import { createServer } from "node:http"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import WebSocket, { WebSocketServer } from "ws"

const AUTH_COOKIE = "gs_spike=paired"
const ORIGIN = "http://127.0.0.1"
const startedAt = Date.now()
const log = []

function record(category, detail = {}) {
  log.push({ at: new Date().toISOString(), elapsedMs: Date.now() - startedAt, category, ...detail })
}

function authenticated(request) {
  return request.headers.cookie?.split(/;\s*/).includes(AUTH_COOKIE) === true
}

const history = []
const subscribers = new Set()
let nextEventId = 1

function publish(payload) {
  const event = { id: nextEventId++, payload }
  history.push(event)
  for (const response of subscribers) response.write(`id: ${event.id}\ndata: ${JSON.stringify(event.payload)}\n\n`)
  return event
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", ORIGIN)
  if (!authenticated(request)) {
    response.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}')
    return
  }
  if (url.pathname === "/api/state") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    response.end(JSON.stringify({ revision: history.at(-1)?.id ?? 0 }))
    return
  }
  if (url.pathname === "/events") {
    const cursor = Number(url.searchParams.get("cursor") || request.headers["last-event-id"] || 0)
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    })
    response.flushHeaders()
    for (const event of history) {
      if (event.id > cursor) response.write(`id: ${event.id}\ndata: ${JSON.stringify(event.payload)}\n\n`)
    }
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 25)
    subscribers.add(response)
    const cleanup = () => {
      clearInterval(heartbeat)
      subscribers.delete(response)
    }
    request.once("close", cleanup)
    response.once("close", cleanup)
    return
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  response.end("<!doctype html><title>git-stacks Node transport spike</title><p>ready</p>")
})

const sockets = new Set()
server.on("connection", (socket) => {
  sockets.add(socket)
  socket.once("close", () => sockets.delete(socket))
})

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 })
wss.on("connection", (socket) => {
  socket.on("message", (payload, binary) => {
    if (!binary && payload.toString() === "ping") socket.send("pong")
  })
})

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", ORIGIN)
  const origin = request.headers.origin
  if (url.pathname !== "/terminal" || !authenticated(request) || origin !== ORIGIN) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit("connection", webSocket, request))
})

await new Promise((resolve, reject) => {
  server.once("error", reject)
  server.listen(0, "127.0.0.1", resolve)
})
const address = server.address()
const port = typeof address === "object" && address ? address.port : 0
const baseUrl = `http://127.0.0.1:${port}`
record("server-ready", { port })

async function stateAndAuth() {
  const unauthorized = await fetch(`${baseUrl}/api/state`)
  const authorized = await fetch(`${baseUrl}/api/state`, { headers: { cookie: AUTH_COOKIE } })
  const body = await authorized.json()
  const result = { passed: unauthorized.status === 401 && authorized.status === 200 && body.revision === 0 }
  record("state-and-auth", result)
  return result
}

async function readSseUntil(response, predicate, timeoutMs = 3_000) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  const timeout = delay(timeoutMs).then(() => { throw new Error("SSE read timed out") })
  while (true) {
    const next = await Promise.race([reader.read(), timeout])
    if (next.done) throw new Error("SSE ended unexpectedly")
    text += decoder.decode(next.value, { stream: true })
    if (predicate(text)) {
      await reader.cancel()
      return text
    }
  }
}

async function durableSse() {
  const firstController = new AbortController()
  const first = await fetch(`${baseUrl}/events?cursor=0`, {
    headers: { cookie: AUTH_COOKIE }, signal: firstController.signal,
  })
  const readFirst = readSseUntil(first, (text) => text.includes(": heartbeat") && text.includes('"kind":"first"'))
  const firstEvent = publish({ kind: "first" })
  const firstText = await readFirst
  firstController.abort()
  await delay(20)

  const secondEvent = publish({ kind: "while-disconnected" })
  const second = await fetch(`${baseUrl}/events?cursor=${firstEvent.id}`, { headers: { cookie: AUTH_COOKIE } })
  const secondText = await readSseUntil(second, (text) => text.includes('"kind":"while-disconnected"'))
  await delay(20)
  const result = {
    passed: firstText.includes(": heartbeat") && secondText.includes(`id: ${secondEvent.id}`) && subscribers.size === 0,
    firstEventId: firstEvent.id,
    replayedEventId: secondEvent.id,
    remainingSubscribers: subscribers.size,
  }
  record("durable-sse", result)
  return result
}

function openSocket({ origin = ORIGIN, cookie = AUTH_COOKIE } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/terminal`, { origin, headers: { cookie } })
    socket.once("open", () => resolve(socket))
    socket.once("unexpected-response", (_request, response) => reject(new Error(`upgrade rejected: ${response.statusCode}`)))
    socket.once("error", reject)
  })
}

async function websocketAuth() {
  const rejected = await openSocket({ origin: "http://evil.invalid" }).then(() => false, () => true)
  const socket = await openSocket()
  const pong = once(socket, "message")
  socket.send("ping")
  const [payload] = await pong
  socket.close()
  await once(socket, "close")
  const result = { passed: rejected && payload.toString() === "pong" }
  record("websocket-auth", result)
  return result
}

async function boundedWebSocketStream() {
  const socket = await openSocket()
  const chunk = Buffer.alloc(64 * 1024, 0x61)
  const target = 32 * 1024 * 1024
  const pressureLimit = 512 * 1024
  let received = 0
  let maxBuffered = 0
  let pressureWaits = 0
  socket.on("message", (payload, binary) => {
    if (binary) received += payload.length
  })
  const serverSocket = [...wss.clients][0]
  socket._socket.pause()
  setTimeout(() => socket._socket.resume(), 150)
  const pending = new Set()
  for (let sent = 0; sent < target; sent += chunk.length) {
    while (serverSocket.bufferedAmount > pressureLimit) {
      pressureWaits += 1
      await Promise.race(pending)
    }
    let write
    write = new Promise((resolve, reject) => {
      serverSocket.send(chunk, { binary: true }, (error) => error ? reject(error) : resolve())
    }).finally(() => pending.delete(write))
    pending.add(write)
    maxBuffered = Math.max(maxBuffered, serverSocket.bufferedAmount)
  }
  await Promise.all(pending)
  const deadline = Date.now() + 5_000
  while (received < target && Date.now() < deadline) await delay(5)
  socket.close()
  await once(socket, "close")
  const result = {
    passed: received === target && pressureWaits > 0 && maxBuffered <= pressureLimit + chunk.length,
    received,
    maxBuffered,
    pressureWaits,
  }
  record("bounded-websocket-stream", result)
  return result
}

const checks = []
for (const check of [stateAndAuth, durableSse, websocketAuth, boundedWebSocketStream]) {
  process.stderr.write(`running ${check.name}\n`)
  try {
    checks.push({ name: check.name, ...(await check()) })
  } catch (error) {
    const failure = { name: check.name, passed: false, error: error instanceof Error ? error.stack : String(error) }
    checks.push(failure)
    record(check.name, failure)
  }
}

for (const client of wss.clients) client.terminate()
await new Promise((resolve) => wss.close(resolve))
await new Promise((resolve) => server.close(resolve))
for (const socket of sockets) socket.destroy()
await delay(20)

const report = {
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  wsVersion: "8.21.1",
  passed: checks.every((check) => check.passed) && subscribers.size === 0 && sockets.size === 0,
  durationMs: Date.now() - startedAt,
  checks,
  finalResources: { subscribers: subscribers.size, webSockets: wss.clients.size, sockets: sockets.size },
  log,
}
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.passed ? 0 : 1
