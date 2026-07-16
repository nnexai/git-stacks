import { createHash, randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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

type OutputChunk = { cursor: bigint; bytes: Uint8Array }
type Attachment = { socket: TerminalAttachment; ack: bigint; pressured: boolean; streaming: boolean }

export interface PtyProcess {
  readonly pid: number
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

function serializePtyEnvironment(environment: Record<string, string>): Buffer {
  const entries = Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("\0")) throw new TypeError(`Invalid PTY environment entry: ${key}`)
  }
  return Buffer.concat(entries.map(([key, value]) => Buffer.from(`${key}=${value}\0`, "utf8")))
}

function createPtyInitialization(
  shell: "bash" | "zsh" | "fish",
  environment: Record<string, string>,
  command?: string,
): { root: string; readyPath: string; bootstrap: string; runCommand?: string } {
  const root = mkdtempSync(join(tmpdir(), "git-stacks-pty-"))
  chmodSync(root, 0o700)
  const environmentPath = join(root, "environment")
  const readyPath = join(root, "ready")
  writeFileSync(environmentPath, serializePtyEnvironment(environment), { mode: 0o600 })
  let runCommand: string | undefined
  if (command !== undefined) {
    const commandPath = join(root, shell === "fish" ? "command.fish" : "command.sh")
    writeFileSync(commandPath, command, { mode: 0o600 })
    runCommand = shell === "fish"
      ? `source ${shellQuote(commandPath)}; set -l __gs_status $status; command rm -rf -- ${shellQuote(root)}; exit $__gs_status`
      : `. ${shellQuote(commandPath)}; __gs_status=$?; command rm -rf -- ${shellQuote(root)}; exit "$__gs_status"`
  }
  const bootstrap = shell === "fish"
    ? [
        `for __gs_entry in (string split0 < ${shellQuote(environmentPath)})`,
        "set -l __gs_pair (string split -m 1 = -- $__gs_entry)",
        "test (count $__gs_pair) -eq 2; or exit 126",
        "set -gx $__gs_pair[1] $__gs_pair[2]",
        "end",
        `command rm -f -- ${shellQuote(environmentPath)}`,
        `command touch -- ${shellQuote(readyPath)}`,
      ].join("; ")
    : [
        `while IFS= read -r -d '' __gs_entry; do export "$__gs_entry" || return 126; done < ${shellQuote(environmentPath)}`,
        `command rm -f -- ${shellQuote(environmentPath)}`,
        `: > ${shellQuote(readyPath)}`,
      ].join("; ")
  return { root, readyPath, bootstrap, ...(runCommand ? { runCommand } : {}) }
}

async function waitForPtyInitialization(
  processHandle: PtyProcess,
  initialization: ReturnType<typeof createPtyInitialization>,
): Promise<void> {
  let exited = false
  const subscription = processHandle.onExit(() => { exited = true })
  processHandle.write(`${initialization.bootstrap}\r`)
  const deadline = Date.now() + 10_000
  try {
    while (!existsSync(initialization.readyPath)) {
      if (exited) throw new Error("Shell exited before PTY initialization completed")
      if (Date.now() >= deadline) throw new Error("Shell PTY initialization exceeded 10000ms")
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
  } finally {
    subscription.dispose()
  }
}

function bufferPty(processHandle: PtyProcess): PtyProcess {
  let dataListener: ((data: string) => void) | undefined
  let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined
  const pendingData: string[] = []
  let pendingExit: { exitCode: number; signal?: number } | undefined
  processHandle.onData((data) => dataListener ? dataListener(data) : pendingData.push(data))
  processHandle.onExit((event) => {
    pendingExit = event
    exitListener?.(event)
  })
  return {
    pid: processHandle.pid,
    write: (data) => processHandle.write(data),
    resize: (columns, rows) => processHandle.resize(columns, rows),
    kill: (signal) => processHandle.kill(signal),
    onData(listener) {
      dataListener = listener
      for (const data of pendingData.splice(0)) listener(data)
      return { dispose: () => { if (dataListener === listener) dataListener = undefined } }
    },
    onExit(listener) {
      exitListener = listener
      if (pendingExit) queueMicrotask(() => listener(pendingExit!))
      return { dispose: () => { if (exitListener === listener) exitListener = undefined } }
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
  setTimeout?: (callback: () => void, delayMs: number) => unknown
  clearTimeout?: (handle: unknown) => void
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
      let resolveExit!: (code: number) => void
      const exited = new Promise<number>((resolve) => { resolveExit = resolve })
      let child: PtyProcess
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
          const spawned = bufferPty(this.spawn(launch.argv, {
              cwd: launch.cwd,
              env: {
                ...launch.environment,
                TERM: launch.environment.TERM ?? "xterm-256color",
                COLORTERM: launch.environment.COLORTERM ?? "truecolor",
                ...terminalEnvironment,
              },
              cols: input.cols,
              rows: input.rows,
              name: "xterm-256color",
            }))
          if (launch.initialization) {
            const initialization = createPtyInitialization(launch.initialization.shell, {
              ...launch.environment,
              ...terminalEnvironment,
            })
            try {
              await waitForPtyInitialization(spawned, initialization)
            } catch (error) {
              spawned.kill("SIGKILL")
              throw error
            } finally {
              rmSync(initialization.root, { force: true, recursive: true })
            }
          }
          child = spawned
        } else {
          child = this.createCommandProcess(launch.steps, terminalEnvironment, input.cols, input.rows)
        }
      } catch (error) {
        throw Object.assign(new Error(`PTY allocation failed: ${(error as Error).message}`), { status: 409, code: "capability_unavailable" })
      }
      child.onData((data) => {
        if (!session) return
        const sanitized = filter.push(new TextEncoder().encode(data))
        if (sanitized.length) this.output(session, sanitized)
      })
      child.onExit(({ exitCode }) => {
        resolveExit(exitCode)
        if (!session) return
        const remaining = filter.flush()
        if (remaining.length) this.output(session, remaining)
        session.state = "ended"
        session.exitCode = exitCode
        session.endedAt = this.now()
        this.sendControl(session, { type: "exit", code: exitCode })
        this.notifyActive()
      })
      session = {
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
      }
      this.sessions.set(id, session)
      this.notifyActive()
      return this.project(session)
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
    const shell = discoverUserShell(process.env, "pty")
    const plan = buildUserShellBootstrap(shell, { mode: "pty" })
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
          const initialization = createPtyInitialization(shell.family, {
            ...step.environment,
            ...terminalEnvironment,
          }, step.command)
          const child = this.spawn([...plan.argv], {
            cwd: step.cwd,
            env: {
              ...process.env,
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
            await waitForPtyInitialization(child, initialization)
            if (cancelled) {
              child.kill("SIGTERM")
            } else {
              child.write(`${initialization.runCommand}\r`)
              acceptsInput = true
              for (const input of pendingInput.splice(0)) child.write(input)
            }
            const event = await childExited
            acceptsInput = false
            active = undefined
            if (cancelled) {
              finish(event.exitCode || 130, event.signal)
              return
            }
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
      const termExited = await this.waitForExit(session)
      const termGroupGone = !this.processGroupExists(session.process.pid)
      if (!termExited || !termGroupGone) {
        this.killGroup(session, "SIGKILL")
        const killExited = await this.waitForExit(session)
        if (!killExited || this.processGroupExists(session.process.pid)) {
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

  private waitForExit(session: Session): Promise<boolean> {
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
      void session.exited.then(() => finish(true))
    })
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
    session.attachment = { socket, ack: session.earliestCursor > 0n ? session.earliestCursor - 1n : 0n, pressured: false, streaming: socket.data.streaming }
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
    if (message.type === "input" && session.state === "running") { this.inputsReceived += 1; session.process.write(message.data) }
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
    if (session.process.pid <= 0) { session.process.kill(signal); return }
    try { process.kill(-session.process.pid, signal) } catch { session.process.kill(signal) }
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
