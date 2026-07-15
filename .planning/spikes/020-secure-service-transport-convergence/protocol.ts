export const HEADER_BYTES = 13
export const MAX_FRAME_BYTES = 1024 * 1024

export type Frame = { kind: number; stream: bigint; payload: Uint8Array }

export function encodeFrame(kind: number, stream: bigint, payload: Uint8Array): Uint8Array {
  if (!Number.isInteger(kind) || kind < 1 || kind > 255) throw new Error("invalid frame kind")
  if (payload.length > MAX_FRAME_BYTES) throw new Error("frame too large")
  const frame = new Uint8Array(HEADER_BYTES + payload.length)
  const view = new DataView(frame.buffer)
  frame[0] = kind
  view.setUint32(1, payload.length)
  view.setBigUint64(5, stream)
  frame.set(payload, HEADER_BYTES)
  return frame
}

export function encodeJson(kind: number, stream: bigint, value: unknown): Uint8Array {
  return encodeFrame(kind, stream, new TextEncoder().encode(JSON.stringify(value)))
}

export class FrameParser {
  #pending = new Uint8Array(0)

  push(input: Uint8Array): Frame[] {
    const joined = new Uint8Array(this.#pending.length + input.length)
    joined.set(this.#pending)
    joined.set(input, this.#pending.length)
    const frames: Frame[] = []
    let offset = 0
    while (joined.length - offset >= HEADER_BYTES) {
      const view = new DataView(joined.buffer, joined.byteOffset + offset)
      const length = view.getUint32(1)
      if (length > MAX_FRAME_BYTES) throw new Error("frame too large")
      if (joined.length - offset < HEADER_BYTES + length) break
      frames.push({
        kind: joined[offset]!,
        stream: view.getBigUint64(5),
        payload: joined.slice(offset + HEADER_BYTES, offset + HEADER_BYTES + length),
      })
      offset += HEADER_BYTES + length
    }
    this.#pending = joined.slice(offset)
    return frames
  }
}

export function json(frame: Frame): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(frame.payload)) as Record<string, unknown>
}
