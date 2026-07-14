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

const BOOTSTRAP_HOST = process.env.BOOTSTRAP_HOST ?? "127.0.0.1"
const WT_HOST = process.env.WT_HOST ?? "127.0.0.1"
const WT_TARGET_HOST = process.env.WT_TARGET_HOST ?? WT_HOST
const WT_PORT = Number(process.env.WT_PORT ?? 4433)
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 0)
const CERT_DAYS = Number(process.env.CERT_DAYS ?? 10)
const root = new URL(".", import.meta.url).pathname

type LogFields = Record<string, unknown>
const activeSessions = new Set<WebTransportSession>()

function log(event: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function send(response: ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  })
  response.end(body)
}

async function generateCertificate(): Promise<{ certPem: string; keyPem: string; der: Uint8Array }> {
  cryptoProvider.set(crypto)
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const now = Date.now()
  const sans = [
    { type: "dns" as const, value: "git-stacks-spike.local" },
    { type: "dns" as const, value: "localhost" },
    { type: "ip" as const, value: "127.0.0.1" },
  ]
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(WT_TARGET_HOST) && WT_TARGET_HOST !== "127.0.0.1") {
    sans.push({ type: "ip", value: WT_TARGET_HOST })
  }
  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"),
    name: "CN=git-stacks-spike.local",
    notBefore: new Date(now - 5 * 60_000),
    notAfter: new Date(now + CERT_DAYS * 24 * 60 * 60_000),
    signingAlgorithm: algorithm,
    keys,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension(sans),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  }, crypto)
  const privateKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey)
  return {
    certPem: certificate.toString("pem"),
    keyPem: PemConverter.encode(privateKey, PemConverter.PrivateKeyTag),
    der: new Uint8Array(certificate.rawData),
  }
}

async function echoSession(session: WebTransportSession): Promise<void> {
  await session.ready
  activeSessions.add(session)
  const peerAddress = (session as WebTransportSession & { peerAddress?: string }).peerAddress
  log("session.accepted", { peerAddress })
  const streams = session.incomingBidirectionalStreams.getReader()
  try {
    while (true) {
      const { done, value: stream } = await streams.read()
      if (done) break
      log("stream.accepted", { peerAddress })
      void stream.readable.pipeTo(stream.writable).then(
        () => log("stream.closed", { peerAddress }),
        (error) => log("stream.error", { peerAddress, error: String(error) }),
      )
    }
  } catch (error) {
    log("session.stream-error", { peerAddress, error: String(error) })
  } finally {
    streams.releaseLock()
    const closed = await session.closed.catch((error) => ({ reason: String(error) }))
    activeSessions.delete(session)
    log("session.closed", { peerAddress, closed })
  }
}

await quicheLoaded
const { certPem, keyPem, der } = await generateCertificate()
const certificateHash = createHash("sha256").update(der).digest()
const certificateHashBase64 = certificateHash.toString("base64")
const wrongHashBase64 = Buffer.from(certificateHash.map((byte, index) => index === 0 ? byte ^ 0xff : byte)).toString("base64")
const transport = new Http3Server({
  host: WT_HOST,
  port: WT_PORT,
  secret: randomBytes(32).toString("base64url"),
  cert: certPem,
  privKey: keyPem,
  defaultDatagramsReadableMode: "bytes",
})
const sessions = transport.sessionStream("/git-stacks")
transport.startServer()
await transport.ready
const address = transport.address()
if (!address) throw new Error("WebTransport server did not expose a listening address")

void (async () => {
  const reader = sessions.getReader()
  try {
    while (true) {
      const { done, value: session } = await reader.read()
      if (done) return
      void echoSession(session)
    }
  } finally {
    reader.releaseLock()
  }
})()

const wtUrl = `https://${WT_TARGET_HOST}:${address.port}/git-stacks`
const nonce = randomBytes(12).toString("base64url")
const indexHtml = readFileSync(join(root, "public/index.html"))
const clientScript = readFileSync(join(root, "public/client.js"))
const appStyles = readFileSync(join(root, "public/app.css"))
const bootstrap = createHttpServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`)
    if (url.pathname === "/config") {
      send(response, 200, "application/json; charset=utf-8", JSON.stringify({ wtUrl, certificateHashBase64, wrongHashBase64, nonce, certificateValidityDays: CERT_DAYS }))
      return
    }
    if (url.pathname === "/client.js") {
      send(response, 200, "text/javascript; charset=utf-8", clientScript)
      return
    }
    if (url.pathname === "/app.css") {
      send(response, 200, "text/css; charset=utf-8", appStyles)
      return
    }
    if (url.pathname === "/") {
      response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
      send(response, 200, "text/html; charset=utf-8", indexHtml)
      return
    }
    send(response, 404, "text/plain; charset=utf-8", "Not found")
})
await new Promise<void>((resolve, reject) => {
  bootstrap.once("error", reject)
  bootstrap.listen(HTTP_PORT, BOOTSTRAP_HOST, resolve)
})
const bootstrapAddress = bootstrap.address()
if (!bootstrapAddress || typeof bootstrapAddress === "string") throw new Error("Bootstrap server did not expose a listening address")
const browserUrl = `http://${BOOTSTRAP_HOST}:${bootstrapAddress.port}/`

log("spike.ready", { browserUrl, wtUrl, certificateHashBase64, certificateValidityDays: CERT_DAYS, runtime: process.version, transport: "@fails-components/webtransport@1.6.6" })
console.log(`OPEN ${browserUrl}`)

let stopping = false
async function stop(): Promise<void> {
  if (stopping) return
  stopping = true
  log("spike.stopping")
  bootstrap.closeAllConnections()
  await new Promise<void>((resolve) => bootstrap.close(() => resolve()))
  for (const session of activeSessions) session.close({ closeCode: 0, reason: "server shutdown" })
  await Promise.race([
    Promise.allSettled([...activeSessions].map((session) => session.closed)),
    sleep(1_000),
  ])
  transport.stopServer()
  await Promise.race([transport.closed, sleep(1_000)])
}

process.on("SIGINT", () => { void stop().then(() => process.exit(0)) })
process.on("SIGTERM", () => { void stop().then(() => process.exit(0)) })
