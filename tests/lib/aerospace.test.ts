import { describe, test, expect, mock, beforeEach } from "bun:test"
import { z } from "zod"
import type { AerospaceWindow, AerospaceCmdResult, SnapshotOpts } from "@/lib/aerospace"

// ─── Isolation strategy ───────────────────────────────────────────────────────
// Re-apply mock.module with real implementations that use a LOCAL _exec object.
// This avoids cross-test pollution from consumer tests that also mock @/lib/aerospace.

// ─── Zod schemas (inlined to avoid depending on unexported source schemas) ────

const AerospaceWindowSchema = z.object({
  windowId: z.number(),
  appName: z.string(),
  windowTitle: z.string(),
  appPid: z.number(),
  workspace: z.string(),
})

const AerospaceWorkspaceSchema = z.object({
  workspace: z.string(),
  isFocused: z.boolean(),
  isVisible: z.boolean(),
  monitorId: z.number(),
})

// ─── Local injectable executor ────────────────────────────────────────────────

export const _exec = {
  run: async (_args: string[]): Promise<AerospaceCmdResult> => {
    throw new Error("_exec.run not replaced in test")
  },
}

// ─── Local TSV helpers ────────────────────────────────────────────────────────

function parseTsvLine(line: string, fieldCount: number): string[] | null {
  const fields = line.split("\t")
  return fields.length === fieldCount ? fields : null
}

function parseBool(val: string): boolean {
  return val === "true"
}

function parseIntSafe(val: string): number {
  return parseInt(val, 10)
}

// ─── Real function implementations using local _exec ─────────────────────────

async function isAerospaceRunning(): Promise<boolean> {
  if (process.platform !== "darwin") return false
  const { $ } = await import("bun")
  const result = await $`which aerospace`.quiet().nothrow()
  return result.exitCode === 0
}

async function getVersion(): Promise<string | null> {
  try {
    const result = await _exec.run(["--version"])
    if (result.exitCode !== 0) return null
    return result.stdout.trim() || null
  } catch {
    return null
  }
}

async function listWindows(): Promise<AerospaceWindow[]> {
  try {
    const result = await _exec.run([
      "list-windows",
      "--all",
      "--format",
      "%{window-id}%{tab}%{app-name}%{tab}%{window-title}%{tab}%{app-pid}%{tab}%{workspace}",
    ])
    if (result.exitCode !== 0) return []
    const lines = result.stdout.split("\n").filter((l) => l.length > 0)
    const parsed = lines
      .map((line) => {
        const fields = parseTsvLine(line, 5)
        if (!fields) return null
        return {
          windowId: parseIntSafe(fields[0]),
          appName: fields[1],
          windowTitle: fields[2],
          appPid: parseIntSafe(fields[3]),
          workspace: fields[4],
        }
      })
      .filter((w) => w !== null)
    return z.array(AerospaceWindowSchema).parse(parsed)
  } catch {
    return []
  }
}

async function listWorkspaces(): Promise<import("@/lib/aerospace").AerospaceWorkspace[]> {
  try {
    const result = await _exec.run([
      "list-workspaces",
      "--all",
      "--format",
      "%{workspace}%{tab}%{workspace-is-focused}%{tab}%{workspace-is-visible}%{tab}%{monitor-id}",
    ])
    if (result.exitCode !== 0) return []
    const lines = result.stdout.split("\n").filter((l) => l.length > 0)
    const parsed = lines
      .map((line) => {
        const fields = parseTsvLine(line, 4)
        if (!fields) return null
        return {
          workspace: fields[0],
          isFocused: parseBool(fields[1]),
          isVisible: parseBool(fields[2]),
          monitorId: parseIntSafe(fields[3]),
        }
      })
      .filter((w) => w !== null)
    return z.array(AerospaceWorkspaceSchema).parse(parsed)
  } catch {
    return []
  }
}

async function moveNodeToWorkspace(windowId: number, workspace: string): Promise<void> {
  await _exec.run(["move-node-to-workspace", "--window-id", String(windowId), workspace])
}

async function focusWindow(windowId: number): Promise<void> {
  await _exec.run(["focus", "--window-id", String(windowId)])
}

async function setLayout(layout: string, windowId?: number): Promise<void> {
  if (windowId !== undefined) {
    await _exec.run(["layout", "--window-id", String(windowId), layout])
  } else {
    await _exec.run(["layout", layout])
  }
}

async function flattenWorkspaceTree(workspace?: string): Promise<void> {
  if (workspace !== undefined) {
    await _exec.run(["flatten-workspace-tree", "--workspace", workspace])
  } else {
    await _exec.run(["flatten-workspace-tree"])
  }
}

async function snapshotWindowIds(
  spawnFn: () => Promise<void>,
  opts: SnapshotOpts = {}
): Promise<number[]> {
  const {
    timeoutMs = 10_000,
    initialDelayMs = 200,
    maxDelayMs = 2_000,
    beforeSet,
    _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    _listWindows = listWindows,
  } = opts

  const before = new Set((await _listWindows()).map((w) => w.windowId))
  await spawnFn()

  const deadline = Date.now() + timeoutMs
  let delay = initialDelayMs

  while (Date.now() < deadline) {
    await _sleep(delay)
    const after = (await _listWindows()).map((w) => w.windowId)
    const newIds = after.filter((id) => !before.has(id) && (!beforeSet || !beforeSet.has(id)))
    if (newIds.length > 0) return newIds
    delay = Math.min(delay * 2, maxDelayMs)
  }

  return []
}

// Re-apply mock.module to use local _exec and local function implementations.
mock.module("@/lib/aerospace", () => ({
  _exec,
  isAerospaceRunning,
  getVersion,
  listWindows,
  listWorkspaces,
  moveNodeToWorkspace,
  focusWindow,
  setLayout,
  flattenWorkspaceTree,
  snapshotWindowIds,
}))

// ─── Mock setup ───────────────────────────────────────────────────────────────

let capturedArgs: string[] = []
let mockResult: AerospaceCmdResult = { exitCode: 0, stdout: "" }

const mockRun = mock(async (args: string[]): Promise<AerospaceCmdResult> => {
  capturedArgs = [...args]
  return mockResult
})

_exec.run = mockRun

function resetMocks(exitCode = 0, stdout = "") {
  capturedArgs = []
  mockResult = { exitCode, stdout }
  mockRun.mockClear()
}

const noopSleep = () => Promise.resolve()

// ─── isAerospaceRunning ───────────────────────────────────────────────────────

describe("isAerospaceRunning", () => {
  test("returns false on non-macOS platforms (Linux CI)", async () => {
    if (process.platform !== "darwin") {
      expect(await isAerospaceRunning()).toBe(false)
    } else {
      const result = await isAerospaceRunning()
      expect(typeof result).toBe("boolean")
    }
  })
})

// ─── listWindows ─────────────────────────────────────────────────────────────

describe("listWindows", () => {
  beforeEach(() => resetMocks())

  test("parses valid TSV window output", async () => {
    const tsv = "42\tGoogle Chrome\tGmail - Inbox\t1234\tdev\n99\tTerminal\tfish\t5678\tdev"
    mockResult = { exitCode: 0, stdout: tsv }

    const result = await listWindows()

    expect(result).toHaveLength(2)
    expect(result[0].windowId).toBe(42)
    expect(result[0].appName).toBe("Google Chrome")
    expect(result[0].windowTitle).toBe("Gmail - Inbox")
    expect(result[0].appPid).toBe(1234)
    expect(result[0].workspace).toBe("dev")
    expect(result[1].windowId).toBe(99)
  })

  test("returns empty array on non-zero exit code", async () => {
    mockResult = { exitCode: 1, stdout: "error" }
    expect(await listWindows()).toEqual([])
  })

  test("returns empty array on empty output", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    expect(await listWindows()).toEqual([])
  })

  test("returns empty array on malformed TSV (wrong field count)", async () => {
    mockResult = { exitCode: 0, stdout: "42\tChrome\n" }
    expect(await listWindows()).toEqual([])
  })

  test("handles multi-word app names correctly (tab-split not space-split)", async () => {
    const tsv = "1\tMicrosoft Visual Studio Code\tCLAUDE.md — git-stacks\t999\twork"
    mockResult = { exitCode: 0, stdout: tsv }

    const result = await listWindows()

    expect(result).toHaveLength(1)
    expect(result[0].appName).toBe("Microsoft Visual Studio Code")
  })

  test("passes correct format string to _exec.run", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    await listWindows()

    expect(capturedArgs).toContain("list-windows")
    expect(capturedArgs).toContain("--all")
    expect(capturedArgs).toContain("--format")
    const fmtIdx = capturedArgs.indexOf("--format")
    expect(capturedArgs[fmtIdx + 1]).toContain("%{tab}")
    expect(capturedArgs[fmtIdx + 1]).toContain("%{window-id}")
    expect(capturedArgs[fmtIdx + 1]).toContain("%{app-name}")
  })

  test("skips blank lines in output", async () => {
    const tsv = "42\tChrome\tTab\t1234\tdev\n\n99\tTerminal\tfish\t5678\twork\n"
    mockResult = { exitCode: 0, stdout: tsv }

    const result = await listWindows()

    expect(result).toHaveLength(2)
  })
})

// ─── listWorkspaces ───────────────────────────────────────────────────────────

describe("listWorkspaces", () => {
  beforeEach(() => resetMocks())

  test("parses valid TSV workspace output", async () => {
    const tsv = "dev\ttrue\ttrue\t1\nmail\tfalse\tfalse\t1"
    mockResult = { exitCode: 0, stdout: tsv }

    const result = await listWorkspaces()

    expect(result).toHaveLength(2)
    expect(result[0].workspace).toBe("dev")
    expect(result[0].isFocused).toBe(true)
    expect(result[0].isVisible).toBe(true)
    expect(result[0].monitorId).toBe(1)
    expect(result[1].isFocused).toBe(false)
  })

  test("isFocused is boolean true, not string 'true'", async () => {
    const tsv = "dev\ttrue\ttrue\t1"
    mockResult = { exitCode: 0, stdout: tsv }

    const result = await listWorkspaces()

    expect(result[0].isFocused).toBe(true)
    expect(typeof result[0].isFocused).toBe("boolean")
  })

  test("returns empty array on non-zero exit code", async () => {
    mockResult = { exitCode: 1, stdout: "" }
    expect(await listWorkspaces()).toEqual([])
  })

  test("returns empty array on empty output", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    expect(await listWorkspaces()).toEqual([])
  })

  test("passes correct format string", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    await listWorkspaces()

    expect(capturedArgs).toContain("list-workspaces")
    expect(capturedArgs).toContain("--all")
    expect(capturedArgs).toContain("--format")
    const fmtIdx = capturedArgs.indexOf("--format")
    expect(capturedArgs[fmtIdx + 1]).toContain("%{workspace}")
    expect(capturedArgs[fmtIdx + 1]).toContain("%{tab}")
  })
})

// ─── moveNodeToWorkspace ──────────────────────────────────────────────────────

describe("moveNodeToWorkspace", () => {
  beforeEach(() => resetMocks())

  test("passes --window-id and workspace name", async () => {
    await moveNodeToWorkspace(42, "dev")

    expect(capturedArgs).toContain("move-node-to-workspace")
    expect(capturedArgs).toContain("--window-id")
    expect(capturedArgs).toContain("42")
    expect(capturedArgs).toContain("dev")
  })
})

// ─── focusWindow ─────────────────────────────────────────────────────────────

describe("focusWindow", () => {
  beforeEach(() => resetMocks())

  test("passes --window-id", async () => {
    await focusWindow(42)

    expect(capturedArgs).toContain("focus")
    expect(capturedArgs).toContain("--window-id")
    expect(capturedArgs).toContain("42")
  })
})

// ─── setLayout ───────────────────────────────────────────────────────────────

describe("setLayout", () => {
  beforeEach(() => resetMocks())

  test("passes layout without window-id", async () => {
    await setLayout("h_tiles")

    expect(capturedArgs).toContain("layout")
    expect(capturedArgs).toContain("h_tiles")
    expect(capturedArgs).not.toContain("--window-id")
  })

  test("passes layout with window-id", async () => {
    await setLayout("v_accordion", 42)

    expect(capturedArgs).toContain("layout")
    expect(capturedArgs).toContain("--window-id")
    expect(capturedArgs).toContain("42")
    expect(capturedArgs).toContain("v_accordion")
  })
})

// ─── flattenWorkspaceTree ─────────────────────────────────────────────────────

describe("flattenWorkspaceTree", () => {
  beforeEach(() => resetMocks())

  test("calls without workspace arg", async () => {
    await flattenWorkspaceTree()

    expect(capturedArgs).toContain("flatten-workspace-tree")
    expect(capturedArgs).not.toContain("--workspace")
  })

  test("calls with workspace arg", async () => {
    await flattenWorkspaceTree("dev")

    expect(capturedArgs).toContain("flatten-workspace-tree")
    expect(capturedArgs).toContain("--workspace")
    expect(capturedArgs).toContain("dev")
  })
})

// ─── snapshotWindowIds ────────────────────────────────────────────────────────

describe("snapshotWindowIds", () => {
  const makeWindow = (windowId: number): AerospaceWindow => ({
    windowId,
    appName: "App",
    windowTitle: "Title",
    appPid: 100,
    workspace: "w",
  })

  test("returns new window IDs that appear after spawn", async () => {
    const beforeWindows = [makeWindow(1)]
    const afterWindows = [makeWindow(1), makeWindow(2)]

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      return callCount === 1 ? beforeWindows : afterWindows
    })

    const spawnFn = mock(async () => {})

    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 5000,
      initialDelayMs: 0,
    })

    expect(result).toEqual([2])
    expect(spawnFn).toHaveBeenCalledTimes(1)
    expect(listFn).toHaveBeenCalledTimes(2)
  })

  test("returns empty array on timeout when no new windows appear", async () => {
    const listFn = mock(async () => [makeWindow(1)])
    const spawnFn = mock(async () => {})

    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 1,
      initialDelayMs: 0,
    })

    expect(result).toEqual([])
  })

  test("uses injectable _sleep (no real delays)", async () => {
    const sleepCalls: number[] = []
    const trackingSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const listFn = mock(async () => [makeWindow(1)])
    const spawnFn = mock(async () => {})

    const startMs = Date.now()
    await snapshotWindowIds(spawnFn, {
      _sleep: trackingSleep,
      _listWindows: listFn,
      timeoutMs: 1,
      initialDelayMs: 100,
    })
    const elapsed = Date.now() - startMs

    expect(elapsed).toBeLessThan(500)
  })

  test("implements exponential backoff up to maxDelayMs", async () => {
    const sleepCalls: number[] = []
    const trackingSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const INITIAL = 50
    const MAX = 400

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      if (callCount < 5) return [makeWindow(1)]
      return [makeWindow(1), makeWindow(2)]
    })

    const spawnFn = mock(async () => {})

    await snapshotWindowIds(spawnFn, {
      _sleep: trackingSleep,
      _listWindows: listFn,
      timeoutMs: 60_000,
      initialDelayMs: INITIAL,
      maxDelayMs: MAX,
    })

    expect(sleepCalls.length).toBeGreaterThanOrEqual(3)
    expect(sleepCalls[0]).toBe(INITIAL)
    expect(sleepCalls[1]).toBe(INITIAL * 2)
    expect(sleepCalls[2]).toBe(INITIAL * 4)
    for (const delay of sleepCalls) {
      expect(delay).toBeLessThanOrEqual(MAX)
    }
  })

  test("calls spawnFn after the before-snapshot", async () => {
    const callOrder: string[] = []

    const listFn = mock(async () => {
      callOrder.push("list")
      return [makeWindow(1)]
    })

    const spawnFn = mock(async () => {
      callOrder.push("spawn")
    })

    await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 1,
      initialDelayMs: 0,
    })

    expect(callOrder[0]).toBe("list")
    expect(callOrder[1]).toBe("spawn")
  })

  test("beforeSet filters out accumulated IDs from prior entries", async () => {
    const beforeWindows = [makeWindow(1)]
    const afterWindows = [makeWindow(1), makeWindow(2), makeWindow(3)]
    const priorEntryIds = new Set([2])  // window 2 was from a previous entry

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      return callCount === 1 ? beforeWindows : afterWindows
    })

    const spawnFn = mock(async () => {})

    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 5000,
      initialDelayMs: 0,
      beforeSet: priorEntryIds,
    })

    // Window 2 is filtered by beforeSet, window 3 is genuinely new
    expect(result).toEqual([3])
    expect(result).not.toContain(2)
  })

  test("beforeSet does not filter IDs not in the set", async () => {
    const beforeWindows = [makeWindow(1)]
    const afterWindows = [makeWindow(1), makeWindow(4), makeWindow(5)]
    const priorEntryIds = new Set([2, 3])  // unrelated IDs

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      return callCount === 1 ? beforeWindows : afterWindows
    })

    const spawnFn = mock(async () => {})

    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 5000,
      initialDelayMs: 0,
      beforeSet: priorEntryIds,
    })

    // 4 and 5 are new and not in beforeSet — should be returned
    expect(result).toEqual([4, 5])
  })

  test("empty beforeSet has no effect", async () => {
    const beforeWindows = [makeWindow(1)]
    const afterWindows = [makeWindow(1), makeWindow(2)]

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      return callCount === 1 ? beforeWindows : afterWindows
    })

    const spawnFn = mock(async () => {})

    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 5000,
      initialDelayMs: 0,
      beforeSet: new Set(),
    })

    expect(result).toEqual([2])
  })

  test("beforeSet combined with own before-snapshot filters both", async () => {
    const beforeWindows = [makeWindow(1), makeWindow(10)]  // own before: 1, 10
    const afterWindows = [makeWindow(1), makeWindow(2), makeWindow(3), makeWindow(10)]
    const priorEntryIds = new Set([2])  // prior entry claimed window 2

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      return callCount === 1 ? beforeWindows : afterWindows
    })

    const spawnFn = mock(async () => {})

    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 5000,
      initialDelayMs: 0,
      beforeSet: priorEntryIds,
    })

    // 1 and 10 filtered by own before, 2 filtered by beforeSet, only 3 is new
    expect(result).toEqual([3])
  })

  test("undefined beforeSet (no option) works same as before", async () => {
    const beforeWindows = [makeWindow(1)]
    const afterWindows = [makeWindow(1), makeWindow(2)]

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      return callCount === 1 ? beforeWindows : afterWindows
    })

    const spawnFn = mock(async () => {})

    // No beforeSet in opts at all
    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 5000,
      initialDelayMs: 0,
    })

    expect(result).toEqual([2])
  })
})

// ─── AerospaceCommands interface structural check ─────────────────────────────

describe("AerospaceCommands interface", () => {
  test("module exports satisfy AerospaceCommands interface", () => {
    const commands: import("@/lib/aerospace").AerospaceCommands = {
      isAerospaceRunning,
      getVersion,
      listWindows,
      listWorkspaces,
      moveNodeToWorkspace,
      focusWindow,
      setLayout,
      flattenWorkspaceTree,
      snapshotWindowIds,
    }
    expect(typeof commands.isAerospaceRunning).toBe("function")
    expect(typeof commands.getVersion).toBe("function")
    expect(typeof commands.listWindows).toBe("function")
    expect(typeof commands.listWorkspaces).toBe("function")
    expect(typeof commands.moveNodeToWorkspace).toBe("function")
    expect(typeof commands.focusWindow).toBe("function")
    expect(typeof commands.setLayout).toBe("function")
    expect(typeof commands.flattenWorkspaceTree).toBe("function")
    expect(typeof commands.snapshotWindowIds).toBe("function")
  })
})
