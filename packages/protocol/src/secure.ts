import { z } from "zod"

export const SECURE_PROTOCOL = "git-stacks/2" as const
export const SECURE_FRAME_MAGIC = 0x47533200
export const SECURE_FRAME_HEADER_BYTES = 24

export const SECURE_LIMITS = Object.freeze({
  controlFrameBytes: 1024 * 1024,
  terminalFrameBytes: 64 * 1024,
  streamsPerSession: 64,
  sessionsPerPrincipal: 8,
  sessionsPerTarget: 32,
  sessionsTotal: 128,
  authenticationMs: 15_000,
  requestsInFlight: 128,
  inboundPendingFrames: 512,
  inboundPendingBytes: 16 * 1024 * 1024,
  outboundPendingFrames: 512,
  outboundPendingBytes: 16 * 1024 * 1024,
  outboundPendingFramesPerStream: 128,
  outboundPendingBytesPerStream: 4 * 1024 * 1024,
  browserLeaseMs: 30_000,
  launchTokenTtlMs: 30_000,
  pairingTokenTtlMs: 5 * 60_000,
})

export const SecureFrameKindSchema = z.enum([
  "client_hello", "server_challenge", "client_proof", "server_accept", "close",
  "request", "response", "event", "terminal_control", "terminal_data",
])
export type SecureFrameKind = z.infer<typeof SecureFrameKindSchema>

const frameKinds: readonly SecureFrameKind[] = [
  "client_hello", "server_challenge", "client_proof", "server_accept", "close",
  "request", "response", "event", "terminal_control", "terminal_data",
]
const kindToCode = new Map(frameKinds.map((kind, index) => [kind, index + 1]))

export interface SecureFrame {
  kind: SecureFrameKind
  streamId: number
  sequence: bigint
  flags: number
  payload: Uint8Array
}

export function secureFrameBytes(frame: Pick<SecureFrame, "payload">): number {
  return SECURE_FRAME_HEADER_BYTES + frame.payload.byteLength
}

/** Bounded handoff between an authenticated transport reader and its consumer. */
export class SecureFrameQueue {
  private readonly frames: SecureFrame[] = []
  private bytes = 0

  get length(): number { return this.frames.length }
  get byteLength(): number { return this.bytes }

  push(frame: SecureFrame): void {
    const bytes = secureFrameBytes(frame)
    if (this.frames.length >= SECURE_LIMITS.inboundPendingFrames || this.bytes + bytes > SECURE_LIMITS.inboundPendingBytes) {
      throw new SecureProtocolError("Secure channel inbound capacity exceeded", "capacity_exceeded")
    }
    this.frames.push(frame)
    this.bytes += bytes
  }

  shift(): SecureFrame | undefined {
    const frame = this.frames.shift()
    if (frame) this.bytes -= secureFrameBytes(frame)
    return frame
  }
}

export class SecureProtocolError extends Error {
  constructor(message: string, readonly code = "protocol_error") {
    super(message)
    this.name = "SecureProtocolError"
  }
}

function maximumPayload(kind: SecureFrameKind): number {
  return kind === "terminal_data" ? SECURE_LIMITS.terminalFrameBytes : SECURE_LIMITS.controlFrameBytes
}

export function assertSecureFrame(frame: SecureFrame): void {
  if (!Number.isSafeInteger(frame.streamId) || frame.streamId < 0 || frame.streamId > 0xffff_ffff) throw new SecureProtocolError("Invalid stream id")
  if (!Number.isSafeInteger(frame.flags) || frame.flags < 0 || frame.flags > 0xffff) throw new SecureProtocolError("Invalid frame flags")
  if (frame.sequence < 0n || frame.sequence > 0xffff_ffff_ffff_ffffn) throw new SecureProtocolError("Invalid frame sequence")
  if (frame.payload.byteLength > maximumPayload(frame.kind)) throw new SecureProtocolError("Frame payload exceeds limit", "frame_too_large")
  if (!kindToCode.has(frame.kind)) throw new SecureProtocolError("Unknown frame kind")
}

export function encodeSecureFrame(frame: SecureFrame): Uint8Array {
  assertSecureFrame(frame)
  const kind = kindToCode.get(frame.kind)!
  const encoded = new Uint8Array(SECURE_FRAME_HEADER_BYTES + frame.payload.byteLength)
  const view = new DataView(encoded.buffer)
  view.setUint32(0, SECURE_FRAME_MAGIC)
  view.setUint8(4, 2)
  view.setUint8(5, kind)
  view.setUint16(6, frame.flags)
  view.setUint32(8, frame.streamId)
  view.setBigUint64(12, frame.sequence)
  view.setUint32(20, frame.payload.byteLength)
  encoded.set(frame.payload, SECURE_FRAME_HEADER_BYTES)
  return encoded
}

export class SecureFrameDecoder {
  private buffered = new Uint8Array(0)

  push(chunk: Uint8Array): SecureFrame[] {
    if (chunk.byteLength === 0) return []
    const frames: SecureFrame[] = []
    let frameBytes = 0
    let offset = 0
    while (offset < chunk.byteLength || this.buffered.byteLength >= SECURE_FRAME_HEADER_BYTES) {
      if (this.buffered.byteLength > 0) {
        if (this.buffered.byteLength < SECURE_FRAME_HEADER_BYTES) {
          offset += this.append(chunk, offset, SECURE_FRAME_HEADER_BYTES - this.buffered.byteLength)
          if (this.buffered.byteLength < SECURE_FRAME_HEADER_BYTES) break
        }
        const header = this.header(this.buffered, 0)
        if (this.buffered.byteLength < header.total) {
          offset += this.append(chunk, offset, header.total - this.buffered.byteLength)
          if (this.buffered.byteLength < header.total) break
        }
        this.addFrame(frames, header, this.buffered, 0, frameBytes)
        frameBytes += header.total
        this.buffered = new Uint8Array(0)
        continue
      }
      if (chunk.byteLength - offset < SECURE_FRAME_HEADER_BYTES) {
        this.buffered = chunk.slice(offset)
        break
      }
      const header = this.header(chunk, offset)
      if (chunk.byteLength - offset < header.total) {
        this.buffered = chunk.slice(offset)
        break
      }
      this.addFrame(frames, header, chunk, offset, frameBytes)
      frameBytes += header.total
      offset += header.total
    }
    return frames
  }

  finish(): void {
    if (this.buffered.byteLength !== 0) throw new SecureProtocolError("Truncated secure frame")
  }

  private append(chunk: Uint8Array, offset: number, wanted: number): number {
    const length = Math.min(wanted, chunk.byteLength - offset)
    if (length === 0) return 0
    const combined = new Uint8Array(this.buffered.byteLength + length)
    combined.set(this.buffered)
    combined.set(chunk.subarray(offset, offset + length), this.buffered.byteLength)
    this.buffered = combined
    return length
  }

  private header(bytes: Uint8Array, offset: number): { kind: SecureFrameKind; flags: number; streamId: number; sequence: bigint; length: number; total: number } {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    if (view.getUint32(0) !== SECURE_FRAME_MAGIC || view.getUint8(4) !== 2) throw new SecureProtocolError("Invalid secure frame header")
    const kind = frameKinds[view.getUint8(5) - 1]
    if (!kind) throw new SecureProtocolError("Unknown mandatory frame kind")
    const length = view.getUint32(20)
    if (length > maximumPayload(kind)) throw new SecureProtocolError("Frame payload exceeds limit", "frame_too_large")
    return {
      kind,
      flags: view.getUint16(6),
      streamId: view.getUint32(8),
      sequence: view.getBigUint64(12),
      length,
      total: SECURE_FRAME_HEADER_BYTES + length,
    }
  }

  private addFrame(
    frames: SecureFrame[],
    header: { kind: SecureFrameKind; flags: number; streamId: number; sequence: bigint; length: number; total: number },
    bytes: Uint8Array,
    offset: number,
    frameBytes: number,
  ): void {
    if (frames.length >= SECURE_LIMITS.inboundPendingFrames || frameBytes + header.total > SECURE_LIMITS.inboundPendingBytes) {
      throw new SecureProtocolError("Decoded secure frame batch exceeds capacity", "capacity_exceeded")
    }
    frames.push({
      kind: header.kind,
      flags: header.flags,
      streamId: header.streamId,
      sequence: header.sequence,
      payload: bytes.slice(offset + SECURE_FRAME_HEADER_BYTES, offset + header.total),
    })
  }
}

function canonical(value: unknown, seen: Set<object>): string {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new SecureProtocolError("Non-canonical number")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry, seen)).join(",")}]`
  if (typeof value !== "object") throw new SecureProtocolError("Unsupported canonical value")
  if (seen.has(value)) throw new SecureProtocolError("Cyclic canonical value")
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new SecureProtocolError("Only plain objects are canonical")
  seen.add(value)
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const encoded = `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key], seen)}`).join(",")}}`
  seen.delete(value)
  return encoded
}

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function encodeCanonical(value: unknown): Uint8Array {
  return encoder.encode(canonical(value, new Set()))
}

export function decodeCanonical(payload: Uint8Array): unknown {
  const text = decoder.decode(payload)
  const value = JSON.parse(text) as unknown
  if (canonical(value, new Set()) !== text) throw new SecureProtocolError("Non-canonical control payload")
  return value
}

export const SecureScopeSchema = z.enum([
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
])
export type SecureScope = z.infer<typeof SecureScopeSchema>
export const SecureScopesSchema = z.array(SecureScopeSchema).max(32).refine((scopes) => new Set(scopes).size === scopes.length)

const ByteStringSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)
const IsoTimestampSchema = z.string().datetime({ offset: true })

export const SecureClientHelloSchema = z.strictObject({
  protocol: z.literal(SECURE_PROTOCOL),
  mode: z.enum(["browser", "tui", "helper", "pairing"]),
  principal_id: z.string().min(1).max(160).optional(),
  delegate_id: z.string().min(1).max(160).optional(),
  helper_epoch: z.string().uuid().optional(),
  target_id: z.string().min(1).max(160),
  listener_epoch: z.string().uuid(),
  connection_nonce: ByteStringSchema,
  public_key: ByteStringSchema,
  launch_token: ByteStringSchema.optional(),
  requested_scopes: SecureScopesSchema,
  build: z.string().min(1).max(96),
})
export type SecureClientHello = z.infer<typeof SecureClientHelloSchema>

export const SecureServerChallengeSchema = z.strictObject({
  protocol: z.literal(SECURE_PROTOCOL),
  service_id: z.string().uuid(),
  listener_epoch: z.string().uuid(),
  challenge: ByteStringSchema,
  server_time: IsoTimestampSchema,
  expires_at: IsoTimestampSchema,
  accepted_scopes: SecureScopesSchema,
})
export type SecureServerChallenge = z.infer<typeof SecureServerChallengeSchema>

export const SecureClientProofSchema = z.strictObject({
  protocol: z.literal(SECURE_PROTOCOL),
  transcript_hash: ByteStringSchema,
  signature: ByteStringSchema,
})
export type SecureClientProof = z.infer<typeof SecureClientProofSchema>

export const SecureServerAcceptSchema = z.strictObject({
  protocol: z.literal(SECURE_PROTOCOL),
  session_id: z.string().uuid(),
  principal_id: z.string().min(1).max(160),
  target_id: z.string().min(1).max(160),
  scopes: SecureScopesSchema,
  lease_expires_at: IsoTimestampSchema,
  event_cursor: z.string().regex(/^(0|[1-9][0-9]*)$/),
  pin_set: z.unknown().optional(),
})
export type SecureServerAccept = z.infer<typeof SecureServerAcceptSchema>

export const SecureRequestSchema = z.strictObject({
  id: z.string().uuid(),
  method: z.string().regex(/^[a-z][a-z0-9_.-]{0,95}$/),
  body: z.unknown().optional(),
  idempotency_key: z.string().min(1).max(256).optional(),
})
export type SecureRequest = z.infer<typeof SecureRequestSchema>

export const SecureResponseSchema = z.strictObject({
  id: z.string().uuid(),
  ok: z.boolean(),
  body: z.unknown().optional(),
  error: z.strictObject({ code: z.string().min(1).max(96), message: z.string().min(1).max(500), retryable: z.boolean().optional() }).optional(),
}).refine((value) => value.ok ? value.error === undefined : value.error !== undefined)
export type SecureResponse = z.infer<typeof SecureResponseSchema>

export const SecureTerminalControlSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("attach"), terminal_id: z.string().min(1).max(160), cursor: z.string().regex(/^(0|[1-9][0-9]*)$/), streaming: z.boolean() }),
  z.strictObject({ type: z.literal("input"), terminal_id: z.string().min(1).max(160), data: z.string().max(64 * 1024) }),
  z.strictObject({ type: z.literal("resize"), terminal_id: z.string().min(1).max(160), cols: z.number().int().min(2).max(400), rows: z.number().int().min(1).max(240) }),
  z.strictObject({ type: z.literal("ack"), terminal_id: z.string().min(1).max(160), cursor: z.string().regex(/^(0|[1-9][0-9]*)$/) }),
  z.strictObject({ type: z.literal("flow"), terminal_id: z.string().min(1).max(160), streaming: z.boolean() }),
  z.strictObject({ type: z.literal("detach"), terminal_id: z.string().min(1).max(160) }),
])
export type SecureTerminalControl = z.infer<typeof SecureTerminalControlSchema>
