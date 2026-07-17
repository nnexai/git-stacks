import { beforeAll, describe, expect, test } from "@test/api"

import {
  PHASE127_DISCLOSURE_CANARIES,
  PHASE127_TIMES,
  createScriptedCommandRunner,
  makeWorkspaceSource,
  type Phase127CommandRequest,
  type Phase127CommandResult,
} from "../../helpers/phase127-stale-fixtures"

type ForgeRunnerResult = {
  exit_code: number
  stdout: string
  stderr: string
}

type ForgeRunner = (request: Phase127CommandRequest) => Promise<ForgeRunnerResult>

type LookupForgeChangeStatus = (input: {
  source: unknown
  runner?: ForgeRunner
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}) => Promise<unknown>

type RuntimeModule = Record<string, unknown>

const MODULE_URL = new URL(
  "../../../packages/core/src/integrations/forge-change-status.ts",
  import.meta.url,
).href

const GITHUB_QUERY =
  "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){state mergedAt closedAt}}}"

const EXPECTED_GITHUB_ARGV = [
  "gh",
  "api",
  "graphql",
  "--hostname",
  "github.com",
  "-f",
  `query=${GITHUB_QUERY}`,
  "-f",
  "owner=acme",
  "-f",
  "name=app",
  "-F",
  "number=42",
] as const

const EXPECTED_GITLAB_ARGV = [
  "glab",
  "api",
  "--hostname",
  "gitlab.com",
  "projects/acme%2Fplatform%2Fapp/merge_requests/42",
] as const

const FORBIDDEN_RESULT_KEYS = new Set([
  "argv",
  "command",
  "confidence",
  "credential",
  "credentials",
  "env",
  "environment",
  "error",
  "main_path",
  "path",
  "raw_error",
  "score",
  "shell",
  "stderr",
  "stdout",
  "token",
])

const MUTATING_OR_INFERENCE_ARGV_TOKENS = new Set([
  "checkout",
  "close",
  "comment",
  "create",
  "delete",
  "edit",
  "label",
  "merge",
  "push",
  "search",
  "update-ref",
])

let forgeModule: RuntimeModule | undefined
let forgeModuleLoadError: unknown

beforeAll(async () => {
  try {
    forgeModule = await import(/* @vite-ignore */ MODULE_URL) as RuntimeModule
  } catch (error) {
    forgeModuleLoadError = error
  }
})

function lookupForgeChangeStatus(): LookupForgeChangeStatus {
  expect(
    forgeModuleLoadError,
    "Phase 127 core must provide packages/core/src/integrations/forge-change-status.ts",
  ).toBeUndefined()
  const value = forgeModule?.lookupForgeChangeStatus
  expect(
    value,
    "Phase 127 forge status module must export lookupForgeChangeStatus",
  ).toBeTypeOf("function")
  return value as LookupForgeChangeStatus
}

function commandRunner(
  script: Array<
    | Phase127CommandResult
    | Error
    | ((request: Phase127CommandRequest) => Phase127CommandResult | Promise<Phase127CommandResult>)
  >,
) {
  const scripted = createScriptedCommandRunner(script)
  const runner: ForgeRunner = async (request) => {
    const result = await scripted.run(request)
    return {
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }
  return { calls: scripted.calls, runner }
}

function githubPayload(
  state: "MERGED" | "CLOSED" | "OPEN",
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          state,
          mergedAt: state === "MERGED" ? PHASE127_TIMES.mergedAt : null,
          closedAt: state === "OPEN" ? null : PHASE127_TIMES.closedAt,
          ...overrides,
        },
      },
    },
  })
}

function gitlabPayload(
  state: "merged" | "closed" | "opened",
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    state,
    merged_at: state === "merged" ? PHASE127_TIMES.mergedAt : null,
    closed_at: state === "opened" ? null : PHASE127_TIMES.closedAt,
    ...overrides,
  })
}

function codedError(code: string, message = PHASE127_DISCLOSURE_CANARIES.rawError): Error {
  return Object.assign(new Error(message), { code })
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
    return keys
  }
  if (!value || typeof value !== "object") return keys
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key)
    collectKeys(nested, keys)
  }
  return keys
}

function expectSanitized(result: unknown, additionalSecrets: readonly string[] = []): void {
  const encoded = JSON.stringify(result)
  const canaries = [
    PHASE127_DISCLOSURE_CANARIES.path,
    PHASE127_DISCLOSURE_CANARIES.windowsPath,
    PHASE127_DISCLOSURE_CANARIES.urlWithCredential,
    PHASE127_DISCLOSURE_CANARIES.credential,
    PHASE127_DISCLOSURE_CANARIES.bearer,
    PHASE127_DISCLOSURE_CANARIES.command,
    PHASE127_DISCLOSURE_CANARIES.stdout,
    PHASE127_DISCLOSURE_CANARIES.stderr,
    PHASE127_DISCLOSURE_CANARIES.rawError,
    ...Object.values(PHASE127_DISCLOSURE_CANARIES.environment),
    ...additionalSecrets,
  ]
  for (const canary of canaries) expect(encoded).not.toContain(canary)
  for (const key of collectKeys(result)) expect(FORBIDDEN_RESULT_KEYS.has(key)).toBe(false)
}

function expectReadOnlyArgv(request: Phase127CommandRequest): void {
  expect(Array.isArray(request.argv)).toBe(true)
  expect(request).not.toHaveProperty("shell")
  expect(request.argv).not.toContain(PHASE127_DISCLOSURE_CANARIES.credential)
  expect(request.argv).not.toContain(PHASE127_DISCLOSURE_CANARIES.bearer)
  for (const token of request.argv) {
    expect(MUTATING_OR_INFERENCE_ARGV_TOKENS.has(token.toLowerCase())).toBe(false)
  }
}

describe("Phase 127 read-only forge change status contract", () => {
  test("loads through the guarded lifecycle and exports the lookup contract", () => {
    expect(lookupForgeChangeStatus()).toBeTypeOf("function")
  })

  test.each([
    ["merged", "MERGED", { status: "merged", occurred_at: PHASE127_TIMES.mergedAt }],
    ["closed", "CLOSED", { status: "closed", occurred_at: PHASE127_TIMES.closedAt }],
    ["open", "OPEN", { status: "open" }],
  ] as const)("maps a validated GitHub pull request to %s", async (_label, state, expected) => {
    const lookup = lookupForgeChangeStatus()
    const scripted = commandRunner([
      { exitCode: 0, stdout: githubPayload(state), stderr: PHASE127_DISCLOSURE_CANARIES.stderr },
    ])
    const signal = new AbortController().signal

    const result = await lookup({
      source: makeWorkspaceSource(),
      runner: scripted.runner,
      signal,
      timeout_ms: 4_321,
      max_output_bytes: 12_345,
    })

    expect(result).toEqual(expected)
    expect(scripted.calls).toHaveLength(1)
    expect(scripted.calls[0]).toMatchObject({
      argv: [...EXPECTED_GITHUB_ARGV],
      signal,
      timeout_ms: 4_321,
      max_output_bytes: 12_345,
    })
    expect(scripted.calls[0].env).toEqual({
      GH_PROMPT_DISABLED: "1",
      GLAB_PROMPT_DISABLED: "1",
      NO_COLOR: "1",
    })
    expectReadOnlyArgv(scripted.calls[0])
    expectSanitized(result, [makeWorkspaceSource().repo_path])
  })

  test.each([
    ["merged", "merged", { status: "merged", occurred_at: PHASE127_TIMES.mergedAt }],
    ["closed", "closed", { status: "closed", occurred_at: PHASE127_TIMES.closedAt }],
    ["open", "opened", { status: "open" }],
  ] as const)("maps a validated GitLab merge request to %s", async (_label, state, expected) => {
    const lookup = lookupForgeChangeStatus()
    const scripted = commandRunner([
      { exitCode: 0, stdout: gitlabPayload(state), stderr: PHASE127_DISCLOSURE_CANARIES.stderr },
    ])
    const source = makeWorkspaceSource({
      forge: "gitlab",
      base_url: "https://gitlab.com",
      url: "https://gitlab.com/acme/platform/app/-/merge_requests/42",
      change_type: "mr",
      repo: "app",
      repo_path: "acme/platform/app",
      web_url: "https://gitlab.com/acme/platform/app/-/merge_requests/42",
      source_ref: "refs/merge-requests/42/head",
      fetched_ref: "refs/git-stacks/source/42",
    })

    const result = await lookup({ source, runner: scripted.runner })

    expect(result).toEqual(expected)
    expect(scripted.calls).toHaveLength(1)
    expect(scripted.calls[0].argv).toEqual([...EXPECTED_GITLAB_ARGV])
    expect(scripted.calls[0].timeout_ms).toBeGreaterThan(0)
    expect(scripted.calls[0].max_output_bytes).toBeGreaterThan(0)
    expectReadOnlyArgv(scripted.calls[0])
    expectSanitized(result, [source.repo_path])
  })

  test.each([
    [
      "Gitea is an explicit unsupported provider",
      makeWorkspaceSource({
        forge: "gitea",
        base_url: "https://gitea.example.com",
        url: "https://gitea.example.com/acme/app.git",
        web_url: "https://gitea.example.com/acme/app/pulls/42",
      }),
      "unsupported_provider",
    ],
    [
      "self-hosted GitHub is not claimed",
      makeWorkspaceSource({
        base_url: "https://github.example.com",
        url: "https://github.example.com/acme/app.git",
        web_url: "https://github.example.com/acme/app/pull/42",
      }),
      "unsupported_host",
    ],
    [
      "self-hosted GitLab is not claimed",
      makeWorkspaceSource({
        forge: "gitlab",
        base_url: "https://gitlab.example.com",
        url: "https://gitlab.example.com/acme/app.git",
        change_type: "mr",
        web_url: "https://gitlab.example.com/acme/app/-/merge_requests/42",
      }),
      "unsupported_host",
    ],
    [
      "provider and change type must agree",
      makeWorkspaceSource({ forge: "github", change_type: "mr" }),
      "invalid_provenance",
    ],
    [
      "GitHub repository identity is exactly owner/name",
      makeWorkspaceSource({ repo_path: "acme/group/app" }),
      "invalid_provenance",
    ],
    [
      "registry repository identity must be present",
      makeWorkspaceSource({ repo: "" }),
      "invalid_provenance",
    ],
    [
      "change number must remain a positive integer",
      makeWorkspaceSource({ change_number: 0 }),
      "invalid_provenance",
    ],
    [
      "persisted provider URL host must agree",
      makeWorkspaceSource({ url: "https://gitlab.com/acme/app.git" }),
      "invalid_provenance",
    ],
    [
      "persisted review URL must agree with the claimed change",
      makeWorkspaceSource({ web_url: "https://github.com/acme/app/pull/99" }),
      "invalid_provenance",
    ],
    [
      "credentialed base URLs are invalid provenance",
      makeWorkspaceSource({ base_url: "https://user:secret@github.com" }),
      "invalid_provenance",
    ],
    [
      "incomplete source metadata is invalid provenance",
      { ...makeWorkspaceSource(), repo_path: undefined },
      "invalid_provenance",
    ],
    ["missing source metadata is invalid provenance", undefined, "invalid_provenance"],
  ] as const)("returns fixed unknown and makes zero process calls when %s", async (_label, source, reason) => {
    const lookup = lookupForgeChangeStatus()
    const scripted = commandRunner([
      new Error("invalid provenance must not invoke provider tooling"),
    ])

    const result = await lookup({ source, runner: scripted.runner })

    expect(result).toEqual({ status: "unknown", reason })
    expect(scripted.calls).toHaveLength(0)
    expectSanitized(result)
  })

  test.each([
    ["missing GitHub CLI", codedError("ENOENT"), "tool_unavailable"],
    ["request timeout", codedError("FORGE_TIMEOUT"), "request_timeout"],
    ["request abort", codedError("ABORT_ERR"), "request_aborted"],
    ["oversized provider output", codedError("FORGE_OUTPUT_LIMIT"), "output_limit_exceeded"],
    ["runner rejection", new Error(PHASE127_DISCLOSURE_CANARIES.rawError), "provider_unavailable"],
  ] as const)("maps %s to a sanitized unknown reason", async (_label, thrown, reason) => {
    const lookup = lookupForgeChangeStatus()
    const scripted = commandRunner([thrown])

    const result = await lookup({ source: makeWorkspaceSource(), runner: scripted.runner })

    expect(result).toEqual({ status: "unknown", reason })
    expect(scripted.calls).toHaveLength(1)
    expectSanitized(result)
  })

  test.each([
    ["authentication failure", "HTTP 401 unauthorized; token=" + PHASE127_DISCLOSURE_CANARIES.credential, "authentication_required"],
    ["rate limit", "HTTP 429 rate limit; " + PHASE127_DISCLOSURE_CANARIES.stderr, "rate_limited"],
    ["provider outage", "HTTP 503 unavailable; " + PHASE127_DISCLOSURE_CANARIES.stderr, "provider_unavailable"],
    ["unclassified nonzero exit", PHASE127_DISCLOSURE_CANARIES.stderr, "provider_unavailable"],
  ] as const)("maps %s without returning provider stderr", async (_label, stderr, reason) => {
    const lookup = lookupForgeChangeStatus()
    const scripted = commandRunner([
      { exitCode: 1, stdout: PHASE127_DISCLOSURE_CANARIES.stdout, stderr },
    ])

    const result = await lookup({ source: makeWorkspaceSource(), runner: scripted.runner })

    expect(result).toEqual({ status: "unknown", reason })
    expectSanitized(result)
  })

  test.each([
    ["malformed JSON", "not-json"],
    ["missing pull request", JSON.stringify({ data: { repository: { pullRequest: null } } })],
    ["missing repository", JSON.stringify({ data: { repository: null } })],
    ["unknown state", githubPayload("OPEN", { state: "DRAFT" })],
    ["merged without timestamp", githubPayload("MERGED", { mergedAt: null })],
    ["closed without timestamp", githubPayload("CLOSED", { closedAt: null })],
    ["malformed merged timestamp", githubPayload("MERGED", { mergedAt: "yesterday" })],
    ["extra provider payload is not a status substitute", JSON.stringify({ status: "merged" })],
  ] as const)("maps GitHub %s to malformed_response", async (_label, stdout) => {
    const lookup = lookupForgeChangeStatus()
    const scripted = commandRunner([{ exitCode: 0, stdout, stderr: "" }])

    const result = await lookup({ source: makeWorkspaceSource(), runner: scripted.runner })

    expect(result).toEqual({ status: "unknown", reason: "malformed_response" })
    expectSanitized(result)
  })

  test.each([
    ["malformed JSON", "not-json"],
    ["unknown state", gitlabPayload("opened", { state: "locked" })],
    ["merged without timestamp", gitlabPayload("merged", { merged_at: null })],
    ["closed without timestamp", gitlabPayload("closed", { closed_at: null })],
    ["malformed closed timestamp", gitlabPayload("closed", { closed_at: "last week" })],
  ] as const)("maps GitLab %s to malformed_response", async (_label, stdout) => {
    const lookup = lookupForgeChangeStatus()
    const scripted = commandRunner([{ exitCode: 0, stdout, stderr: "" }])
    const source = makeWorkspaceSource({
      forge: "gitlab",
      base_url: "https://gitlab.com",
      url: "https://gitlab.com/acme/platform/app/-/merge_requests/42",
      change_type: "mr",
      repo: "app",
      repo_path: "acme/platform/app",
      web_url: "https://gitlab.com/acme/platform/app/-/merge_requests/42",
    })

    const result = await lookup({ source, runner: scripted.runner })

    expect(result).toEqual({ status: "unknown", reason: "malformed_response" })
    expectSanitized(result)
  })

  test("uses persisted provenance only and never searches branches or remotes", async () => {
    const lookup = lookupForgeChangeStatus()
    const source = makeWorkspaceSource({
      source_branch: "secret-branch-that-must-not-be-searched",
      source_ref: "refs/private/secret-that-must-not-be-searched",
      fetched_ref: "refs/git-stacks/private-secret",
    })
    const scripted = commandRunner([
      { exitCode: 0, stdout: githubPayload("OPEN"), stderr: "" },
    ])

    const result = await lookup({ source, runner: scripted.runner })

    expect(result).toEqual({ status: "open" })
    expect(scripted.calls).toHaveLength(1)
    expect(scripted.calls[0].argv).toEqual([...EXPECTED_GITHUB_ARGV])
    const argv = scripted.calls[0].argv.join(" ")
    expect(argv).not.toContain(source.source_branch)
    expect(argv).not.toContain(source.source_ref)
    expect(argv).not.toContain(source.fetched_ref)
    expect(argv).not.toContain(source.url)
    expect(argv).not.toContain(source.web_url)
    expectReadOnlyArgv(scripted.calls[0])
  })

  test("returns a closed four-way union with no raw process or safety fields", async () => {
    const lookup = lookupForgeChangeStatus()
    const statuses = [
      githubPayload("MERGED"),
      githubPayload("CLOSED"),
      githubPayload("OPEN"),
      "not-json",
    ]
    const observed = []

    for (const stdout of statuses) {
      const scripted = commandRunner([{ exitCode: 0, stdout, stderr: "" }])
      observed.push(await lookup({ source: makeWorkspaceSource(), runner: scripted.runner }))
    }

    expect(observed).toEqual([
      { status: "merged", occurred_at: PHASE127_TIMES.mergedAt },
      { status: "closed", occurred_at: PHASE127_TIMES.closedAt },
      { status: "open" },
      { status: "unknown", reason: "malformed_response" },
    ])
    for (const result of observed) expectSanitized(result)
  })
})
