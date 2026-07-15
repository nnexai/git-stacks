import { describe, expect, test } from "@test/api"

import { spawn } from "../../packages/core/src/node-runtime"

describe("Node process runtime", () => {
  test("bounds a spawned process with a hard timeout", async () => {
    const started = performance.now()
    const child = spawn([process.execPath, "-e", "setTimeout(() => {}, 30_000)"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      timeoutMs: 100,
    })

    expect(await child.exited).not.toBe(0)
    expect(performance.now() - started).toBeLessThan(1_500)
  })
})
