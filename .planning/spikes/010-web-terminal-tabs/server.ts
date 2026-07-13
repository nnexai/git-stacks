import { randomBytes } from "node:crypto"

const HOST = "127.0.0.1"
const requestedPort = Number(process.env.PORT ?? 0)
const capabilityCookie = "git_stacks_web_poc"
const capability = randomBytes(24).toString("base64url")

type WebSocketData = {
  sessionId: string
  attached: boolean
}

type Session = {
  id: string
  label: string
  createdAt: string
  process: Bun.Subprocess
  terminal: Bun.Terminal
  sockets: Set<Bun.ServerWebSocket<WebSocketData>>
  scrollback: Uint8Array[]
  scrollbackBytes: number
  closed: boolean
  exitCode: number | null
}

const sessions = new Map<string, Session>()
let baseOrigin = ""

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } })
}

function sessionId(): string {
  return `web_${randomBytes(9).toString("base64url")}`
}

function cookieValue(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? ""
  for (const value of cookieHeader.split(";")) {
    const [name, ...rest] = value.trim().split("=")
    if (name === capabilityCookie) return rest.join("=")
  }
  return undefined
}

function isAuthorized(request: Request): boolean {
  return cookieValue(request) === capability
}

function isAllowedOrigin(request: Request): boolean {
  return request.headers.get("origin") === baseOrigin
}

function validDimensions(cols: unknown, rows: unknown): cols is number {
  return Number.isInteger(cols) && Number.isInteger(rows) && Number(cols) >= 2 && Number(cols) <= 300 && Number(rows) >= 1 && Number(rows) <= 200
}

function broadcast(session: Session, data: Uint8Array): void {
  for (const socket of session.sockets) {
    const sent = socket.send(data)
    if (sent === -1) console.warn(`[${session.label}] websocket backpressure applied`)
  }
}

function remember(session: Session, data: Uint8Array): void {
  const copy = data.slice()
  session.scrollback.push(copy)
  session.scrollbackBytes += copy.byteLength
  while (session.scrollbackBytes > 128 * 1024 && session.scrollback.length > 1) {
    session.scrollbackBytes -= session.scrollback.shift()!.byteLength
  }
}

function createSession(label: string): Session {
  const id = sessionId()
  const safeLabel = label.replace(/[^a-zA-Z0-9 _.:-]/g, "").trim().slice(0, 48) || "shell"
  let session: Session | undefined
  const childProcess = Bun.spawn(["bash", "--noprofile", "--norc", "-i"], {
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color", PS1: `[${safeLabel}] $ ` },
    terminal: {
      cols: 100,
      rows: 30,
      name: "xterm-256color",
      data: (_terminal, data) => {
        if (!session) return
        remember(session, data)
        broadcast(session, data)
      },
    },
    onExit: (_process, exitCode) => {
      if (!session) return
      session.closed = true
      session.exitCode = exitCode
      const message = JSON.stringify({ type: "exit", code: exitCode })
      for (const socket of session.sockets) socket.send(message)
    },
  })
  session = {
    id,
    label: safeLabel,
    createdAt: new Date().toISOString(),
    process: childProcess,
    terminal: childProcess.terminal!,
    sockets: new Set(),
    scrollback: [],
    scrollbackBytes: 0,
    closed: false,
    exitCode: null,
  }
  sessions.set(id, session)
  setTimeout(() => session?.terminal.write(`echo "web POC session: ${safeLabel}"; echo "Each tab has an independent Bun PTY. Type a command, then switch tabs."\r`), 100)
  return session
}

function publicSession(session: Session): Record<string, unknown> {
  return { id: session.id, label: session.label, createdAt: session.createdAt, closed: session.closed, exitCode: session.exitCode }
}

const server = Bun.serve<WebSocketData>({
  hostname: HOST,
  port: requestedPort,
  idleTimeout: 0,
  fetch: async (request, server) => {
    const url = new URL(request.url)
    if (url.pathname === "/ws") {
      if (!isAuthorized(request) || !isAllowedOrigin(request)) return new Response("Forbidden", { status: 403 })
      const session = sessions.get(url.searchParams.get("session") ?? "")
      if (!session) return new Response("Unknown session", { status: 404 })
      if (!server.upgrade(request, { data: { sessionId: session.id, attached: false } })) return new Response("WebSocket upgrade failed", { status: 400 })
      return undefined
    }

    if (request.method !== "GET" && request.method !== "POST") return new Response("Method not allowed", { status: 405 })
    if (!isAuthorized(request) && url.pathname !== "/") return new Response("Unauthorized", { status: 401 })

    if (url.pathname === "/") {
      return new Response(Bun.file(new URL("./public/index.html", import.meta.url)), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "set-cookie": `${capabilityCookie}=${capability}; HttpOnly; SameSite=Strict; Path=/`,
        },
      })
    }
    if (url.pathname === "/client.js") return new Response(Bun.file(new URL("./public/client.js", import.meta.url)), { headers: { "content-type": "text/javascript; charset=utf-8" } })
    if (url.pathname === "/client.css") return new Response(Bun.file(new URL("./public/client.css", import.meta.url)), { headers: { "content-type": "text/css; charset=utf-8" } })
    if (url.pathname === "/app.css") return new Response(Bun.file(new URL("./public/app.css", import.meta.url)), { headers: { "content-type": "text/css; charset=utf-8" } })

    if (url.pathname === "/api/sessions" && request.method === "GET") return json([...sessions.values()].map(publicSession))
    if (url.pathname === "/api/sessions" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as { label?: unknown }
      const session = createSession(typeof body.label === "string" ? body.label : "shell")
      return json(publicSession(session), 201)
    }

    const closeMatch = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname)
    if (closeMatch && request.method === "POST") {
      const session = sessions.get(closeMatch[1]!)
      if (!session) return new Response("Not found", { status: 404 })
      if (!session.closed) {
        session.process.kill("SIGTERM")
        session.terminal.close()
      }
      return json({ closed: true })
    }

    return new Response("Not found", { status: 404 })
  },
  websocket: {
    open: (socket) => {
      const session = sessions.get(socket.data.sessionId)
      if (!session) return socket.close(1008, "Unknown session")
      session.sockets.add(socket)
      socket.send(JSON.stringify({ type: "ready", session: publicSession(session) }))
      for (const chunk of session.scrollback) socket.send(chunk)
      socket.data.attached = true
    },
    message: (socket, raw) => {
      const session = sessions.get(socket.data.sessionId)
      if (!session || typeof raw !== "string") return
      let message: { type?: string; data?: unknown; cols?: unknown; rows?: unknown }
      try { message = JSON.parse(raw) } catch { return socket.close(1003, "Invalid message") }
      if (message.type === "input" && typeof message.data === "string" && message.data.length <= 64 * 1024 && !session.closed) {
        session.terminal.write(message.data)
      } else if (message.type === "resize" && validDimensions(message.cols, message.rows) && !session.closed) {
        session.terminal.resize(Number(message.cols), Number(message.rows))
      } else if (message.type === "ping") {
        socket.send(JSON.stringify({ type: "pong" }))
      }
    },
    close: (socket) => {
      const session = sessions.get(socket.data.sessionId)
      session?.sockets.delete(socket)
    },
  },
})

baseOrigin = server.url.origin
for (const label of ["workspace-shell", "test-runner", "logs"]) createSession(label)

console.log(`Web terminal POC listening at ${server.url}`)
console.log(`Open ${server.url} in a browser; each tab is a separate Bun PTY session.`)

process.on("SIGINT", async () => {
  for (const session of sessions.values()) {
    if (!session.closed) session.process.kill("SIGTERM")
    session.terminal.close()
  }
  await server.stop(true)
})
