const MAX_FRAME_BYTES = 64 * 1024

export class NdjsonFrameDecoder<T> {
  private decoder = new TextDecoder()
  private buffer = ""

  push(chunk: Uint8Array): { values: T[]; malformed: number; oversized: boolean } {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    if (this.buffer.length > MAX_FRAME_BYTES && !this.buffer.includes("\n")) {
      this.buffer = ""
      return { values: [], malformed: 0, oversized: true }
    }
    const values: T[] = []
    let malformed = 0
    const frames = this.buffer.split("\n")
    this.buffer = frames.pop() ?? ""
    for (const frame of frames) {
      if (!frame.trim()) continue
      if (frame.length > MAX_FRAME_BYTES) { malformed++; continue }
      try { values.push(JSON.parse(frame) as T) } catch { malformed++ }
    }
    return { values, malformed, oversized: false }
  }
}
