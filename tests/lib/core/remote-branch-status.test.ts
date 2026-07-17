import { beforeAll, describe, expect, test } from "@test/api"

import {
  PHASE127_DISCLOSURE_CANARIES,
  PHASE127_IDS,
  createScriptedCommandRunner,
  makeRepositoryFixture,
  type Phase127CommandRequest,
  type Phase127CommandResult,
} from "../../helpers/phase127-stale-fixtures"

type RemoteRunnerResult = {
  exit_code: number
  stdout: string
  stderr: string
}

type RemoteRunner = (request: Phase127CommandRequest) => Promise<RemoteRunnerResult>

type ObserveRemoteBranchStatus = (input: {
  main_path: string
  branch: string
  runner?: RemoteRunner
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}) => Promise<unknown>

type RuntimeModule = Record<string, unknown>

const MODULE_URL = new URL(
  "../../../packages/core/src/integrations/remote-branch-status.ts",
  import.meta.url,
).href

const FORBIDDEN_RESULT_KEYS = new Set([
  "argv",
  "branch",
  "command",
  "confidence",
  "credential",
  "credentials",
  "cwd",
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

const MUTATING_ARGV_TOKENS = new Set([
  "add",
  "checkout",
  "clean",
  "clone",
  "commit",
  "delete",
  "fetch",
  "merge",
  "push",
  "remote",
  "reset",
  "rm",
  "switch",
  "update-ref",
])

let remoteModule: RuntimeModule | undefined
let remoteModuleLoadError: unknown

beforeAll(async () => {
  try {
    remoteModule = await import(/* @vite-ignore */ MODULE_URL) as RuntimeModule
  } catch (error) {
    remoteModuleLoadError = error
  }
})

function observeRemoteBranchStatus(): ObserveRemoteBranchStatus {
  expect(
    remoteModuleLoadError,
    "Phase 127 core must provide packages/core/src/integrations/remote-branch-status.ts",
  ).toBeUndefined()
  const value = remoteModule?.observeRemoteBranchStatus
  expect(
    value,
    "Phase 127 remote branch module must export observeRemoteBranchStatus",
  ).toBeTypeOf("function")
  return value as ObserveRemoteBranchStatus
}

function commandRunner(
  script: Array<
    | Phase127CommandResult
    | Error
    | ((request: Phase127CommandRequest) => Phase127CommandResult | Promise<Phase127CommandResult>)
  >,
) {
  const scripted = createScriptedCommandRunner(script)
  const runner: RemoteRunner = async (request) => {
    const result = await scripted.run(request)
    return {
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }
  return { calls: scripted.calls, runner }
}

function codedError(code: string): Error {
  return Object.assign(new Error(PHASE127_DISCLOSURE_CANARIES.rawError), { code })
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

function expectSanitized(
  result: unknown,
  mainPath = PHASE127_DISCLOSURE_CANARIES.path,
  branch = "phase127-private-branch",
): void {
  const encoded = JSON.stringify(result)
  const canaries = [
    mainPath,
    branch,
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
  ]
  for (const canary of canaries) expect(encoded).not.toContain(canary)
  for (const key of collectKeys(result)) expect(FORBIDDEN_RESULT_KEYS.has(key)).toBe(false)
}

function expectedArgv(mainPath: string, branch: string): string[] {
  return [
    "git",
    "-C",
    mainPath,
    "ls-remote",
    "--exit-code",
    "--heads",
    "origin",
    branch,
  ]
}

function expectReadOnlyRequest(
  request: Phase127CommandRequest,
  mainPath: string,
  branch: string,
): void {
  expect(request.argv).toEqual(expectedArgv(mainPath, branch))
  expect(request).not.toHaveProperty("shell")
  expect(request.cwd).toBeUndefined()
  expect(request.env).toBeUndefined()
  for (const token of request.argv) {
    expect(MUTATING_ARGV_TOKENS.has(token.toLowerCase())).toBe(false)
  }
}

describe("Phase 127 abortable remote branch observation contract", () => {
  test("loads through the guarded lifecycle and exports the observer contract", () => {
    expect(observeRemoteBranchStatus()).toBeTypeOf("function")
  })

  test("maps exit 0 to present with exact bounded argv and AbortSignal forwarding", async () => {
    const observe = observeRemoteBranchStatus()
    const repository = makeRepositoryFixture({
      main_path: PHASE127_DISCLOSURE_CANARIES.path,
      branch: "phase127-private-branch",
    })
    const signal = new AbortController().signal
    const scripted = commandRunner([
      {
        exitCode: 0,
        stdout: PHASE127_DISCLOSURE_CANARIES.stdout,
        stderr: PHASE127_DISCLOSURE_CANARIES.stderr,
      },
    ])

    const result = await observe({
      main_path: repository.main_path,
      branch: repository.branch,
      runner: scripted.runner,
      signal,
      timeout_ms: 2_345,
      max_output_bytes: 6_789,
    })

    expect(result).toEqual({ status: "present" })
    expect(scripted.calls).toHaveLength(1)
    expect(scripted.calls[0]).toMatchObject({
      argv: expectedArgv(repository.main_path, repository.branch),
      signal,
      timeout_ms: 2_345,
      max_output_bytes: 6_789,
    })
    expectReadOnlyRequest(scripted.calls[0], repository.main_path, repository.branch)
    expectSanitized(result, repository.main_path, repository.branch)
  })

  test("maps only exit 2 to a confirmed missing branch", async () => {
    const observe = observeRemoteBranchStatus()
    const repository = makeRepositoryFixture()
    const scripted = commandRunner([
      {
        exitCode: 2,
        stdout: PHASE127_DISCLOSURE_CANARIES.stdout,
        stderr: PHASE127_DISCLOSURE_CANARIES.stderr,
      },
    ])

    const result = await observe({
      main_path: repository.main_path,
      branch: repository.branch,
      runner: scripted.runner,
    })

    expect(result).toEqual({ status: "missing" })
    expect(scripted.calls).toHaveLength(1)
    expect(scripted.calls[0].timeout_ms).toBeGreaterThan(0)
    expect(scripted.calls[0].max_output_bytes).toBeGreaterThan(0)
    expectReadOnlyRequest(scripted.calls[0], repository.main_path, repository.branch)
    expectSanitized(result, repository.main_path, repository.branch)
  })

  test.each([1, 3, 127, 128])(
    "maps non-authoritative exit %i to fixed repository-scoped unknown evidence",
    async (exitCode) => {
      const observe = observeRemoteBranchStatus()
      const repository = makeRepositoryFixture({
        id: PHASE127_IDS.repositories.api,
        name: "api",
        main_path: "/fixtures/source/api",
        branch: "feature/api-stale-contract",
      })
      const scripted = commandRunner([
        {
          exitCode,
          stdout: PHASE127_DISCLOSURE_CANARIES.stdout,
          stderr: `${PHASE127_DISCLOSURE_CANARIES.stderr}; exit=${exitCode}`,
        },
      ])

      const scoped = {
        repository_id: repository.id,
        repository_name: repository.name,
        outcome: await observe({
          main_path: repository.main_path,
          branch: repository.branch,
          runner: scripted.runner,
        }),
      }

      expect(scoped).toEqual({
        repository_id: PHASE127_IDS.repositories.api,
        repository_name: "api",
        outcome: { status: "unknown", reason: "remote_check_failed" },
      })
      expectReadOnlyRequest(scripted.calls[0], repository.main_path, repository.branch)
      expectSanitized(scoped.outcome, repository.main_path, repository.branch)
    },
  )

  test.each([
    ["runner rejection", new Error(PHASE127_DISCLOSURE_CANARIES.rawError)],
    ["timeout", codedError("FORGE_TIMEOUT")],
    ["abort", codedError("ABORT_ERR")],
    ["output limit", codedError("FORGE_OUTPUT_LIMIT")],
    ["missing executable", codedError("ENOENT")],
  ] as const)("maps %s to one fixed sanitized unknown", async (_label, thrown) => {
    const observe = observeRemoteBranchStatus()
    const repository = makeRepositoryFixture({
      main_path: PHASE127_DISCLOSURE_CANARIES.path,
      branch: "phase127-private-branch",
    })
    const scripted = commandRunner([thrown])

    const result = await observe({
      main_path: repository.main_path,
      branch: repository.branch,
      runner: scripted.runner,
    })

    expect(result).toEqual({ status: "unknown", reason: "remote_check_failed" })
    expect(scripted.calls).toHaveLength(1)
    expectSanitized(result, repository.main_path, repository.branch)
  })

  test("forwards an already-aborted signal without converting cancellation into missing", async () => {
    const observe = observeRemoteBranchStatus()
    const repository = makeRepositoryFixture()
    const controller = new AbortController()
    controller.abort("Phase 127 cancellation")
    const scripted = commandRunner([
      (request) => {
        expect(request.signal).toBe(controller.signal)
        throw codedError("ABORT_ERR")
      },
    ])

    const result = await observe({
      main_path: repository.main_path,
      branch: repository.branch,
      runner: scripted.runner,
      signal: controller.signal,
    })

    expect(result).toEqual({ status: "unknown", reason: "remote_check_failed" })
    expect(result).not.toEqual({ status: "missing" })
    expect(scripted.calls.length).toBeLessThanOrEqual(1)
    expectSanitized(result, repository.main_path, repository.branch)
  })

  test("keeps concurrent repository outcomes independent and in caller-owned scope", async () => {
    const observe = observeRemoteBranchStatus()
    const app = makeRepositoryFixture({
      id: PHASE127_IDS.repositories.app,
      name: "app",
      main_path: "/fixtures/source/app",
      branch: "feature/app",
    })
    const api = makeRepositoryFixture({
      id: PHASE127_IDS.repositories.api,
      name: "api",
      main_path: "/fixtures/source/api",
      branch: "feature/api",
    })
    const appRunner = commandRunner([{ exitCode: 0, stdout: "", stderr: "" }])
    const apiRunner = commandRunner([{ exitCode: 2, stdout: "", stderr: "" }])

    const scoped = await Promise.all([
      observe({ main_path: app.main_path, branch: app.branch, runner: appRunner.runner })
        .then((outcome) => ({ repository_id: app.id, outcome })),
      observe({ main_path: api.main_path, branch: api.branch, runner: apiRunner.runner })
        .then((outcome) => ({ repository_id: api.id, outcome })),
    ])

    expect(scoped).toEqual([
      { repository_id: PHASE127_IDS.repositories.app, outcome: { status: "present" } },
      { repository_id: PHASE127_IDS.repositories.api, outcome: { status: "missing" } },
    ])
    expect(appRunner.calls[0].argv).toEqual(expectedArgv(app.main_path, app.branch))
    expect(apiRunner.calls[0].argv).toEqual(expectedArgv(api.main_path, api.branch))
  })

  test("returns only the closed present, missing, or fixed unknown union", async () => {
    const observe = observeRemoteBranchStatus()
    const repository = makeRepositoryFixture()
    const results = []

    for (const exitCode of [0, 2, 1]) {
      const scripted = commandRunner([{ exitCode, stdout: "", stderr: "" }])
      results.push(await observe({
        main_path: repository.main_path,
        branch: repository.branch,
        runner: scripted.runner,
      }))
    }

    expect(results).toEqual([
      { status: "present" },
      { status: "missing" },
      { status: "unknown", reason: "remote_check_failed" },
    ])
    for (const result of results) expectSanitized(result, repository.main_path, repository.branch)
  })
})
