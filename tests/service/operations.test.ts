import { describe, expect, test } from "bun:test"

describe("v1 operations transport", () => {
  test("idle lifecycle suppresses exit while clients or operations are active", async () => {
    const callbacks: Array<() => void> = []
    let exited = 0
    const { createIdleLifecycle } = await import("../../src/service/main")
    const lifecycle = createIdleLifecycle({ idleMs: 5, setTimer: (fn) => { callbacks.push(fn); return callbacks.length as never }, clearTimer: () => {}, onIdle: () => { exited += 1 } })
    lifecycle.setConnectedClients(1)
    callbacks.at(-1)?.()
    expect(exited).toBe(0)
    lifecycle.setConnectedClients(0)
    lifecycle.setActiveOperations(1)
    callbacks.at(-1)?.()
    expect(exited).toBe(0)
    lifecycle.setActiveOperations(0)
    callbacks.at(-1)?.()
    expect(exited).toBe(1)
    lifecycle.dispose()
  })

  test("exports the loopback server composition entry point", async () => {
    const module = await import("../../src/service/server")
    expect(module.startServiceServer).toBeFunction()
  })
})
