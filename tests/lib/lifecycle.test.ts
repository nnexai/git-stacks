import { describe, test, expect } from "bun:test"
import { runHooksCaptured, type HookOutputLine } from "../../src/lib/lifecycle"

describe("runHooksCaptured", () => {
  test("captures stdout lines via callback", async () => {
    const lines: HookOutputLine[] = []
    const results = await runHooksCaptured(
      ["echo hello && echo world"],
      "/tmp",
      {},
      (out) => lines.push(out)
    )
    expect(lines.map(l => l.line)).toEqual(["hello", "world"])
    expect(lines.every(l => l.stream === "stdout")).toBe(true)
    expect(results).toHaveLength(1)
    expect(results[0].exitCode).toBe(0)
    expect(results[0].failed).toBe(false)
    expect(results[0].command).toBe("echo hello && echo world")
  })

  test("captures stderr separately", async () => {
    const lines: HookOutputLine[] = []
    await runHooksCaptured(
      ["echo err >&2"],
      "/tmp",
      {},
      (out) => lines.push(out)
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].stream).toBe("stderr")
    expect(lines[0].line).toBe("err")
  })

  test("stops sequence on first failure when abortOnFailure=true", async () => {
    const results = await runHooksCaptured(
      ["exit 1", "echo second"],
      "/tmp",
      {},
      () => {}
    )
    expect(results).toHaveLength(1)
    expect(results[0].failed).toBe(true)
    expect(results[0].exitCode).toBe(1)
  })

  test("returns empty array for undefined commands", async () => {
    const results = await runHooksCaptured(undefined, "/tmp", {}, () => {})
    expect(results).toEqual([])
  })

  test("continues after failure when abortOnFailure=false", async () => {
    const lines: HookOutputLine[] = []
    const results = await runHooksCaptured(
      ["exit 1", "echo second"],
      "/tmp",
      {},
      (out) => lines.push(out),
      false
    )
    expect(results).toHaveLength(2)
    expect(results[0].failed).toBe(true)
    expect(results[1].failed).toBe(false)
    expect(lines.some(l => l.line === "second")).toBe(true)
  })

  test("passes env vars to subprocess", async () => {
    const lines: HookOutputLine[] = []
    await runHooksCaptured(
      ["echo $TEST_VAR"],
      "/tmp",
      { TEST_VAR: "hello" },
      (out) => lines.push(out)
    )
    expect(lines[0].line).toBe("hello")
  })
})
