import "reflect-metadata"
import { createPublicKey, randomBytes } from "node:crypto"
import { createSocket, type RemoteInfo } from "node:dgram"
import { once } from "node:events"
import { mkdirSync, writeFileSync } from "node:fs"
import { createServer as createHttpServer } from "node:http"
import { createServer as createTcpServer, connect as connectTcp, type Socket } from "node:net"
import { createServer as createTlsServer } from "node:tls"
import { Http3Server, quicheLoaded, type WebTransportSession } from "@fails-components/webtransport"
import { authoritySigned, selfSigned } from "./certificate.ts"
import { FrameParser, encodeJson, json } from "./protocol.ts"

const HOST = "127.0.0.1"
const AUTHORITY_HOST = "127.0.0.2"
const pairToken = randomBytes(32).toString("base64url")
const browserToken = randomBytes(32).toString("base64url")
const tuiToken = randomBytes(32).toString("base64url")
const usedTokens = new Set<string>()
const helpers = new Map<string, JsonWebKey>()
const captures = { udp: [] as Buffer[], tcp: [] as Buffer[], http: [] as string[] }
const activeSessions = new Set<WebTransportSession>()
const markers = new Set<string>()
const metrics = { browserAccepted: false, helperPaired: false, helperReconnected: false, helperReconnects: 0, tuiAccepted: false, rotated: false }

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

function recordMarker(value: unknown): void {
  markers.add(String(value))
  mkdirSync(new URL(".state/", import.meta.url), { recursive: true, mode: 0o700 })
  writeFileSync(new URL(".state/markers.json", import.meta.url), JSON.stringify([...markers]), { mode: 0o600 })
}

async function readFrame(readable: ReadableStream<Uint8Array>): Promise<Record<string, unknown>> {
  const reader = readable.getReader()
  const parser = new FrameParser()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) throw new Error("stream closed before frame")
      const frames = parser.push(next.value)
      if (frames[0]) return json(frames[0])
    }
  } finally {
    reader.releaseLock()
  }
}

function canonicalPin(pin: string, url: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([1, "git-stacks-spike-service", pin, url]))
}

function canonicalProof(helperId: string, nonce: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([1, "git-stacks-spike-service", helperId, nonce]))
}

const serviceIdentity = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
const servicePublicKey = await crypto.subtle.exportKey("jwk", serviceIdentity.publicKey)
const certA = await selfSigned(HOST)
const certB = await selfSigned(HOST)
let pinBSignature = ""
let wtUrlB = ""

await quicheLoaded
async function reserveUdpPort(): Promise<number> {
  const socket = createSocket("udp4")
  socket.bind(0, HOST)
  await once(socket, "listening")
  const address = socket.address()
  socket.close()
  await once(socket, "close")
  return address.port
}
const portA = await reserveUdpPort()
const wtServer = new Http3Server({
  host: AUTHORITY_HOST,
  port: portA,
  secret: randomBytes(32).toString("base64url"),
  cert: certA.cert,
  privKey: certA.key,
  defaultDatagramsReadableMode: "bytes",
})
const sessions = wtServer.sessionStream("/secure")
wtServer.startServer()
await wtServer.ready
const wtAddress = wtServer.address()
if (!wtAddress) throw new Error("WebTransport address unavailable")
const wtServerB = new Http3Server({
  host: AUTHORITY_HOST,
  port: await reserveUdpPort(),
  secret: randomBytes(32).toString("base64url"),
  cert: certB.cert,
  privKey: certB.key,
  defaultDatagramsReadableMode: "bytes",
})
const sessionsB = wtServerB.sessionStream("/secure")
wtServerB.startServer()
await wtServerB.ready
const wtAddressB = wtServerB.address()
if (!wtAddressB) throw new Error("rotated WebTransport address unavailable")

async function handleWtStream(stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): Promise<void> {
  const writer = stream.writable.getWriter()
  try {
    const first = await readFrame(stream.readable)
    if (first.type === "browser-pair") {
      if (first.token !== browserToken || usedTokens.has(browserToken)) throw new Error("browser pairing rejected")
      usedTokens.add(browserToken)
      recordMarker(first.marker)
      metrics.browserAccepted = true
      await writer.write(encodeJson(2, 0n, { type: "accepted", principal: "browser" }))
      return
    }
    if (first.type === "helper-pair") {
      if (first.token !== pairToken || usedTokens.has(pairToken) || typeof first.helperId !== "string") throw new Error("helper pairing rejected")
      usedTokens.add(pairToken)
      helpers.set(first.helperId, first.publicKey as JsonWebKey)
      recordMarker(first.marker)
      metrics.helperPaired = true
      await writer.write(encodeJson(2, 0n, { type: "paired", nextPin: certB.hash, nextUrl: wtUrlB, signature: pinBSignature }))
      return
    }
    if (first.type === "auth-init" && typeof first.helperId === "string") {
      const key = helpers.get(first.helperId)
      if (!key) throw new Error("unknown helper")
      const nonce = randomBytes(32).toString("base64url")
      await writer.write(encodeJson(2, 0n, { type: "challenge", nonce }))
      const proof = await readFrame(stream.readable)
      const imported = await crypto.subtle.importKey("jwk", key, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
      const valid = typeof proof.signature === "string" && await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        imported,
        Buffer.from(proof.signature, "base64url"),
        canonicalProof(first.helperId, nonce) as BufferSource,
      )
      if (!valid) throw new Error("invalid helper proof")
      recordMarker(proof.marker)
      metrics.helperReconnected = true
      metrics.helperReconnects += 1
      await writer.write(encodeJson(2, 0n, { type: "accepted", principal: "helper" }))
      return
    }
    throw new Error("unsupported handshake")
  } catch (error) {
    await writer.write(encodeJson(3, 0n, { type: "rejected", error: String(error) })).catch(() => undefined)
  } finally {
    await writer.close().catch(() => undefined)
    writer.releaseLock()
  }
}

async function handleWtSession(session: WebTransportSession): Promise<void> {
  await session.ready
  activeSessions.add(session)
  const reader = session.incomingBidirectionalStreams.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      void handleWtStream(next.value)
    }
  } finally {
    reader.releaseLock()
    await session.closed.catch(() => undefined)
    activeSessions.delete(session)
  }
}

async function acceptSessions(source: any): Promise<void> {
  const reader = source.getReader()
  while (true) {
    const next = await reader.read()
    if (next.done) break
    void handleWtSession(next.value)
  }
}
void acceptSessions(sessions)
void acceptSessions(sessionsB)

const udpProxy = createSocket("udp4")
const udpUpstream = createSocket("udp4")
let udpClient: RemoteInfo | undefined
udpProxy.on("message", (message, remote) => {
  udpClient = remote
  captures.udp.push(Buffer.from(message))
  udpUpstream.send(message, wtAddress.port, AUTHORITY_HOST)
})
udpUpstream.on("message", (message) => {
  captures.udp.push(Buffer.from(message))
  if (udpClient) udpProxy.send(message, udpClient.port, udpClient.address)
})
udpProxy.bind(wtAddress.port, HOST)
await once(udpProxy, "listening")
const udpAddress = udpProxy.address()

const udpProxyB = createSocket("udp4")
const udpUpstreamB = createSocket("udp4")
let udpClientB: RemoteInfo | undefined
udpProxyB.on("message", (message, remote) => {
  udpClientB = remote
  captures.udp.push(Buffer.from(message))
  udpUpstreamB.send(message, wtAddressB.port, AUTHORITY_HOST)
})
udpUpstreamB.on("message", (message) => {
  captures.udp.push(Buffer.from(message))
  if (udpClientB) udpProxyB.send(message, udpClientB.port, udpClientB.address)
})
udpProxyB.bind(wtAddressB.port, HOST)
await once(udpProxyB, "listening")
const udpAddressB = udpProxyB.address()
wtUrlB = `https://${HOST}:${udpAddressB.port}/secure`
pinBSignature = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, serviceIdentity.privateKey, canonicalPin(certB.hash, wtUrlB) as BufferSource)).toString("base64url")

const tlsCertificate = await authoritySigned(HOST)
const tlsServer = createTlsServer({
  cert: tlsCertificate.cert,
  key: tlsCertificate.key,
  minVersion: "TLSv1.3",
  maxVersion: "TLSv1.3",
  ALPNProtocols: ["git-stacks/2"],
}, (socket) => {
  const parser = new FrameParser()
  socket.on("data", (bytes) => {
    for (const frame of parser.push(bytes)) {
      const message = json(frame)
      if (message.type !== "tui-auth" || message.token !== tuiToken || usedTokens.has(tuiToken)) {
        socket.end(encodeJson(3, 0n, { type: "rejected" }))
        return
      }
      usedTokens.add(tuiToken)
      recordMarker(message.marker)
      metrics.tuiAccepted = true
      socket.end(encodeJson(2, 0n, { type: "accepted", principal: "tui" }))
    }
  })
})
tlsServer.listen(0, HOST)
await once(tlsServer, "listening")
const tlsAddress = tlsServer.address()
if (!tlsAddress || typeof tlsAddress === "string") throw new Error("TLS address unavailable")

const tcpSockets = new Set<Socket>()
const tcpProxy = createTcpServer((client) => {
  const upstream = connectTcp({ host: HOST, port: tlsAddress.port })
  tcpSockets.add(client); tcpSockets.add(upstream)
  client.on("data", (bytes) => captures.tcp.push(Buffer.from(bytes)))
  upstream.on("data", (bytes) => captures.tcp.push(Buffer.from(bytes)))
  client.pipe(upstream); upstream.pipe(client)
  client.once("close", () => tcpSockets.delete(client)); upstream.once("close", () => tcpSockets.delete(upstream))
})
tcpProxy.listen(0, HOST)
await once(tcpProxy, "listening")
const tcpAddress = tcpProxy.address()
if (!tcpAddress || typeof tcpAddress === "string") throw new Error("TCP proxy address unavailable")

const browserSource = `
const decoder = new TextDecoder();
const encoder = new TextEncoder();
function b64(value) { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
function frame(value) { const body = encoder.encode(JSON.stringify(value)); const out = new Uint8Array(13 + body.length); const view = new DataView(out.buffer); out[0] = 2; view.setUint32(1, body.length); view.setBigUint64(5, 0n); out.set(body, 13); return out; }
async function run() {
  const config = JSON.parse(decoder.decode(b64(location.hash.slice(1)))); history.replaceState(null, '', location.pathname);
  const marker = 'BROWSER_TERMINAL_SECRET_' + crypto.randomUUID();
  const transport = new WebTransport(config.url, { serverCertificateHashes: [{ algorithm: 'sha-256', value: b64(config.pin) }] });
  await transport.ready; const stream = await transport.createBidirectionalStream(); const writer = stream.writable.getWriter();
  await writer.write(frame({ type: 'browser-pair', token: config.token, marker })); await writer.close();
  const read = await stream.readable.getReader().read(); if (read.done) throw new Error('empty response');
  const size = new DataView(read.value.buffer, read.value.byteOffset).getUint32(1); const response = JSON.parse(decoder.decode(read.value.slice(13, 13 + size)));
  if (response.type !== 'accepted') throw new Error(JSON.stringify(response)); transport.close();
  document.body.dataset.result = 'passed'; document.querySelector('main').textContent = 'encrypted browser terminal path passed';
}
run().catch(error => { document.body.dataset.result = 'failed'; document.querySelector('main').textContent = String(error); });
`
const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src https://127.0.0.1:*; object-src 'none'; base-uri 'none'"><main>running</main><script src="/client.js"></script>`
let httpServer: ReturnType<typeof createHttpServer>
httpServer = createHttpServer((request, response) => {
  captures.http.push(request.url ?? "")
  if (request.url === "/client.js") { response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }); response.end(browserSource); return }
  if (request.url === "/metrics") {
    const udp = Buffer.concat(captures.udp); const tcp = Buffer.concat(captures.tcp)
    const markerVisible = [...markers].some((marker) => udp.includes(Buffer.from(marker)) || tcp.includes(Buffer.from(marker)))
    const bootstrapLeak = captures.http.some((url) => url.includes(pairToken) || url.includes(browserToken) || url.includes(tuiToken) || url.includes(certA.hash))
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    response.end(JSON.stringify({ ...metrics, markerVisible, bootstrapLeak, udpBytes: udp.length, tcpBytes: tcp.length, httpRequests: captures.http, activeSessions: activeSessions.size, rss: process.memoryUsage().rss }))
    return
  }
  if (request.url === "/rotate" && request.method === "POST") {
    metrics.rotated = true
    response.writeHead(204); response.end(); return
  }
  if (request.url === "/") { response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }); response.end(html); return }
  response.writeHead(404); response.end()
})
httpServer.listen(0, HOST)
await once(httpServer, "listening")
const httpAddress = httpServer.address()
if (!httpAddress || typeof httpAddress === "string") throw new Error("HTTP address unavailable")

const wtUrl = `https://${HOST}:${udpAddress.port}/secure`
const fragment = Buffer.from(JSON.stringify({ url: wtUrl, pin: certA.hash, token: browserToken })).toString("base64url")
const descriptor = {
  http: `http://${HOST}:${httpAddress.port}`,
  browserUrl: `http://${HOST}:${httpAddress.port}/#${fragment}`,
  wtUrl,
  pinA: certA.hash,
  pairToken,
  servicePublicKey,
  tui: { host: HOST, port: tcpAddress.port, ca: tlsCertificate.ca, wrongCa: certB.cert, token: tuiToken },
}
mkdirSync(new URL(".state/", import.meta.url), { recursive: true, mode: 0o700 })
const descriptorPath = new URL(".state/descriptor.json", import.meta.url)
writeFileSync(descriptorPath, JSON.stringify(descriptor), { mode: 0o600 })
console.log(`DESCRIPTOR_FILE ${descriptorPath.pathname}`)
log("spike.ready", { http: descriptor.http, wtUrl, node: process.version, platform: process.platform, arch: process.arch })

let stopping = false
async function stop(): Promise<void> {
  if (stopping) return
  stopping = true
  for (const session of activeSessions) session.close({ closeCode: 0, reason: "shutdown" })
  await Promise.race([Promise.allSettled([...activeSessions].map((session) => session.closed)), new Promise((resolve) => setTimeout(resolve, 1000))])
  httpServer.closeAllConnections(); httpServer.close()
  for (const socket of tcpSockets) socket.destroy()
  tcpProxy.close(); tlsServer.close(); udpProxy.close(); udpUpstream.close(); udpProxyB.close(); udpUpstreamB.close()
  wtServer.stopServer()
  wtServerB.stopServer()
  await Promise.race([Promise.allSettled([wtServer.closed, wtServerB.closed]), new Promise((resolve) => setTimeout(resolve, 1000))])
}
process.on("SIGINT", () => { void stop().then(() => process.exit(0)) })
process.on("SIGTERM", () => { void stop().then(() => process.exit(0)) })
