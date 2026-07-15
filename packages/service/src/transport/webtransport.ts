import "reflect-metadata"

import { randomBytes } from "node:crypto"
import {
  Http3Server,
  WebTransport,
  quicheLoaded,
  type WebTransportSession,
} from "@fails-components/webtransport"
import { promoteEncryptedCarrier, type SecureDuplex, type SecureSessionCarrier } from "@git-stacks/client"
import { SECURE_LIMITS } from "@git-stacks/protocol"
import { assertSecureTransportEnvironment } from "../security/transport-environment.js"

type WebTransportStream = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }

function closeStream(stream: WebTransportStream): Promise<void> {
  return Promise.allSettled([
    stream.readable.cancel(),
    stream.writable.abort(),
  ]).then(() => undefined)
}

async function closeStreamBounded(stream: WebTransportStream): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    closeStream(stream),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, 500) }),
  ])
  if (timer) clearTimeout(timer)
}

async function settleBounded(task: Promise<unknown>, timeoutMs = 1_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    task.then(() => undefined, () => undefined),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs) }),
  ])
  if (timer) clearTimeout(timer)
}

function duplex(stream: WebTransportStream, closeSession?: () => void): SecureDuplex {
  return {
    readable: stream.readable,
    writable: stream.writable,
    async close() {
      // Closing the QUIC session is the authoritative cancellation signal. Do
      // it before awaiting stream cancellation: the native adapter can leave
      // readable.cancel()/writable.abort() pending behind a blocked write.
      closeSession?.()
      await closeStreamBounded(stream)
    },
  }
}

export interface WebTransportListenerOptions {
  hostname: string
  port?: number
  path?: string
  certificate: string
  privateKey: string
  loopbackOnly?: boolean
  onControl(duplex: SecureDuplex, context: { peerAddress?: string; closeSession(): void }): Promise<void>
}

export interface RunningWebTransportListener {
  endpoint: string
  port: number
  close(): Promise<void>
}

/** HTTP/3 WebTransport server. It exposes no HTTP request handler or fallback. */
export async function startWebTransportListener(options: WebTransportListenerOptions): Promise<RunningWebTransportListener> {
  assertSecureTransportEnvironment()
  if (options.loopbackOnly && !["127.0.0.1", "::1", "localhost"].includes(options.hostname)) {
    throw new Error("A loopback-only WebTransport listener must bind a loopback hostname")
  }
  await quicheLoaded
  const path = options.path ?? "/git-stacks"
  const server = new Http3Server({
    host: options.hostname,
    port: options.port ?? 0,
    secret: randomBytes(32).toString("base64url"),
    cert: options.certificate,
    privKey: options.privateKey,
    defaultDatagramsReadableMode: "bytes",
  })
  const sessions = server.sessionStream(path)
  const active = new Set<WebTransportSession>()
  const tasks = new Set<Promise<void>>()
  let stopping = false
  const acceptSession = async (session: WebTransportSession): Promise<void> => {
    await session.ready
    if (stopping) { session.close({ closeCode: 1, reason: "listener stopping" }); return }
    if (active.size >= SECURE_LIMITS.sessionsTotal) { session.close({ closeCode: 1, reason: "listener capacity reached" }); return }
    const details = session as WebTransportSession & { peerAddress?: string }
    const peerAddress = typeof details.peerAddress === "string" ? details.peerAddress : undefined
    // A local listener is bound to 127.0.0.1, so the kernel is the loopback
    // boundary. Session peer/origin metadata is deliberately not an identity
    // signal: browser and native implementations expose it inconsistently.
    // Authentication still requires the unguessable one-use grant, proof of
    // its ephemeral key, and the pinned transport certificate.
    active.add(session)
    const reader = session.incomingBidirectionalStreams.getReader()
    try {
      let streamTimer: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<never>((_, reject) => {
        streamTimer = setTimeout(() => reject(new Error("WebTransport control stream timed out")), SECURE_LIMITS.authenticationMs)
        streamTimer.unref?.()
      })
      let first: ReadableStreamReadResult<WebTransportStream>
      try { first = await Promise.race([reader.read() as Promise<ReadableStreamReadResult<WebTransportStream>>, timedOut]) }
      finally { if (streamTimer) clearTimeout(streamTimer) }
      if (first.done) return
      const closeSession = () => session.close({ closeCode: 0, reason: "closed" })
      await options.onControl(duplex(first.value as WebTransportStream), { peerAddress, closeSession })
      const extra = await reader.read()
      if (!extra.done) {
        await closeStream(extra.value as WebTransportStream)
        session.close({ closeCode: 3, reason: "unexpected stream" })
      }
    } finally {
      reader.releaseLock()
      active.delete(session)
    }
  }
  const accept = async () => {
    const reader = sessions.getReader()
    try {
      while (!stopping) {
        const next = await reader.read()
        if (next.done) break
        let task!: Promise<void>
        task = acceptSession(next.value).catch(() => next.value.close({ closeCode: 4, reason: "session failed" })).finally(() => tasks.delete(task))
        tasks.add(task)
      }
    } finally { reader.releaseLock() }
  }
  server.startServer()
  await server.ready
  const address = server.address()
  if (!address) throw new Error("WebTransport listener did not publish an address")
  void accept()
  return {
    endpoint: `https://${options.hostname}:${address.port}${path}`,
    port: address.port,
    async close() {
      if (stopping) return
      stopping = true
      for (const session of active) session.close({ closeCode: 0, reason: "listener stopping" })
      server.stopServer()
      // The native HTTP/3 adapter occasionally leaves its informational
      // `closed` promise pending after stopServer() has released the listener.
      // Service shutdown must not hand lifecycle control to that promise.
      await settleBounded(Promise.allSettled([...tasks, server.closed]))
    },
  }
}

export async function connectNodeWebTransport(
  endpoint: string,
  certificateHashes: string[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SecureSessionCarrier> {
  assertSecureTransportEnvironment()
  options.signal?.throwIfAborted()
  if (!certificateHashes.length) throw new Error("A pinned WebTransport certificate hash is required")
  await quicheLoaded
  const transport = new WebTransport(endpoint, {
    serverCertificateHashes: certificateHashes.map((hash) => ({ algorithm: "sha-256" as const, value: Buffer.from(hash, "base64url") })),
  })
  void transport.closed.catch(() => undefined)
  const timeoutMs = options.timeoutMs ?? 5_000
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("Pinned WebTransport connection timed out"), { code: "timeout" })), timeoutMs)
    timer.unref?.()
  })
  let abort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(options.signal?.reason ?? new DOMException("Aborted", "AbortError"))
    options.signal?.addEventListener("abort", abort, { once: true })
  })
  try { await Promise.race([transport.ready, timeout, aborted]) } catch (error) {
    transport.close({ closeCode: 1, reason: "connection failed" })
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    if (abort) options.signal?.removeEventListener("abort", abort)
  }
  let controlOpened = false
  return promoteEncryptedCarrier({
    encrypted: true,
    serverAuthenticated: true,
    peerBinding: certificateHashes.join(","),
    async openControl() {
      if (controlOpened) throw new Error("WebTransport control stream is already open")
      controlOpened = true
      return duplex(await transport.createBidirectionalStream() as WebTransportStream)
    },
    async openStream() { throw new Error("Logical streams are multiplexed by the secure protocol") },
    async *incomingStreams() {},
    async close(reason = "closed") { transport.close({ closeCode: 0, reason: reason.slice(0, 128) }); await transport.closed.catch(() => undefined) },
  })
}

export async function connectNodeWebTransportEndpoints(
  endpoints: string[],
  certificateHashes: string[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SecureSessionCarrier> {
  if (!endpoints.length || endpoints.length > 2) throw new Error("One or two pinned WebTransport endpoints are required")
  const failures: Error[] = []
  for (const endpoint of endpoints) {
    options.signal?.throwIfAborted()
    try { return await connectNodeWebTransport(endpoint, certificateHashes, options) } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  throw new AggregateError(failures, "Every signed WebTransport rollover endpoint failed")
}
