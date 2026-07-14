import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { EventBroker, EventSubscription } from "../../lib/service/event-broker"
import type { OperationRegistry, WorkspaceCreateMutation } from "../../lib/service/operations"
import type { Signal, SignalDismissal, WorkspaceCreationCatalog } from "../../lib/service/contract"
import type { SnapshotAdapter } from "../snapshot-adapter"
import {
  WebOperationMutationSchema,
  WebPairingExchangeSchema,
  WebPinsSchema,
  WebPrioritiesSchema,
  WebSignalAcknowledgeSchema,
  WebSignalDismissSchema,
  WebTerminalCreateSchema,
  WebTerminalRenameSchema,
  WEB_PROTOCOL,
} from "./contract"
import { WebPrincipalManager, type WebPrincipal } from "./principal-manager"
import { projectWebCatalog, projectWebOperation, projectWebSignal, projectWebSnapshot, projectWebTerminalSignals } from "./projection"
import { WebTerminalManager, type WebSocketData } from "./terminal-manager"

const WEB_BODY_BYTES = 256 * 1024
const WEB_SSE_PER_PRINCIPAL = 4
const WEB_SSE_TOTAL = 16
const WEB_SSE_HEARTBEAT_MS = 15_000

type Mutation = (request: { workspace: string; options?: Record<string, unknown> }, signal?: AbortSignal) => import("../../lib/service/operations").OperationExecution

export interface WebApplicationOptions {
  assetsRoot: string
  snapshot: SnapshotAdapter
  operations?: OperationRegistry
  broker?: EventBroker
  mutations?: Record<string, Mutation>
  workspaceCreate?: WorkspaceCreateMutation
  workspaceCreationCatalog?: () => WorkspaceCreationCatalog | Promise<WorkspaceCreationCatalog>
  publishSignal?: (signal: Signal) => Promise<void>
  dismissSignal?: (dismissal: SignalDismissal) => Promise<void>
  signalProjection?: () => Promise<{ signals: Signal[]; dismissed: string[]; sequence: string }>
  onConnectionChange?: (count: number) => void
  onActivity?: () => void
  eventHeartbeatMs?: number
  setWorkspacePins?: (ids: string[]) => void | Promise<void>
  setWorkspacePriorities?: (priorities: Array<{ workspace_id: string; priority: number }>) => void | Promise<void>
}

function securityHeaders(contentType?: string): Headers {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  })
  if (contentType) headers.set("content-type", contentType)
  return headers
}

function webJson(data: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = securityHeaders("application/json; charset=utf-8")
  if (extra) for (const [key, value] of new Headers(extra)) headers.append(key, value)
  return Response.json({ protocol: WEB_PROTOCOL, ok: true, data }, { status, headers })
}
function webError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ protocol: WEB_PROTOCOL, ok: false, error: { code, message } }), { status, headers: securityHeaders("application/json; charset=utf-8") })
}

async function body(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(declared) && declared > WEB_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { status: 413 })
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > WEB_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { status: 413 })
  if (!bytes.byteLength) return {}
  try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw Object.assign(new Error("Malformed JSON"), { status: 400 }) }
}

function mime(path: string): string | undefined {
  if (path.endsWith(".html")) return "text/html; charset=utf-8"
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (path.endsWith(".css")) return "text/css; charset=utf-8"
  if (path.endsWith(".svg")) return "image/svg+xml"
  return undefined
}

class BrowserEventStream {
  private closed = false
  constructor(
    private readonly subscription: EventSubscription,
    readonly principalId: string,
    private readonly operations: OperationRegistry | undefined,
    private readonly release: () => void,
    private readonly heartbeatMs: number,
  ) {}

  stream(): ReadableStream<Uint8Array> {
    const source: Bun.DirectUnderlyingSource<Uint8Array> = {
      type: "direct",
      pull: async (controller) => {
        try {
          while (!this.closed) {
            if (!this.subscription.peek()) await Promise.race([this.subscription.waitForAvailable(), Bun.sleep(this.heartbeatMs)])
            const reservation = this.subscription.reserve()
            if (!reservation) {
              if (this.subscription.diagnostics.closed) { controller.close(); this.close(); return }
              await controller.write(": heartbeat\n\n")
              await controller.flush()
              continue
            }
            const event = reservation.event
            const visible = event.type !== "operation" || this.operations?.ownerOf(event.operation.operation_id) === this.principalId
            this.subscription.ack(reservation)
            if (!visible) continue
            const projected = event.type === "operation"
              ? { ...event, operation: projectWebOperation(event.operation) }
              : event.type === "signal" ? { ...event, signal: projectWebSignal(event.signal) } : event
            await controller.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(projected)}\n\n`)
            await controller.flush()
            continue
          }
        } catch (error) {
          controller.close(error instanceof Error ? error : new Error(String(error)))
          this.close()
        }
      },
      cancel: () => this.close(),
    }
    return new ReadableStream(source as unknown as UnderlyingSource<Uint8Array>)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.subscription.close()
    this.release()
  }
}

export class WebApplication {
  readonly principals: WebPrincipalManager
  readonly terminals: WebTerminalManager
  private assets = new Set<string>()
  private streams = new Set<BrowserEventStream>()
  private sseByPrincipal = new Map<string, number>()
  private principalSweep: ReturnType<typeof setInterval>

  constructor(private readonly options: WebApplicationOptions) {
    this.terminals = new WebTerminalManager(options.snapshot, options.publishSignal, () => this.notifyConnections())
    this.principals = new WebPrincipalManager(Date.now, (principalId) => {
      for (const stream of [...this.streams]) if (stream.principalId === principalId) stream.close()
      void this.terminals.closePrincipal(principalId)
    })
    this.principalSweep = setInterval(() => this.principals.sweep(), 60_000)
    this.principalSweep.unref?.()
    try {
      const manifest = JSON.parse(readFileSync(join(options.assetsRoot, "manifest.json"), "utf8")) as { assets?: string[] }
      for (const asset of manifest.assets ?? []) if (/^[A-Za-z0-9._-]+$/.test(asset)) this.assets.add(asset)
    } catch {}
  }

  issuePairing(origin: string): { url: string; expires_at: string } { return this.principals.issue(origin) }

  async handle(request: Request, server: Bun.Server<WebSocketData>): Promise<Response | undefined> {
    const url = new URL(request.url)
    if (url.pathname !== "/web" && !url.pathname.startsWith("/web/")) return undefined
    const expectedHost = `${server.hostname}:${server.port}`
    const expectedOrigin = `http://${expectedHost}`
    if (request.headers.get("host") !== expectedHost) return webError("forbidden", "Invalid Host", 403)
    if (url.pathname === "/web") return new Response(null, { status: 308, headers: { location: "/web/" } })
    if (url.pathname === "/web/" || url.pathname.startsWith("/web/assets/")) return this.asset(url.pathname)
    if (url.pathname === "/web/api/pair" && request.method === "POST") {
      if (!this.unsafeAllowed(request, expectedOrigin)) return webError("forbidden", "Invalid browser origin", 403)
      try {
        const parsed = WebPairingExchangeSchema.safeParse(await body(request))
        if (!parsed.success) return webError("invalid_request", "Invalid pairing exchange", 400)
        const existing = this.principals.authenticate(request) ?? undefined
        const result = this.principals.exchange(parsed.data.code, existing)
        if (!result) return webError("unauthorized", "Pairing code is invalid or expired", 401)
        this.options.onActivity?.()
        return webJson({ paired: true, resumed: Boolean(existing) }, 200, result.cookie ? { "set-cookie": result.cookie } : undefined)
      } catch (error) {
        const status = (error as { status?: number }).status ?? 400
        return webError("invalid_request", (error as Error).message, status)
      }
    }
    if (request.method === "OPTIONS") return webError("not_found", "Route not found", 404)
    const principal = this.principals.authenticate(request)
    if (!principal) return webError("unauthorized", "Browser session is not paired", 401)
    if (request.method === "GET") {
      const site = request.headers.get("sec-fetch-site")
      if (site && site !== "same-origin" && site !== "none") return webError("forbidden", "Cross-site request rejected", 403)
    } else if (!this.unsafeAllowed(request, expectedOrigin)) return webError("forbidden", "Invalid browser origin", 403)
    this.options.onActivity?.()

    if (url.pathname.startsWith("/web/ws/terminals/")) {
      if (request.headers.get("origin") !== expectedOrigin) return webError("forbidden", "Invalid WebSocket origin", 403)
      const sessionId = decodeURIComponent(url.pathname.slice("/web/ws/terminals/".length))
      if (!this.terminals.get(principal.id, sessionId)) return webError("not_found", "Terminal not found", 404)
      const streaming = url.searchParams.get("streaming") !== "0"
      if (!server.upgrade(request, { data: { kind: "web-terminal", principalId: principal.id, sessionId, streaming } })) return webError("invalid_request", "WebSocket upgrade failed", 400)
      return undefined
    }

    try {
      return await this.api(request, url, principal, server)
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      const code = (error as { code?: string }).code ?? (status === 400 || status === 413 ? "invalid_request" : "internal_error")
      return webError(code, status === 500 ? "Web request failed" : (error as Error).message, status)
    }
  }

  websocket = {
    open: (socket: Bun.ServerWebSocket<WebSocketData>) => { this.terminals.attach(socket); this.notifyConnections() },
    message: (socket: Bun.ServerWebSocket<WebSocketData>, message: string | Buffer) => this.terminals.message(socket, message),
    close: (socket: Bun.ServerWebSocket<WebSocketData>) => { this.terminals.detached(socket); this.notifyConnections() },
    drain: (socket: Bun.ServerWebSocket<WebSocketData>) => this.terminals.drain(socket),
  }

  async stop(): Promise<void> {
    clearInterval(this.principalSweep)
    for (const stream of [...this.streams]) stream.close()
    await this.terminals.stop()
  }

  private async api(request: Request, url: URL, principal: WebPrincipal, server: Bun.Server<WebSocketData>): Promise<Response> {
    if (request.method === "GET" && url.pathname === "/web/api/discovery") return webJson({
      service_version: "1",
      capabilities: {
        snapshots: true,
        terminals: process.platform === "linux" && Boolean(this.options.snapshot.resolveTerminalLaunch),
        operations: Boolean(this.options.operations),
        workspace_creation: Boolean(this.options.workspaceCreationCatalog && this.options.workspaceCreate),
        signals: Boolean(this.options.signalProjection),
      },
      limits: { terminals_per_browser: 16, terminals_total: 48, replay_bytes: 1024 * 1024 },
    })
    if (request.method === "GET" && url.pathname === "/web/api/diagnostics") return webJson({
      principals: this.principals.size,
      event_streams: this.streams.size,
      terminals: this.terminals.diagnostics,
    })
    if (request.method === "POST" && url.pathname === "/web/api/logout") {
      const id = this.principals.revoke(request)
      if (id) await this.terminals.closePrincipal(id)
      return webJson({ logged_out: true }, 200, { "set-cookie": this.principals.clearCookie() })
    }
    if (request.method === "GET" && url.pathname === "/web/api/snapshot") {
      return webJson(projectWebSnapshot(await this.options.snapshot.buildAll()))
    }
    if (request.method === "PUT" && url.pathname === "/web/api/pins") {
      if (!this.options.setWorkspacePins) return webError("capability_unavailable", "Workspace pinning is unavailable", 409)
      const parsed = WebPinsSchema.safeParse(await body(request))
      if (!parsed.success) return webError("invalid_request", "Invalid pinned workspaces", 400)
      const snapshots = await this.options.snapshot.buildAll()
      const revision = snapshots[0]?.revision ?? "0"
      if (revision !== parsed.data.expected_revision) return webError("conflict", "Authoritative snapshot revision is stale", 409)
      const known = new Set(snapshots.map(({ workspace }) => workspace.id))
      if (parsed.data.workspace_ids.some((id) => !known.has(id))) return webError("not_found", "Pinned workspace no longer exists", 404)
      await this.options.setWorkspacePins(parsed.data.workspace_ids)
      return webJson({ workspace_ids: parsed.data.workspace_ids })
    }
    if (request.method === "PUT" && url.pathname === "/web/api/priorities") {
      if (!this.options.setWorkspacePriorities) return webError("capability_unavailable", "Workspace priorities are unavailable", 409)
      const parsed = WebPrioritiesSchema.safeParse(await body(request))
      if (!parsed.success) return webError("invalid_request", "Invalid workspace priorities", 400)
      const snapshots = await this.options.snapshot.buildAll()
      const revision = snapshots[0]?.revision ?? "0"
      if (revision !== parsed.data.expected_revision) return webError("conflict", "Authoritative snapshot revision is stale", 409)
      const known = new Set(snapshots.map(({ workspace }) => workspace.id))
      if (parsed.data.priorities.some(({ workspace_id }) => !known.has(workspace_id))) return webError("not_found", "Workspace no longer exists", 404)
      await this.options.setWorkspacePriorities(parsed.data.priorities)
      return webJson({ priorities: parsed.data.priorities })
    }
    if (request.method === "GET" && url.pathname === "/web/api/workspace-creation/catalog") {
      if (!this.options.workspaceCreationCatalog) return webError("capability_unavailable", "Workspace creation is unavailable", 409)
      return webJson(projectWebCatalog(await this.options.workspaceCreationCatalog()))
    }
    if (request.method === "GET" && url.pathname === "/web/api/signals") {
      if (!this.options.signalProjection) return webError("capability_unavailable", "Signals are unavailable", 409)
      const projection = await this.options.signalProjection()
      const dismissed = new Set(projection.dismissed)
      return webJson({ ...projection, signals: this.visibleSignals(principal.id, projection.signals.filter((signal) => !dismissed.has(signal.id))).map(projectWebSignal) })
    }
    if (request.method === "POST" && url.pathname === "/web/api/signals/acknowledge") {
      if (!this.options.signalProjection) return webError("capability_unavailable", "Signals are unavailable", 409)
      const parsed = WebSignalAcknowledgeSchema.safeParse(await body(request))
      if (!parsed.success) return webError("invalid_request", "Invalid signal acknowledgement", 400)
      const projection = await this.options.signalProjection()
      const dismissed = new Set(projection.dismissed)
      const visible = projection.signals.filter((signal) => !dismissed.has(signal.id))
      const acknowledged = this.principals.acknowledgeSurface(principal.id, parsed.data.surface_id, visible)
      return webJson({ ...projection, acknowledged, signals: this.visibleSignals(principal.id, visible).map(projectWebSignal) })
    }
    if (request.method === "POST" && url.pathname === "/web/api/signals/dismiss") {
      if (!this.options.dismissSignal) return webError("capability_unavailable", "Signals are unavailable", 409)
      const parsed = WebSignalDismissSchema.safeParse(await body(request))
      if (!parsed.success) return webError("invalid_request", "Invalid signal dismissal", 400)
      await this.options.dismissSignal({ kind: "dismiss_signal", signal_id: parsed.data.signal_id })
      return webJson({ dismissed: true }, 202)
    }
    if (request.method === "GET" && url.pathname === "/web/api/events") return this.events(url, request, principal, server)
    if (request.method === "GET" && url.pathname === "/web/api/terminals") return webJson(this.terminals.list(principal.id))
    if (request.method === "POST" && url.pathname === "/web/api/terminals") {
      const parsed = WebTerminalCreateSchema.safeParse(await body(request))
      if (!parsed.success) return webError("invalid_request", "Invalid terminal request", 400)
      return webJson(await this.terminals.create(principal.id, parsed.data), 201)
    }
    const terminalMatch = /^\/web\/api\/terminals\/(term_[A-Za-z0-9_-]{16,})$/.exec(url.pathname)
    if (terminalMatch && request.method === "DELETE") {
      const terminal = await this.terminals.close(principal.id, terminalMatch[1]!)
      if (!terminal) return webError("not_found", "Terminal not found", 404)
      if (terminal.state === "cleanup_failed") return webError("operation_failed", "Terminal cleanup failed; retry close", 500)
      if (terminal.state === "closing") return webError("conflict", "Terminal cleanup is already in progress", 409)
      return webJson(terminal)
    }
    if (terminalMatch && request.method === "PATCH") {
      const parsed = WebTerminalRenameSchema.safeParse(await body(request))
      if (!parsed.success) return webError("invalid_request", "Invalid terminal title", 400)
      const terminal = this.terminals.rename(principal.id, terminalMatch[1]!, parsed.data.title, parsed.data.mode)
      return terminal ? webJson(terminal) : webError("not_found", "Terminal not found", 404)
    }
    if (request.method === "POST" && url.pathname === "/web/api/operations") return this.submitOperation(request, principal)
    const operationMatch = /^\/web\/api\/operations\/(op_[A-Za-z0-9_-]{16,})$/.exec(url.pathname)
    if (operationMatch && request.method === "GET") {
      const operation = this.options.operations?.getForClient(operationMatch[1]!, principal.id)
      return operation ? webJson(projectWebOperation(operation)) : webError("not_found", "Operation not found", 404)
    }
    if (operationMatch && request.method === "DELETE") {
      const operation = this.options.operations?.getForClient(operationMatch[1]!, principal.id)
      if (!operation || !this.options.operations) return webError("not_found", "Operation not found", 404)
      return webJson(projectWebOperation(await this.options.operations.cancel(operation.operation_id)), 202)
    }
    return webError("not_found", "Route not found", 404)
  }

  private visibleSignals(principalId: string, signals: Signal[]): Signal[] {
    return projectWebTerminalSignals(this.principals.visibleSignals(principalId, signals), this.terminals.surfaceIds(principalId))
  }

  private async submitOperation(request: Request, principal: WebPrincipal): Promise<Response> {
    if (!this.options.operations) return webError("capability_unavailable", "Operations are unavailable", 409)
    const key = request.headers.get("idempotency-key")
    if (!key || key.length > 256) return webError("invalid_request", "A valid Idempotency-Key is required", 400)
    const parsed = WebOperationMutationSchema.safeParse(await body(request))
    if (!parsed.success) return webError("invalid_request", "Invalid operation request", 400)
    let execution: import("../../lib/service/operations").OperationExecution
    let registryRequest: unknown
    if (parsed.data.kind === "workspace.create") {
      if (!this.options.workspaceCreate) return webError("capability_unavailable", "Workspace creation is unavailable", 409)
      registryRequest = parsed.data.request
      execution = this.options.workspaceCreate(parsed.data.request)
    } else {
      const snapshots = await this.options.snapshot.buildAll()
      const mutation = parsed.data as Extract<typeof parsed.data, { kind: "workspace.open" | "workspace.close" }>
      const selected = snapshots.find((item) => item.workspace.id === mutation.request.workspace_id)
      if (!selected) return webError("not_found", "Workspace not found", 404)
      if (selected.revision !== mutation.request.expected_revision) return webError("conflict", "Authoritative snapshot revision is stale", 409)
      const adapter = this.options.mutations?.[mutation.kind]
      if (!adapter) return webError("capability_unavailable", "Workspace operation is unavailable", 409)
      registryRequest = mutation.request
      execution = adapter({ workspace: selected.workspace.name })
    }
    const operation = await this.options.operations.submit({ clientId: principal.id, endpoint: parsed.data.kind, idempotencyKey: key, request: registryRequest, execution })
    return webJson(projectWebOperation(operation), 202)
  }

  private async events(url: URL, request: Request, principal: WebPrincipal, server: Bun.Server<WebSocketData>): Promise<Response> {
    if (!this.options.broker) return webError("capability_unavailable", "Events are unavailable", 409)
    const total = this.streams.size
    const own = this.sseByPrincipal.get(principal.id) ?? 0
    if (total >= WEB_SSE_TOTAL || own >= WEB_SSE_PER_PRINCIPAL) return webError("rate_limited", "Event connection limit reached", 429)
    const cursor = url.searchParams.get("cursor") ?? request.headers.get("last-event-id") ?? "0"
    if (!/^(0|[1-9][0-9]*)$/.test(cursor)) return webError("invalid_request", "Invalid event cursor", 400)
    let subscription: EventSubscription
    try { subscription = await this.options.broker.subscribe(cursor) } catch (error) {
      const replay = (error as { replay?: unknown }).replay
      return replay ? webError("replay_gap", "Requested cursor is no longer retained", 409) : webError("internal_error", "Event subscription failed", 500)
    }
    server.timeout(request, 0)
    this.sseByPrincipal.set(principal.id, own + 1)
    let stream: BrowserEventStream
    const release = () => {
      this.streams.delete(stream)
      const remaining = (this.sseByPrincipal.get(principal.id) ?? 1) - 1
      if (remaining) this.sseByPrincipal.set(principal.id, remaining); else this.sseByPrincipal.delete(principal.id)
      this.notifyConnections()
    }
    stream = new BrowserEventStream(subscription, principal.id, this.options.operations, release, this.options.eventHeartbeatMs ?? WEB_SSE_HEARTBEAT_MS)
    this.streams.add(stream)
    this.notifyConnections()
    const headers = securityHeaders("text/event-stream")
    headers.set("connection", "keep-alive")
    return new Response(stream.stream(), { headers })
  }

  private asset(pathname: string): Response {
    const name = pathname === "/web/" ? "index.html" : pathname.slice("/web/assets/".length)
    const contentType = mime(name)
    if (!this.assets.has(name) || !contentType) return webError("not_found", "Asset not found", 404)
    const file = Bun.file(join(this.options.assetsRoot, name))
    return new Response(file, { headers: securityHeaders(contentType) })
  }

  private unsafeAllowed(request: Request, origin: string): boolean {
    return request.headers.get("origin") === origin && !["cross-site"].includes(request.headers.get("sec-fetch-site") ?? "")
  }

  private notifyConnections(): void { this.options.onConnectionChange?.(this.streams.size + this.terminals.activeCount) }
}
