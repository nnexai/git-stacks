import {
  runForgeCommand,
  type ForgeCommandResult,
  type ForgeCommandRunner,
} from "./forge-source-resolver.js"

export const REMOTE_BRANCH_STATUS_TIMEOUT_MS = 15_000
export const REMOTE_BRANCH_STATUS_MAX_OUTPUT_BYTES = 256 * 1024

const REMOTE_BRANCH_STATUS_MAX_TIMEOUT_MS = 60_000
const REMOTE_BRANCH_STATUS_MAX_OUTPUT_LIMIT_BYTES = 1024 * 1024
const utf8 = new TextEncoder()

export type RemoteBranchObservation =
  | { status: "present" }
  | { status: "missing" }
  | { status: "unknown"; reason: "remote_check_failed" }

export type ObserveRemoteBranchStatusInput = {
  main_path: string
  branch: string
  runner?: ForgeCommandRunner
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}

function unknown(): RemoteBranchObservation {
  return { status: "unknown", reason: "remote_check_failed" }
}

function boundedOption(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? Math.min(value, maximum)
    : fallback
}

function isCommandResult(value: unknown): value is ForgeCommandResult {
  if (!value || typeof value !== "object") return false
  const result = value as Partial<ForgeCommandResult>
  return Number.isInteger(result.exit_code)
    && typeof result.stdout === "string"
    && typeof result.stderr === "string"
}

function exceedsOutputLimit(value: string, maximum: number): boolean {
  return value.length > maximum || utf8.encode(value).byteLength > maximum
}

export async function observeRemoteBranchStatus(
  input: ObserveRemoteBranchStatusInput,
): Promise<RemoteBranchObservation> {
  if (input.signal?.aborted) return unknown()

  const runner = input.runner ?? runForgeCommand
  const timeoutMs = boundedOption(
    input.timeout_ms,
    REMOTE_BRANCH_STATUS_TIMEOUT_MS,
    REMOTE_BRANCH_STATUS_MAX_TIMEOUT_MS,
  )
  const maxOutputBytes = boundedOption(
    input.max_output_bytes,
    REMOTE_BRANCH_STATUS_MAX_OUTPUT_BYTES,
    REMOTE_BRANCH_STATUS_MAX_OUTPUT_LIMIT_BYTES,
  )

  try {
    const result = await runner({
      argv: [
        "git",
        "-C",
        input.main_path,
        "ls-remote",
        "--exit-code",
        "--heads",
        "origin",
        input.branch,
      ],
      signal: input.signal,
      timeout_ms: timeoutMs,
      max_output_bytes: maxOutputBytes,
    })
    if (!isCommandResult(result)) return unknown()
    if (
      exceedsOutputLimit(result.stdout, maxOutputBytes)
      || exceedsOutputLimit(result.stderr, maxOutputBytes)
    ) return unknown()
    if (result.exit_code === 0) return { status: "present" }
    if (result.exit_code === 2) return { status: "missing" }
    return unknown()
  } catch {
    return unknown()
  }
}
