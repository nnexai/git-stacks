import { describe, expect, test } from "bun:test"
import { drainCommandStream } from "@/tui/dashboard/command-stream"

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe("drainCommandStream", () => {
  test("keeps a UTF-8 character intact when its bytes span chunks", async () => {
    const bytes = new TextEncoder().encode("ready 😀\n")
    const output: string[] = []
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 8))
        controller.enqueue(bytes.slice(8))
        controller.close()
      },
    })

    await drainCommandStream(source, (line) => output.push(line))

    expect(output).toEqual(["ready 😀"])
  })

  test("emits complete lines and flushes a final partial line", async () => {
    const output: string[] = []
    await drainCommandStream(stream(["one\ntwo", "\nthree"]), (line) => output.push(line))
    expect(output).toEqual(["one", "two", "three"])
  })
})
