import { randomBytes } from "node:crypto"
import { z } from "zod"
import { authenticateAdmission, type AuthenticatedClient } from "../lib/service/credentials"
import { IdempotencyConflictError, type OperationRegistry, type OperationExecution } from "../lib/service/operations"
import type { EventBroker, EventReservation, EventSubscription, EventSubscriptionDiagnostics } from "../lib/service/event-broker"
import type { WorkspaceSnapshotResponse } from "../lib/service/contract"

export const MAX_BODY_BYTES = 256 * 1024
export const RATE_LIMIT_PER_MINUTE = 60
export const RATE_LIMIT_BURST = 20
export const REQUEST_TIMEOUT_SECONDS = 30
export const SSE_HEARTBEAT_MS = 15_000
export const SSE_MAX_PER_CREDENTIAL = 8
export const SSE_MAX_TOTAL = 32

const MutationRequestSchema = z.strictObject({
  workspace: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
})

type SnapshotAdapter = {
  buildAll(): Promise<WorkspaceSnapshotResponse[]>
  buildWorkspace(name: string, requestId?: string): Promise<WorkspaceSnapshotResponse>
}

export interface ServiceServerOptions {
  serviceRoot: string
  snapshot: SnapshotAdapter
  operations?: OperationRegistry
  broker?: EventBroker
  mutations?: Record<string, (request: z.infer<typeof MutationRequestSchema>) => OperationExecution>
  hostname?: "127.0.0.1"
  port?: number
  now?: () => number
  heartbeatMs?: number
  rateLimitPerMinute?: number
  rateLimitBurst?: number
  maxBodyBytes?: number
  maxSsePerCredential?: number
  maxSseTotal?: number
  onConnectionChange?: (count: number) => void
}

export interface RunningServiceServer {
  server: Bun.Server<undefined>
  url: URL
  get connectedClients(): number
  get sseDiagnostics(): readonly SseTransportDiagnostics[]
  stop(): Promise<void>
}

export interface SseTransportDiagnostics extends EventSubscriptionDiagnostics {
  bridgeReservedEvents: number
  bridgeReservedBytes: number
  combinedPendingEvents: number
  combinedPendingBytes: number
  heartbeatActive: boolean
}

export class SseTransportBridge {
  private reservation?: EventReservation
  private timer?: ReturnType<typeof setTimeout>
  private released = false
  private heartbeatActive = false
  private removeCloseListener: () => void

  constructor(
    private readonly subscription: EventSubscription,
    private readonly heartbeatMs: number,
    private readonly onRelease: () => void,
  ) { this.removeCloseListener = subscription.onClosed(() => this.release()) }

  get diagnostics(): SseTransportDiagnostics {
    const subscription = this.subscription.diagnostics
    return {
      ...subscription,
      bridgeReservedEvents: this.reservation ? 1 : 0,
      bridgeReservedBytes: this.reservation?.bytes ?? 0,
      combinedPendingEvents: subscription.combinedEvents,
      combinedPendingBytes: subscription.combinedBytes,
      heartbeatActive: this.heartbeatActive,
    }
  }

  stream(): ReadableStream<Uint8Array> {
    const source: Bun.DirectUnderlyingSource<Uint8Array> = {
      type: "direct",
      pull: async (controller) => {
        try {
          while (!this.released) {
            const available = await this.awaitEventOrHeartbeat()
            if (available === "heartbeat") {
              await controller.write(": heartbeat\n\n")
              await controller.flush()
              continue
            }
            this.reservation = this.subscription.reserve()
            if (this.reservation) {
              const event = this.reservation.event
              await controller.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
              await controller.flush()
              this.subscription.ack(this.reservation)
              this.reservation = undefined
              continue
            }
            if (this.subscription.disconnect) {
              await controller.write(`event: disconnect\ndata: ${JSON.stringify(this.subscription.disconnect)}\n\n`)
              await controller.flush()
            }
            controller.close()
            this.release()
            return
          }
        } catch (error) {
          controller.close(error instanceof Error ? error : new Error(String(error)))
          this.release()
        }
      },
      cancel: () => this.release(),
    }
    return new ReadableStream(source as unknown as UnderlyingSource<Uint8Array>)
  }

  close(): void { this.release() }

  private async awaitEventOrHeartbeat(): Promise<"event" | "heartbeat"> {
    if (this.subscription.peek() || this.subscription.diagnostics.closed) return "event"
    this.heartbeatActive = true
    return new Promise((resolve) => {
      let settled = false
      const finish = (value: "event" | "heartbeat") => {
        if (settled) return
        settled = true
        if (this.timer) clearTimeout(this.timer)
        this.timer = undefined
        this.heartbeatActive = false
        resolve(value)
      }
      this.timer = setTimeout(() => finish("heartbeat"), this.heartbeatMs)
      void this.subscription.waitForAvailable().then(() => finish("event"))
    })
  }

  private release(): void {
    if (this.released) return
    this.released = true
    this.removeCloseListener()
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.heartbeatActive = false
    this.reservation = undefined
    this.subscription.close()
    this.onRelease()
  }
}

type Bucket = { tokens: number; updatedAt: number }

function requestId(): string { return `req_${randomBytes(16).toString("base64url")}` }
function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers })
}
function success(id: string, data: unknown): unknown { return { protocol: "v1", request_id: id, ok: true, data } }
function failure(id: string, code: string, message: string, status: number, details?: Record<string, unknown>): Response {
  return json({ protocol: "v1", request_id: id, ok: false, error: { code, message, ...(details ? { details } : {}) } }, status)
}

export function startServiceServer(options: ServiceServerOptions): RunningServiceServer {
  const now = options.now ?? Date.now
  const buckets = new Map<string, Bucket>()
  const sseByClient = new Map<string, number>()
  let sseTotal = 0
  const bridges = new Set<SseTransportBridge>()
  const maxBody = options.maxBodyBytes ?? MAX_BODY_BYTES
  const rate = options.rateLimitPerMinute ?? RATE_LIMIT_PER_MINUTE
  const burst = options.rateLimitBurst ?? RATE_LIMIT_BURST
  const heartbeat = options.heartbeatMs ?? SSE_HEARTBEAT_MS
  const maxPerClient = options.maxSsePerCredential ?? SSE_MAX_PER_CREDENTIAL
  const maxTotal = options.maxSseTotal ?? SSE_MAX_TOTAL

  const consume = (clientId: string): boolean => {
    const timestamp = now()
    const bucket = buckets.get(clientId) ?? { tokens: burst, updatedAt: timestamp }
    bucket.tokens = Math.min(burst, bucket.tokens + ((timestamp - bucket.updatedAt) * rate) / 60_000)
    bucket.updatedAt = timestamp
    if (bucket.tokens < 1) { buckets.set(clientId, bucket); return false }
    bucket.tokens -= 1
    buckets.set(clientId, bucket)
    return true
  }

  const readBody = async (request: Request): Promise<unknown> => {
    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > maxBody) throw Object.assign(new Error("Request body exceeds 256 KiB"), { status: 413 })
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > maxBody) throw Object.assign(new Error("Request body exceeds 256 KiB"), { status: 413 })
    if (bytes.byteLength === 0) return {}
    try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw Object.assign(new Error("Malformed JSON body"), { status: 400 }) }
  }

  const events = async (request: Request, client: AuthenticatedClient, id: string, server: Bun.Server<undefined>): Promise<Response> => {
    if (!options.broker) return failure(id, "capability_unavailable", "Event streaming is unavailable", 409)
    if ((sseByClient.get(client.clientId) ?? 0) >= maxPerClient || sseTotal >= maxTotal) {
      return failure(id, "rate_limited", "Event connection limit reached", 429)
    }
    const cursor = new URL(request.url).searchParams.get("cursor") ?? "0"
    if (!/^(0|[1-9][0-9]*)$/.test(cursor)) return failure(id, "invalid_request", "Invalid event cursor", 400)
    let subscription: EventSubscription
    try { subscription = await options.broker.subscribe(cursor) } catch (caught) {
      const replay = (caught as { replay?: { requested: string; earliest_cursor: string; latest_cursor: string; snapshot_revision: string } }).replay
      if (replay) return failure(id, "replay_gap", "Requested cursor is no longer retained", 409, replay)
      throw caught
    }
    sseTotal += 1
    sseByClient.set(client.clientId, (sseByClient.get(client.clientId) ?? 0) + 1)
    options.onConnectionChange?.(sseTotal)
    server.timeout(request, 0)
    let closed = false
    const release = () => {
      if (closed) return
      closed = true
      sseTotal -= 1
      const remaining = (sseByClient.get(client.clientId) ?? 1) - 1
      if (remaining) sseByClient.set(client.clientId, remaining); else sseByClient.delete(client.clientId)
      options.onConnectionChange?.(sseTotal)
    }
    const bridge = new SseTransportBridge(subscription, heartbeat, () => { bridges.delete(bridge); release() })
    bridges.add(bridge)
    const stream = bridge.stream()
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } })
  }

  const server = Bun.serve({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 0,
    maxRequestBodySize: maxBody,
    idleTimeout: REQUEST_TIMEOUT_SECONDS,
    async fetch(request, server) {
      const admission = authenticateAdmission(request.headers.get("authorization"), { serviceRoot: options.serviceRoot })
      if (!admission.ok) return json(admission.body, admission.status)
      const id = requestId()
      if (!consume(admission.client.clientId)) return failure(id, "rate_limited", "Request rate limit exceeded", 429)
      const url = new URL(request.url)
      if (request.method === "GET" && url.pathname === "/v1/events") return events(request, admission.client, id, server)
      server.timeout(request, REQUEST_TIMEOUT_SECONDS)
      try {
        if (request.method === "GET" && url.pathname === "/v1") return json(success(id, {
          service_version: "1",
          capabilities: {
            workspace_snapshots: { available: true },
            operations: { available: Boolean(options.operations) },
            attention_events: { available: Boolean(options.broker) },
          },
          limits: { request_body_bytes: maxBody, subscriber_events: 256, subscriber_bytes: 1024 * 1024 },
        }))
        if (request.method === "GET" && url.pathname === "/v1/snapshot") return json(success(id, await options.snapshot.buildAll()))
        const workspaceMatch = /^\/v1\/workspaces\/([^/]+)$/.exec(url.pathname)
        if (request.method === "GET" && workspaceMatch) {
          const all = await options.snapshot.buildAll()
          const workspace = all.find((item) => item.workspace.id === decodeURIComponent(workspaceMatch[1]!))
          if (!workspace) return failure(id, "not_found", "Workspace not found", 404)
          return json(await options.snapshot.buildWorkspace(workspace.workspace.name, id))
        }
        const mutationMatch = /^\/v1\/operations\/([^/]+)$/.exec(url.pathname)
        if (request.method === "POST" && mutationMatch && mutationMatch[1] !== "cancel") {
          const mutation = decodeURIComponent(mutationMatch[1]!)
          const adapter = options.mutations?.[mutation]
          if (!adapter || !options.operations) return failure(id, "capability_unavailable", "Mutation capability is unavailable", 409, { capability: mutation })
          const parsed = MutationRequestSchema.safeParse(await readBody(request))
          if (!parsed.success) return failure(id, "invalid_request", "Invalid mutation request", 400)
          const key = request.headers.get("idempotency-key")
          if (!key || key.length > 256) return failure(id, "invalid_request", "A valid Idempotency-Key header is required", 400)
          const operation = await options.operations.submit({ clientId: admission.client.clientId, endpoint: mutation, idempotencyKey: key, request: parsed.data, execution: adapter(parsed.data) })
          return json(success(id, operation), 202)
        }
        const operationMatch = /^\/v1\/operations\/(op_[A-Za-z0-9_-]{16,})$/.exec(url.pathname)
        if (request.method === "GET" && operationMatch) {
          const operation = options.operations?.get(operationMatch[1]!)
          return operation ? json(success(id, operation)) : failure(id, "not_found", "Operation not found", 404)
        }
        const cancelMatch = /^\/v1\/operations\/(op_[A-Za-z0-9_-]{16,})\/cancel$/.exec(url.pathname)
        if (request.method === "POST" && cancelMatch && options.operations) {
          const operation = options.operations.get(cancelMatch[1]!)
          if (!operation) return failure(id, "not_found", "Operation not found", 404)
          return json(success(id, await options.operations.cancel(cancelMatch[1]!)), 202)
        }
        return failure(id, "not_found", "Route not found", 404)
      } catch (caught) {
        if (caught instanceof IdempotencyConflictError) return failure(id, "idempotency_conflict", caught.message, 409, { operation_id: caught.operationId })
        const status = (caught as { status?: number }).status
        if (status === 400 || status === 413) return failure(id, "invalid_request", (caught as Error).message, status)
        return failure(id, "internal_error", "Service request failed", 500)
      }
    },
  })
  const url = new URL(`http://${server.hostname}:${server.port}`)
  return {
    server,
    url,
    get connectedClients() { return sseTotal },
    get sseDiagnostics() { return [...bridges].map((bridge) => bridge.diagnostics) },
    async stop() { for (const bridge of [...bridges]) bridge.close(); options.broker?.close(); await server.stop(true) },
  }
}
