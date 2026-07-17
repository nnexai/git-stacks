import assert from "node:assert/strict"
import test from "node:test"

import {
  SECURE_FRAME_HEADER_BYTES,
  SECURE_LIMITS,
  SecureFrameDecoder,
  SecureFrameQueue,
  SecureProtocolError,
  SecureResponseSchema,
  WebSnapshotSchema,
  WebStaleWorkspaceResponseSchema,
  decodeCanonical,
  encodeCanonical,
  encodeSecureFrame,
} from "../../packages/protocol/dist/index.js"
import { FramedDuplex } from "../../packages/client/dist/index.js"

test("secure frames survive arbitrary fragmentation and coalescing", () => {
  const first = encodeSecureFrame({ kind: "request", flags: 0, streamId: 7, sequence: 1n, payload: encodeCanonical({ b: 2, a: 1 }) })
  const second = encodeSecureFrame({ kind: "terminal_data", flags: 1, streamId: 9, sequence: 2n, payload: new Uint8Array([0, 1, 2, 255]) })
  const bytes = new Uint8Array(first.length + second.length)
  bytes.set(first)
  bytes.set(second, first.length)
  const decoder = new SecureFrameDecoder()
  const frames = []
  for (let offset = 0; offset < bytes.length; offset += 3) frames.push(...decoder.push(bytes.slice(offset, offset + 3)))
  decoder.finish()
  assert.equal(frames.length, 2)
  assert.deepEqual(decodeCanonical(frames[0].payload), { a: 1, b: 2 })
  assert.deepEqual([...frames[1].payload], [0, 1, 2, 255])
})

test("canonical control encoding rejects alternate ordering and non-finite values", () => {
  assert.equal(new TextDecoder().decode(encodeCanonical({ z: 1, a: [true, null] })), '{"a":[true,null],"z":1}')
  assert.throws(() => decodeCanonical(new TextEncoder().encode('{"z":1,"a":2}')), SecureProtocolError)
  assert.throws(() => encodeCanonical({ value: Number.NaN }), SecureProtocolError)
})

test("secure frame limits accept exact payloads and reject overflow before buffering", () => {
  const exactControl = encodeSecureFrame({
    kind: "response",
    flags: 0,
    streamId: 1,
    sequence: 0n,
    payload: new Uint8Array(SECURE_LIMITS.controlFrameBytes),
  })
  assert.equal(exactControl.byteLength, SECURE_FRAME_HEADER_BYTES + SECURE_LIMITS.controlFrameBytes)

  assert.throws(() => encodeSecureFrame({
    kind: "response",
    flags: 0,
    streamId: 1,
    sequence: 0n,
    payload: new Uint8Array(SECURE_LIMITS.controlFrameBytes + 1),
  }), (error) => error.code === "frame_too_large")
  assert.throws(() => encodeSecureFrame({
    kind: "terminal_data",
    flags: 0,
    streamId: 1,
    sequence: 0n,
    payload: new Uint8Array(SECURE_LIMITS.terminalFrameBytes + 1),
  }), /exceeds limit/)

  for (const [kind, limit] of [[7, SECURE_LIMITS.controlFrameBytes], [10, SECURE_LIMITS.terminalFrameBytes]]) {
    const maliciousHeader = new Uint8Array(SECURE_FRAME_HEADER_BYTES)
    const view = new DataView(maliciousHeader.buffer)
    view.setUint32(0, 0x47533200)
    view.setUint8(4, 2)
    view.setUint8(5, kind)
    view.setUint32(20, limit + 1)
    assert.throws(() => new SecureFrameDecoder().push(maliciousHeader), (error) => error.code === "frame_too_large")
  }
})

test("representative enlarged read responses remain below the one MiB control frame bound", () => {
  const uuid = (family, index) => `${family}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  const snapshot = WebSnapshotSchema.parse({
    protocol: "web-v1",
    revision: "21",
    generated_at: "2026-07-17T12:00:00.000Z",
    pinned_workspace_ids: Array.from({ length: 17 }, (_, index) => uuid("1", index + 1)),
    workspaces: Array.from({ length: 17 }, (_, index) => ({
      id: uuid("1", index + 1),
      name: `workspace-${String(index + 1).padStart(2, "0")}`,
      activity_at: "2026-07-17T11:00:00.000Z",
      branch: `feature/${index + 1}`,
      priority: index,
      labels: [],
      repositories: [],
      commands: [],
      file_status: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0 },
    })),
    archived_workspaces: Array.from({ length: 18 }, (_, index) => ({
      id: uuid("2", index + 1),
      name: `archived-${String(index + 1).padStart(2, "0")}`,
      activity_at: "2026-07-16T11:00:00.000Z",
    })),
  })
  const stale = WebStaleWorkspaceResponseSchema.parse({
    revision: "21",
    checked_at: "2026-07-17T12:00:00.000Z",
    threshold_days: 30,
    candidates: Array.from({ length: 17 }, (_, index) => ({
      workspace_id: uuid("3", index + 1),
      workspace_name: `candidate-${String(index + 1).padStart(2, "0")}`,
      activity_at: "2026-06-01T00:00:00.000Z",
      confirmed_reasons: [{ code: "inactive", occurred_at: "2026-06-01T00:00:00.000Z" }],
      unknown_evidence: [],
      cautions: [],
    })),
    incomplete: Array.from({ length: 18 }, (_, index) => ({
      workspace_id: uuid("4", index + 1),
      workspace_name: `incomplete-${String(index + 1).padStart(2, "0")}`,
      activity_at: null,
      unknown_evidence: [{ code: "activity_unavailable", observed_at: "2026-07-17T12:00:00.000Z" }],
      cautions: [],
    })),
  })

  for (const body of [snapshot, stale]) {
    const response = SecureResponseSchema.parse({
      id: "90000000-0000-4000-8000-000000000001",
      ok: true,
      body,
    })
    const payload = encodeCanonical(response)
    assert.ok(payload.byteLength < SECURE_LIMITS.controlFrameBytes)
    assert.doesNotThrow(() => encodeSecureFrame({ kind: "response", flags: 0, streamId: 1, sequence: 0n, payload }))
  }
})

test("secure writer rejects bounded-queue overflow before retaining unbounded output", async () => {
  let release
  const blocked = new Promise((resolve) => { release = resolve })
  const channel = new FramedDuplex({
    readable: new ReadableStream({ start() {} }),
    writable: new WritableStream({ write: () => blocked }),
    close: async () => {},
  })
  const pending = []
  for (let index = 0; index < SECURE_LIMITS.outboundPendingFrames; index += 1) {
    pending.push(channel.sendControl("event", { index }, index % 4))
  }
  await assert.rejects(channel.sendControl("event", { overflow: true }), (error) => error.code === "capacity_exceeded")
  assert.ok(channel.bufferedAmount > 0)
  assert.ok(channel.bufferedAmount < SECURE_LIMITS.outboundPendingBytes)
  release()
  await Promise.all(pending)
  assert.equal(channel.bufferedAmount, 0)
})

test("secure authenticated frame queue fails closed at frame and byte capacity", () => {
  const queue = new SecureFrameQueue()
  const frame = { kind: "event", flags: 0, streamId: 0, sequence: 0n, payload: new Uint8Array(1) }
  for (let index = 0; index < SECURE_LIMITS.inboundPendingFrames; index += 1) queue.push({ ...frame, sequence: BigInt(index) })
  assert.throws(() => queue.push({ ...frame, sequence: BigInt(SECURE_LIMITS.inboundPendingFrames) }), (error) => error.code === "capacity_exceeded")

  const bytes = new SecureFrameQueue()
  assert.throws(() => bytes.push({ ...frame, payload: new Uint8Array(SECURE_LIMITS.inboundPendingBytes) }), (error) => error.code === "capacity_exceeded")
})

test("secure decoder bounds a large coalesced frame batch without combining the transport chunk", () => {
  const frame = encodeSecureFrame({ kind: "event", flags: 0, streamId: 0, sequence: 0n, payload: new Uint8Array() })
  const chunk = new Uint8Array(frame.byteLength * (SECURE_LIMITS.inboundPendingFrames + 1))
  for (let index = 0; index <= SECURE_LIMITS.inboundPendingFrames; index += 1) {
    const encoded = encodeSecureFrame({ kind: "event", flags: 0, streamId: 0, sequence: BigInt(index), payload: new Uint8Array() })
    chunk.set(encoded, encoded.byteLength * index)
  }
  assert.throws(() => new SecureFrameDecoder().push(chunk), (error) => error.code === "capacity_exceeded")
})

test("secure writer round-robins streams while preserving wire sequence order", async () => {
  let release
  const blocked = new Promise((resolve) => { release = resolve })
  let firstWrite
  const enteredFirstWrite = new Promise((resolve) => { firstWrite = resolve })
  const writes = []
  const channel = new FramedDuplex({
    readable: new ReadableStream({ start() {} }),
    writable: new WritableStream({
      write(frame) {
        writes.push(new SecureFrameDecoder().push(frame)[0])
        if (writes.length === 1) { firstWrite(); return blocked }
      },
    }),
    close: async () => {},
  })
  const first = channel.send("terminal_data", new Uint8Array([1]), 7)
  await enteredFirstWrite
  const pending = [
    first,
    channel.send("terminal_data", new Uint8Array([2]), 7),
    channel.sendControl("event", { control: true }),
    channel.send("terminal_data", new Uint8Array([3]), 9),
    channel.send("terminal_data", new Uint8Array([4]), 7),
  ]
  release()
  await Promise.all(pending)
  assert.deepEqual(writes.map((frame) => frame.streamId), [7, 7, 0, 9, 7])
  assert.deepEqual(writes.map((frame) => frame.sequence), [0n, 1n, 2n, 3n, 4n])
})

test("secure channel tears down its carrier before waiting for a blocked writer", async () => {
  let release
  const blocked = new Promise((resolve) => { release = resolve })
  let carrierClosed = false
  const channel = new FramedDuplex({
    readable: new ReadableStream(),
    writable: new WritableStream({ write: () => blocked }),
    async close() { carrierClosed = true; release() },
  })
  const pending = channel.sendControl("event", { blocked: true })
  const rejected = assert.rejects(pending, /Secure channel closed/)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await channel.close("test shutdown")
  assert.equal(carrierClosed, true)
  await rejected
})

test("secure channel still releases its carrier after the peer ends reads first", async () => {
  let readable
  let carrierClosed = false
  const channel = new FramedDuplex({
    readable: new ReadableStream({ start(controller) { readable = controller } }),
    writable: new WritableStream(),
    async close() { carrierClosed = true },
  })
  const reading = channel.start(() => {})
  readable.close()
  await reading
  await channel.close("peer ended")
  assert.equal(carrierClosed, true)
})
