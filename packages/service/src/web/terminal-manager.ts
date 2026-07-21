import { createHash, randomBytes } from "node:crypto"
import { chmodSync, closeSync, constants, existsSync, fstatSync, mkdtempSync, openSync, rmSync, writeFileSync, writeSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { spawn as spawnPty } from "node-pty"
import type { Signal, TerminalLaunchResolution, TerminalLaunchStep } from "@git-stacks/protocol"
import {
  buildUserShellBootstrap,
  discoverUserShell,
  UserShellError,
  type ExecuteUserShellCommandRequest,
  type ExecuteUserShellCommandResult,
} from "@git-stacks/core/user-shell"
import { WS_CONFIG_DIR } from "@git-stacks/core/paths"
import type { SnapshotAdapter } from "../snapshot-adapter"
import type { TerminalAttachment } from "../terminal-attachment"
import {
  createWorkspaceLifecycleAdmission,
  type WorkspaceLifecycleAdmission,
} from "../policy/workspace-lifecycle-admission"
import { WebTerminalSchema, WebTerminalSocketControlSchema, type WebTerminal } from "@git-stacks/protocol"
import { TerminalSignalFilter, type TerminalSignal } from "./signal-filter"

export const WEB_TERMINAL_MAX_TOTAL = 48
export const WEB_TERMINAL_MAX_PER_PRINCIPAL = 16
export const WEB_TERMINAL_REPLAY_BYTES = 1024 * 1024
export const WEB_TERMINAL_SOCKET_PRESSURE_BYTES = 512 * 1024
export const WEB_TERMINAL_ENDED_RETENTION_MS = 60 * 60 * 1_000
export const WEB_TERMINAL_LAUNCH_RESOLUTION_TIMEOUT_MS = 10_000
export const PTY_CANARY_BYPASS_ENV = "GIT_STACKS_CANARY_BYPASS_INTERACTIVE_PTY_INITIALIZATION"
export const PTY_CANARY_DIAGNOSTICS_ENV = "GIT_STACKS_CANARY_PTY_DIAGNOSTICS"

export type PtyCanaryDiagnostic = {
  id: string
  phase: "launch" | "spawned" | "initializing" | "initialization_bypassed" | "initialized" | "initialization_failed" | "session_ready" | "attached" | "first_output" | "first_input" | "exited"
  shell?: "bash" | "zsh" | "fish"
  bypass?: boolean
  pid?: number
  exit_code?: number
  signal?: number
  failure?: "early_exit" | "timeout" | "other"
}

function appendPtyCanaryDiagnostic(event: PtyCanaryDiagnostic): void {
  if (process.env[PTY_CANARY_DIAGNOSTICS_ENV] !== "1") return
  let descriptor: number | undefined
  try {
    const path = join(WS_CONFIG_DIR, "service", "pty-canary.jsonl")
    descriptor = openSync(path, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) return
    writeSync(descriptor, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`)
  } catch {
    // Diagnostic capture must never alter terminal behavior.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

type OutputChunk = { cursor: bigint; bytes: Uint8Array }
type Attachment = { socket: TerminalAttachment; ack: bigint; pressured: boolean; streaming: boolean }
export interface PtyProcess {
  readonly pid: number
  cancelSequence?(): void
  releasePreAttachment?(): void
  outputObserved?(): boolean
  outputIdleFor?(milliseconds: number): boolean
  suppressOutput?(): void
  resumeOutput?(): void
  write(data: string): void
  resize(columns: number, rows: number): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
}

export type PtyFactory = (
  argv: string[],
  options: { cwd: string; env: Record<string, string | undefined>; cols: number; rows: number; name: string },
) => PtyProcess

export type TerminalCommandStepRunner = (
  request: ExecuteUserShellCommandRequest,
) => Promise<ExecuteUserShellCommandResult>

const productionPty: PtyFactory = (argv, options) => {
  const [file, ...args] = argv
  if (!file) throw new Error("Terminal command is empty")
  return spawnPty(file, args, options)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function ptyOverlay(environment: Record<string, string>): {
  entries: Array<{ key: string; shadow: string }>
  environment: Record<string, string>
} {
  const entries = Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("\0")) throw new TypeError(`Invalid PTY environment entry: ${key}`)
  }
  const nonce = randomBytes(12).toString("hex")
  return {
    entries: entries.map(([key], index) => ({ key, shadow: `__GS_PTY_${nonce}_${index}` })),
    environment: Object.fromEntries(entries.map(([, value], index) => [`__GS_PTY_${nonce}_${index}`, value])),
  }
}

export function createPtyInitialization(
  shell: "bash" | "zsh" | "fish",
  environment: Record<string, string>,
  command?: string,
): { shell: "bash" | "zsh" | "fish"; root: string; readyPath: string; statusPathPrefix: string; bootstrap: string; environment: Record<string, string>; command?: string } {
  const root = mkdtempSync(join(tmpdir(), "git-stacks-pty-"))
  chmodSync(root, 0o700)
  const readyPath = join(root, "ready")
  const statusPathPrefix = join(root, "status.")
  const overlay = ptyOverlay(environment)
  const ok = `__GS_PTY_OK_${randomBytes(12).toString("hex")}`
  const bootstrap = shell === "fish"
    ? (() => {
        const valuePaths = overlay.entries.map(({ key }, index) => {
          const valuePath = join(root, `value.${index}`)
          writeFileSync(valuePath, `${environment[key]}\0`, { mode: 0o600 })
          return valuePath
        })
        return [
          "begin",
          `builtin set -l ${ok} 1`,
          ...overlay.entries.map(({ key }, index) =>
            `builtin read --null --global --export ${key} < ${shellQuote(valuePaths[index]!)}; or builtin set ${ok} 0`),
          `builtin test \"$${ok}\" = 1; and builtin printf '' > ${shellQuote(readyPath)}`,
          "end > /dev/null 2>&1",
        ].join("; ")
      })()
    : (() => {
        const body = [
          `${ok}=1`,
          ...overlay.entries.flatMap(({ key, shadow }) => [
            `${key}=\"$${shadow}\"`,
            `case \"\${${key}-}\" in \"$${shadow}\") ;; *) ${ok}= ;; esac`,
          ]),
          `case \"$${ok}\" in 1) > ${shellQuote(readyPath)} ;; esac`,
        ].join("; ")
        if (shell === "zsh") return `{ ${body}; } > /dev/null 2>&1`
        const silentBody = `{ ${body}; } > /dev/null 2>&1`
        return `BASH_XTRACEFD=2; case \"\${BASH_XTRACEFD-}\" in 2) ${silentBody} ;; esac`
      })()
  let initializationEnvironment = shell === "fish" ? {} : overlay.environment
  if (shell === "zsh") {
    const originalZdotdir = environment.ZDOTDIR || process.env.ZDOTDIR || environment.HOME || process.env.HOME
    if (originalZdotdir) {
      const sourceOriginal = (name: string) => [
        `if [[ -r ${shellQuote(join(originalZdotdir, name))} ]]; then`,
        `  builtin source -- ${shellQuote(join(originalZdotdir, name))}`,
        "fi",
      ].join("\n")
      for (const name of [".zshenv", ".zprofile", ".zshrc"]) {
        writeFileSync(join(root, name), `${sourceOriginal(name)}\nZDOTDIR=${shellQuote(root)}\n`, { mode: 0o600 })
      }
      writeFileSync(join(root, ".zlogin"), [
        sourceOriginal(".zlogin"),
        `ZDOTDIR=${shellQuote(originalZdotdir)}`,
        bootstrap,
        "",
      ].join("\n"), { mode: 0o600 })
      initializationEnvironment = { ...overlay.environment, ZDOTDIR: root }
    }
  }
  return { shell, root, readyPath, statusPathPrefix, bootstrap, environment: initializationEnvironment, ...(command === undefined ? {} : { command }) }
}

function createPtyCommandInitialization(
  shell: ReturnType<typeof discoverUserShell>,
  environment: Record<string, string>,
  command: string,
): { root: string; readyPath: string; acknowledgementPath: string; argv: string[] } {
  const root = mkdtempSync(join(tmpdir(), "git-stacks-pty-command-"))
  chmodSync(root, 0o700)
  const readyPath = join(root, "ready")
  const acknowledgementPath = join(root, "ack")
  const environmentPath = join(root, "environment")
  const chunks: Buffer[] = []
  for (const [key, value] of Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("\0")) throw new TypeError(`Invalid PTY environment entry: ${key}`)
    chunks.push(Buffer.from(`${key}=${value}\0`, "utf8"))
  }
  writeFileSync(environmentPath, Buffer.concat(chunks), { mode: 0o600 })
  const plan = buildUserShellBootstrap(shell, {
    mode: "command",
    command,
    readinessPath: readyPath,
    acknowledgementPath,
    environmentPath,
  })
  return { root, readyPath, acknowledgementPath, argv: [...plan.argv] }
}

async function waitForPtyReady(
  processHandle: PtyProcess,
  readyPath: string,
  timeoutMs = 10_000,
): Promise<void> {
  let exited = false
  const subscription = processHandle.onExit(() => { exited = true })
  const deadline = Date.now() + timeoutMs
  try {
    while (!existsSync(readyPath)) {
      if (exited) throw new Error("Shell exited before PTY initialization completed")
      if (Date.now() >= deadline) throw new Error(`Shell PTY initialization exceeded ${timeoutMs}ms`)
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
  } finally {
    subscription.dispose()
  }
}

async function waitForPtyInitialization(
  processHandle: PtyProcess,
  initialization: ReturnType<typeof createPtyInitialization>,
  timeoutMs = 30_000,
  injectBootstrap = true,
  bootstrapDelayMs = 1_000,
): Promise<void> {
  let exited = false
  let initialized = false
  const exitSubscription = processHandle.onExit(() => { exited = true })
  const deadline = Date.now() + timeoutMs
  try {
    // Bash and zsh profiles can read from the terminal while they initialize
    // (prompt frameworks commonly issue capability probes). Do not let the
    // private bootstrap become an accidental response to one of those reads.
    if (injectBootstrap) {
      const injectAt = Math.min(deadline, Date.now() + bootstrapDelayMs)
      while (Date.now() < injectAt) {
        if (exited) throw new Error("Shell exited before PTY initialization completed")
        if (processHandle.outputObserved?.() && (processHandle.outputIdleFor?.(100) ?? true)) break
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(10, injectAt - Date.now())))
      }
      if (Date.now() >= deadline) throw new Error(`Shell PTY initialization exceeded ${timeoutMs}ms`)
      processHandle.suppressOutput?.()
      processHandle.write(`${initialization.bootstrap}\r`)
    }
    let retryBootstrapAt = Date.now() + Math.max(250, bootstrapDelayMs)
    while (!existsSync(initialization.readyPath)) {
      if (exited) throw new Error("Shell exited before PTY initialization completed")
      if (Date.now() >= deadline) throw new Error(`Shell PTY initialization exceeded ${timeoutMs}ms`)
      if (injectBootstrap && Date.now() >= retryBootstrapAt) {
        // A terminal capability read can consume the first injected line even
        // after its visible query has been answered. Retrying the idempotent,
        // output-suppressed bootstrap lets the shell accept it once the line
        // editor owns terminal input, without exposing private values.
        processHandle.write(`${initialization.bootstrap}\r`)
        retryBootstrapAt = Date.now() + Math.max(250, bootstrapDelayMs)
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
    initialized = true
  } finally {
    processHandle.resumeOutput?.()
    exitSubscription.dispose()
  }
  if (initialized && injectBootstrap) {
    // Initialization output is hidden so private bootstrap text cannot reach
    // browser history. Ask Readline/ZLE to redraw after output resumes; the
    // prompt may otherwise have been rendered entirely inside that hidden
    // interval, leaving an attached terminal blank with input still active.
    processHandle.write("\u000c")
  }
}

function ptyInitializationLaunch(
  argv: readonly string[],
  initialization: ReturnType<typeof createPtyInitialization>,
): { argv: string[]; injectBootstrap: boolean } {
  // Fish 4.6 performs terminal capability queries before reading interactive
  // input. terminal.create cannot attach xterm until initialization completes,
  // so writing the bootstrap through the PTY deadlocks. --init-command runs
  // after the user's real config but before Fish starts reading terminal input.
  if (initialization.shell === "fish") {
    return { argv: [...argv, "--init-command", initialization.bootstrap], injectBootstrap: false }
  }
  if (
    initialization.shell === "zsh"
    && (argv.includes("-l") || argv.includes("--login"))
    && !argv.includes("-f")
    && initialization.environment.ZDOTDIR === initialization.root
  ) {
    return { argv: [...argv], injectBootstrap: false }
  }
  return { argv: [...argv], injectBootstrap: true }
}

const PRIMARY_DEVICE_ATTRIBUTES_QUERY = "\u001b[0c"
const XTERM_PRIMARY_DEVICE_ATTRIBUTES_RESPONSE = "\u001b[?1;2c"

function bufferPty(processHandle: PtyProcess, answerPrimaryDeviceAttributes = false): PtyProcess {
  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
  const pendingData: string[] = []
  let preAttachment = answerPrimaryDeviceAttributes
  let outputObserved = false
  let lastOutputAt = 0
  let outputSuppressed = false
  let negotiationPending = ""
  let pendingExit: { exitCode: number; signal?: number } | undefined
  const emitData = (data: string) => {
    if (!data || outputSuppressed) return
    if (dataListeners.size) dataListeners.forEach((listener) => listener(data))
    else pendingData.push(data)
  }
  processHandle.onData((data) => {
    outputObserved = true
    lastOutputAt = Date.now()
    if (!preAttachment) { emitData(data); return }
    let input = negotiationPending + data
    negotiationPending = ""
    let output = ""
    while (input) {
      const query = input.indexOf(PRIMARY_DEVICE_ATTRIBUTES_QUERY)
      if (query >= 0) {
        output += input.slice(0, query)
        processHandle.write(XTERM_PRIMARY_DEVICE_ATTRIBUTES_RESPONSE)
        input = input.slice(query + PRIMARY_DEVICE_ATTRIBUTES_QUERY.length)
        continue
      }
      let held = 0
      for (let size = Math.min(input.length, PRIMARY_DEVICE_ATTRIBUTES_QUERY.length - 1); size > 0; size -= 1) {
        if (PRIMARY_DEVICE_ATTRIBUTES_QUERY.startsWith(input.slice(-size))) { held = size; break }
      }
      output += input.slice(0, input.length - held)
      negotiationPending = input.slice(input.length - held)
      break
    }
    emitData(output)
  })
  processHandle.onExit((event) => {
    emitData(negotiationPending)
    negotiationPending = ""
    pendingExit = event
    for (const listener of exitListeners) listener(event)
  })
  return {
    pid: processHandle.pid,
    cancelSequence: () => processHandle.cancelSequence?.(),
    releasePreAttachment: () => {
      if (!preAttachment) return
      preAttachment = false
      emitData(negotiationPending)
      negotiationPending = ""
    },
    outputObserved: () => outputObserved,
    outputIdleFor: (milliseconds) => outputObserved && Date.now() - lastOutputAt >= milliseconds,
    suppressOutput: () => {
      outputSuppressed = true
      negotiationPending = ""
    },
    resumeOutput: () => { outputSuppressed = false },
    write: (data) => processHandle.write(data),
    resize: (columns, rows) => processHandle.resize(columns, rows),
    kill: (signal) => processHandle.kill(signal),
    onData(listener) {
      dataListeners.add(listener)
      for (const data of pendingData.splice(0)) listener(data)
      return { dispose: () => { dataListeners.delete(listener) } }
    },
    onExit(listener) {
      exitListeners.add(listener)
      if (pendingExit) queueMicrotask(() => listener(pendingExit!))
      return { dispose: () => { exitListeners.delete(listener) } }
    },
  }
}

type Session = {
  id: string
  principalId: string
  workspaceId: string
  repositoryId: string
  commandId?: string
  surfaceId: string
  title: string
  automaticTitle: string
  titlePinned: boolean
  state: WebTerminal["state"]
  createdAt: string
  endedAt?: number
  exitCode: number | null
  cursor: bigint
  earliestCursor: bigint
  historyAvailable: boolean
  chunks: OutputChunk[]
  replayBytes: number
  process: PtyProcess
  exited: Promise<number>
  closePromise?: Promise<WebTerminal>
  attachment?: Attachment
  filter: TerminalSignalFilter
  agentSessions: Map<TerminalSignal["provider"], string>
  diagnosticId?: string
  diagnosticShell?: "bash" | "zsh" | "fish"
  diagnosticInputObserved?: boolean
}

export type { TerminalAttachmentData } from "../terminal-attachment"

export type WebTerminalCreateInput = {
  workspace_id: string
  repository_id: string
  command_id?: string
  expected_revision: string
  cols: number
  rows: number
}

export type WorkspaceTerminalCloseResult =
  | { ok: true; status: "closed"; requested: number; closed: number; failed: 0 }
  | { ok: false; status: "cleanup_failed"; requested: number; closed: number; failed: number }

export type WebTerminalManagerTiming = {
  launchResolutionTimeoutMs?: number
  ptyInitializationTimeoutMs?: number
  ptyBootstrapDelayMs?: number
  setTimeout?: (callback: () => void, delayMs: number) => unknown
  clearTimeout?: (handle: unknown) => void
  bypassInteractiveInitialization?: boolean
  ptyDiagnostic?: (event: PtyCanaryDiagnostic) => void
}

function terminalId(): string { return `term_${randomBytes(16).toString("base64url")}` }
function activityId(session: Session, signal: Pick<TerminalSignal, "provider" | "sessionId">): string {
  return `sig_${createHash("sha256").update(`${session.surfaceId}\0${signal.provider}\0${signal.sessionId}`).digest("hex").slice(0, 32)}`
}
function stateTitle(provider: string, state: TerminalSignal["state"]): string {
  const label = provider === "codex" ? "Codex" : provider === "claude" ? "Claude" : provider === "copilot" ? "GitHub Copilot" : "OpenCode"
  if (state === "waiting") return `${label} needs your input`
  if (state === "completed") return `${label} finished and may need your attention`
  if (state === "failed") return `${label} encountered an error`
  return `${label} is working`
}

export function encodeTerminalFrame(cursor: bigint, bytes: Uint8Array): Uint8Array {
  const frame = new Uint8Array(9 + bytes.length)
  frame[0] = 1
  new DataView(frame.buffer).setBigUint64(1, cursor)
  frame.set(bytes, 9)
  return frame
}

export class WebTerminalManager {
  private sessions = new Map<string, Session>()
  private controlsReceived = 0
  private inputsReceived = 0

  constructor(
    private readonly snapshot: SnapshotAdapter,
    private readonly publishSignal?: (signal: Signal) => Promise<void>,
    private readonly onActiveChange?: (count: number) => void,
    private readonly now: () => number = Date.now,
    private readonly spawn: PtyFactory = productionPty,
    private readonly workspaceLifecycleAdmission: Pick<WorkspaceLifecycleAdmission, "admitTerminal"> = createWorkspaceLifecycleAdmission(),
    private readonly closeTimeoutMs = 1_000,
    private readonly timing: WebTerminalManagerTiming = {},
    private readonly runCommandStep?: TerminalCommandStepRunner,
    private readonly processGroupExists: (pid: number) => boolean = (pid) => {
      if (process.platform === "win32" || pid <= 0) return false
      try {
        process.kill(-pid, 0)
        return true
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM"
      }
    },
  ) {}

  get activeCount(): number { return [...this.sessions.values()].filter((session) => session.state === "starting" || session.state === "running" || session.state === "closing").length }
  get diagnostics(): { sessions: number; active: number; attached: number; streaming: number; controls_received: number; inputs_received: number } {
    const attachments = [...this.sessions.values()].flatMap((session) => session.attachment ? [session.attachment] : [])
    return { sessions: this.sessions.size, active: this.activeCount, attached: attachments.length, streaming: attachments.filter((attachment) => attachment.streaming).length, controls_received: this.controlsReceived, inputs_received: this.inputsReceived }
  }

  list(principalId: string): WebTerminal[] {
    this.prune()
    return [...this.sessions.values()].filter((session) => session.principalId === principalId).map((session) => this.project(session))
  }

  surfaceIds(principalId: string): Set<string> {
    this.prune()
    return new Set([...this.sessions.values()].filter((session) => session.principalId === principalId).map((session) => session.surfaceId))
  }

  get(principalId: string, id: string): WebTerminal | undefined {
    const session = this.sessions.get(id)
    return session?.principalId === principalId ? this.project(session) : undefined
  }

  async create(principalId: string, input: WebTerminalCreateInput): Promise<WebTerminal> {
    this.prune()
    if (!this.snapshot.resolveTerminalLaunch) throw Object.assign(new Error("Terminal launch is unavailable"), { status: 409, code: "capability_unavailable" })
    if (this.sessions.size >= WEB_TERMINAL_MAX_TOTAL || [...this.sessions.values()].filter((session) => session.principalId === principalId && session.state !== "ended").length >= WEB_TERMINAL_MAX_PER_PRINCIPAL) {
      throw Object.assign(new Error("Terminal capacity reached"), { status: 429, code: "capacity_exceeded" })
    }
    const admission = this.workspaceLifecycleAdmission.admitTerminal(input.workspace_id)
    try {
      const resolution = await this.resolveTerminalLaunch({
        workspace_id: input.workspace_id,
        repository_id: input.repository_id,
        ...(input.command_id ? { command_id: input.command_id } : {}),
        expected_revision: input.expected_revision,
      })
      if (!resolution.resolved) throw Object.assign(new Error(resolution.error.message), { status: resolution.error.code === "not_found" ? 404 : 409, code: resolution.error.code })

      const id = terminalId()
      const surfaceId = crypto.randomUUID()
      const signalToken = randomBytes(32).toString("base64url")
      let session: Session | undefined
      const filter = new TerminalSignalFilter(signalToken, (signal) => { if (session) void this.handleSignal(session, signal) })
      const diagnosticId = randomBytes(6).toString("hex")
      let diagnosticShell: "bash" | "zsh" | "fish" | undefined
      const recordDiagnostic = (event: Omit<PtyCanaryDiagnostic, "id">) => {
        const diagnostic = { id: diagnosticId, ...event }
        if (this.timing.ptyDiagnostic) this.timing.ptyDiagnostic(diagnostic)
        else appendPtyCanaryDiagnostic(diagnostic)
      }
      let resolveExit!: (code: number) => void
      const exited = new Promise<number>((resolve) => { resolveExit = resolve })
      let child: PtyProcess
      let deferredInitialization: {
        initialization: ReturnType<typeof createPtyInitialization>
        injectBootstrap: boolean
      } | undefined
      try {
        const terminalEnvironment = {
          GIT_STACKS_SURFACE_ID: surfaceId,
          GIT_STACKS_TAB_ID: surfaceId,
          GIT_STACKS_WORKSPACE_ID: input.workspace_id,
          GIT_STACKS_REPOSITORY_ID: input.repository_id,
          GIT_STACKS_SIGNAL_TOKEN: signalToken,
          GIT_STACKS_SIGNAL_TRANSPORT: "osc9",
        }
        const launch = resolution.launch
        if ("argv" in launch) {
          diagnosticShell = launch.initialization?.shell
          const bypassInteractiveInitialization = launch.initialization !== undefined
            && (this.timing.bypassInteractiveInitialization
              ?? process.env[PTY_CANARY_BYPASS_ENV] === "1")
          recordDiagnostic({
            phase: "launch",
            ...(diagnosticShell === undefined ? {} : { shell: diagnosticShell }),
            bypass: bypassInteractiveInitialization,
          })
          const initialization = launch.initialization && !bypassInteractiveInitialization
            ? createPtyInitialization(launch.initialization.shell, {
                ...launch.environment,
                ...terminalEnvironment,
              })
            : undefined
          try {
            const initializationLaunch = initialization
              ? ptyInitializationLaunch(launch.argv, initialization)
              : { argv: [...launch.argv], injectBootstrap: true }
            const spawned = bufferPty(this.spawn(initializationLaunch.argv, {
              cwd: launch.cwd,
              env: {
                ...launch.environment,
                ...initialization?.environment,
                TERM: launch.environment.TERM ?? "xterm-256color",
                COLORTERM: launch.environment.COLORTERM ?? "truecolor",
                ...terminalEnvironment,
              },
              cols: input.cols,
              rows: input.rows,
              name: "xterm-256color",
            }), initialization !== undefined)
            recordDiagnostic({
              phase: "spawned",
              ...(diagnosticShell === undefined ? {} : { shell: diagnosticShell }),
              bypass: bypassInteractiveInitialization,
              pid: spawned.pid,
            })
            if (initialization) {
              const spawnedExited = new Promise<number>((resolve) => spawned.onExit(({ exitCode }) => resolve(exitCode)))
              if (initialization.shell === "zsh" && !initializationLaunch.injectBootstrap) {
                // Login zsh profiles can negotiate with the real terminal before
                // .zlogin applies the authoritative overlay. Publish the session
                // first so xterm can answer those queries, then observe the
                // startup-file readiness marker without injecting terminal input.
                deferredInitialization = {
                  initialization,
                  injectBootstrap: initializationLaunch.injectBootstrap,
                }
                recordDiagnostic({ phase: "initializing", shell: launch.initialization!.shell, bypass: false, pid: spawned.pid })
              } else {
                try {
                  recordDiagnostic({ phase: "initializing", shell: launch.initialization!.shell, bypass: false, pid: spawned.pid })
                  await waitForPtyInitialization(
                    spawned,
                    initialization,
                    this.timing.ptyInitializationTimeoutMs,
                    initializationLaunch.injectBootstrap,
                    this.timing.ptyBootstrapDelayMs,
                  )
                  recordDiagnostic({ phase: "initialized", shell: launch.initialization!.shell, bypass: false, pid: spawned.pid })
                } catch (error) {
                  const message = error instanceof Error ? error.message : ""
                  recordDiagnostic({
                    phase: "initialization_failed",
                    shell: launch.initialization!.shell,
                    bypass: false,
                    pid: spawned.pid,
                    failure: message.includes("exited") ? "early_exit" : message.includes("exceeded") ? "timeout" : "other",
                  })
                  // A shell profile can exit during initialization (for example
                  // after a failed user-level `cd`). One bounded TERM/KILL attempt
                  // is safe while this spawn is still owned here. Never retain a
                  // bare PID for deferred signaling: that process-group ID may be
                  // reused after the original leader exits.
                  try {
                    await this.terminatePtyProcessGroup(spawned, spawnedExited)
                  } catch {}
                  throw error
                }
              }
            } else if (bypassInteractiveInitialization) {
              recordDiagnostic({ phase: "initialization_bypassed", shell: launch.initialization!.shell, bypass: true, pid: spawned.pid })
            }
            child = spawned
          } finally {
            if (initialization && deferredInitialization?.initialization !== initialization) {
              rmSync(initialization.root, { force: true, recursive: true })
            }
          }
        } else {
          child = this.createCommandProcess(launch.steps, terminalEnvironment, input.cols, input.rows)
        }
      } catch (error) {
        throw Object.assign(new Error(`PTY allocation failed: ${(error as Error).message}`), { status: 409, code: "capability_unavailable" })
      }
      const activeSession: Session = {
        id,
        principalId,
        workspaceId: input.workspace_id,
        repositoryId: input.repository_id,
        ...(input.command_id ? { commandId: input.command_id } : {}),
        surfaceId,
        title: input.command_id ? "Command" : "Shell",
        automaticTitle: input.command_id ? "Command" : "Shell",
        titlePinned: false,
        state: "running",
        createdAt: new Date(this.now()).toISOString(),
        exitCode: null,
        cursor: 0n,
        earliestCursor: 0n,
        historyAvailable: true,
        chunks: [],
        replayBytes: 0,
        process: child,
        exited,
        filter,
        agentSessions: new Map(),
        ...(diagnosticShell === undefined ? {} : { diagnosticId, diagnosticShell }),
      }
      session = activeSession
      let outputObserved = false
      child.onData((data) => {
        if (!outputObserved && activeSession.diagnosticId && activeSession.diagnosticShell) {
          outputObserved = true
          recordDiagnostic({ phase: "first_output", shell: activeSession.diagnosticShell, pid: child.pid })
        }
        const sanitized = filter.push(new TextEncoder().encode(data))
        if (sanitized.length) this.output(activeSession, sanitized)
      })
      child.onExit(({ exitCode, signal }) => {
        if (activeSession.diagnosticId && activeSession.diagnosticShell) {
          recordDiagnostic({
            phase: "exited",
            shell: activeSession.diagnosticShell,
            pid: child.pid,
            exit_code: exitCode,
            ...(signal === undefined ? {} : { signal }),
          })
        }
        resolveExit(exitCode)
        const remaining = filter.flush()
        if (remaining.length) this.output(activeSession, remaining)
        activeSession.state = "ended"
        activeSession.exitCode = exitCode
        activeSession.endedAt = this.now()
        this.sendControl(activeSession, { type: "exit", code: exitCode })
        this.notifyActive()
      })
      this.sessions.set(id, activeSession)
      if (diagnosticShell !== undefined) recordDiagnostic({ phase: "session_ready", shell: diagnosticShell, pid: child.pid })
      this.notifyActive()
      if (deferredInitialization) {
        const pending = deferredInitialization
        void (async () => {
          try {
            await waitForPtyInitialization(
              child,
              pending.initialization,
              this.timing.ptyInitializationTimeoutMs,
              pending.injectBootstrap,
              this.timing.ptyBootstrapDelayMs,
            )
            recordDiagnostic({ phase: "initialized", shell: pending.initialization.shell, bypass: false, pid: child.pid })
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown initialization failure"
            recordDiagnostic({
              phase: "initialization_failed",
              shell: pending.initialization.shell,
              bypass: false,
              pid: child.pid,
              failure: message.includes("exited") ? "early_exit" : message.includes("exceeded") ? "timeout" : "other",
            })
            this.output(activeSession, new TextEncoder().encode(`\r\n[git-stacks shell initialization] ${message}\r\n`))
            try { await this.terminatePtyProcessGroup(child, activeSession.exited) } catch {}
          } finally {
            rmSync(pending.initialization.root, { force: true, recursive: true })
          }
        })()
      }
      return this.project(activeSession)
    } finally {
      admission.release()
    }
  }

  private createCommandProcess(
    steps: TerminalLaunchStep[],
    terminalEnvironment: Record<string, string>,
    columns: number,
    rows: number,
  ): PtyProcess {
    if (!this.runCommandStep) return this.createCommandPtyProcess(steps, terminalEnvironment, columns, rows)
    const controller = new AbortController()
    const decoder = new TextDecoder()
    let dataListener: (data: string) => void = () => undefined
    let exitListener: (event: { exitCode: number; signal?: number }) => void = () => undefined
    let exited = false
    const finish = (exitCode: number, signal?: number) => {
      if (exited) return
      exited = true
      const remaining = decoder.decode()
      if (remaining) dataListener(remaining)
      exitListener({ exitCode, ...(signal === undefined ? {} : { signal }) })
    }
    const reportDiagnostic = (diagnostic: ExecuteUserShellCommandResult["diagnostic"]) => {
      dataListener(diagnostic
        ? `\r\n[git-stacks shell ${diagnostic.category}] ${diagnostic.message} Recovery: ${diagnostic.recovery}\r\n`
        : "\r\n[git-stacks shell execution] Command execution failed. Retry after checking shell configuration.\r\n")
    }
    queueMicrotask(() => void (async () => {
      try {
        for (const step of steps) {
          const result = await this.runCommandStep!({
            command: step.command,
            cwd: step.cwd,
            shellEnvironment: process.env,
            inheritedEnvironment: process.env,
            overlay: { ...step.environment, ...terminalEnvironment },
            signal: controller.signal,
            onOutput: ({ chunk }) => {
              const text = decoder.decode(chunk, { stream: true })
              if (text) dataListener(text)
            },
          })
          if (result.exitCode !== 0) {
            reportDiagnostic(result.diagnostic)
            finish(result.exitCode)
            return
          }
        }
        finish(0)
      } catch (error) {
        const diagnostic = error instanceof UserShellError
          ? error.diagnostic
          : (error as { diagnostic?: ExecuteUserShellCommandResult["diagnostic"] }).diagnostic
        reportDiagnostic(diagnostic)
        finish(controller.signal.aborted ? 130 : 126, controller.signal.aborted ? 15 : undefined)
      }
    })())
    return {
      pid: 0,
      write: () => undefined,
      resize: () => undefined,
      kill: () => controller.abort(new Error("terminal command cancelled")),
      onData(listener) { dataListener = listener; return { dispose: () => { dataListener = () => undefined } } },
      onExit(listener) { exitListener = listener; return { dispose: () => { exitListener = () => undefined } } },
    }
  }

  private createCommandPtyProcess(
    steps: TerminalLaunchStep[],
    terminalEnvironment: Record<string, string>,
    initialColumns: number,
    initialRows: number,
  ): PtyProcess {
    const shell = discoverUserShell(process.env, "command")
    let active: PtyProcess | undefined
    let columns = initialColumns
    let rows = initialRows
    let cancelled = false
    let acceptsInput = false
    let lastPid = 0
    let dataListener: (data: string) => void = () => undefined
    let exitListener: (event: { exitCode: number; signal?: number }) => void = () => undefined
    let exited = false
    const pendingInput: string[] = []
    const finish = (exitCode: number, signal?: number) => {
      if (exited) return
      exited = true
      exitListener({ exitCode, ...(signal === undefined ? {} : { signal }) })
    }

    queueMicrotask(() => void (async () => {
      try {
        for (const step of steps) {
          if (cancelled) {
            finish(130, 15)
            return
          }
          const initialization = createPtyCommandInitialization(shell, {
            ...step.environment,
            ...terminalEnvironment,
          }, step.command)
          try {
            const inheritedEnvironment = shell.family === "bash"
              ? Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("BASH_FUNC_")))
              : process.env
            const child = this.spawn(initialization.argv, {
              cwd: step.cwd,
              env: {
                ...inheritedEnvironment,
                TERM: process.env.TERM ?? "xterm-256color",
                COLORTERM: process.env.COLORTERM ?? "truecolor",
              },
              cols: columns,
              rows,
              name: "xterm-256color",
            })
            active = child
            lastPid = child.pid
            acceptsInput = false
            child.onData((data) => dataListener(data))
            let resolveExit!: (event: { exitCode: number; signal?: number }) => void
            const childExited = new Promise<{ exitCode: number; signal?: number }>((resolve) => { resolveExit = resolve })
            child.onExit(resolveExit)
            try {
              await waitForPtyReady(child, initialization.readyPath, this.timing.ptyInitializationTimeoutMs)
            } catch (error) {
              try {
                await this.terminatePtyProcessGroup(child, childExited)
                active = undefined
              } catch (cleanupError) {
                dataListener(`\r\n[git-stacks shell cleanup] ${(cleanupError as Error).message}\r\n`)
                // Keep the logical terminal honest while the failed-init group
                // is still alive, but settle it as soon as the original PTY
                // reports its eventual exit. This observer never sends another
                // signal to a numeric PID that could have been reused.
                void childExited.then((event) => {
                  if (active === child) active = undefined
                  acceptsInput = false
                  finish(event.exitCode === 0 ? 126 : event.exitCode, event.signal)
                })
                return
              }
              throw error
            }
            if (cancelled) {
              child.kill("SIGTERM")
            } else {
              acceptsInput = true
              for (const input of pendingInput.splice(0)) child.write(input)
              writeFileSync(initialization.acknowledgementPath, "ack", { mode: 0o600 })
            }
            const event = await childExited
            acceptsInput = false
            if (cancelled) {
              finish(event.exitCode || 130, event.signal)
              return
            }
            if (this.processGroupExists(child.pid)) {
              try {
                await this.terminatePtyProcessGroup(child, childExited)
              } catch (cleanupError) {
                dataListener(`\r\n[git-stacks shell cleanup] ${(cleanupError as Error).message}\r\n`)
                return
              }
            }
            active = undefined
            if (event.exitCode !== 0) {
              finish(event.exitCode, event.signal)
              return
            }
          } finally {
            rmSync(initialization.root, { force: true, recursive: true })
          }
        }
        finish(0)
      } catch (error) {
        dataListener(`\r\n[git-stacks shell initialization] ${(error as Error).message}\r\n`)
        finish(cancelled ? 130 : 126, cancelled ? 15 : undefined)
      }
    })())

    return {
      get pid() { return active?.pid ?? lastPid },
      cancelSequence() { cancelled = true },
      write(data) {
        if (active && acceptsInput) active.write(data)
        else pendingInput.push(data)
      },
      resize(nextColumns, nextRows) {
        columns = nextColumns
        rows = nextRows
        active?.resize(nextColumns, nextRows)
      },
      kill(signal = "SIGTERM") {
        cancelled = true
        active?.kill(signal)
      },
      onData(listener) { dataListener = listener; return { dispose: () => { dataListener = () => undefined } } },
      onExit(listener) { exitListener = listener; return { dispose: () => { exitListener = () => undefined } } },
    }
  }

  private resolveTerminalLaunch(
    request: Parameters<NonNullable<SnapshotAdapter["resolveTerminalLaunch"]>>[0],
  ): Promise<TerminalLaunchResolution> {
    const resolveLaunch = this.snapshot.resolveTerminalLaunch!
    const controller = new AbortController()
    const timeoutMs = this.timing.launchResolutionTimeoutMs ?? WEB_TERMINAL_LAUNCH_RESOLUTION_TIMEOUT_MS
    const setTimer = this.timing.setTimeout ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs))
    const clearTimer = this.timing.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

    return new Promise((resolve, reject) => {
      let settled = false
      let timer: unknown
      const finish = (settle: () => void) => {
        if (settled) return
        settled = true
        clearTimer(timer)
        settle()
      }
      timer = setTimer(() => {
        if (settled) return
        controller.abort()
        finish(() => reject(Object.assign(new Error(`Terminal launch resolution timed out after ${timeoutMs}ms`), {
          status: 504,
          code: "request_timeout",
        })))
      }, timeoutMs)
      ;(timer as { unref?: () => void } | undefined)?.unref?.()

      let pending: Promise<TerminalLaunchResolution>
      try {
        pending = resolveLaunch(request, controller.signal)
      } catch (error) {
        finish(() => reject(error))
        return
      }
      void pending.then(
        (resolution) => finish(() => resolve(resolution)),
        (error) => finish(() => reject(error)),
      )
    })
  }

  rename(principalId: string, id: string, title: string, mode: "manual" | "automatic"): WebTerminal | undefined {
    const session = this.sessions.get(id)
    if (!session || session.principalId !== principalId) return undefined
    const normalized = title.replaceAll("\0", "").trim()
    if (mode === "automatic") {
      if (!normalized) return this.project(session)
      session.automaticTitle = normalized
      if (session.titlePinned) return this.project(session)
      session.title = normalized
    } else {
      session.titlePinned = normalized.length > 0
      session.title = session.titlePinned ? normalized : session.automaticTitle
    }
    this.sendControl(session, { type: "renamed", title: session.title, title_pinned: session.titlePinned })
    return this.project(session)
  }

  close(principalId: string, id: string): Promise<WebTerminal | undefined> {
    const session = this.sessions.get(id)
    if (!session || session.principalId !== principalId) return Promise.resolve(undefined)
    return this.closeSession(session)
  }

  async closeWorkspace(workspaceId: string): Promise<WorkspaceTerminalCloseResult> {
    const sessions = [...this.sessions.values()].filter((session) => session.workspaceId === workspaceId)
    const terminals = await Promise.all(sessions.map((session) => this.closeSession(session)))
    const failed = terminals.filter((terminal) => terminal.state !== "ended").length
    const closed = terminals.length - failed
    if (failed > 0) return { ok: false, status: "cleanup_failed", requested: sessions.length, closed, failed }
    return { ok: true, status: "closed", requested: sessions.length, closed, failed: 0 }
  }

  private closeSession(session: Session): Promise<WebTerminal> {
    if (session.state === "ended") {
      return this.finalizeEndedSession(session)
    }
    if (session.closePromise) return session.closePromise
    session.state = "closing"
    this.sendControl(session, { type: "closing" })
    const pending = this.closeConfirmed(session)
    session.closePromise = pending
    const clearFailedAttempt = () => {
      if (session.closePromise === pending && session.state === "cleanup_failed") {
        session.closePromise = undefined
      }
    }
    void pending.then(clearFailedAttempt, clearFailedAttempt)
    return pending
  }

  private async closeConfirmed(session: Session): Promise<WebTerminal> {
    try {
      this.killGroup(session, "SIGTERM")
      const [termExited, termGroupGone] = await Promise.all([
        this.waitForExitPromise(session.exited),
        this.waitForProcessGroupExit(session.process.pid),
      ])
      if (!termExited || !termGroupGone) {
        this.killGroup(session, "SIGKILL")
        const [killExited, killGroupGone] = await Promise.all([
          termExited ? Promise.resolve(true) : this.waitForExitPromise(session.exited),
          this.waitForProcessGroupExit(session.process.pid),
        ])
        if (!killExited || !killGroupGone) {
          session.state = "cleanup_failed"
          this.notifyActive()
          return this.project(session)
        }
      }
      session.state = "ended"
      session.endedAt ??= this.now()
    } catch {
      session.state = "cleanup_failed"
    }
    this.notifyActive()
    if (session.state !== "ended") return this.project(session)
    return this.finalizeEndedSession(session)
  }

  private waitForExitPromise(exited: Promise<unknown>): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(value)
      }
      const timeout = setTimeout(() => finish(false), this.closeTimeoutMs)
      timeout.unref?.()
      void exited.then(() => finish(true), () => finish(true))
    })
  }

  private async waitForProcessGroupExit(pid: number): Promise<boolean> {
    const deadline = Date.now() + this.closeTimeoutMs
    while (this.processGroupExists(pid)) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) return false
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, Math.min(10, remaining))
        timeout.unref?.()
      })
    }
    return true
  }

  private signalPtyProcessGroup(processHandle: PtyProcess, signal: NodeJS.Signals): void {
    if (processHandle.pid <= 0) { processHandle.kill(signal); return }
    try { process.kill(-processHandle.pid, signal) } catch { processHandle.kill(signal) }
  }

  private async terminatePtyProcessGroup(processHandle: PtyProcess, exited: Promise<unknown>): Promise<void> {
    this.signalPtyProcessGroup(processHandle, "SIGTERM")
    const [termExited, termGroupGone] = await Promise.all([
      this.waitForExitPromise(exited),
      this.waitForProcessGroupExit(processHandle.pid),
    ])
    if (termExited && termGroupGone) return
    this.signalPtyProcessGroup(processHandle, "SIGKILL")
    const [killExited, killGroupGone] = await Promise.all([
      termExited ? Promise.resolve(true) : this.waitForExitPromise(exited),
      this.waitForProcessGroupExit(processHandle.pid),
    ])
    if (!killExited || !killGroupGone) throw new Error(`PTY process group ${processHandle.pid} did not exit after SIGTERM and SIGKILL`)
  }

  private async finalizeEndedSession(session: Session): Promise<WebTerminal> {
    const terminal = this.project(session)
    await this.clearAgentSignals(session)
    session.attachment?.socket.close(1000, "Terminal closed")
    this.sessions.delete(session.id)
    this.notifyActive()
    return terminal
  }

  attach(socket: TerminalAttachment): void {
    const session = this.sessions.get(socket.data.sessionId)
    if (!session || session.principalId !== socket.data.principalId) { socket.close(1008, "Unknown terminal"); return }
    if (session.attachment && session.attachment.socket !== socket) session.attachment.socket.close(4001, "Taken over")
    session.process.releasePreAttachment?.()
    session.attachment = { socket, ack: session.earliestCursor > 0n ? session.earliestCursor - 1n : 0n, pressured: false, streaming: socket.data.streaming }
    this.recordSessionDiagnostic(session, { phase: "attached", pid: session.process.pid })
    socket.send(JSON.stringify({ type: "ready", terminal: this.project(session), reset: true, streaming: session.attachment.streaming }))
    if (session.attachment.streaming) for (const chunk of session.chunks) this.sendChunk(session, chunk)
  }

  message(socket: TerminalAttachment, raw: string | Buffer): void {
    this.controlsReceived += 1
    const session = this.sessions.get(socket.data.sessionId)
    if (!session || session.principalId !== socket.data.principalId || session.attachment?.socket !== socket) { socket.close(1008, "Unknown terminal"); return }
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw)
    let decoded: unknown
    try { decoded = JSON.parse(text) } catch { socket.close(1003, "Invalid control"); return }
    const parsed = WebTerminalSocketControlSchema.safeParse(decoded)
    if (!parsed.success) { socket.close(1008, "Invalid control"); return }
    const message = parsed.data
    if (message.type === "input" && session.state === "running") {
      this.inputsReceived += 1
      if (!session.diagnosticInputObserved) {
        session.diagnosticInputObserved = true
        this.recordSessionDiagnostic(session, { phase: "first_input", pid: session.process.pid })
      }
      session.process.write(message.data)
    }
    else if (message.type === "resize" && session.state === "running") session.process.resize(message.cols, message.rows)
    else if (message.type === "ack") {
      const ack = BigInt(message.cursor) > session.cursor ? session.cursor : BigInt(message.cursor)
      if (ack > session.attachment.ack) session.attachment.ack = ack
    }
    else if (message.type === "flow") this.setStreaming(session, message.streaming)
    else if (message.type === "ping") socket.send(JSON.stringify({ type: "pong" }))
  }

  detached(socket: TerminalAttachment): void {
    const session = this.sessions.get(socket.data.sessionId)
    if (session?.attachment?.socket === socket) session.attachment = undefined
  }

  drain(socket: TerminalAttachment): void {
    const session = this.sessions.get(socket.data.sessionId)
    if (!session?.attachment || session.attachment.socket !== socket || !session.attachment.pressured) return
    session.attachment.pressured = false
    if (session.attachment.streaming) this.replay(session)
  }

  async closePrincipal(principalId: string): Promise<void> {
    await Promise.all(this.list(principalId).map((session) => this.close(principalId, session.id)))
  }

  async stop(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => this.close(session.principalId, session.id)))
    for (const session of this.sessions.values()) session.attachment?.socket.close(1001, "Service stopping")
  }

  private output(session: Session, bytes: Uint8Array): void {
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
      session.cursor += 1n
      const chunk = { cursor: session.cursor, bytes: bytes.slice(offset, offset + 64 * 1024) }
      session.chunks.push(chunk)
      session.replayBytes += chunk.bytes.length
      while (session.replayBytes > WEB_TERMINAL_REPLAY_BYTES && session.chunks.length > 1) {
        const removed = session.chunks.shift()!
        session.replayBytes -= removed.bytes.length
        session.historyAvailable = false
      }
      session.earliestCursor = session.chunks[0]?.cursor ?? session.cursor
      this.sendChunk(session, chunk)
    }
  }

  private recordSessionDiagnostic(session: Session, event: Omit<PtyCanaryDiagnostic, "id" | "shell">): void {
    if (!session.diagnosticId || !session.diagnosticShell) return
    const diagnostic = { id: session.diagnosticId, shell: session.diagnosticShell, ...event }
    if (this.timing.ptyDiagnostic) this.timing.ptyDiagnostic(diagnostic)
    else appendPtyCanaryDiagnostic(diagnostic)
  }

  private sendChunk(session: Session, chunk: OutputChunk): void {
    const attachment = session.attachment
    if (!attachment || !attachment.streaming || attachment.pressured) return
    if (attachment.socket.getBufferedAmount() > WEB_TERMINAL_SOCKET_PRESSURE_BYTES || attachment.socket.send(encodeTerminalFrame(chunk.cursor, chunk.bytes)) === -1) attachment.pressured = true
  }

  private setStreaming(session: Session, streaming: boolean): void {
    const attachment = session.attachment
    if (!attachment || attachment.streaming === streaming) return
    attachment.streaming = streaming
    if (!streaming) {
      // Already-buffered socket bytes may still arrive, but no new PTY output is sent.
      attachment.pressured = false
      return
    }
    this.replay(session)
  }

  private replay(session: Session): void {
    const attachment = session.attachment
    if (!attachment?.streaming) return
    const missingHistory = session.chunks.length > 0 && attachment.ack + 1n < session.earliestCursor
    if (missingHistory) {
      attachment.socket.send(JSON.stringify({ type: "history_unavailable", earliest_cursor: session.earliestCursor.toString(), latest_cursor: session.cursor.toString() }))
      attachment.ack = session.earliestCursor - 1n
      attachment.socket.send(JSON.stringify({ type: "ready", terminal: this.project(session), reset: true, streaming: true }))
    }
    for (const chunk of session.chunks) if (chunk.cursor > attachment.ack) this.sendChunk(session, chunk)
  }

  private sendControl(session: Session, message: unknown): void { session.attachment?.socket.send(JSON.stringify(message)) }

  private project(session: Session): WebTerminal {
    return WebTerminalSchema.parse({
      id: session.id,
      workspace_id: session.workspaceId,
      repository_id: session.repositoryId,
      ...(session.commandId ? { command_id: session.commandId } : {}),
      surface_id: session.surfaceId,
      title: session.title,
      title_pinned: session.titlePinned,
      state: session.state,
      created_at: session.createdAt,
      exit_code: session.exitCode,
      cursor: session.cursor.toString(),
      earliest_cursor: session.earliestCursor.toString(),
      history_available: session.historyAvailable,
    })
  }

  private killGroup(session: Session, signal: NodeJS.Signals): void {
    session.process.cancelSequence?.()
    this.signalPtyProcessGroup(session.process, signal)
  }

  private async handleSignal(session: Session, signal: TerminalSignal): Promise<void> {
    if (!this.publishSignal) return
    session.agentSessions.set(signal.provider, signal.sessionId)
    await this.publishSignal({
      version: 1,
      kind: "activity",
      id: activityId(session, signal),
      source: signal.provider,
      workspace_id: session.workspaceId,
      repository_id: session.repositoryId,
      surface_id: session.surfaceId,
      session_id: signal.sessionId,
      state: signal.state,
      title: stateTitle(signal.provider, signal.state),
      occurred_at: new Date(this.now()).toISOString(),
    })
  }

  private async clearAgentSignals(session: Session): Promise<void> {
    if (!this.publishSignal || !session.agentSessions.size) return
    const agents = [...session.agentSessions]
    session.agentSessions.clear()
    await Promise.allSettled(agents.map(([provider, sessionId]) => this.publishSignal!({
      version: 1,
      kind: "activity",
      id: activityId(session, { provider, sessionId }),
      source: provider,
      workspace_id: session.workspaceId,
      repository_id: session.repositoryId,
      surface_id: session.surfaceId,
      session_id: sessionId,
      state: "idle",
      title: `${provider === "codex" ? "Codex" : provider === "claude" ? "Claude" : provider === "copilot" ? "GitHub Copilot" : "OpenCode"} terminal closed`,
      occurred_at: new Date(this.now()).toISOString(),
    })))
  }

  private prune(): void {
    const cutoff = this.now() - WEB_TERMINAL_ENDED_RETENTION_MS
    for (const [id, session] of this.sessions) if (session.endedAt !== undefined && session.endedAt < cutoff && !session.attachment) this.sessions.delete(id)
  }

  private notifyActive(): void { this.onActiveChange?.(this.activeCount) }
}
