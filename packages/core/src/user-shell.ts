import { constants, accessSync, chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

import { sleep, spawn, type SpawnedProcess, type SpawnOptions } from "./node-runtime"

export const USER_SHELL_INITIALIZATION_TIMEOUT_MS = 10_000
export const USER_SHELL_TERMINATION_GRACE_MS = 1_000

const INITIALIZATION_POLL_MS = 10
const MAX_INITIALIZATION_DIAGNOSTIC_BYTES = 64 * 1024

export type SupportedUserShell = "bash" | "zsh" | "fish"
export type UserShellMode = "command" | "pty"
export type UserShellDiagnosticCategory =
  | "discovery"
  | "validation"
  | "initialization"
  | "execution"
  | "cancellation"
  | "cleanup"

export type UserShellDiagnostic = {
  category: UserShellDiagnosticCategory
  shell: string
  mode: UserShellMode
  stage: string
  message: string
  recovery: string
}

export class UserShellError extends Error {
  readonly diagnostic: UserShellDiagnostic

  constructor(diagnostic: UserShellDiagnostic, options?: ErrorOptions) {
    super(diagnostic.message, options)
    this.name = "UserShellError"
    this.diagnostic = diagnostic
  }
}

export type ValidatedUserShell = {
  executable: string
  family: SupportedUserShell
}

export type UserShellLaunchPlan = {
  shell: ValidatedUserShell
  mode: UserShellMode
  argv: readonly string[]
  bootstrap?: string
  initialization: {
    timeoutMs: typeof USER_SHELL_INITIALIZATION_TIMEOUT_MS
    readiness: "private-file-handshake"
  }
}

export type BuildUserShellBootstrapOptions = {
  mode: UserShellMode
  command?: string
  readinessPath?: string
  acknowledgementPath?: string
  environmentPath?: string
}

export type UserShellOutput = {
  stream: "stdout" | "stderr"
  chunk: Uint8Array
}

export type ExecuteUserShellCommandRequest = {
  command: string
  cwd: string
  shellEnvironment?: NodeJS.ProcessEnv
  inheritedEnvironment?: Record<string, string | undefined>
  overlay?: Record<string, string>
  signal?: AbortSignal
  onOutput?: (output: UserShellOutput) => void
}

export type ExecuteUserShellCommandResult = {
  exitCode: number
  shell: ValidatedUserShell
  stdout: Buffer
  stderr: Buffer
  initializationDiagnostics: Buffer
  diagnostic?: UserShellDiagnostic
}

export type UserShellExecutionDependencies = {
  spawn: (argv: readonly string[], options?: SpawnOptions) => SpawnedProcess
  now: () => number
  wait: (milliseconds: number) => Promise<void>
  processGroupExists: (pid: number) => boolean
}

const DEFAULT_EXECUTION_DEPENDENCIES: UserShellExecutionDependencies = {
  spawn,
  now: Date.now,
  wait: sleep,
  processGroupExists: (pid) => {
    if (process.platform === "win32") return false
    try {
      process.kill(-pid, 0)
      return true
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM"
    }
  },
}

const POSIX_BOOTSTRAP = [
  "__gs_ready=$1",
  "__gs_ack=$2",
  "__gs_environment=$3",
  "__gs_command=$4",
  "while IFS= command read -r -d '' __gs_entry; do command export \"$__gs_entry\" || command exit 126; done < \"$__gs_environment\"",
  "command rm -f -- \"$__gs_environment\" || command exit 126",
  "> \"$__gs_ready\" || command exit 126",
  "while [[ ! -e \"$__gs_ack\" ]]; do command sleep 0.01; done",
  "command rm -f -- \"$__gs_ready\" \"$__gs_ack\"",
  "command eval -- \"$__gs_command\"",
].join("\n")

const FISH_BOOTSTRAP = [
  "set -l __gs_ready $argv[1]",
  "set -l __gs_ack $argv[2]",
  "set -l __gs_environment $argv[3]",
  "set -l __gs_command $argv[4]",
  "for __gs_entry in (string split0 < $__gs_environment)",
  "  set -l __gs_pair (string split -m 1 = -- $__gs_entry)",
  "  test (count $__gs_pair) -eq 2; or exit 126",
  "  set -gx $__gs_pair[1] $__gs_pair[2]",
  "end",
  "command rm -f -- $__gs_environment; or exit 126",
  "command touch -- $__gs_ready; or exit 126",
  "while not test -e $__gs_ack; command sleep 0.01; end",
  "command rm -f -- $__gs_ready $__gs_ack",
  "eval $__gs_command",
].join("\n")

function diagnostic(
  category: UserShellDiagnosticCategory,
  shell: string,
  mode: UserShellMode,
  stage: string,
  message: string,
  recovery: string,
): UserShellDiagnostic {
  return { category, shell, mode, stage, message, recovery }
}

function fail(
  category: UserShellDiagnosticCategory,
  shell: string,
  mode: UserShellMode,
  stage: string,
  message: string,
  recovery: string,
  cause?: unknown,
): never {
  throw new UserShellError(diagnostic(category, shell, mode, stage, message, recovery), cause === undefined ? undefined : { cause })
}

export function discoverUserShell(
  environment: NodeJS.ProcessEnv = process.env,
  mode: UserShellMode = "command",
): ValidatedUserShell {
  const requested = environment.SHELL
  if (!requested) {
    fail(
      "discovery",
      "<unset>",
      mode,
      "shell-environment",
      "SHELL is not set; a supported user shell cannot be selected.",
      "Set SHELL to the absolute executable path for Bash, zsh, or fish.",
    )
  }
  if (!requested.startsWith("/")) {
    fail(
      "discovery",
      requested,
      mode,
      "shell-path",
      `Configured shell path is not absolute: ${requested}`,
      "Set SHELL to an absolute executable path for Bash, zsh, or fish.",
    )
  }

  let executable: string
  try {
    const stats = statSync(requested)
    if (!stats.isFile()) throw new Error("path is not a regular file")
    accessSync(requested, constants.X_OK)
    executable = realpathSync(requested)
  } catch (error) {
    fail(
      "validation",
      requested,
      mode,
      "shell-executable",
      `Configured shell is unavailable or not executable: ${requested}`,
      "Correct SHELL to an executable Bash, zsh, or fish path and retry.",
      error,
    )
  }

  const identity = basename(executable)
  if (identity !== "bash" && identity !== "zsh" && identity !== "fish") {
    fail(
      "validation",
      executable,
      mode,
      "shell-family",
      `Configured shell is unsupported: ${executable}`,
      "Choose an executable Bash, zsh, or fish shell.",
    )
  }
  return { executable, family: identity }
}

function requireCommandBootstrapPaths(options: BuildUserShellBootstrapOptions): {
  command: string
  readinessPath: string
  acknowledgementPath: string
  environmentPath: string
} {
  if (
    options.command === undefined
    || !options.readinessPath
    || !options.acknowledgementPath
    || !options.environmentPath
  ) {
    throw new TypeError("Command shell planning requires command and private bootstrap paths")
  }
  return {
    command: options.command,
    readinessPath: options.readinessPath,
    acknowledgementPath: options.acknowledgementPath,
    environmentPath: options.environmentPath,
  }
}

export function buildUserShellBootstrap(
  shell: ValidatedUserShell,
  options: BuildUserShellBootstrapOptions,
): UserShellLaunchPlan {
  const initialization = {
    timeoutMs: USER_SHELL_INITIALIZATION_TIMEOUT_MS,
    readiness: "private-file-handshake",
  } as const

  if (options.mode === "pty") {
    const flags = shell.family === "bash"
      ? ["--login", "-i"]
      : shell.family === "zsh"
        ? ["-l", "-i"]
        : ["--login", "--interactive"]
    return { shell, mode: "pty", argv: [shell.executable, ...flags], initialization }
  }

  const paths = requireCommandBootstrapPaths(options)
  const bootstrap = shell.family === "fish" ? FISH_BOOTSTRAP : POSIX_BOOTSTRAP
  const commonArguments = [
    paths.readinessPath,
    paths.acknowledgementPath,
    paths.environmentPath,
    paths.command,
  ]
  const argv = shell.family === "bash"
    ? [shell.executable, "--login", "-i", "-c", bootstrap, "git-stacks-user-shell", ...commonArguments]
    : shell.family === "zsh"
      ? [shell.executable, "-l", "-i", "-c", bootstrap, "git-stacks-user-shell", ...commonArguments]
      : [shell.executable, "--login", "--interactive", "--command", bootstrap, ...commonArguments]
  return { shell, mode: "command", argv, bootstrap, initialization }
}

function serializeEnvironment(environment: Record<string, string>): Buffer {
  const entries = Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))
  const chunks: Buffer[] = []
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("\0")) {
      throw new TypeError(`Invalid environment overlay entry: ${key}`)
    }
    chunks.push(Buffer.from(`${key}=${value}\0`, "utf8"))
  }
  return Buffer.concat(chunks)
}

function sanitizeInheritedEnvironment(
  shell: ValidatedUserShell,
  environment: Record<string, string | undefined>,
): Record<string, string | undefined> {
  if (shell.family !== "bash") return environment

  // Bash imports exported functions from BASH_FUNC_<name>%% environment
  // entries before startup files run. That parent-controlled namespace cannot
  // be allowed to replace bootstrap primitives such as `command` or `eval`.
  // Real interactive-login startup files still run and define their own shell
  // functions normally.
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !key.startsWith("BASH_FUNC_")),
  )
}

function appendBounded(target: Buffer[], chunk: Uint8Array): void {
  const used = target.reduce((total, value) => total + value.byteLength, 0)
  if (used >= MAX_INITIALIZATION_DIAGNOSTIC_BYTES) return
  target.push(Buffer.from(chunk).subarray(0, MAX_INITIALIZATION_DIAGNOSTIC_BYTES - used))
}

async function collectOutput(
  stream: ReadableStream<Uint8Array> | null,
  streamName: "stdout" | "stderr",
  initialized: () => boolean,
  initialization: Buffer[],
  command: Buffer[],
  onOutput?: (output: UserShellOutput) => void,
): Promise<void> {
  if (!stream) return
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    if (initialized()) {
      const copy = Buffer.from(value)
      command.push(copy)
      onOutput?.({ stream: streamName, chunk: copy })
    } else {
      appendBounded(initialization, value)
    }
  }
}

async function exitWithin(
  processHandle: SpawnedProcess,
  milliseconds: number,
  dependencies: UserShellExecutionDependencies,
): Promise<boolean> {
  return Promise.race([
    processHandle.exited.then(() => true, () => true),
    dependencies.wait(milliseconds).then(() => false),
  ])
}

async function processGroupGoneWithin(
  pid: number,
  milliseconds: number,
  dependencies: UserShellExecutionDependencies,
): Promise<boolean> {
  const deadline = dependencies.now() + milliseconds
  while (dependencies.processGroupExists(pid)) {
    const remaining = deadline - dependencies.now()
    if (remaining <= 0) return false
    await dependencies.wait(Math.min(INITIALIZATION_POLL_MS, remaining))
  }
  return true
}

async function terminateProcessGroup(
  processHandle: SpawnedProcess,
  shell: ValidatedUserShell,
  dependencies: UserShellExecutionDependencies,
): Promise<void> {
  processHandle.killGroup("SIGTERM")
  const leaderExitedAfterTerm = await exitWithin(processHandle, USER_SHELL_TERMINATION_GRACE_MS, dependencies)
  const groupExitedAfterTerm = await processGroupGoneWithin(processHandle.pid, USER_SHELL_TERMINATION_GRACE_MS, dependencies)
  if (leaderExitedAfterTerm && groupExitedAfterTerm) return
  processHandle.killGroup("SIGKILL")
  const leaderExitedAfterKill = leaderExitedAfterTerm
    || await exitWithin(processHandle, USER_SHELL_TERMINATION_GRACE_MS, dependencies)
  const groupExitedAfterKill = await processGroupGoneWithin(processHandle.pid, USER_SHELL_TERMINATION_GRACE_MS, dependencies)
  if (leaderExitedAfterKill && groupExitedAfterKill) return
  fail(
    "cleanup",
    shell.executable,
    "command",
    "process-group-exit",
    `Shell process group ${processHandle.pid} did not exit after SIGTERM and SIGKILL.`,
    "Inspect and stop the surviving process group before retrying.",
  )
}

async function waitForInitialization(
  processHandle: SpawnedProcess,
  shell: ValidatedUserShell,
  readinessPath: string,
  signal: AbortSignal | undefined,
  dependencies: UserShellExecutionDependencies,
): Promise<void> {
  const startedAt = dependencies.now()
  while (!existsSync(readinessPath)) {
    if (signal?.aborted) {
      fail(
        "cancellation",
        shell.executable,
        "command",
        "initialization-cancelled",
        "Shell initialization was cancelled.",
        "Retry the command when cancellation is no longer requested.",
        signal.reason,
      )
    }
    if (dependencies.now() - startedAt >= USER_SHELL_INITIALIZATION_TIMEOUT_MS) {
      fail(
        "initialization",
        shell.executable,
        "command",
        "initialization-timeout",
        `Shell initialization exceeded ${USER_SHELL_INITIALIZATION_TIMEOUT_MS}ms.`,
        "Repair or simplify the shell startup files, then retry.",
      )
    }
    const outcome = await Promise.race([
      processHandle.exited.then((exitCode) => ({ exitCode }), (error) => ({ error })),
      dependencies.wait(INITIALIZATION_POLL_MS).then(() => undefined),
    ])
    if (outcome) {
      if ("error" in outcome) {
        fail(
          "initialization",
          shell.executable,
          "command",
          "initialization-spawn",
          "Shell process failed during initialization.",
          "Check the shell executable and startup files, then retry.",
          outcome.error,
        )
      }
      fail(
        "initialization",
        shell.executable,
        "command",
        "initialization-exit",
        `Shell exited with code ${outcome.exitCode} before initialization completed.`,
        "Check the shell startup diagnostics and repair the startup files.",
      )
    }
  }
}

async function waitForCommandExit(
  processHandle: SpawnedProcess,
  signal: AbortSignal | undefined,
): Promise<{ exitCode?: number; cancelled: boolean }> {
  if (!signal) return { exitCode: await processHandle.exited, cancelled: false }
  if (signal.aborted) return { cancelled: true }
  let removeListener: () => void = () => undefined
  const aborted = new Promise<{ cancelled: true }>((resolve) => {
    const listener = () => resolve({ cancelled: true })
    signal.addEventListener("abort", listener, { once: true })
    removeListener = () => signal.removeEventListener("abort", listener)
  })
  const result = await Promise.race([
    processHandle.exited.then((exitCode) => ({ exitCode, cancelled: false as const })),
    aborted,
  ])
  removeListener()
  return result
}

export async function executeUserShellCommand(
  request: ExecuteUserShellCommandRequest,
  dependencyOverrides: Partial<UserShellExecutionDependencies> = {},
): Promise<ExecuteUserShellCommandResult> {
  const dependencies = { ...DEFAULT_EXECUTION_DEPENDENCIES, ...dependencyOverrides }
  const shell = discoverUserShell(request.shellEnvironment ?? process.env, "command")
  const bootstrapRoot = mkdtempSync(join(tmpdir(), "git-stacks-user-shell-"))
  chmodSync(bootstrapRoot, 0o700)
  const readinessPath = join(bootstrapRoot, "ready")
  const acknowledgementPath = join(bootstrapRoot, "ack")
  const environmentPath = join(bootstrapRoot, "environment")
  writeFileSync(environmentPath, serializeEnvironment(request.overlay ?? {}), { mode: 0o600 })
  const plan = buildUserShellBootstrap(shell, {
    mode: "command",
    command: request.command,
    readinessPath,
    acknowledgementPath,
    environmentPath,
  })

  let initialized = false
  let processHandle: SpawnedProcess | undefined
  const initializationDiagnostics: Buffer[] = []
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let outputReaders: Promise<void>[] = []

  try {
    processHandle = dependencies.spawn(plan.argv, {
      cwd: request.cwd,
      env: sanitizeInheritedEnvironment(shell, request.inheritedEnvironment ?? process.env),
      isolatedProcessGroup: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    outputReaders = [
      collectOutput(processHandle.stdout, "stdout", () => initialized, initializationDiagnostics, stdout, request.onOutput),
      collectOutput(processHandle.stderr, "stderr", () => initialized, initializationDiagnostics, stderr, request.onOutput),
    ]
    await waitForInitialization(processHandle, shell, readinessPath, request.signal, dependencies)
    initialized = true
    writeFileSync(acknowledgementPath, "ack", { mode: 0o600 })

    const outcome = await waitForCommandExit(processHandle, request.signal)
    if (outcome.cancelled) {
      await terminateProcessGroup(processHandle, shell, dependencies)
      fail(
        "cancellation",
        shell.executable,
        "command",
        "execution-cancelled",
        "User shell command was cancelled.",
        "Retry the command when cancellation is no longer requested.",
        request.signal?.reason,
      )
    }
    await Promise.all(outputReaders)
    const exitCode = outcome.exitCode ?? 1
    return {
      exitCode,
      shell,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
      initializationDiagnostics: Buffer.concat(initializationDiagnostics),
      diagnostic: exitCode === 0 ? undefined : diagnostic(
        "execution",
        shell.executable,
        "command",
        "command-exit",
        `User shell command exited with code ${exitCode}.`,
        "Review the command output and correct the command before retrying.",
      ),
    }
  } catch (error) {
    if (processHandle && !initialized) {
      await terminateProcessGroup(processHandle, shell, dependencies)
      await Promise.all(outputReaders)
    }
    throw error
  } finally {
    rmSync(bootstrapRoot, { force: true, recursive: true })
  }
}
