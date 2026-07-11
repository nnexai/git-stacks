import { describe, expect, test } from "bun:test"

describe("v1 event transport", () => {
  test("uses the documented SSE admission constants", async () => {
    const server = await import("../../src/service/server")
    expect(server.SSE_HEARTBEAT_MS).toBe(15_000)
    expect(server.SSE_MAX_PER_CREDENTIAL).toBe(8)
    expect(server.SSE_MAX_TOTAL).toBe(32)
  })
})
