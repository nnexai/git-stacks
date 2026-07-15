import { describe, expect, test } from "bun:test"
import { TerminalSignalFilter } from "../../packages/service/src/web/signal-filter"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe("web terminal signal filter", () => {
  test("recognizes a valid token across every byte boundary and strips the private OSC", () => {
    const token = "private-token"
    const signals: unknown[] = []
    const filter = new TerminalSignalFilter(token, (signal) => signals.push(signal))
    const bytes = encoder.encode(`before\u001b]9;git-stacks-signal:${token}:codex:session-1:waiting\u001b\\after`)
    const output: Uint8Array[] = []
    for (const byte of bytes) output.push(filter.push(Uint8Array.of(byte)))
    output.push(filter.flush())
    expect(decoder.decode(Buffer.concat(output))).toBe("beforeafter")
    expect(signals).toEqual([{ provider: "codex", sessionId: "session-1", state: "waiting" }])
  })

  test("strips wrong-token, malformed, and oversize candidates without publishing", () => {
    const signals: unknown[] = []
    const filter = new TerminalSignalFilter("correct", (signal) => signals.push(signal))
    const wrong = filter.push(encoder.encode("left\u001b]9;git-stacks-signal:wrong:codex:s:working\u0007right"))
    const malformed = filter.push(encoder.encode("A\u001b]9;git-stacks-signal:correct:unknown:s:waiting\u001b\\B"))
    const oversized = filter.push(encoder.encode(`C\u001b]9;git-stacks-signal:${"x".repeat(3000)}`))
    expect(decoder.decode(wrong)).toBe("leftright")
    expect(decoder.decode(malformed)).toBe("AB")
    expect(decoder.decode(oversized)).toBe("C")
    expect(signals).toEqual([])
  })
})
