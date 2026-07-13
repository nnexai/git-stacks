export type TerminalSignal = { provider: "codex" | "claude" | "copilot" | "opencode"; sessionId: string; state: "working" | "waiting" | "completed" | "failed" }

const PREFIX = new TextEncoder().encode("\u001b]9;git-stacks-signal:")
const MAX_CANDIDATE = 2048

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let index = from; index <= haystack.length - needle.length; index += 1) {
    for (let nested = 0; nested < needle.length; nested += 1) if (haystack[index + nested] !== needle[nested]) continue outer
    return index
  }
  return -1
}

function prefixSuffix(bytes: Uint8Array): number {
  for (let size = Math.min(bytes.length, PREFIX.length - 1); size > 0; size -= 1) {
    let match = true
    for (let index = 0; index < size; index += 1) if (bytes[bytes.length - size + index] !== PREFIX[index]) { match = false; break }
    if (match) return size
  }
  return 0
}

export class TerminalSignalFilter {
  private pending = new Uint8Array()

  constructor(private readonly token: string, private readonly onSignal: (signal: TerminalSignal) => void) {}

  push(chunk: Uint8Array): Uint8Array {
    const input = new Uint8Array(this.pending.length + chunk.length)
    input.set(this.pending)
    input.set(chunk, this.pending.length)
    this.pending = new Uint8Array()
    const output: Uint8Array[] = []
    let offset = 0
    while (offset < input.length) {
      const start = indexOf(input, PREFIX, offset)
      if (start === -1) {
        const remainder = input.slice(offset)
        const held = prefixSuffix(remainder)
        if (remainder.length > held) output.push(remainder.slice(0, remainder.length - held))
        if (held) this.pending = remainder.slice(remainder.length - held)
        break
      }
      if (start > offset) output.push(input.slice(offset, start))
      let end = -1
      let terminator = 0
      for (let index = start + PREFIX.length; index < input.length; index += 1) {
        if (input[index] === 7) { end = index; terminator = 1; break }
        if (input[index] === 27 && input[index + 1] === 92) { end = index; terminator = 2; break }
      }
      if (end === -1) {
        if (input.length - start <= MAX_CANDIDATE) this.pending = input.slice(start)
        offset = input.length
        break
      }
      const body = new TextDecoder("utf-8", { fatal: false }).decode(input.slice(start + PREFIX.length, end))
      const [candidateToken, provider, sessionId, state, ...extra] = body.split(":")
      if (candidateToken === this.token && extra.length === 0 && /^(codex|claude|copilot|opencode)$/.test(provider ?? "") && /^(working|waiting|completed|failed)$/.test(state ?? "") && Boolean(sessionId) && (sessionId?.length ?? 0) <= 160) {
        this.onSignal({ provider: provider as TerminalSignal["provider"], sessionId: sessionId!, state: state as TerminalSignal["state"] })
      }
      offset = end + terminator
    }
    const size = output.reduce((sum, item) => sum + item.length, 0)
    const result = new Uint8Array(size)
    let cursor = 0
    for (const item of output) { result.set(item, cursor); cursor += item.length }
    return result
  }

  flush(): Uint8Array {
    const bytes = this.pending
    this.pending = new Uint8Array()
    return indexOf(bytes, PREFIX) === -1 ? bytes : new Uint8Array()
  }
}
