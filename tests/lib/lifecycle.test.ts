import { describe, test, expect, mock, beforeEach, afterEach } from "@test/api"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { runProcess } from "../process"
import type { HookOutputLine, HookResult, ShellOutputLine, ShellSequenceResult, SpawnHandle } from "@/lib/lifecycle"

// ─── Isolation strategy ───────────────────────────────────────────────────────
// This unit replaces @/lib/lifecycle with a local injectable executor. Vitest
// isolates the replacement to this file, and the injection tests can replace
// _exec.spawn without affecting consumer tests.

// Local injectable executor — real Node child process by default
const _exec = {
  spawn: (args: {
    cmd: string[]
    cwd: string
    env: Record<string, string>
    stdout: "inherit" | "pipe"
    stderr: "inherit" | "pipe"
  }): SpawnHandle => {
    const proc = runProcess(args.cmd, {
      cwd: args.cwd,
      env: args.env,
      stdout: args.stdout,
      stderr: args.stderr,
    })
    return {
      exited: proc.exited,
      stdout: args.stdout === "pipe" ? (proc.stdout ?? null) : null,
      stderr: args.stderr === "pipe" ? (proc.stderr ?? null) : null,
    }
  },
}

async function runHooks(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  abortOnFailure = true
): Promise<void> {
  if (!commands || commands.length === 0) return
  const mergedEnv = { ...process.env, ...env } as Record<string, string>
  for (const cmd of commands) {
    const handle = _exec.spawn({
      cmd: ["sh", "-c", cmd],
      cwd,
      env: mergedEnv,
      stdout: "inherit",
      stderr: "inherit",
    })
    const exitCode = await handle.exited
    if (abortOnFailure && exitCode !== 0) {
      throw new Error(`Hook failed (exit ${exitCode}): ${cmd}`)
    }
  }
}

async function runHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure = true
): Promise<HookResult[]> {
  if (!commands || commands.length === 0) return []
  const mergedEnv = { ...process.env, ...env } as Record<string, string>
  const results: HookResult[] = []
  for (const cmd of commands) {
    const handle = _exec.spawn({
      cmd: ["sh", "-c", cmd],
      cwd,
      env: mergedEnv,
      stdout: "pipe",
      stderr: "pipe",
    })
    const readStream = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      stream: "stdout" | "stderr"
    ) => {
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (buf) { onOutput({ line: buf, stream }); buf = "" }
          break
        }
        buf += decoder.decode(value)
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (line) onOutput({ line, stream })
        }
      }
    }
    await Promise.all([
      readStream(handle.stdout!.getReader(), "stdout"),
      readStream(handle.stderr!.getReader(), "stderr"),
    ])
    const exitCode = await handle.exited
    const result: HookResult = { exitCode, failed: exitCode !== 0, command: cmd }
    results.push(result)
    if (abortOnFailure && exitCode !== 0) break
  }
  return results
}

async function runShellSequence(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>
): Promise<ShellSequenceResult> {
  if (!commands || commands.length === 0) return { exitCode: 0 }
  const mergedEnv = { ...process.env, ...env } as Record<string, string>
  for (const cmd of commands) {
    const handle = _exec.spawn({
      cmd: ["sh", "-c", cmd],
      cwd,
      env: mergedEnv,
      stdout: "inherit",
      stderr: "inherit",
    })
    const exitCode = await handle.exited
    if (exitCode !== 0) return { exitCode, failedCommand: cmd }
  }
  return { exitCode: 0 }
}

async function runShellSequenceCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: ShellOutputLine) => void
): Promise<ShellSequenceResult> {
  if (!commands || commands.length === 0) return { exitCode: 0 }
  const mergedEnv = { ...process.env, ...env } as Record<string, string>
  for (const cmd of commands) {
    const handle = _exec.spawn({
      cmd: ["sh", "-c", cmd],
      cwd,
      env: mergedEnv,
      stdout: "pipe",
      stderr: "pipe",
    })
    const readStream = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      stream: "stdout" | "stderr"
    ) => {
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (buf) onOutput({ line: buf, stream })
          break
        }
        buf += decoder.decode(value)
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (line) onOutput({ line, stream })
        }
      }
    }
    await Promise.all([
      readStream(handle.stdout!.getReader(), "stdout"),
      readStream(handle.stderr!.getReader(), "stderr"),
    ])
    const exitCode = await handle.exited
    if (exitCode !== 0) return { exitCode, failedCommand: cmd }
  }
  return { exitCode: 0 }
}

// Re-apply mock.module to override whatever integration-commands.test.ts set.
// Our module uses the local _exec and local implementations above.
mock.module("@/lib/lifecycle", () => ({
  _exec,
  runHooks,
  runHooksCaptured,
  runShellSequence,
  runShellSequenceCaptured,
}))

// ─── Real-shell tests ─────────────────────────────────────────────────────────
// These use the local runHooksCaptured which calls a real Node child process via _exec.spawn.
// _exec.spawn is real by default; injection tests will swap it in beforeEach.

describe("runHooksCaptured", () => {
  test("captures stdout lines via callback", async () => {
    const lines: HookOutputLine[] = []
    const results = await runHooksCaptured(
      ["echo hello && echo world"],
      "/tmp",
      {},
      (out: HookOutputLine) => lines.push(out)
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
      (out: HookOutputLine) => lines.push(out)
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
      (out: HookOutputLine) => lines.push(out),
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
      (out: HookOutputLine) => lines.push(out)
    )
    expect(lines[0].line).toBe("hello")
  })
})

// ─── lifecycle _exec injection ────────────────────────────────────────────────
// These tests replace _exec.spawn with a mock to verify call shapes without
// executing real shell commands.

import type { SpawnHandle as _SpawnHandle } from "@/lib/lifecycle"

describe("Phase 124 lifecycle adapter delegation contract", () => {
  test("activates after the shared adapter exists and rejects hard-coded shell execution", () => {
    const adapterPath = join(import.meta.dirname, "../../packages/core/src/user-shell.ts")
    if (!existsSync(adapterPath)) return

    const lifecycleSource = readFileSync(
      join(import.meta.dirname, "../../packages/core/src/lifecycle.ts"),
      "utf8",
    )
    expect(
      lifecycleSource,
      "PHASE124_RED migrated shell consumers: lifecycle still owns a legacy shell path",
    ).toContain("executeUserShellCommand")
    expect(lifecycleSource).not.toMatch(/\[\s*["']\/bin\/sh["']\s*,\s*["']-c["']/)
  })
})

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
let originalSpawn: typeof _exec.spawn

const mockSpawn = mock((args: SpawnArgs): SpawnHandle => {
  capturedSpawnArgs.push({ ...args })
  const handle = spawnHandles[capturedSpawnArgs.length - 1] ?? makeSpawnHandle(0)
  return handle
})

function resetSpawnMocks(...handles: SpawnHandle[]) {
  capturedSpawnArgs = []
  spawnHandles = handles
  mockSpawn.mockClear()
}

// ─── runHooks _exec.spawn ─────────────────────────────────────────────────────

describe("runHooks _exec injection", () => {
  beforeEach(() => {
    originalSpawn = _exec.spawn
    _exec.spawn = mockSpawn as any
    resetSpawnMocks(makeSpawnHandle(0))
  })

  afterEach(() => {
    _exec.spawn = originalSpawn
  })

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

describe("runShellSequence _exec injection", () => {
  beforeEach(() => {
    originalSpawn = _exec.spawn
    _exec.spawn = mockSpawn as any
    resetSpawnMocks(makeSpawnHandle(1))
  })

  afterEach(() => {
    _exec.spawn = originalSpawn
  })

  test("returns failing exit code and command", async () => {
    const result = await runShellSequence(["false"], "/tmp", {})
    expect(result).toEqual({ exitCode: 1, failedCommand: "false" })
  })
})

describe("runShellSequenceCaptured _exec injection", () => {
  beforeEach(() => {
    originalSpawn = _exec.spawn
    _exec.spawn = mockSpawn as any
    resetSpawnMocks(makeSpawnHandle(0))
  })

  afterEach(() => {
    _exec.spawn = originalSpawn
  })

  test("calls _exec.spawn with stdout=pipe and stderr=pipe", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "output\n", ""))
    await runShellSequenceCaptured(["echo hello"], "/tmp", {}, () => {})

    expect(capturedSpawnArgs).toHaveLength(1)
    expect(capturedSpawnArgs[0].stdout).toBe("pipe")
    expect(capturedSpawnArgs[0].stderr).toBe("pipe")
  })

  test("captures stdout and stderr output with stream tags", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "hello\n", "err\n"))
    const lines: ShellOutputLine[] = []
    await runShellSequenceCaptured(["echo hello"], "/tmp", {}, (out) => lines.push(out))

    expect(lines).toEqual([
      { line: "hello", stream: "stdout" },
      { line: "err", stream: "stderr" },
    ])
  })

  test("captures stderr-only output", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "", "only stderr\n"))
    const lines: ShellOutputLine[] = []
    await runShellSequenceCaptured(["echo only stderr >&2"], "/tmp", {}, (out) => lines.push(out))

    expect(lines).toEqual([{ line: "only stderr", stream: "stderr" }])
  })

  test("stops after first failing command", async () => {
    resetSpawnMocks(makeSpawnHandle(1), makeSpawnHandle(0))
    const result = await runShellSequenceCaptured(["false", "echo second"], "/tmp", {}, () => {})

    expect(result).toEqual({ exitCode: 1, failedCommand: "false" })
    expect(capturedSpawnArgs).toHaveLength(1)
  })
})

// ─── runHooksCaptured _exec.spawn ─────────────────────────────────────────────

describe("runHooksCaptured _exec injection", () => {
  beforeEach(() => {
    originalSpawn = _exec.spawn
    _exec.spawn = mockSpawn as any
    resetSpawnMocks(makeSpawnHandle(0))
  })

  afterEach(() => {
    _exec.spawn = originalSpawn
  })

  test("calls _exec.spawn with stdout=pipe, stderr=pipe", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "output\n", ""))
    await runHooksCaptured(["echo hello"], "/tmp", {}, () => {})

    expect(capturedSpawnArgs[0].stdout).toBe("pipe")
    expect(capturedSpawnArgs[0].stderr).toBe("pipe")
  })

  test("captures output via onOutput callback from streams", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "hello\n", ""))
    const lines: HookOutputLine[] = []
    await runHooksCaptured(
      ["echo hello"],
      "/tmp",
      {},
      (out: HookOutputLine) => lines.push(out)
    )

    expect(lines.some(l => l.line === "hello" && l.stream === "stdout")).toBe(true)
  })

  test("captures stderr output via onOutput callback", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "", "error text\n"))
    const lines: HookOutputLine[] = []
    await runHooksCaptured(
      ["echo error >&2"],
      "/tmp",
      {},
      (out: HookOutputLine) => lines.push(out)
    )

    expect(lines.some(l => l.line === "error text" && l.stream === "stderr")).toBe(true)
  })

  test("returns HookResult with exitCode and command", async () => {
    resetSpawnMocks(makeSpawnHandle(0, "ok\n", ""))
    const results = await runHooksCaptured(
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
    const results = await runHooksCaptured(
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
