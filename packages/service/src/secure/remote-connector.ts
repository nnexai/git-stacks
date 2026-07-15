import { createHash, createPrivateKey, createPublicKey } from "node:crypto"

import { authenticateSecureCarrier, type FramedDuplex, type SecureClientAuthenticationOptions, type SecureRpcClient, type SecureSessionCarrier } from "@git-stacks/client"
import { decodeCanonical, type SecureFrame, type SecureRequest, type SecureScope } from "@git-stacks/protocol"

import { IdentityStore } from "../security/identity.js"
import { verifySignedPinSet } from "../security/certificates.js"
import { TargetRegistry } from "../security/targets.js"
import type { SecureSessionContext, SecureSessionHandler } from "../security/session-authority.js"
import { connectNodeWebTransportEndpoints } from "../transport/webtransport.js"

type RemoteSession = { rpc: SecureRpcClient; channel: FramedDuplex }
type Relay = { controller: AbortController; promise?: Promise<RemoteSession> }

const REMOTE_CONNECT_ATTEMPTS = 3
const REMOTE_CONNECT_TIMEOUT_MS = 2_000
const REMOTE_RETRY_BASE_MS = 100
const REMOTE_RETRY_MAX_MS = 1_000

function aborted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError")
}

async function waitForRetry(signal: AbortSignal, attempt: number): Promise<void> {
  signal.throwIfAborted()
  const exponential = Math.min(REMOTE_RETRY_MAX_MS, REMOTE_RETRY_BASE_MS * 2 ** attempt)
  const jitter = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000) * exponential * 0.2)
  const delay = Math.min(REMOTE_RETRY_MAX_MS, exponential + jitter)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, delay)
    timer.unref?.()
    const onAbort = () => { clearTimeout(timer); done(aborted(signal)) }
    function done(error?: Error): void {
      signal.removeEventListener("abort", onAbort)
      if (error) reject(error)
      else resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}

async function authenticateWithCancellation(
  carrier: SecureSessionCarrier,
  options: SecureClientAuthenticationOptions,
  signal: AbortSignal,
): Promise<Awaited<ReturnType<typeof authenticateSecureCarrier>>> {
  signal.throwIfAborted()
  const authentication = authenticateSecureCarrier(carrier, options)
  let onAbort: (() => void) | undefined
  const cancellation = new Promise<never>((_, reject) => {
    onAbort = () => reject(aborted(signal))
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  try {
    return await Promise.race([authentication, cancellation])
  } catch (error) {
    // Authentication can finish after cancellation; its RPC owns the carrier
    // then, so close it too instead of leaving a successful late socket alive.
    void authentication.then(({ rpc }) => rpc.close("remote authentication cancelled"), () => undefined)
    throw error
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort)
  }
}

async function helperKeys(serviceRoot: string): Promise<{ id: string; keys: CryptoKeyPair }> {
  const identity = new IdentityStore(serviceRoot, "helper").loadOrCreate()
  const privateDer = createPrivateKey(identity.privateKeyPem).export({ type: "pkcs8", format: "der" })
  const publicDer = createPublicKey(identity.publicKeyPem).export({ type: "spki", format: "der" })
  return {
    id: identity.id,
    keys: {
      privateKey: await crypto.subtle.importKey("pkcs8", privateDer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
      publicKey: await crypto.subtle.importKey("spki", publicDer, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
    },
  }
}

export class RemoteTargetConnector {
  private readonly targets: TargetRegistry
  private readonly helperEpoch = crypto.randomUUID()
  constructor(private readonly serviceRoot: string) { this.targets = new TargetRegistry(serviceRoot) }

  async connect(targetId: string, principalId: string, grantedScopes: SecureScope[], signal: AbortSignal): Promise<RemoteSession> {
    const target = this.targets.get(targetId)
    if (!target) throw Object.assign(new Error("Paired target not found"), { code: "not_found" })
    verifySignedPinSet(target.pin_set, target.public_key, target.pin_set.generation)
    const helper = await helperKeys(this.serviceRoot)
    const allowed = new Set(target.scopes)
    const scopes = grantedScopes.filter((scope) => allowed.has(scope))
    const delegateId = createHash("sha256").update(principalId).digest("base64url")
    let failure: unknown
    for (let attempt = 0; attempt < REMOTE_CONNECT_ATTEMPTS; attempt += 1) {
      signal.throwIfAborted()
      let carrier: Awaited<ReturnType<typeof connectNodeWebTransportEndpoints>> | undefined
      try {
        carrier = await connectNodeWebTransportEndpoints(
          [target.pin_set.endpoint, ...(target.pin_set.alternate_endpoint ? [target.pin_set.alternate_endpoint] : [])],
          target.pin_set.hashes,
          { timeoutMs: REMOTE_CONNECT_TIMEOUT_MS, signal },
        )
        const authenticated = await authenticateWithCancellation(carrier, {
          mode: "helper",
          principalId: helper.id,
          delegateId,
          helperEpoch: this.helperEpoch,
          targetId: target.service_id,
          // Helper authentication accepts the authority's fresh challenge epoch;
          // this placeholder is never trusted and remains transcript-bound.
          listenerEpoch: target.service_id,
          requestedScopes: scopes,
          build: "git-stacks-helper/0.21",
          keyPair: helper.keys,
        }, signal)
        signal.throwIfAborted()
        if (authenticated.pinSet !== undefined) this.targets.updatePins(target.id, authenticated.pinSet)
        const renew = setInterval(() => void authenticated.rpc.request("session.renew").catch(() => clearInterval(renew)), 150_000)
        renew.unref?.()
        void authenticated.rpc.closed.then(() => clearInterval(renew))
        return { rpc: authenticated.rpc, channel: authenticated.channel }
      } catch (error) {
        failure = error
        await carrier?.close("remote connection attempt failed").catch(() => undefined)
        if (signal.aborted) throw aborted(signal)
        if (attempt + 1 < REMOTE_CONNECT_ATTEMPTS) await waitForRetry(signal, attempt)
      }
    }
    throw failure instanceof Error ? failure : new Error("Remote connection failed")
  }
}

export class TargetRoutingHandler implements SecureSessionHandler {
  private readonly remotes = new Map<string, Relay>()
  private readonly contexts = new Map<string, SecureSessionContext>()
  private stopping = false

  constructor(
    private readonly localTargetId: string,
    private readonly local: SecureSessionHandler,
    private readonly connector: RemoteTargetConnector,
  ) {}

  request(context: SecureSessionContext, request: SecureRequest): Promise<unknown> {
    if (context.targetId === this.localTargetId) return this.local.request(context, request)
    return this.remote(context).then(({ rpc }) => rpc.request(request.method, request.body, {
      ...(request.idempotency_key ? { idempotencyKey: request.idempotency_key } : {}),
    }))
  }

  async terminalControl(context: SecureSessionContext, streamId: number, value: unknown): Promise<void> {
    if (context.targetId === this.localTargetId) return this.local.terminalControl?.(context, streamId, value)
    const remote = await this.remote(context)
    await remote.channel.sendControl("terminal_control", value, streamId)
  }

  async terminalData(context: SecureSessionContext, streamId: number, value: Uint8Array): Promise<void> {
    if (context.targetId === this.localTargetId) return this.local.terminalData?.(context, streamId, value)
    const remote = await this.remote(context)
    await remote.channel.send("terminal_data", value, streamId)
  }

  async closed(context: SecureSessionContext): Promise<void> {
    if (context.targetId === this.localTargetId) { await this.local.closed?.(context); return }
    await this.drain(context.sessionId, "local relay closed")
  }

  async closeTarget(targetId: string): Promise<void> {
    await Promise.allSettled([...this.contexts.values()]
      .filter((context) => context.targetId === targetId)
      .map((context) => this.closeContext(context, "paired target removed")))
  }

  /** Drains every per-local-session relay before the containing service stops. */
  async close(): Promise<void> {
    this.stopping = true
    await Promise.allSettled([...this.contexts.values()].map((context) => this.closeContext(context, "service stopping")))
  }

  private remote(context: SecureSessionContext): Promise<RemoteSession> {
    if (this.stopping) return Promise.reject(new Error("Remote connector is stopping"))
    const existing = this.remotes.get(context.sessionId)
    if (existing?.promise) return existing.promise
    const relay: Relay = { controller: new AbortController() }
    this.contexts.set(context.sessionId, context)
    this.remotes.set(context.sessionId, relay)
    const pending = this.connector.connect(context.targetId, context.principalId, context.scopes, relay.controller.signal).then((remote) => {
      if (relay.controller.signal.aborted || this.remotes.get(context.sessionId) !== relay) {
        void remote.rpc.close("local relay closed")
        throw aborted(relay.controller.signal)
      }
      remote.rpc.observeFrames((frame) => { void this.forward(context, frame) })
      void remote.rpc.closed.then(() => this.closeContext(context, "remote target disconnected"))
      return remote
    })
    relay.promise = pending
    void pending.catch(() => {
      if (this.remotes.get(context.sessionId) === relay) this.remotes.delete(context.sessionId)
    })
    return pending
  }

  private async closeContext(context: SecureSessionContext, reason: string): Promise<void> {
    await this.drain(context.sessionId, reason)
    await context.close(reason)
  }

  private async drain(sessionId: string, reason: string): Promise<void> {
    const relay = this.remotes.get(sessionId)
    this.remotes.delete(sessionId)
    this.contexts.delete(sessionId)
    if (!relay) return
    relay.controller.abort(new Error(reason))
    const pending = relay.promise
    if (pending) await pending.then((remote) => remote.rpc.close(reason), () => undefined)
  }

  private async forward(context: SecureSessionContext, frame: SecureFrame): Promise<void> {
    if (frame.kind === "event") await context.sendEvent(decodeCanonical(frame.payload))
    else if (frame.kind === "terminal_control") await context.sendTerminalControl(frame.streamId, decodeCanonical(frame.payload))
    else if (frame.kind === "terminal_data") await context.sendTerminalData(frame.streamId, frame.payload)
    else if (frame.kind === "close") await context.close("remote target closed")
  }
}
