import { describe, it, expect } from "@test/api"
import { mapLimited } from "@/lib/concurrency"

describe("mapLimited", () => {
  it("runs at most N tasks concurrently (max=3)", async () => {
    let peak = 0
    let running = 0

    const items = Array.from({ length: 10 }, (_, i) => i)

    const results = await mapLimited(
      items,
      async (item) => {
        running++
        if (running > peak) peak = running
        // Small async pause so tasks overlap
        await new Promise((r) => setTimeout(r, 5))
        running--
        return item * 2
      },
      3
    )

    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1) // ensure tasks did run concurrently
    // Results should all be fulfilled
    expect(results.every((r) => r.status === "fulfilled")).toBe(true)
  })

  it("returns all results — no drops (10 items, limit=3)", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)

    const results = await mapLimited(items, async (item) => item * 3, 3)

    expect(results.length).toBe(10)
    expect(results.every((r) => r.status === "fulfilled")).toBe(true)
    const values = results.map((r) => (r as PromiseFulfilledResult<number>).value)
    expect(values).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27])
  })

  it("a rejecting task frees its slot — remaining tasks still complete", async () => {
    const items = [0, 1, 2, 3, 4]

    const results = await mapLimited(
      items,
      async (item) => {
        await new Promise((r) => setTimeout(r, 1))
        if (item === 2) throw new Error("task 2 failed")
        return item
      },
      2
    )

    expect(results.length).toBe(5)
    // item 2 is rejected
    expect(results[2].status).toBe("rejected")
    // all others are fulfilled
    const others = [0, 1, 3, 4]
    for (const idx of others) {
      expect(results[idx].status).toBe("fulfilled")
    }
  })

  it("returns results in input order (like Promise.allSettled)", async () => {
    // Reverse the completion order: later items finish first
    const items = [300, 200, 100] // ms delays — item 2 finishes first

    const results = await mapLimited(
      items,
      async (delay) => {
        await new Promise((r) => setTimeout(r, delay))
        return delay
      },
      3
    )

    expect(results.length).toBe(3)
    const values = results.map((r) => (r as PromiseFulfilledResult<number>).value)
    // Must match input order, not completion order
    expect(values).toEqual([300, 200, 100])
  })
})
