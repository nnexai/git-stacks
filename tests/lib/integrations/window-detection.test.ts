import { describe, expect, test } from "@test/api"
import { pollForNewWindowIds } from "@/lib/integrations/window-detection"

describe("pollForNewWindowIds", () => {
  test("caps each sleep to the deadline and resolves without real time", async () => {
    let now = 0
    const sleeps: number[] = []
    const result = await pollForNewWindowIds(new Set([1]), async () => [1], {
      timeoutMs: 250,
      initialDelayMs: 200,
      maxDelayMs: 2_000,
      clock: { now: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms } },
    })
    expect(result).toEqual([])
    expect(sleeps).toEqual([200, 50])
  })
})
