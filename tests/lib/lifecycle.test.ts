import { describe, test, expect, mock, beforeEach } from "bun:test"
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

// ─── lifecycle _exec injection ────────────────────────────────────────────────
// These tests use the injectable _exec.spawn to verify call shapes without
// executing real shell commands. Separate from the real-shell tests above.

// @ts-ignore — query param cache-busting for bun module cache
const lifecycleModule = await import("@/lib/lifecycle?lifecycle-exec-test")

const { runHooks, runHooksCaptured: runHooksCapturedInjected, _exec } = lifecycleModule

import type { SpawnHandle } from "@/lib/lifecycle"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function streamFromString(s: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(s))
      controller.close()
    },
  })
}

function makeSpawnHandle(
  exitCode: number,
  stdout = "",
  stderr = ""
): SpawnHandle {
  return {
    exited: Promise.resolve(exitCode),
    stdout: streamFromString(stdout),
    stderr: streamFromString(stderr),
  }
}

type SpawnArgs = {
  cmd: string[]
  cwd: string
  env: Record<string, string>
  stdout: "inherit" | "pipe"
  stderr: "inherit" | "pipe"
}

let capturedSpawnArgs: SpawnArgs[] = []
let spawnHandles: SpawnHandle[] = []

const mockSpawn = mock((args: SpawnArgs): SpawnHandle => {
  capturedSpawnArgs.push({ ...args })
  const handle = spawnHandles[capturedSpawnArgs.length - 1] ?? makeSpawnHandle(0)
  return handle
})

_exec.spawn = mockSpawn

function resetSpawnMocks(...handles: SpawnHandle[]) {
  capturedSpawnArgs = []
  spawnHandles = handles
  mockSpawn.mockClear()
}

// ─── runHooks _exec.spawn ─────────────────────────────────────────────────────

describe("runHooks _exec injection", () => {
  beforeEach(() => resetSpawnMocks(makeSpawnHandle(0)))

  test("calls _exec.spawn with cmd=['sh','-c',cmd], stdout=inherit, stderr=inherit", async () => {
    resetSpawnMocks(makeSpawnHandle(0))
    await runHooks(["echo hello"], "/tmp", {})

    expect(capturedSpawnArgs).toHaveLength(1)
    expect(capturedSpawnArgs[0].cmd).toEqual(["sh", "-c", "echo hello"])
    expect(capturedSpawnArgs[0].stdout).toBe("inherit")
    expect(capturedSpawnArgs[0].stderr).toBe("inherit")
    expect(capturedSpawnArgs[0].cwd).toBe("/tmp")
  })

  test("merges env with process.env", async () => {
    resetSpawnMocks(makeSpawnHandle(0))
    await runHooks(["echo $MY_VAR"], "/project", { MY_VAR: "test-value" })

    expect(capturedSpawnArgs[0].env.MY_VAR).toBe("test-value")
  })

  test("runs multiple commands sequentially", async () => {
    resetSpawnMocks(makeSpawnHandle(0), makeSpawnHandle(0))
    await runHooks(["echo first", "echo second"], "/tmp", {})

    expect(capturedSpawnArgs).toHaveLength(2)
    expect(capturedSpawnArgs[0].cmd[2]).toBe("echo first")
    expect(capturedSpawnArgs[1].cmd[2]).toBe("echo second")
  })

  test("throws when exitCode is non-zero and abortOnFailure=true", async () => {
    resetSpawnMocks(makeSpawnHandle(1))

    await expect(runHooks(["false"], "/tmp", {})).rejects.toThrow(
      "Hook failed (exit 1): false"
    )
  })

  test("does not throw when abortOnFailure=false even on non-zero exit", async () => {
    resetSpawnMocks(makeSpawnHandle(1), makeSpawnHandle(0))
    await runHooks(["false", "echo ok"], "/tmp", {}, false)

    // Both commands should have been called
    expect(capturedSpawnArgs).toHaveLength(2)
  })

  test("does nothing for undefined commands", async () => {
    resetSpawnMocks()
    await runHooks(undefined, "/tmp", {})

    expect(capturedSpawnArgs).toHaveLength(0)
  })

  test("does nothing for empty commands array", async () => {
    resetSpawnMocks()
    await runHooks([], "/tmp", {})

    expect(capturedSpawnArgs).toHaveLength(0)
  })
})

// ─── runHooksCaptured _exec.spawn ─────────────────────────────────────────────

describe("runHooksCaptured _exec injection", () => {
  test("calls _exec.spawn with stdout=pipe, stderr=pipe", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "output\n", ""))
    await runHooksCapturedInjected(["echo hello"], "/tmp", {}, () => {})

    expect(capturedSpawnArgs[0].stdout).toBe("pipe")
    expect(capturedSpawnArgs[0].stderr).toBe("pipe")
  })

  test("captures output via onOutput callback from streams", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "hello\n", ""))
    const lines: HookOutputLine[] = []
    await runHooksCapturedInjected(
      ["echo hello"],
      "/tmp",
      {},
      (out) => lines.push(out)
    )

    expect(lines.some(l => l.line === "hello" && l.stream === "stdout")).toBe(true)
  })

  test("captures stderr output via onOutput callback", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "", "error text\n"))
    const lines: HookOutputLine[] = []
    await runHooksCapturedInjected(
      ["echo error >&2"],
      "/tmp",
      {},
      (out) => lines.push(out)
    )

    expect(lines.some(l => l.line === "error text" && l.stream === "stderr")).toBe(true)
  })

  test("returns HookResult with exitCode and command", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "ok\n", ""))
    const results = await runHooksCapturedInjected(
      ["my-command"],
      "/tmp",
      {},
      () => {}
    )

    expect(results).toHaveLength(1)
    expect(results[0].exitCode).toBe(0)
    expect(results[0].failed).toBe(false)
    expect(results[0].command).toBe("my-command")
  })

  test("stops after failure when abortOnFailure=true", async () => {
    resetSpawnMocks(
      makeSpawnHandle(1, "", ""),
      makeSpawnHandle(0, "", ""),
    )
    const results = await runHooksCapturedInjected(
      ["fail", "second"],
      "/tmp",
      {},
      () => {}
    )

    expect(results).toHaveLength(1)
    expect(results[0].failed).toBe(true)
    expect(capturedSpawnArgs).toHaveLength(1)
  })
})
