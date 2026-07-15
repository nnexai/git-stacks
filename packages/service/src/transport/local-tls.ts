import { createHash } from "node:crypto"
import { once } from "node:events"
import { Readable, Writable } from "node:stream"
import { connect as connectTls, createServer as createTlsServer, type TLSSocket } from "node:tls"

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
  const socket = connectTls({
    host: input.hostname,
    port: input.port,
    servername: input.servername ?? "localhost",
    ca: input.certificate,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    ALPNProtocols: [LOCAL_ALPN],
  })
  await once(socket, "secureConnect")
  if (!socket.authorized || socket.alpnProtocol !== LOCAL_ALPN) {
    socket.destroy()
    throw new Error(socket.authorizationError?.message ?? "Local TLS authentication failed")
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
