import { createHash, timingSafeEqual, X509Certificate } from "node:crypto"
import { once } from "node:events"
import { Readable, Writable } from "node:stream"
import { checkServerIdentity, connect as connectTls, createServer as createTlsServer, type PeerCertificate, type TLSSocket } from "node:tls"

import { promoteEncryptedCarrier, type SecureDuplex, type SecureSessionCarrier } from "@git-stacks/client"
import { SECURE_LIMITS } from "@git-stacks/protocol"
import { assertSecureTransportEnvironment } from "../security/transport-environment.js"

export const LOCAL_ALPN = "git-stacks/2"

function socketDuplex(socket: TLSSocket): SecureDuplex {
  return {
    readable: Readable.toWeb(socket) as unknown as ReadableStream<Uint8Array>,
    writable: Writable.toWeb(socket) as WritableStream<Uint8Array>,
    async close() {
      if (socket.destroyed) return
      const closed = once(socket, "close")
      socket.destroy()
      await closed.catch(() => undefined)
    },
  }
}

export interface LocalTlsListenerOptions {
  hostname?: "127.0.0.1"
  port?: number
  certificate: string
  privateKey: string
  onControl(duplex: SecureDuplex): Promise<void>
}

export interface RunningLocalTlsListener {
  hostname: string
  port: number
  close(): Promise<void>
}

export async function startLocalTlsListener(options: LocalTlsListenerOptions): Promise<RunningLocalTlsListener> {
  assertSecureTransportEnvironment()
  const hostname = options.hostname ?? "127.0.0.1"
  const sockets = new Set<TLSSocket>()
  const server = createTlsServer({
    cert: options.certificate,
    key: options.privateKey,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    ALPNProtocols: [LOCAL_ALPN],
    requestCert: false,
  })
  server.on("secureConnection", (socket) => {
    if (sockets.size >= SECURE_LIMITS.sessionsTotal) { socket.destroy(); return }
    if (socket.alpnProtocol !== LOCAL_ALPN || socket.remoteAddress && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socket.remoteAddress)) {
      socket.destroy()
      return
    }
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    void options.onControl(socketDuplex(socket)).catch(() => socket.destroy())
  })
  server.listen(options.port ?? 0, hostname)
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Local TLS listener did not publish an address")
  return {
    hostname,
    port: address.port,
    async close() {
      for (const socket of sockets) socket.destroy()
      server.close()
      await once(server, "close").catch(() => undefined)
    },
  }
}

export async function connectLocalTls(input: { hostname: string; port: number; certificate: string; servername?: string }): Promise<SecureSessionCarrier> {
  assertSecureTransportEnvironment()
  const servername = input.servername ?? "localhost"
  const expectedLeaf = new X509Certificate(input.certificate).raw
  const socket = connectTls({
    host: input.hostname,
    port: input.port,
    servername,
    // The owner-only descriptor is the trust anchor. Verify its exact leaf
    // below instead of asking the runtime to interpret a self-signed leaf as
    // a CA; Bun and Node intentionally differ on that CA-chain behavior.
    rejectUnauthorized: false,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    ALPNProtocols: [LOCAL_ALPN],
  })
  try {
    await once(socket, "secureConnect")
    const peer = socket.getPeerCertificate(true) as PeerCertificate
    const actualLeaf = peer.raw
    const hostnameError = checkServerIdentity(servername, peer)
    if (!actualLeaf || actualLeaf.length !== expectedLeaf.length || !timingSafeEqual(actualLeaf, expectedLeaf)) {
      throw new Error("Local TLS certificate does not match the trusted service leaf")
    }
    if (hostnameError) throw hostnameError
    if (socket.alpnProtocol !== LOCAL_ALPN) throw new Error("Local TLS ALPN negotiation failed")
  } catch (error) {
    socket.destroy()
    throw error
  }
  let opened = false
  return promoteEncryptedCarrier({
    encrypted: true,
    serverAuthenticated: true,
    peerBinding: createHash("sha256").update(input.certificate).digest("base64url"),
    async openControl() {
      if (opened) throw new Error("Local TLS control stream is already open")
      opened = true
      return socketDuplex(socket)
    },
    async openStream() { throw new Error("Logical streams are multiplexed by the secure protocol") },
    async *incomingStreams() {},
    async close() {
      if (socket.destroyed) return
      const closed = once(socket, "close")
      socket.destroy()
      await closed.catch(() => undefined)
    },
  })
}
