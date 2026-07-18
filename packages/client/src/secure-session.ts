import {
  SECURE_LIMITS,
  SECURE_FRAME_HEADER_BYTES,
  assertSecureFrame,
  SecureFrameDecoder,
  SecureFrameQueue,
  SecureResponseSchema,
  SecureClientHelloSchema,
  SecureServerAcceptSchema,
  SecureServerChallengeSchema,
  decodeCanonical,
  encodeCanonical,
  encodeSecureFrame,
  type SecureFrame,
  type SecureFrameKind,
  type SecureRequest,
  type SecureResponse,
  type SecureClientHello,
  type SecureScope,
} from "@git-stacks/protocol"

export interface SecureDuplex {
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>
  close(reason?: string): Promise<void>
}

export interface EncryptedCarrier {
  readonly encrypted: true
  readonly serverAuthenticated: true
  readonly peerBinding: string
  openControl(): Promise<SecureDuplex>
  openStream(kind: "event" | "terminal"): Promise<SecureDuplex>
  incomingStreams(): AsyncIterable<{ kind: "event" | "terminal"; stream: SecureDuplex }>
  close(reason?: string): Promise<void>
}

declare const secureSessionBrand: unique symbol
export interface SecureSessionCarrier extends EncryptedCarrier {
  readonly [secureSessionBrand]: true
  readonly negotiatedProtocol: "git-stacks/2"
}

export function promoteEncryptedCarrier(carrier: EncryptedCarrier): SecureSessionCarrier {
  return Object.assign(carrier, { negotiatedProtocol: "git-stacks/2" as const }) as SecureSessionCarrier
}

export interface AuthenticatedPeer {
  principalId: string
  targetId: string
  sessionId: string
  scopes: ReadonlySet<SecureScope>
  leaseExpiresAt: string
}

export interface AuthenticatedSession {
  readonly carrier: SecureSessionCarrier
  readonly peer: AuthenticatedPeer
  require(scope: SecureScope): void
}

export function createAuthenticatedSession(carrier: SecureSessionCarrier, peer: AuthenticatedPeer): AuthenticatedSession {
  return {
    carrier,
    peer,
    require(scope) {
      if (!peer.scopes.has(scope)) throw Object.assign(new Error("Operation is not authorized"), { code: "unauthorized" })
    },
  }
}

type FrameObserver = (frame: SecureFrame) => void

export class FramedDuplex {
  private readonly decoder = new SecureFrameDecoder()
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>
  private readTask?: Promise<void>
  private writeTask?: Promise<void>
  private closeTask?: Promise<void>
  private closed = false
  private sendSequence = 0n
  private receiveSequence = -1n
  private pendingBytes = 0
  private pendingFrames = 0
  private activeWrite?: OutboundFrame
  private readonly streamQueues = new Map<number, OutboundFrame[]>()
  private readonly readyStreams: number[] = []
  private writeFailure?: unknown
  private readonly observers = new Set<FrameObserver>()

  constructor(private readonly duplex: SecureDuplex) {
    this.writer = duplex.writable.getWriter()
  }

  get bufferedAmount(): number { return this.pendingBytes }

  start(observer: FrameObserver): Promise<void> {
    this.observers.add(observer)
    if (this.readTask) return this.readTask
    this.readTask = this.read()
    return this.readTask
  }

  removeObserver(observer: FrameObserver): void { this.observers.delete(observer) }

  send(kind: SecureFrameKind, payload: Uint8Array, streamId = 0, flags = 0): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Secure channel is closed"))
    if (this.writeFailure) return Promise.reject(this.writeFailure)
    try { assertSecureFrame({ kind, payload, streamId, flags, sequence: 0n }) } catch (error) { return Promise.reject(error) }
    const byteLength = SECURE_FRAME_HEADER_BYTES + payload.byteLength
    if (this.pendingFrames >= SECURE_LIMITS.outboundPendingFrames || this.pendingBytes + byteLength > SECURE_LIMITS.outboundPendingBytes) {
      return Promise.reject(Object.assign(new Error("Secure channel outbound capacity exceeded"), { code: "capacity_exceeded" }))
    }
    let queue = this.streamQueues.get(streamId)
    if (!queue) {
      if (streamId !== 0 && [...this.streamQueues.keys()].filter((id) => id !== 0).length >= SECURE_LIMITS.streamsPerSession) {
        return Promise.reject(Object.assign(new Error("Secure channel stream capacity exceeded"), { code: "capacity_exceeded" }))
      }
      queue = []
      this.streamQueues.set(streamId, queue)
      this.readyStreams.push(streamId)
    }
    const queueBytes = queue.reduce((total, frame) => total + frame.byteLength, 0)
    if (queue.length >= SECURE_LIMITS.outboundPendingFramesPerStream || queueBytes + byteLength > SECURE_LIMITS.outboundPendingBytesPerStream) {
      if (queue.length === 0) {
        this.streamQueues.delete(streamId)
        this.readyStreams.pop()
      }
      return Promise.reject(Object.assign(new Error("Secure channel stream outbound capacity exceeded"), { code: "capacity_exceeded" }))
    }
    this.pendingFrames += 1
    this.pendingBytes += byteLength
    const pending = new Promise<void>((resolve, reject) => queue!.push({ kind, payload, streamId, flags, byteLength, resolve, reject }))
    this.startWriter()
    return pending
  }

  sendControl(kind: Exclude<SecureFrameKind, "terminal_data">, value: unknown, streamId = 0, flags = 0): Promise<void> {
    return this.send(kind, encodeCanonical(value), streamId, flags)
  }

  async close(reason = "closed"): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closed = true
    this.closeTask = this.shutdown(reason)
    return this.closeTask
  }

  private async shutdown(reason: string): Promise<void> {
    const failure = new Error(`Secure channel closed: ${reason}`)
    this.writeFailure = failure
    this.activeWrite?.reject(failure)
    this.rejectPending(failure)
    // Tear down the carrier before waiting for the writer. Waiting first lets a
    // peer that stopped reading hold shutdown forever with one blocked write.
    // Some native stream adapters also leave abort() pending behind that write,
    // so carrier shutdown is bounded and does not trust either promise to settle.
    const closing = this.duplex.close(reason).catch(() => {})
    const aborting = this.writer.abort(failure).catch(() => {})
    await this.boundedShutdown([closing, aborting, this.writeTask?.catch(() => {}) ?? Promise.resolve()])
    try { this.writer.releaseLock() } catch {}
  }

  private async read(): Promise<void> {
    const reader = this.duplex.readable.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        for (const frame of this.decoder.push(next.value)) {
          if (frame.sequence <= this.receiveSequence) throw new Error("Secure frame sequence rollback")
          this.receiveSequence = frame.sequence
          for (const observer of this.observers) observer(frame)
        }
      }
      this.decoder.finish()
    } finally {
      this.closed = true
      reader.releaseLock()
    }
  }

  private startWriter(): void {
    if (this.writeTask) return
    this.writeTask = this.write().catch(() => undefined).finally(() => {
      this.writeTask = undefined
      if (this.readyStreams.length && !this.closed && !this.writeFailure) this.startWriter()
    })
  }

  private async write(): Promise<void> {
    while (this.readyStreams.length) {
      const streamId = this.readyStreams.shift()!
      const queue = this.streamQueues.get(streamId)
      const pending = queue?.shift()
      if (!queue || !pending) continue
      if (queue.length) this.readyStreams.push(streamId)
      else this.streamQueues.delete(streamId)
      this.activeWrite = pending
      try {
        const frame = encodeSecureFrame({
          kind: pending.kind,
          payload: pending.payload,
          streamId: pending.streamId,
          flags: pending.flags,
          sequence: this.sendSequence++,
        })
        await this.writer.write(frame)
        pending.resolve()
      } catch (error) {
        this.writeFailure = error
        pending.reject(error)
        this.rejectPending(error)
        throw error
      } finally {
        if (this.activeWrite === pending) this.activeWrite = undefined
        this.pendingFrames -= 1
        this.pendingBytes -= pending.byteLength
      }
    }
  }

  private rejectPending(error: unknown): void {
    for (const queue of this.streamQueues.values()) {
      for (const pending of queue) {
        this.pendingFrames -= 1
        this.pendingBytes -= pending.byteLength
        pending.reject(error)
      }
    }
    this.streamQueues.clear()
    this.readyStreams.length = 0
  }

  private async boundedShutdown(tasks: Promise<unknown>[]): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled(tasks),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 500) }),
    ])
    if (timer) clearTimeout(timer)
  }
}

type OutboundFrame = {
  kind: SecureFrameKind
  payload: Uint8Array
  streamId: number
  flags: number
  byteLength: number
  resolve(): void
  reject(error: unknown): void
}

export type SecureEventObserver = (event: unknown) => void

export class SecureRpcClient {
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private readonly eventObservers = new Set<SecureEventObserver>()
  private readonly frameObservers = new Set<FrameObserver>()
  private started = false
  private finished = false
  private resolveClosed!: (error?: Error) => void
  readonly closed = new Promise<Error | undefined>((resolve) => { this.resolveClosed = resolve })

  constructor(private readonly channel: FramedDuplex, private readonly session: AuthenticatedSession) {}

  start(): void {
    if (this.started) return
    this.started = true
    void this.channel.start((frame) => this.receive(frame)).then(() => {
      this.finish(new Error("Secure channel closed unexpectedly"))
    }, (error) => {
      const failure = error instanceof Error ? error : new Error(String(error))
      this.finish(failure)
    })
  }

  async request<T>(method: string, body?: unknown, options: { scope?: SecureScope; signal?: AbortSignal; idempotencyKey?: string } = {}): Promise<T> {
    this.start()
    if (options.scope) this.session.require(options.scope)
    if (this.pending.size >= SECURE_LIMITS.requestsInFlight) throw Object.assign(new Error("Too many requests in flight"), { code: "capacity_exceeded" })
    options.signal?.throwIfAborted()
    const request: SecureRequest = {
      id: crypto.randomUUID(),
      method,
      ...(body === undefined ? {} : { body }),
      ...(options.idempotencyKey === undefined ? {} : { idempotency_key: options.idempotencyKey }),
    }
    const response = new Promise<unknown>((resolve, reject) => this.pending.set(request.id, { resolve, reject }))
    const abort = () => {
      const pending = this.pending.get(request.id)
      if (!pending) return
      this.pending.delete(request.id)
      pending.reject(options.signal?.reason instanceof Error ? options.signal.reason : new DOMException("Aborted", "AbortError"))
    }
    options.signal?.addEventListener("abort", abort, { once: true })
    try {
      await this.channel.sendControl("request", request)
      return await response as T
    } finally {
      options.signal?.removeEventListener("abort", abort)
    }
  }

  observeEvents(observer: SecureEventObserver): () => void {
    this.start()
    this.eventObservers.add(observer)
    return () => this.eventObservers.delete(observer)
  }

  observeFrames(observer: FrameObserver): () => void {
    this.start()
    this.frameObservers.add(observer)
    return () => this.frameObservers.delete(observer)
  }

  async close(reason = "client closed"): Promise<void> {
    await this.channel.sendControl("close", { code: "client_closed", message: reason }).catch(() => undefined)
    await this.session.carrier.close(reason).catch(() => undefined)
    this.finish()
  }

  private finish(error?: Error): void {
    if (this.finished) return
    this.finished = true
    const pendingFailure = error ?? new Error("Secure RPC client closed")
    for (const request of this.pending.values()) request.reject(pendingFailure)
    this.pending.clear()
    this.resolveClosed(error)
  }

  private receive(frame: SecureFrame): void {
    for (const observer of this.frameObservers) observer(frame)
    if (frame.kind === "event") {
      const event = decodeCanonical(frame.payload)
      for (const observer of this.eventObservers) observer(event)
      return
    }
    if (frame.kind !== "response") return
    const response: SecureResponse = SecureResponseSchema.parse(decodeCanonical(frame.payload))
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    if (response.ok) pending.resolve(response.body)
    else pending.reject(Object.assign(new Error(response.error?.message ?? "Secure request failed"), {
      code: response.error?.code,
      details: response.error?.details,
    }))
  }
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value as BufferSource))
}

export interface SecureClientAuthenticationOptions {
  mode: SecureClientHello["mode"]
  targetId: string
  listenerEpoch: string
  requestedScopes: SecureScope[]
  build: string
  launchToken?: string
  principalId?: string
  delegateId?: string
  helperEpoch?: string
  keyPair?: CryptoKeyPair
}

/** Authenticate inside an already encrypted and server-pinned carrier. */
export async function authenticateSecureCarrier(
  carrier: SecureSessionCarrier,
  options: SecureClientAuthenticationOptions,
): Promise<{ session: AuthenticatedSession; rpc: SecureRpcClient; channel: FramedDuplex; keyPair: CryptoKeyPair; pinSet?: unknown }> {
  const duplex = await carrier.openControl()
  const channel = new FramedDuplex(duplex)
  const pending = new SecureFrameQueue()
  let wake: (() => void) | undefined
  const handshakeObserver = (frame: SecureFrame) => { pending.push(frame); wake?.(); wake = undefined }
  const ended = channel.start(handshakeObserver)
  const next = async (kind: SecureFrameKind): Promise<SecureFrame> => {
    while (true) {
      const frame = pending.shift()
      if (frame) {
        if (frame.kind === "close") throw new Error(String((decodeCanonical(frame.payload) as { message?: unknown }).message ?? "Secure authentication rejected"))
        if (frame.kind !== kind) throw new Error(`Expected secure ${kind}`)
        return frame
      }
      await Promise.race([ended.then(() => { throw new Error("Secure carrier closed during authentication") }), new Promise<void>((resolve) => { wake = resolve })])
    }
  }
  const keyPair = options.keyPair ?? await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])
  const publicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey)
  const hello = SecureClientHelloSchema.parse({
    protocol: "git-stacks/2",
    mode: options.mode,
    ...(options.principalId ? { principal_id: options.principalId } : {}),
    ...(options.delegateId ? { delegate_id: options.delegateId } : {}),
    ...(options.helperEpoch ? { helper_epoch: options.helperEpoch } : {}),
    target_id: options.targetId,
    listener_epoch: options.listenerEpoch,
    connection_nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    public_key: bytesToBase64Url(publicKey),
    ...(options.launchToken ? { launch_token: options.launchToken } : {}),
    requested_scopes: options.requestedScopes,
    build: options.build,
  })
  await channel.sendControl("client_hello", hello)
  const challenge = SecureServerChallengeSchema.parse(decodeCanonical((await next("server_challenge")).payload))
  if (challenge.protocol !== "git-stacks/2" || (options.mode !== "helper" && challenge.listener_epoch !== options.listenerEpoch)) throw new Error("Secure listener identity changed during authentication")
  const transcriptHash = await sha256(encodeCanonical({ challenge, hello }))
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, transcriptHash as BufferSource)
  await channel.sendControl("client_proof", {
    protocol: "git-stacks/2",
    transcript_hash: bytesToBase64Url(transcriptHash),
    signature: bytesToBase64Url(signature),
  })
  const accepted = SecureServerAcceptSchema.parse(decodeCanonical((await next("server_accept")).payload))
  const session = createAuthenticatedSession(carrier, {
    principalId: accepted.principal_id,
    targetId: accepted.target_id,
    sessionId: accepted.session_id,
    scopes: new Set(accepted.scopes),
    leaseExpiresAt: accepted.lease_expires_at,
  })
  channel.removeObserver(handshakeObserver)
  const rpc = new SecureRpcClient(channel, session)
  rpc.start()
  return { session, rpc, channel, keyPair, ...(accepted.pin_set === undefined ? {} : { pinSet: accepted.pin_set }) }
}

export const secureEncoding = { bytesToBase64Url, base64UrlToBytes }
