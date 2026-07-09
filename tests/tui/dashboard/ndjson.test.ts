import { describe, expect, test } from "bun:test"
import { NdjsonFrameDecoder } from "@/tui/dashboard/ndjson"

const bytes = (text: string) => new TextEncoder().encode(text)

describe("NdjsonFrameDecoder", () => {
  test("handles split and coalesced frames", () => {
    const decoder = new NdjsonFrameDecoder<{ text: string }>()
    expect(decoder.push(bytes('{"text":"one"')).values).toEqual([])
    expect(decoder.push(bytes('}\n{"text":"two"}\n')).values).toEqual([{ text: "one" }, { text: "two" }])
  })

  test("recovers after malformed frames", () => {
    const decoder = new NdjsonFrameDecoder<{ text: string }>()
    const result = decoder.push(bytes('nope\n{"text":"ok"}\n'))
    expect(result).toMatchObject({ values: [{ text: "ok" }], malformed: 1, oversized: false })
  })

  test("preserves UTF-8 across chunk boundaries", () => {
    const encoded = bytes('{"text":"😀"}\n')
    const decoder = new NdjsonFrameDecoder<{ text: string }>()
    decoder.push(encoded.slice(0, 11))
    expect(decoder.push(encoded.slice(11)).values).toEqual([{ text: "😀" }])
  })
})
