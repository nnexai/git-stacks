import "reflect-metadata"
import { createHash, randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer as createHttpServer, type ServerResponse } from "node:http"
import { join } from "node:path"
import { Http3Server, quicheLoaded, type WebTransportSession } from "@fails-components/webtransport"
import {
  BasicConstraintsExtension,
  ExtendedKeyUsage,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  PemConverter,
  SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension,
  X509CertificateGenerator,
  cryptoProvider,
} from "@peculiar/x509"

const HOST = "127.0.0.1"
const WT_PORT = Number(process.env.WT_PORT ?? 4436)
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 0)
const REPLAY_BYTES = 1024 * 1024
const CHUNK_BYTES = 16 * 1024
const HEADER_BYTES = 13
const root = new URL(".", import.meta.url).pathname
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const activeSessions = new Set<WebTransportSession>()
const startupRss = process.memoryUsage().rss
const metrics = { cancelObserved: false, scenarios: 0, startupRss, readyRss: 0, peakRss: startupRss }

type Duplex = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }
type Command = { scenario: "visible" | "slow" | "hidden" | "multi" | "reconnect" | "cancel"; active?: boolean; phase?: number; cursor?: string }
type Chunk = { cursor: bigint; bytes: Uint8Array }

function log(event: string, fields: Record<string, unknown> = {}): void {
  metrics.peakRss = Math.max(metrics.peakRss, process.memoryUsage().rss)
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body), "cache-control": "no-store" })
  response.end(body)
}

function frame(type: 1 | 2, cursor: bigint, payload: Uint8Array): Uint8Array {
  const value = new Uint8Array(HEADER_BYTES + payload.length)
  const view = new DataView(value.buffer)
  value[0] = type
  view.setUint32(1, payload.length)
  view.setBigUint64(5, cursor)
  value.set(payload, HEADER_BYTES)
  return value
}

function control(value: unknown): Uint8Array {
  return frame(2, 0n, encoder.encode(JSON.stringify(value)))
}

class FrameParser {
  private pending = new Uint8Array(0)

  push(input: Uint8Array): Array<{ type: number; cursor: bigint; payload: Uint8Array }> {
    const joined = new Uint8Array(this.pending.length + input.length)
    joined.set(this.pending)
    joined.set(input, this.pending.length)
    const output: Array<{ type: number; cursor: bigint; payload: Uint8Array }> = []
    let offset = 0
    while (joined.length - offset >= HEADER_BYTES) {
      const view = new DataView(joined.buffer, joined.byteOffset + offset)
      const length = view.getUint32(1)
      if (length > 1024 * 1024 || joined.length - offset < HEADER_BYTES + length) break
      output.push({ type: joined[offset]!, cursor: view.getBigUint64(5), payload: joined.slice(offset + HEADER_BYTES, offset + HEADER_BYTES + length) })
      offset += HEADER_BYTES + length
    }
    this.pending = joined.slice(offset)
    return output
  }
}

class Retention {
  cursor = 0n
  bytes = 0
  historyAvailable = true
  chunks: Chunk[] = []

  append(bytes: Uint8Array): Chunk {
    const chunk = { cursor: ++this.cursor, bytes }
    this.chunks.push(chunk)
    this.bytes += bytes.length
    while (this.bytes > REPLAY_BYTES && this.chunks.length > 1) {
      this.bytes -= this.chunks.shift()!.bytes.length
      this.historyAvailable = false
    }
    return chunk
  }

  after(cursor: bigint): { gap: boolean; chunks: Chunk[] } {
    const earliest = this.chunks[0]?.cursor ?? this.cursor
    return { gap: this.chunks.length > 0 && cursor + 1n < earliest, chunks: this.chunks.filter((item) => item.cursor > cursor) }
  }
}

function payload(seed: number): Uint8Array {
  const value = new Uint8Array(CHUNK_BYTES)
  value.fill(32 + (seed % 90))
  value[value.length - 1] = 10
  return value
}

async function generate(retention: Retention, bytes: number, onChunk?: (chunk: Chunk) => Promise<void>): Promise<void> {
  const count = Math.ceil(bytes / CHUNK_BYTES)
  for (let index = 0; index < count; index += 1) {
    const chunk = retention.append(payload(index))
    if (onChunk) await onChunk(chunk)
  }
}

async function readCommand(readable: ReadableStream<Uint8Array>): Promise<Command> {
  const reader = readable.getReader()
  const parser = new FrameParser()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) throw new Error("stream ended before command")
      for (const item of parser.push(value)) {
        if (item.type === 2) return JSON.parse(decoder.decode(item.payload)) as Command
      }
    }
  } finally {
    reader.releaseLock()
  }
}

type WriteMetrics = { writes: number; blockedWrites: number; maxWriteMs: number }

async function measuredWrite(writer: WritableStreamDefaultWriter<Uint8Array>, bytes: Uint8Array, state: WriteMetrics): Promise<void> {
  const started = performance.now()
  await writer.write(bytes)
  const elapsed = performance.now() - started
  state.writes += 1
  if (elapsed >= 1) state.blockedWrites += 1
  state.maxWriteMs = Math.max(state.maxWriteMs, elapsed)
}

const reconnect = new Retention()
let reconnectInitialized = false

async function handleScenario(stream: Duplex, command: Command): Promise<void> {
  metrics.scenarios += 1
  const writer = stream.writable.getWriter()
  const writes: WriteMetrics = { writes: 0, blockedWrites: 0, maxWriteMs: 0 }
  const started = performance.now()
  const finish = async (result: Record<string, unknown>): Promise<void> => {
    await measuredWrite(writer, control({ type: "result", scenario: command.scenario, ...result, transport: { ...writes } }), writes)
    await writer.close()
    log("scenario.complete", { scenario: command.scenario, elapsedMs: Math.round(performance.now() - started), ...result, ...writes })
  }

  try {
    if (command.scenario === "visible" || command.scenario === "slow") {
      const retention = new Retention()
      const total = command.scenario === "visible" ? 16 * 1024 * 1024 : 48 * 1024 * 1024
      await generate(retention, total, (chunk) => measuredWrite(writer, frame(1, chunk.cursor, chunk.bytes), writes))
      await finish({ generated: total, replayBytes: retention.bytes, cursor: retention.cursor.toString() })
      return
    }

    if (command.scenario === "hidden") {
      const retention = new Retention()
      await generate(retention, 8 * 1024 * 1024)
      const replay = retention.after(0n)
      await measuredWrite(writer, control({ type: "reset", earliest: retention.chunks[0]?.cursor.toString(), latest: retention.cursor.toString() }), writes)
      for (const chunk of replay.chunks) await measuredWrite(writer, frame(1, chunk.cursor, chunk.bytes), writes)
      await finish({ generated: 8 * 1024 * 1024, replayBytes: retention.bytes, gap: replay.gap, cursor: retention.cursor.toString() })
      return
    }

    if (command.scenario === "multi") {
      const retention = new Retention()
      const total = 2 * 1024 * 1024
      await generate(retention, total, command.active ? (chunk) => measuredWrite(writer, frame(1, chunk.cursor, chunk.bytes), writes) : undefined)
      await finish({ generated: total, sent: command.active ? total : 0, replayBytes: retention.bytes, active: Boolean(command.active) })
      return
    }

    if (command.scenario === "reconnect") {
      const phase = command.phase ?? 1
      if (phase === 1 || !reconnectInitialized) {
        reconnect.chunks = []
        reconnect.cursor = 0n
        reconnect.bytes = 0
        reconnect.historyAvailable = true
        reconnectInitialized = true
        await generate(reconnect, 512 * 1024, (chunk) => measuredWrite(writer, frame(1, chunk.cursor, chunk.bytes), writes))
        const acknowledged = reconnect.cursor
        await generate(reconnect, 512 * 1024)
        await finish({ phase: 1, acknowledged: acknowledged.toString(), latest: reconnect.cursor.toString(), gap: false, replayBytes: reconnect.bytes })
        return
      }
      const requested = BigInt(command.cursor ?? "0")
      const replay = reconnect.after(requested)
      if (replay.gap) await measuredWrite(writer, control({ type: "reset", earliest: reconnect.chunks[0]?.cursor.toString(), latest: reconnect.cursor.toString() }), writes)
      for (const chunk of replay.chunks) await measuredWrite(writer, frame(1, chunk.cursor, chunk.bytes), writes)
      if (phase === 2) {
        await generate(reconnect, 512 * 1024, (chunk) => measuredWrite(writer, frame(1, chunk.cursor, chunk.bytes), writes))
        const acknowledged = reconnect.cursor
        await generate(reconnect, 2 * 1024 * 1024)
        await finish({ phase, requested: requested.toString(), acknowledged: acknowledged.toString(), latest: reconnect.cursor.toString(), gap: replay.gap, replayBytes: reconnect.bytes })
      } else {
        await finish({ phase, requested: requested.toString(), latest: reconnect.cursor.toString(), gap: replay.gap, replayBytes: reconnect.bytes })
      }
      return
    }

    if (command.scenario === "cancel") {
      const retention = new Retention()
      try {
        await generate(retention, 128 * 1024 * 1024, (chunk) => measuredWrite(writer, frame(1, chunk.cursor, chunk.bytes), writes))
      } catch (error) {
        metrics.cancelObserved = true
        log("scenario.cancelled", { cursor: retention.cursor.toString(), replayBytes: retention.bytes, error: String(error) })
        return
      }
      await finish({ unexpected: "consumer did not cancel", replayBytes: retention.bytes })
    }
  } finally {
    writer.releaseLock()
  }
}

async function handleSession(session: WebTransportSession): Promise<void> {
  await session.ready
  activeSessions.add(session)
  const reader = session.incomingBidirectionalStreams.getReader()
  log("session.accepted")
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      void readCommand(value.readable).then((command) => handleScenario(value, command)).catch((error) => log("stream.error", { error: String(error) }))
    }
  } catch (error) {
    log("session.error", { error: String(error) })
  } finally {
    reader.releaseLock()
    await session.closed.catch(() => undefined)
    activeSessions.delete(session)
    log("session.closed")
  }
}

async function certificate(): Promise<{ cert: string; key: string; hash: string }> {
  cryptoProvider.set(crypto)
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const now = Date.now()
  const cert = await X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"),
    name: "CN=git-stacks-spike.local",
    notBefore: new Date(now - 5 * 60_000),
    notAfter: new Date(now + 10 * 24 * 60 * 60_000),
    signingAlgorithm: algorithm,
    keys,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension([{ type: "dns", value: "localhost" }, { type: "ip", value: HOST }]),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  }, crypto)
  return {
    cert: cert.toString("pem"),
    key: PemConverter.encode(await crypto.subtle.exportKey("pkcs8", keys.privateKey), PemConverter.PrivateKeyTag),
    hash: createHash("sha256").update(new Uint8Array(cert.rawData)).digest("base64"),
  }
}

await quicheLoaded
const identity = await certificate()
const transport = new Http3Server({ host: HOST, port: WT_PORT, secret: randomBytes(32).toString("base64url"), cert: identity.cert, privKey: identity.key, defaultDatagramsReadableMode: "bytes" })
const sessions = transport.sessionStream("/terminal")
transport.startServer()
await transport.ready
const transportAddress = transport.address()
if (!transportAddress) throw new Error("WebTransport address unavailable")
void (async () => {
  const reader = sessions.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      void handleSession(value)
    }
  } finally { reader.releaseLock() }
})()

const html = readFileSync(join(root, "public/index.html"))
const client = readFileSync(join(root, "public/client.js"))
const bootstrap = createHttpServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`)
  if (url.pathname === "/config") return send(response, 200, "application/json", JSON.stringify({ wtUrl: `https://${HOST}:${transportAddress.port}/terminal`, hash: identity.hash, replayBytes: REPLAY_BYTES }))
  if (url.pathname === "/metrics") return send(response, 200, "application/json", JSON.stringify({ ...metrics, rss: process.memoryUsage().rss }))
  if (url.pathname === "/client.js") return send(response, 200, "text/javascript; charset=utf-8", client)
  if (url.pathname === "/favicon.ico") return send(response, 204, "text/plain", "")
  if (url.pathname === "/") {
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; connect-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    return send(response, 200, "text/html; charset=utf-8", html)
  }
  return send(response, 404, "text/plain", "Not found")
})
await new Promise<void>((resolve, reject) => { bootstrap.once("error", reject); bootstrap.listen(HTTP_PORT, HOST, resolve) })
const bootstrapAddress = bootstrap.address()
if (!bootstrapAddress || typeof bootstrapAddress === "string") throw new Error("Bootstrap address unavailable")
metrics.readyRss = process.memoryUsage().rss
log("spike.ready", { browserUrl: `http://${HOST}:${bootstrapAddress.port}/`, wtUrl: `https://${HOST}:${transportAddress.port}/terminal`, runtime: process.version })
console.log(`OPEN http://${HOST}:${bootstrapAddress.port}/`)

let stopping = false
async function stop(): Promise<void> {
  if (stopping) return
  stopping = true
  bootstrap.closeAllConnections()
  await new Promise<void>((resolve) => bootstrap.close(() => resolve()))
  for (const session of activeSessions) session.close({ closeCode: 0, reason: "shutdown" })
  await Promise.race([Promise.allSettled([...activeSessions].map((session) => session.closed)), new Promise((resolve) => setTimeout(resolve, 1_000))])
  transport.stopServer()
  await Promise.race([transport.closed, new Promise((resolve) => setTimeout(resolve, 1_000))])
}
process.on("SIGINT", () => { void stop().then(() => process.exit(0)) })
process.on("SIGTERM", () => { void stop().then(() => process.exit(0)) })
