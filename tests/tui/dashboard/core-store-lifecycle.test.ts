import { expect, mock, test } from "bun:test"

let streamAborted = false

mock.module("@git-stacks/service/client", () => ({
  fetchCoreState: async () => { throw new Error("unused") },
  fetchEventCursor: async () => "0",
  subscribeServiceEvents: async (_cursor: string, _observer: unknown, signal?: AbortSignal) => {
    return await new Promise<string>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        streamAborted = true
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
      }, { once: true })
    })
  },
}))

const { stopCoreState, subscribeCoreEvents } = await import("../../../packages/tui/src/core-store")

test("dashboard shutdown aborts its long-lived service event stream", async () => {
  const unsubscribe = subscribeCoreEvents(() => {})
  await Bun.sleep(5)
  stopCoreState()
  await Bun.sleep(5)
  unsubscribe()

  expect(streamAborted).toBe(true)
})
