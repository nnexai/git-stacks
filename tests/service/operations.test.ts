import { describe, expect, test } from "bun:test"

describe("v1 operations transport", () => {
  test("exports the loopback server composition entry point", async () => {
    const module = await import("../../src/service/server")
    expect(module.startServiceServer).toBeFunction()
  })
})
