import { createPublicKey, verify } from "node:crypto"

import {
  SECURE_LIMITS,
  SecureClientHelloSchema,
  SecureClientProofSchema,
  SecureFrameQueue,
  SecureRequestSchema,
  SecureResponseSchema,
  decodeCanonical,
  encodeCanonical,
  type SecureClientHello,
  type SecureRequest,
  type SecureResponse,
  type SecureScope,
} from "@git-stacks/protocol"
import { FramedDuplex, type SecureDuplex } from "@git-stacks/client"

import { OneUseTokenStore } from "./tokens.js"
import type { PairedHelper, PairingAuthority } from "./targets.js"

export interface LaunchGrant {
  mode: "browser" | "tui"
  principalId: string
  targetId: string
  scopes: SecureScope[]
}

export interface LaunchToken {
  token: string
  expiresAt: string
  listenerEpoch: string
  grant: LaunchGrant
}

export class LocalSessionAuthority {
  readonly listenerEpoch = crypto.randomUUID()
  private readonly launches = new OneUseTokenStore<LaunchGrant>()
  private browserSession?: { close(): Promise<void> }

  issue(grant: LaunchGrant): LaunchToken {
    // The TUI descriptor is protected by the user's mode-0700/0600 service
    // directory and remains one-use. It must survive long-running service-owned
    // shells; successful admission immediately rotates it.
    const ttl = grant.mode === "browser" ? SECURE_LIMITS.launchTokenTtlMs : 30 * 24 * 60 * 60_000
    const record = this.launches.issue(grant, ttl)
    return { token: record.token, expiresAt: new Date(record.expiresAt).toISOString(), listenerEpoch: this.listenerEpoch, grant }
  }

  admit(hello: SecureClientHello): SessionAdmission | null {
    if (hello.listener_epoch !== this.listenerEpoch || !hello.launch_token) return null
    const record = this.launches.consume(hello.launch_token)
    if (!record || record.value.mode !== hello.mode || record.value.targetId !== hello.target_id) return null
    const requested = new Set(hello.requested_scopes)
    const scopes = record.value.scopes.filter((scope) => requested.has(scope))
    return {
      principalId: record.value.principalId,
      targetId: record.value.targetId,
      scopes,
      leaseMs: record.value.mode === "browser" ? SECURE_LIMITS.browserLeaseMs : 24 * 60 * 60_000,
      replaceExisting: record.value.mode === "browser",
    }
  }

  registerBrowserSession(session: { close(): Promise<void> }): void {
    const previous = this.browserSession
    this.browserSession = session
    // Admission of the replacement must not depend on a stale browser draining
    // its QUIC writer. The old session is revoked immediately, but cleanup is
    // deliberately detached from the new authentication handshake.
    if (previous && previous !== session) void previous.close()
  }

  clearBrowserSession(session: { close(): Promise<void> }): void {
    if (this.browserSession === session) this.browserSession = undefined
  }

  revoke(): void { this.launches.revokeAll(); void this.browserSession?.close(); this.browserSession = undefined }
}

export interface SessionAdmission {
  principalId: string
  targetId: string
  scopes: SecureScope[]
  leaseMs: number
  replaceExisting?: boolean
  helperId?: string
  helperEpoch?: string
}

export interface SecureSessionContext extends SessionAdmission {
  sessionId: string
  mode: SecureClientHello["mode"]
  channel: FramedDuplex
  sendEvent(value: unknown): Promise<void>
  sendTerminalControl(streamId: number, value: unknown): Promise<void>
  sendTerminalData(streamId: number, value: Uint8Array): Promise<void>
  close(reason?: string): Promise<void>
}

export interface SecureSessionHandler {
  request(context: SecureSessionContext, request: SecureRequest): Promise<unknown>
  terminalControl?(context: SecureSessionContext, streamId: number, value: unknown): Promise<void> | void
  terminalData?(context: SecureSessionContext, streamId: number, value: Uint8Array): Promise<void> | void
  closed?(context: SecureSessionContext): Promise<void> | void
}

export interface SecureSessionServerOptions {
  serviceId: string
  listenerEpoch: string
  eventCursor(): Promise<string>
  admit(hello: SecureClientHello): SessionAdmission | null | Promise<SessionAdmission | null>
  handler: SecureSessionHandler
  pairingAuthority?: PairingAuthority
  sessionOpened?(context: SecureSessionContext): Promise<void> | void
  sessionClosed?(context: SecureSessionContext): Promise<void> | void
  currentPinSet?(): unknown
}

function toBase64Url(value: Uint8Array): string { return Buffer.from(value).toString("base64url") }

async function digest(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value as BufferSource))
}

async function verifyEphemeral(publicKey: string, payload: Uint8Array, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", Buffer.from(publicKey, "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(signature, "base64url"), payload as BufferSource)
  } catch { return false }
}

async function verifyHelper(publicKeyPem: string, payload: Uint8Array, signature: string): Promise<boolean> {
  // Parsing first rejects malformed or non-P-256 records before verification.
  try { createPublicKey(publicKeyPem) } catch { return false }
  try {
    return verify("sha256", payload, { key: publicKeyPem, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))
  } catch { return false }
}

function boundedErrorField(value: unknown, fallback: string, maximum: number): string {
  let rendered: string
  try { rendered = (typeof value === "string" ? value : String(value)).toWellFormed() }
  catch { rendered = fallback }
  if (!rendered) rendered = fallback
  if (rendered.length <= maximum) return rendered
  return `${rendered.slice(0, maximum - 1).toWellFormed()}…`
}

function rawPublicKeyPem(encoded: string): string {
  const raw = Buffer.from(encoded, "base64url")
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("Pairing public key is not P-256")
  return createPublicKey({
    key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") },
    format: "jwk",
  }).export({ type: "spki", format: "pem" }).toString()
}

export class SecureSessionServer {
  private readonly sessions = new Set<SecureSessionContext>()
  private readonly helperEpochs = new Map<string, string>()
  private pendingSessions = 0

  constructor(private readonly options: SecureSessionServerOptions) {}

  get activeSessions(): number { return this.sessions.size }

  async accept(duplex: SecureDuplex): Promise<void> {
    if (this.sessions.size + this.pendingSessions >= SECURE_LIMITS.sessionsTotal) { await duplex.close("capacity exceeded"); return }
    this.pendingSessions += 1
    const channel = new FramedDuplex(duplex)
    const queue = new SecureFrameQueue()
    let wake: (() => void) | undefined
    let fatal: unknown
    let readEnded = false
    const reading = channel.start((frame) => { queue.push(frame); wake?.(); wake = undefined }).then(
      () => { readEnded = true; wake?.(); wake = undefined },
      (error) => { fatal = error; readEnded = true; wake?.(); wake = undefined },
    )
    const next = async () => {
      while (!queue.length) {
        if (fatal) throw fatal
        await Promise.race([reading, new Promise<void>((resolve) => { wake = resolve })])
        if (!queue.length && fatal) throw fatal
        if (!queue.length && readEnded) throw new Error("Secure carrier closed")
      }
      return queue.shift()!
    }
    let context: SecureSessionContext | undefined
    let accepted = false
    const authenticationDeadline = setTimeout(() => void channel.close("authentication timed out"), SECURE_LIMITS.authenticationMs)
    authenticationDeadline.unref?.()
    try {
      const first = await next()
      if (first.kind !== "client_hello") throw new Error("Expected secure client hello")
      const hello = SecureClientHelloSchema.parse(decodeCanonical(first.payload))
      if (hello.mode !== "helper" && hello.listener_epoch !== this.options.listenerEpoch) throw new Error("Secure listener epoch mismatch")
      let admission: SessionAdmission | null
      let helperPublicKey: string | undefined
      let pendingPairing: { token: string; record: PairedHelper } | undefined
      if (hello.mode === "pairing" && hello.principal_id && hello.launch_token && this.options.pairingAuthority) {
        const paired = this.options.pairingAuthority.prepare(hello.launch_token, {
          id: hello.principal_id,
          publicKeyPem: rawPublicKeyPem(hello.public_key),
          requestedScopes: hello.requested_scopes,
        })
        pendingPairing = { token: hello.launch_token, record: paired }
        admission = { principalId: paired.helper_id, targetId: hello.target_id, scopes: paired.scopes, leaseMs: 60_000 }
      } else if (hello.mode === "helper" && hello.principal_id && this.options.pairingAuthority) {
        if (!hello.helper_epoch) throw new Error("Helper session epoch is required")
        const helper = this.options.pairingAuthority.find(hello.principal_id)
        if (!helper) throw new Error("Unknown or revoked helper")
        const requested = new Set(hello.requested_scopes)
        admission = {
          principalId: hello.delegate_id ? `${helper.helper_id}/${hello.delegate_id}` : helper.helper_id,
          targetId: hello.target_id,
          scopes: helper.scopes.filter((scope) => requested.has(scope)),
          leaseMs: 5 * 60_000,
          helperId: helper.helper_id,
          helperEpoch: hello.helper_epoch,
        }
        helperPublicKey = helper.public_key
      } else admission = await this.options.admit(hello)
      if (!admission) throw new Error("Launch grant is invalid or expired")
      const challenge = {
        protocol: "git-stacks/2" as const,
        service_id: this.options.serviceId,
        listener_epoch: this.options.listenerEpoch,
        challenge: Buffer.from(randomBytes(32)).toString("base64url"),
        server_time: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15_000).toISOString(),
        accepted_scopes: admission.scopes,
      }
      await channel.sendControl("server_challenge", challenge)
      const second = await next()
      if (second.kind !== "client_proof") throw new Error("Expected secure client proof")
      const proof = SecureClientProofSchema.parse(decodeCanonical(second.payload))
      const transcript = await digest(encodeCanonical({ challenge, hello }))
      if (proof.transcript_hash !== toBase64Url(transcript)) throw new Error("Secure transcript hash mismatch")
      const verified = helperPublicKey
        ? await verifyHelper(helperPublicKey, transcript, proof.signature)
        : await verifyEphemeral(hello.public_key, transcript, proof.signature)
      if (!verified) throw new Error("Secure client proof is invalid")
      if (pendingPairing) this.options.pairingAuthority!.commit(pendingPairing.token, pendingPairing.record)
      const sessionId = crypto.randomUUID()
      let closed = false
      context = {
        ...admission,
        sessionId,
        mode: hello.mode,
        channel,
        sendEvent: (value) => channel.sendControl("event", value),
        sendTerminalControl: (streamId, value) => channel.sendControl("terminal_control", value, streamId),
        sendTerminalData: (streamId, value) => channel.send("terminal_data", value, streamId),
        close: async (reason = "closed") => {
          if (closed) return
          closed = true
          await channel.sendControl("close", { code: "closed", message: reason }).catch(() => undefined)
          await channel.close(reason)
        },
      }
      const samePrincipal = [...this.sessions].filter((session) => session.principalId === context!.principalId)
      if (samePrincipal.length >= SECURE_LIMITS.sessionsPerPrincipal) throw new Error("Principal session capacity reached")
      const sameTarget = [...this.sessions].filter((session) => session.targetId === context!.targetId)
      if (sameTarget.length >= SECURE_LIMITS.sessionsPerTarget) throw new Error("Target session capacity reached")
      if (context.helperId && context.helperEpoch) {
        const previousEpoch = this.helperEpochs.get(context.helperId)
        if (previousEpoch && previousEpoch !== context.helperEpoch) {
          await Promise.allSettled([...this.sessions]
            .filter((session) => session.helperId === context!.helperId && session.helperEpoch !== context!.helperEpoch)
            .map((session) => session.close("helper session replaced")))
        }
        this.helperEpochs.set(context.helperId, context.helperEpoch)
      }
      await this.options.sessionOpened?.(context)
      this.sessions.add(context)
      await channel.sendControl("server_accept", {
        protocol: "git-stacks/2",
        session_id: sessionId,
        principal_id: context.principalId,
        target_id: context.targetId,
        scopes: context.scopes,
        lease_expires_at: new Date(Date.now() + context.leaseMs).toISOString(),
        event_cursor: await this.options.eventCursor(),
        ...(this.options.currentPinSet ? { pin_set: this.options.currentPinSet() } : {}),
      })
      accepted = true
      clearTimeout(authenticationDeadline)
      // Pairing proves and records one helper identity; it is never a product
      // session and must not be reusable as an authority bearer.
      if (context.mode === "pairing") return
      let lease: ReturnType<typeof setTimeout> | undefined
      const renewLease = () => {
        if (lease) clearTimeout(lease)
        lease = setTimeout(() => void context?.close("session lease expired"), context!.leaseMs)
        lease.unref?.()
        return new Date(Date.now() + context!.leaseMs).toISOString()
      }
      renewLease()
      const requests = new Set<Promise<void>>()
      const streams = new Set<number>()
      try {
        while (true) {
          const frame = await next()
          if (frame.kind === "close") break
          if (frame.kind === "request") {
            const request = SecureRequestSchema.parse(decodeCanonical(frame.payload))
            if (request.method === "session.renew") {
              void context.channel.sendControl("response", { id: request.id, ok: true, body: { lease_expires_at: renewLease() } })
            } else if (requests.size >= SECURE_LIMITS.requestsInFlight) {
              void context.channel.sendControl("response", { id: request.id, ok: false, error: { code: "capacity_exceeded", message: "Too many requests in flight" } })
            } else {
              let task!: Promise<void>
              task = this.respond(context, request).finally(() => requests.delete(task))
              requests.add(task)
            }
          } else if (frame.kind === "terminal_control") {
            if (frame.streamId === 0) throw new Error("Terminal frames require a stream id")
            const control = decodeCanonical(frame.payload)
            if (!streams.has(frame.streamId) && streams.size >= SECURE_LIMITS.streamsPerSession) throw new Error("Terminal stream capacity reached")
            streams.add(frame.streamId)
            await this.options.handler.terminalControl?.(context, frame.streamId, control)
            if ((control as { type?: unknown }).type === "detach") streams.delete(frame.streamId)
          } else if (frame.kind === "terminal_data") {
            if (frame.streamId === 0) throw new Error("Terminal frames require a stream id")
            if (!streams.has(frame.streamId) && streams.size >= SECURE_LIMITS.streamsPerSession) throw new Error("Terminal stream capacity reached")
            streams.add(frame.streamId)
            await this.options.handler.terminalData?.(context, frame.streamId, frame.payload)
          } else throw new Error("Unexpected authenticated frame")
        }
      } finally { clearTimeout(lease); await Promise.allSettled([...requests]) }
    } catch (error) {
      void error
      await channel.sendControl("close", {
        code: accepted ? "session_failed" : "authentication_failed",
        message: accepted ? "Secure session failed" : "Secure authentication failed",
      }).catch(() => undefined)
    } finally {
      this.pendingSessions -= 1
      clearTimeout(authenticationDeadline)
      if (context) {
        this.sessions.delete(context)
        await this.options.handler.closed?.(context)
        await this.options.sessionClosed?.(context)
      }
      await channel.close().catch(() => undefined)
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.sessions].map((session) => session.close("service stopping")))
  }

  async revokeHelper(helperId: string): Promise<void> {
    await Promise.allSettled([...this.sessions]
      .filter((session) => session.helperId === helperId)
      .map((session) => session.close("helper revoked")))
  }

  private async respond(context: SecureSessionContext, request: SecureRequest): Promise<void> {
    let response: SecureResponse
    try {
      response = { id: request.id, ok: true, body: await this.options.handler.request(context, request) }
    } catch (error) {
      const candidate = error as { code?: unknown; retryable?: unknown }
      response = {
        id: request.id,
        ok: false,
        error: {
          code: boundedErrorField(candidate.code ?? "internal_error", "internal_error", SECURE_LIMITS.responseErrorCodeLength),
          message: boundedErrorField(error instanceof Error ? error.message : "Secure request failed", "Secure request failed", SECURE_LIMITS.responseErrorMessageLength),
          ...(candidate.retryable === true ? { retryable: true } : {}),
        },
      }
    }
    await context.channel.sendControl("response", SecureResponseSchema.parse(response))
  }
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}
