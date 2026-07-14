import "reflect-metadata"
import { randomBytes } from "node:crypto"
import { once } from "node:events"
import { createServer as createTcpServer, connect as connectTcp, type Server as TcpServer, type Socket as TcpSocket } from "node:net"
import { createServer as createTlsServer, connect as connectTls, type Server as TlsServer, type TLSSocket } from "node:tls"
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
const SERVICE_NAME = "git-stacks-service.local"
const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const

type Authority = { cert: string; keys: CryptoKeyPair }
type Leaf = { cert: string; key: string; serial: string }
type CaptureProxy = { port: number; captured: Buffer[]; close: () => Promise<void> }

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

async function authority(name: string): Promise<Authority> {
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const now = Date.now()
  const cert = await X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"),
    name: `CN=${name}`,
    notBefore: new Date(now - 5 * 60_000),
    notAfter: new Date(now + 10 * 365 * 24 * 60 * 60_000),
    signingAlgorithm: algorithm,
    keys,
    extensions: [
      new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  }, crypto)
  return { cert: cert.toString("pem"), keys }
}

async function leaf(ca: Authority): Promise<Leaf> {
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const now = Date.now()
  const serial = randomBytes(16).toString("hex")
  const cert = await X509CertificateGenerator.create({
    serialNumber: serial,
    subject: `CN=${SERVICE_NAME}`,
    issuer: "CN=git-stacks-service-ca",
    notBefore: new Date(now - 5 * 60_000),
    notAfter: new Date(now + 30 * 24 * 60 * 60_000),
    signingAlgorithm: algorithm,
    publicKey: keys.publicKey,
    signingKey: ca.keys.privateKey,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension([{ type: "dns", value: SERVICE_NAME }]),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  }, crypto)
  return { cert: cert.toString("pem"), key: PemConverter.encode(await crypto.subtle.exportKey("pkcs8", keys.privateKey), PemConverter.PrivateKeyTag), serial }
}

async function listenTls(serverLeaf: Leaf): Promise<{ server: TlsServer; port: number }> {
  const server = createTlsServer({ key: serverLeaf.key, cert: serverLeaf.cert, minVersion: "TLSv1.3" }, (socket) => {
    socket.on("data", (chunk) => { socket.write(chunk) })
  })
  server.listen(0, HOST)
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("TLS server address unavailable")
  return { server, port: address.port }
}

async function closeTls(server: TlsServer): Promise<void> {
  server.close()
  await once(server, "close")
}

async function proxy(targetPort: number): Promise<CaptureProxy> {
  const captured: Buffer[] = []
  const sockets = new Set<TcpSocket>()
  const server: TcpServer = createTcpServer((client) => {
    const remote = connectTcp({ host: HOST, port: targetPort })
    sockets.add(client); sockets.add(remote)
    client.once("close", () => sockets.delete(client)); remote.once("close", () => sockets.delete(remote))
    client.on("data", (chunk) => {
      if (captured.reduce((sum, item) => sum + item.length, 0) < 4 * 1024 * 1024) captured.push(Buffer.from(chunk))
    })
    client.pipe(remote)
    remote.pipe(client)
  })
  server.listen(0, HOST)
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Proxy address unavailable")
  return {
    port: address.port,
    captured,
    close: async () => { for (const socket of sockets) socket.destroy(); server.close(); await once(server, "close") },
  }
}

async function connect(port: number, ca: string): Promise<TLSSocket> {
  const socket = connectTls({ host: HOST, port, servername: SERVICE_NAME, ca, rejectUnauthorized: true, minVersion: "TLSv1.3" })
  await once(socket, "secureConnect")
  return socket
}

async function rejected(port: number, ca: string): Promise<string> {
  const socket = connectTls({ host: HOST, port, servername: SERVICE_NAME, ca, rejectUnauthorized: true, minVersion: "TLSv1.3" })
  try {
    const outcome = await new Promise<string>((resolve) => {
      socket.once("secureConnect", () => resolve("accepted"))
      socket.once("error", (error) => resolve(String(error)))
    })
    if (outcome === "accepted") throw new Error("wrong authority unexpectedly accepted")
    return outcome
  } finally { socket.destroy() }
}

async function echo(socket: TLSSocket, message: Buffer): Promise<Buffer> {
  const chunks: Buffer[] = []
  let receivedBytes = 0
  let complete!: () => void
  let fail!: (error: Error) => void
  const received = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject })
  const onData = (chunk: Buffer): void => {
    chunks.push(Buffer.from(chunk))
    receivedBytes += chunk.length
    if (receivedBytes >= message.length) complete()
  }
  socket.on("data", onData)
  socket.once("error", fail)
  for (let offset = 0; offset < message.length; offset += 16 * 1024) {
    const chunk = message.subarray(offset, offset + 16 * 1024)
    await new Promise<void>((resolve, reject) => socket.write(chunk, (error) => error ? reject(error) : resolve()))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await received
  socket.off("data", onData)
  socket.off("error", fail)
  return Buffer.concat(chunks, receivedBytes).subarray(0, message.length)
}

async function closeSocket(socket: TLSSocket): Promise<void> {
  socket.end()
  await once(socket, "close")
}

cryptoProvider.set(crypto)
log("probe.start", { runtime: `Bun ${Bun.version}`, platform: process.platform, arch: process.arch })
const ca = await authority("git-stacks-service-ca")
const wrongCa = await authority("untrusted-service-ca")
const firstLeaf = await leaf(ca)
let service = await listenTls(firstLeaf)
let capture = await proxy(service.port)

const marker = `GIT_STACKS_TERMINAL_SECRET_${randomBytes(24).toString("base64url")}`
const plaintext = Buffer.from(`${marker}\n`.repeat(Math.ceil((2 * 1024 * 1024) / (marker.length + 1))).slice(0, 2 * 1024 * 1024))
const first = await connect(capture.port, ca.cert)
const echoed = await echo(first, plaintext)
if (!echoed.equals(plaintext)) throw new Error("TLS terminal payload mismatch")
const protocol = first.getProtocol()
const cipher = first.getCipher()
await closeSocket(first)
const captured = Buffer.concat(capture.captured)
if (captured.includes(Buffer.from(marker))) throw new Error("plaintext marker appeared on captured network path")
log("pinned-tls.accepted", { protocol, cipher: cipher?.standardName ?? cipher?.name, plaintextBytes: plaintext.length, capturedBytes: captured.length, markerVisible: false })

const wrongError = await rejected(capture.port, wrongCa.cert)
log("wrong-authority.rejected", { error: wrongError })
await capture.close()
await closeTls(service.server)

const rotatedLeaf = await leaf(ca)
service = await listenTls(rotatedLeaf)
capture = await proxy(service.port)
const rotated = await connect(capture.port, ca.cert)
const rotationMessage = Buffer.from(`rotated-leaf:${rotatedLeaf.serial}`)
if (!(await echo(rotated, rotationMessage)).equals(rotationMessage)) throw new Error("rotated leaf echo mismatch")
await closeSocket(rotated)
log("leaf-rotation.accepted", { previousSerial: firstLeaf.serial, rotatedSerial: rotatedLeaf.serial, samePinnedAuthority: true })

await capture.close()
await closeTls(service.server)
log("suite.complete", { passed: 4, total: 4, runtime: `Bun ${Bun.version}`, platform: process.platform, arch: process.arch })
