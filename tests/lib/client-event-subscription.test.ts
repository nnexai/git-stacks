import { describe, expect, test } from "vitest"

import { ensureSharedEventSubscription } from "@git-stacks/client"

describe("shared secure event subscription", () => {
  test("multiplexes concurrent and sequential consumers onto one server subscription", async () => {
    const calls: Array<{ method: string; body: unknown; scope: unknown }> = []
    const client = {
      async request<T>(method: string, body?: unknown, options?: { scope?: string }): Promise<T> {
        calls.push({ method, body, scope: options?.scope })
        return { cursor: "12" } as T
      },
    }

    const [first, second] = await Promise.all([
      ensureSharedEventSubscription(client, "10"),
      ensureSharedEventSubscription(client, "11"),
    ])
    const third = await ensureSharedEventSubscription(client, "12")

    expect([first, second, third]).toEqual(["12", "12", "12"])
    expect(calls).toEqual([{ method: "events.subscribe", body: { cursor: "10" }, scope: "event.read" }])
  })

  test("releases a failed attempt so reconnect logic can retry", async () => {
    let calls = 0
    const client = {
      async request<T>(): Promise<T> {
        calls += 1
        if (calls === 1) throw new Error("connection replaced")
        return { cursor: "4" } as T
      },
    }

    await expect(ensureSharedEventSubscription(client, "3")).rejects.toThrow("connection replaced")
    await expect(ensureSharedEventSubscription(client, "3")).resolves.toBe("4")
    expect(calls).toBe(2)
  })
})
