import { createHash, randomBytes } from "node:crypto"

import { spawn as spawnPty } from "node-pty"
import type { Signal } from "@git-stacks/protocol"
import type { SnapshotAdapter } from "../snapshot-adapter"
import type { TerminalSocket } from "../carrier"
import { WebTerminalSchema, WebTerminalSocketControlSchema, type WebTerminal } from "@git-stacks/protocol"
import { TerminalSignalFilter, type TerminalSignal } from "./signal-filter"

export const WEB_TERMINAL_MAX_TOTAL = 48
export const WEB_TERMINAL_MAX_PER_PRINCIPAL = 16
export const WEB_TERMINAL_REPLAY_BYTES = 1024 * 1024
export const WEB_TERMINAL_SOCKET_PRESSURE_BYTES = 512 * 1024
export const WEB_TERMINAL_ENDED_RETENTION_MS = 60 * 60 * 1_000

type OutputChunk = { cursor: bigint; bytes: Uint8Array }
type Attachment = { socket: TerminalSocket; ack: bigint; pressured: boolean; streaming: boolean }

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

const productionPty: PtyFactory = (argv, options) => {
  const [file, ...args] = argv
  if (!file) throw new Error("Terminal command is empty")
  return spawnPty(file, args, options)
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
  attachment?: Attachment
  filter: TerminalSignalFilter
  agentSessions: Map<TerminalSignal["provider"], string>
}

export type { WebSocketData } from "../carrier"

export type WebTerminalCreateInput = {
  workspace_id: string
  repository_id: string
  command_id?: string
  expected_revision: string
  cols: number
  rows: number
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
    const resolution = await this.snapshot.resolveTerminalLaunch({
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
    const argv = resolution.launch.argv
    let resolveExit!: (code: number) => void
    const exited = new Promise<number>((resolve) => { resolveExit = resolve })
    let child: PtyProcess
    try {
      child = this.spawn(argv, {
        cwd: resolution.launch.cwd,
        env: {
        ...resolution.launch.environment,
        TERM: resolution.launch.environment.TERM ?? "xterm-256color",
        COLORTERM: resolution.launch.environment.COLORTERM ?? "truecolor",
        GIT_STACKS_SURFACE_ID: surfaceId,
        GIT_STACKS_TAB_ID: surfaceId,
        GIT_STACKS_WORKSPACE_ID: input.workspace_id,
        GIT_STACKS_REPOSITORY_ID: input.repository_id,
        GIT_STACKS_SIGNAL_TOKEN: signalToken,
        GIT_STACKS_SIGNAL_TRANSPORT: "osc9",
        },
        cols: input.cols,
        rows: input.rows,
        name: "xterm-256color",
      })
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

  async close(principalId: string, id: string): Promise<WebTerminal | undefined> {
    const session = this.sessions.get(id)
    if (!session || session.principalId !== principalId) return undefined
    if (session.state === "ended") {
      const terminal = this.project(session)
      await this.clearAgentSignals(session)
      session.attachment?.socket.close(1000, "Terminal closed")
      this.sessions.delete(id)
      this.notifyActive()
      return terminal
    }
    if (session.state === "closing") return this.project(session)
    session.state = "closing"
    this.sendControl(session, { type: "closing" })
    try {
      this.killGroup(session, "SIGTERM")
      const exited = await Promise.race([session.exited.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 1_000))])
      if (!exited) {
        this.killGroup(session, "SIGKILL")
        await Promise.race([session.exited, new Promise<void>((resolve) => setTimeout(resolve, 1_000))])
      }
      session.state = "ended"
      session.endedAt ??= this.now()
    } catch {
      session.state = "cleanup_failed"
    }
    this.notifyActive()
    const terminal = this.project(session)
    if (session.state === "ended") {
      await this.clearAgentSignals(session)
      session.attachment?.socket.close(1000, "Terminal closed")
      this.sessions.delete(id)
    }
    return terminal
  }

  attach(socket: TerminalSocket): void {
    const session = this.sessions.get(socket.data.sessionId)
    if (!session || session.principalId !== socket.data.principalId) { socket.close(1008, "Unknown terminal"); return }
    if (session.attachment && session.attachment.socket !== socket) session.attachment.socket.close(4001, "Taken over")
    session.attachment = { socket, ack: session.earliestCursor > 0n ? session.earliestCursor - 1n : 0n, pressured: false, streaming: socket.data.streaming }
    socket.send(JSON.stringify({ type: "ready", terminal: this.project(session), reset: true, streaming: session.attachment.streaming }))
    if (session.attachment.streaming) for (const chunk of session.chunks) this.sendChunk(session, chunk)
  }

  message(socket: TerminalSocket, raw: string | Buffer): void {
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

  detached(socket: TerminalSocket): void {
    const session = this.sessions.get(socket.data.sessionId)
    if (session?.attachment?.socket === socket) session.attachment = undefined
  }

  drain(socket: TerminalSocket): void {
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
