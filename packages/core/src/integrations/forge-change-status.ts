import { z } from "zod"

import {
  runForgeCommand,
  type ForgeCommandResult,
  type ForgeCommandRunner,
} from "./forge-source-resolver"

export const FORGE_CHANGE_STATUS_TIMEOUT_MS = 15_000
export const FORGE_CHANGE_STATUS_MAX_OUTPUT_BYTES = 256 * 1024

const FORGE_CHANGE_STATUS_MAX_TIMEOUT_MS = 60_000
const FORGE_CHANGE_STATUS_MAX_OUTPUT_LIMIT_BYTES = 1024 * 1024
const FORGE_CHANGE_STATUS_MAX_REPOSITORY_PATH_BYTES = 1024
const FORGE_CHANGE_STATUS_MAX_REPOSITORY_SEGMENTS = 20
const FORGE_CHANGE_STATUS_MAX_URL_BYTES = 2048
const utf8 = new TextEncoder()

const GITHUB_QUERY =
  "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){state mergedAt closedAt}}}"

export type ForgeStatusUnknownReason =
  | "invalid_provenance"
  | "unsupported_provider"
  | "unsupported_host"
  | "tool_unavailable"
  | "authentication_required"
  | "rate_limited"
  | "request_timeout"
  | "request_aborted"
  | "provider_unavailable"
  | "malformed_response"
  | "output_limit_exceeded"

export type ForgeChangeStatus =
  | { status: "merged"; occurred_at: string }
  | { status: "closed"; occurred_at: string }
  | { status: "open" }
  | { status: "unknown"; reason: ForgeStatusUnknownReason }

export type LookupForgeChangeStatusInput = {
  source: unknown
  runner?: ForgeCommandRunner
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}

type ValidatedForgeStatusProvenance =
  | {
      provider: "github"
      host: "github.com"
      repository_path: string
      owner: string
      repository: string
      change_number: number
    }
  | {
      provider: "gitlab"
      host: "gitlab.com"
      repository_path: string
      change_number: number
    }

type ProvenanceResult =
  | { ok: true; provenance: ValidatedForgeStatusProvenance }
  | { ok: false; reason: "invalid_provenance" | "unsupported_provider" | "unsupported_host" }

const boundedSourceString = (maximum: number) => z.string().min(1).max(maximum)
const persistedForgeStatusSourceSchema = z.object({
  kind: z.literal("forge"),
  forge: z.enum(["github", "gitlab", "gitea"]),
  base_url: boundedSourceString(FORGE_CHANGE_STATUS_MAX_URL_BYTES),
  url: boundedSourceString(FORGE_CHANGE_STATUS_MAX_URL_BYTES),
  change_type: z.enum(["pr", "mr"]),
  change_number: z.number().int().positive(),
  repo: boundedSourceString(96),
  repo_path: boundedSourceString(FORGE_CHANGE_STATUS_MAX_REPOSITORY_PATH_BYTES),
  web_url: boundedSourceString(FORGE_CHANGE_STATUS_MAX_URL_BYTES),
})

const providerTimestampSchema = z.string().datetime({ offset: true })
const githubPayloadSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        state: z.enum(["MERGED", "CLOSED", "OPEN"]),
        mergedAt: providerTimestampSchema.nullable(),
        closedAt: providerTimestampSchema.nullable(),
      }).nullable(),
    }).nullable(),
  }),
})
const gitlabPayloadSchema = z.object({
  state: z.enum(["merged", "closed", "opened"]),
  merged_at: providerTimestampSchema.nullable(),
  closed_at: providerTimestampSchema.nullable(),
})

function unknown(reason: ForgeStatusUnknownReason): ForgeChangeStatus {
  return { status: "unknown", reason }
}

function safeHttpsUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw)
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
    ) return undefined
    return url
  } catch {
    return undefined
  }
}

function isSafeRegistryName(value: string): boolean {
  return value !== "."
    && value !== ".."
    && /^[A-Za-z0-9._-]+$/u.test(value)
    && utf8.encode(value).byteLength <= 96
}

function repositorySegments(value: string, provider: "github" | "gitlab"): string[] | undefined {
  if (utf8.encode(value).byteLength > FORGE_CHANGE_STATUS_MAX_REPOSITORY_PATH_BYTES) return undefined
  const segments = value.split("/")
  if (
    (provider === "github" && segments.length !== 2)
    || (provider === "gitlab" && (segments.length < 2 || segments.length > FORGE_CHANGE_STATUS_MAX_REPOSITORY_SEGMENTS))
  ) return undefined
  if (segments.some((segment) => (
    segment === "."
    || segment === ".."
    || !/^[A-Za-z0-9._-]+$/u.test(segment)
    || utf8.encode(segment).byteLength > 255
  ))) return undefined
  return segments
}

function matchesReviewUrl(raw: string, host: string, pathname: string): boolean {
  const url = safeHttpsUrl(raw)
  return url !== undefined && url.host === host && url.pathname === pathname
}

function validateProvenance(source: unknown): ProvenanceResult {
  const decoded = persistedForgeStatusSourceSchema.safeParse(source)
  if (!decoded.success) return { ok: false, reason: "invalid_provenance" }
  const value = decoded.data

  if (value.forge === "gitea") return { ok: false, reason: "unsupported_provider" }
  if (
    (value.forge === "github" && value.change_type !== "pr")
    || (value.forge === "gitlab" && value.change_type !== "mr")
    || !Number.isSafeInteger(value.change_number)
    || !isSafeRegistryName(value.repo)
  ) return { ok: false, reason: "invalid_provenance" }

  const expectedHost = value.forge === "github" ? "github.com" : "gitlab.com"
  const baseUrl = safeHttpsUrl(value.base_url)
  if (!baseUrl || baseUrl.pathname !== "/") return { ok: false, reason: "invalid_provenance" }
  if (baseUrl.host !== expectedHost) return { ok: false, reason: "unsupported_host" }

  const segments = repositorySegments(value.repo_path, value.forge)
  if (!segments) return { ok: false, reason: "invalid_provenance" }
  const repositoryPath = segments.join("/")
  const reviewPath = value.forge === "github"
    ? `/${repositoryPath}/pull/${value.change_number}`
    : `/${repositoryPath}/-/merge_requests/${value.change_number}`
  if (
    !matchesReviewUrl(value.url, expectedHost, reviewPath)
    || !matchesReviewUrl(value.web_url, expectedHost, reviewPath)
  ) return { ok: false, reason: "invalid_provenance" }

  if (value.forge === "github") {
    return {
      ok: true,
      provenance: {
        provider: "github",
        host: "github.com",
        repository_path: repositoryPath,
        owner: segments[0]!,
        repository: segments[1]!,
        change_number: value.change_number,
      },
    }
  }
  return {
    ok: true,
    provenance: {
      provider: "gitlab",
      host: "gitlab.com",
      repository_path: repositoryPath,
      change_number: value.change_number,
    },
  }
}

function boundedOption(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? Math.min(value, maximum)
    : fallback
}

function exceedsOutputLimit(value: string, maximum: number): boolean {
  return value.length > maximum || utf8.encode(value).byteLength > maximum
}

function classifyThrown(error: unknown, signal: AbortSignal | undefined): ForgeStatusUnknownReason {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : undefined
  const code = record && "code" in record ? String(record.code) : ""
  const name = record && "name" in record ? String(record.name) : ""
  if (signal?.aborted || code === "ABORT_ERR" || name === "AbortError") return "request_aborted"
  if (code === "ENOENT") return "tool_unavailable"
  if (code === "FORGE_TIMEOUT") return "request_timeout"
  if (code === "FORGE_OUTPUT_LIMIT") return "output_limit_exceeded"
  return "provider_unavailable"
}

function classifyExit(result: ForgeCommandResult): ForgeStatusUnknownReason {
  const text = result.stderr.toLowerCase()
  if (/command not found|executable file not found|not recognized as an internal or external command/u.test(text)) {
    return "tool_unavailable"
  }
  if (/auth|login|unauthori[sz]ed|forbidden|\b401\b|\b403\b/u.test(text)) return "authentication_required"
  if (/rate.?limit|\b429\b/u.test(text)) return "rate_limited"
  if (/timed? out|timeout/u.test(text)) return "request_timeout"
  return "provider_unavailable"
}

function isCommandResult(value: unknown): value is ForgeCommandResult {
  if (!value || typeof value !== "object") return false
  const result = value as Partial<ForgeCommandResult>
  return Number.isInteger(result.exit_code)
    && typeof result.stdout === "string"
    && typeof result.stderr === "string"
}

type InvocationResult =
  | { ok: true; result: ForgeCommandResult }
  | { ok: false; status: ForgeChangeStatus }

async function invoke(
  input: LookupForgeChangeStatusInput,
  runner: ForgeCommandRunner,
  argv: readonly string[],
): Promise<InvocationResult> {
  if (input.signal?.aborted) return { ok: false, status: unknown("request_aborted") }
  const timeoutMs = boundedOption(
    input.timeout_ms,
    FORGE_CHANGE_STATUS_TIMEOUT_MS,
    FORGE_CHANGE_STATUS_MAX_TIMEOUT_MS,
  )
  const maxOutputBytes = boundedOption(
    input.max_output_bytes,
    FORGE_CHANGE_STATUS_MAX_OUTPUT_BYTES,
    FORGE_CHANGE_STATUS_MAX_OUTPUT_LIMIT_BYTES,
  )
  try {
    const result = await runner({
      argv,
      env: { GH_PROMPT_DISABLED: "1", GLAB_PROMPT_DISABLED: "1", NO_COLOR: "1" },
      signal: input.signal,
      timeout_ms: timeoutMs,
      max_output_bytes: maxOutputBytes,
    })
    if (!isCommandResult(result)) return { ok: false, status: unknown("provider_unavailable") }
    if (
      exceedsOutputLimit(result.stdout, maxOutputBytes)
      || exceedsOutputLimit(result.stderr, maxOutputBytes)
    ) return { ok: false, status: unknown("output_limit_exceeded") }
    if (result.exit_code !== 0) return { ok: false, status: unknown(classifyExit(result)) }
    return { ok: true, result }
  } catch (error) {
    return { ok: false, status: unknown(classifyThrown(error, input.signal)) }
  }
}

function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function githubStatus(raw: string): ForgeChangeStatus {
  const decoded = githubPayloadSchema.safeParse(parseJson(raw))
  if (!decoded.success || !decoded.data.data.repository?.pullRequest) return unknown("malformed_response")
  const pullRequest = decoded.data.data.repository.pullRequest
  if (pullRequest.state === "MERGED" && pullRequest.mergedAt) {
    return { status: "merged", occurred_at: pullRequest.mergedAt }
  }
  if (pullRequest.state === "CLOSED" && pullRequest.closedAt && pullRequest.mergedAt === null) {
    return { status: "closed", occurred_at: pullRequest.closedAt }
  }
  if (pullRequest.state === "OPEN" && pullRequest.mergedAt === null && pullRequest.closedAt === null) {
    return { status: "open" }
  }
  return unknown("malformed_response")
}

function gitlabStatus(raw: string): ForgeChangeStatus {
  const decoded = gitlabPayloadSchema.safeParse(parseJson(raw))
  if (!decoded.success) return unknown("malformed_response")
  const mergeRequest = decoded.data
  if (mergeRequest.state === "merged" && mergeRequest.merged_at) {
    return { status: "merged", occurred_at: mergeRequest.merged_at }
  }
  if (mergeRequest.state === "closed" && mergeRequest.closed_at && mergeRequest.merged_at === null) {
    return { status: "closed", occurred_at: mergeRequest.closed_at }
  }
  if (mergeRequest.state === "opened" && mergeRequest.merged_at === null && mergeRequest.closed_at === null) {
    return { status: "open" }
  }
  return unknown("malformed_response")
}

export async function lookupForgeChangeStatus(
  input: LookupForgeChangeStatusInput,
): Promise<ForgeChangeStatus> {
  const validation = validateProvenance(input.source)
  if (!validation.ok) return unknown(validation.reason)

  const runner = input.runner ?? runForgeCommand
  const provenance = validation.provenance
  if (provenance.provider === "github") {
    const invocation = await invoke(input, runner, [
      "gh",
      "api",
      "graphql",
      "--hostname",
      provenance.host,
      "-f",
      `query=${GITHUB_QUERY}`,
      "-f",
      `owner=${provenance.owner}`,
      "-f",
      `name=${provenance.repository}`,
      "-F",
      `number=${provenance.change_number}`,
    ])
    return invocation.ok ? githubStatus(invocation.result.stdout) : invocation.status
  }

  const invocation = await invoke(input, runner, [
    "glab",
    "api",
    "--hostname",
    provenance.host,
    `projects/${encodeURIComponent(provenance.repository_path)}/merge_requests/${provenance.change_number}`,
  ])
  return invocation.ok ? gitlabStatus(invocation.result.stdout) : invocation.status
}
