import { once } from "node:events"

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { Socket } from "node:net"
import type { Duplex } from "node:stream"
import { WebSocket, WebSocketServer, type RawData } from "ws"
import type { ServiceRequestContext, TerminalSocket, WebSocketData } from "./carrier"

export interface NodeWebSocketHandlers {
  open(socket: TerminalSocket): void
  message(socket: TerminalSocket, message: string | Buffer): void
  close(socket: TerminalSocket): void
  drain(socket: TerminalSocket): void
}

export interface NodeCarrierOptions {
  hostname: string
  port: number
  maxBodyBytes: number
  websocket: NodeWebSocketHandlers
  handle(request: Request, context: ServiceRequestContext): Promise<Response | undefined>
}

export interface NodeCarrierServer {
  readonly hostname: string
  readonly port: number
  stop(force?: boolean): Promise<void>
}

class NodeTerminalSocket implements TerminalSocket {
  private drainTimer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly socket: WebSocket,
    readonly data: WebSocketData,
    private readonly onDrain: (socket: TerminalSocket) => void,
  ) {}

  send(data: string | Uint8Array): number {
    if (this.socket.readyState !== WebSocket.OPEN) return -1
    this.socket.send(data, { binary: typeof data !== "string", compress: false })
    if (this.socket.bufferedAmount > 0) this.watchDrain()
    return this.socket.bufferedAmount > 1024 * 1024 ? -1 : 1
  }

  close(code = 1000, reason = ""): void {
    if (this.drainTimer) clearTimeout(this.drainTimer)
    this.drainTimer = undefined
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) this.socket.close(code, reason)
  }

  getBufferedAmount(): number { return this.socket.bufferedAmount }

  private watchDrain(): void {
    if (this.drainTimer) return
    const check = () => {
      this.drainTimer = undefined
      if (this.socket.readyState !== WebSocket.OPEN) return
      if (this.socket.bufferedAmount > 0) {
        this.drainTimer = setTimeout(check, 5)
        this.drainTimer.unref?.()
        return
      }
      this.onDrain(this)
    }
    this.drainTimer = setTimeout(check, 5)
    this.drainTimer.unref?.()
  }
}

function requestUrl(request: IncomingMessage, hostname: string, port: number): string {
  return `http://${request.headers.host ?? `${hostname}:${port}`}${request.url ?? "/"}`
}

async function toRequest(incoming: IncomingMessage, hostname: string, port: number, maxBodyBytes: number): Promise<Request> {
  const chunks: Buffer[] = []
  let size = 0
  if (incoming.method !== "GET" && incoming.method !== "HEAD") {
    for await (const chunk of incoming) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > maxBodyBytes) throw Object.assign(new Error("Request body too large"), { status: 413 })
      chunks.push(bytes)
    }
  }
  const controller = new AbortController()
  incoming.once("aborted", () => controller.abort())
  return new Request(requestUrl(incoming, hostname, port), {
    method: incoming.method,
    headers: incoming.headers as HeadersInit,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
    signal: controller.signal,
  })
}

async function writeResponse(outgoing: ServerResponse, response: Response): Promise<void> {
  outgoing.statusCode = response.status
  outgoing.statusMessage = response.statusText
  const setCookies = response.headers.getSetCookie()
  for (const [name, value] of response.headers) if (name !== "set-cookie") outgoing.setHeader(name, value)
  if (setCookies.length) outgoing.setHeader("set-cookie", setCookies)
  if (!response.body) { outgoing.end(); return }
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  outgoing.once("close", cancel)
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      if (!outgoing.write(next.value)) await once(outgoing, "drain")
    }
    outgoing.end()
  } finally {
    outgoing.off("close", cancel)
    reader.releaseLock()
  }
}

function writeUpgradeResponse(socket: Duplex, response: Response): void {
  const status = response.status || 400
  const body = response.statusText || "WebSocket upgrade rejected"
  socket.end(`HTTP/1.1 ${status} ${body}\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

export async function startNodeCarrier(options: NodeCarrierOptions): Promise<NodeCarrierServer> {
  const sockets = new Set<Socket>()
  const websocketServer = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 })
  let port = options.port

  const context = (incoming: IncomingMessage, upgrade: (data: WebSocketData) => boolean): ServiceRequestContext => ({
    hostname: options.hostname,
    get port() { return port },
    timeout: (_request, seconds) => incoming.socket.setTimeout(seconds * 1_000),
    upgrade: (_request, value) => upgrade(value.data),
  })

  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = await toRequest(incoming, options.hostname, port, options.maxBodyBytes)
      const response = await options.handle(request, context(incoming, () => false))
      await writeResponse(outgoing, response ?? new Response("Not found", { status: 404 }))
    } catch (error) {
      if (outgoing.headersSent) { outgoing.destroy(error as Error); return }
      const status = (error as { status?: number }).status ?? 500
      await writeResponse(outgoing, new Response(status === 500 ? "Internal server error" : (error as Error).message, { status }))
    }
  })
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
  })
  server.on("upgrade", async (incoming, socket, head) => {
    try {
      const request = await toRequest(incoming, options.hostname, port, options.maxBodyBytes)
      let data: WebSocketData | undefined
      const response = await options.handle(request, context(incoming, (candidate) => { data = candidate; return true }))
      if (!data || response) { writeUpgradeResponse(socket, response ?? new Response("WebSocket upgrade rejected", { status: 400 })); return }
      websocketServer.handleUpgrade(incoming, socket, head, (websocket) => {
        const peer = new NodeTerminalSocket(websocket, data!, options.websocket.drain)
        websocket.on("message", (raw: RawData, binary) => options.websocket.message(peer, binary ? Buffer.from(raw as Buffer) : raw.toString()))
        websocket.once("close", () => options.websocket.close(peer))
        websocket.once("error", () => peer.close(1011, "WebSocket transport error"))
        options.websocket.open(peer)
      })
    } catch {
      socket.destroy()
    }
  })

  server.listen(options.port, options.hostname)
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Node service failed to bind a TCP port")
  port = address.port

  return {
    hostname: options.hostname,
    port,
    async stop(force = true) {
      for (const client of websocketServer.clients) force ? client.terminate() : client.close(1001, "Service stopping")
      websocketServer.close()
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          try {
            server.close((error) => error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolve())
            if (force) server.closeAllConnections()
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") resolve()
            else reject(error)
          }
        })
      }
      for (const socket of sockets) socket.destroy()
    },
  }
}
