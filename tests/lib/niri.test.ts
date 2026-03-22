import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import type { NiriWindow, NiriCmdResult } from "@/lib/niri"

// ─── Mock setup ───────────────────────────────────────────────────────────────
// Strategy: import niri module with cache-busting, then mutate _exec.run.
// _exec is a plain exported object — its properties are mutable in ESM.
// All 7 shell-calling functions call _exec.run, so replacing it intercepts all.
//
// For snapshotWindowIds: the _listWindows injectable parameter is used instead
// of _exec.run interception — cleaner and avoids Zod parse overhead.

// @ts-ignore — query param cache-busting for bun module cache
const niriModule = await import("@/lib/niri?niri-test")

const {
  isNiriRunning,
  listNiriWindows,
  listNiriWorkspaces,
  setNiriWorkspaceName,
  unsetNiriWorkspaceName,
  moveWindowToWorkspace,
  niriSpawn,
  focusNiriWorkspace,
  focusNiriWorkspaceDown,
  snapshotWindowIds,
  focusNiriWindow,
  setNiriColumnWidth,
  consumeOrExpelWindowLeft,
  niriSpawnSh,
  _exec,
} = niriModule

// Captured args and configurable result for _exec.run
let capturedArgs: string[] = []
let mockResult: NiriCmdResult = { exitCode: 0, stdout: "[]" }

const mockRun = mock(async (args: string[]): Promise<NiriCmdResult> => {
  capturedArgs = [...args]
  return mockResult
})

// Mutate the object property — this works because object properties are mutable
// even when module exports are sealed
_exec.run = mockRun

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetMocks(exitCode = 0, stdout = "[]") {
  capturedArgs = []
  mockResult = { exitCode, stdout }
  mockRun.mockClear()
}

const noopSleep = () => Promise.resolve()

// ─── isNiriRunning ────────────────────────────────────────────────────────────
// Pure env-var check — no shell calls needed.

describe("isNiriRunning", () => {
  let originalNiriSocket: string | undefined

  beforeEach(() => {
    originalNiriSocket = process.env.NIRI_SOCKET
  })

  afterEach(() => {
    if (originalNiriSocket === undefined) {
      delete process.env.NIRI_SOCKET
    } else {
      process.env.NIRI_SOCKET = originalNiriSocket
    }
  })

  test("returns true when NIRI_SOCKET is set", async () => {
    process.env.NIRI_SOCKET = "/run/user/1000/niri.sock"
    expect(await isNiriRunning()).toBe(true)
  })

  test("returns false when NIRI_SOCKET is unset", async () => {
    delete process.env.NIRI_SOCKET
    expect(await isNiriRunning()).toBe(false)
  })

  test("returns false when NIRI_SOCKET is empty string", async () => {
    process.env.NIRI_SOCKET = ""
    expect(await isNiriRunning()).toBe(false)
  })
})

// ─── listNiriWindows ──────────────────────────────────────────────────────────

describe("listNiriWindows", () => {
  beforeEach(() => resetMocks())

  test("parses valid JSON window array", async () => {
    const windows = [
      {
        id: 1,
        title: "Terminal",
        app_id: "ghostty",
        pid: 12345,
        workspace_id: 2,
        is_focused: true,
        is_floating: false,
        is_urgent: false,
      },
      {
        id: 2,
        title: null,
        app_id: null,
        pid: null,
        workspace_id: null,
        is_focused: false,
        is_floating: false,
        is_urgent: false,
      },
    ]
    mockResult = { exitCode: 0, stdout: JSON.stringify(windows) }

    const result = await listNiriWindows()

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[0].app_id).toBe("ghostty")
    expect(result[0].pid).toBe(12345)
    expect(result[1].app_id).toBeNull()
    expect(result[1].pid).toBeNull()
    expect(capturedArgs).toContain("-j")
    expect(capturedArgs).toContain("windows")
  })

  test("returns empty array on non-zero exit code", async () => {
    mockResult = { exitCode: 1, stdout: "error: NIRI_SOCKET not set" }

    const result = await listNiriWindows()

    expect(result).toEqual([])
  })

  test("returns empty array on invalid JSON", async () => {
    mockResult = { exitCode: 0, stdout: "not-json" }

    const result = await listNiriWindows()

    expect(result).toEqual([])
  })

  test("returns empty array on Zod validation failure", async () => {
    // Missing required boolean fields
    mockResult = { exitCode: 0, stdout: JSON.stringify([{ id: 1 }]) }

    const result = await listNiriWindows()

    expect(result).toEqual([])
  })

  test("accepts windows with nullable optional fields as null", async () => {
    const windows = [
      {
        id: 42,
        title: null,
        app_id: null,
        pid: null,
        workspace_id: null,
        is_focused: false,
        is_floating: false,
        is_urgent: false,
      },
    ]
    mockResult = { exitCode: 0, stdout: JSON.stringify(windows) }

    const result = await listNiriWindows()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(42)
    expect(result[0].title).toBeNull()
  })
})

// ─── listNiriWorkspaces ───────────────────────────────────────────────────────

describe("listNiriWorkspaces", () => {
  beforeEach(() => resetMocks())

  test("parses valid JSON workspace array", async () => {
    const workspaces = [
      {
        id: 1,
        idx: 0,
        name: "main",
        output: "DP-1",
        is_urgent: false,
        is_active: true,
        is_focused: true,
        active_window_id: 5,
      },
    ]
    mockResult = { exitCode: 0, stdout: JSON.stringify(workspaces) }

    const result = await listNiriWorkspaces()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].name).toBe("main")
    expect(result[0].is_focused).toBe(true)
    expect(result[0].active_window_id).toBe(5)
    expect(capturedArgs).toContain("-j")
    expect(capturedArgs).toContain("workspaces")
  })

  test("returns empty array on non-zero exit code", async () => {
    mockResult = { exitCode: 1, stdout: "" }

    const result = await listNiriWorkspaces()

    expect(result).toEqual([])
  })

  test("accepts workspaces with nullable optional fields as null", async () => {
    const workspaces = [
      {
        id: 2,
        idx: 1,
        name: null,
        output: null,
        is_urgent: false,
        is_active: false,
        is_focused: false,
        active_window_id: null,
      },
    ]
    mockResult = { exitCode: 0, stdout: JSON.stringify(workspaces) }

    const result = await listNiriWorkspaces()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBeNull()
    expect(result[0].active_window_id).toBeNull()
  })
})

// ─── setNiriWorkspaceName ─────────────────────────────────────────────────────

describe("setNiriWorkspaceName", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action set-workspace-name with name only", async () => {
    await setNiriWorkspaceName("my-feature")

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("set-workspace-name")
    expect(capturedArgs).toContain("my-feature")
    expect(capturedArgs).not.toContain("--workspace")
  })

  test("includes --workspace flag when workspaceRef is provided as string", async () => {
    await setNiriWorkspaceName("new-name", "old-name")

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("set-workspace-name")
    expect(capturedArgs).toContain("new-name")
    expect(capturedArgs).toContain("--workspace")
    expect(capturedArgs).toContain("old-name")
  })

  test("includes --workspace flag when workspaceRef is provided as number (index)", async () => {
    await setNiriWorkspaceName("new-name", 3)

    expect(capturedArgs).toContain("--workspace")
    expect(capturedArgs).toContain("3")
  })
})

// ─── moveWindowToWorkspace ────────────────────────────────────────────────────

describe("moveWindowToWorkspace", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action move-window-to-workspace with ref and --window-id", async () => {
    await moveWindowToWorkspace(42, "my-workspace")

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("move-window-to-workspace")
    expect(capturedArgs).toContain("my-workspace")
    expect(capturedArgs).toContain("--window-id")
    expect(capturedArgs).toContain("42")
  })

  test("accepts numeric workspace reference (index)", async () => {
    await moveWindowToWorkspace(10, 2)

    expect(capturedArgs).toContain("move-window-to-workspace")
    expect(capturedArgs).toContain("2")
    expect(capturedArgs).toContain("--window-id")
    expect(capturedArgs).toContain("10")
  })
})

// ─── niriSpawn ────────────────────────────────────────────────────────────────

describe("niriSpawn", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action spawn -- with command array", async () => {
    await niriSpawn(["ghostty", "-e", "tmux"])

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("spawn")
    expect(capturedArgs).toContain("--")
    expect(capturedArgs).toContain("ghostty")
    expect(capturedArgs).toContain("-e")
    expect(capturedArgs).toContain("tmux")
  })

  test("passes single-element command array", async () => {
    await niriSpawn(["foot"])

    expect(capturedArgs).toContain("spawn")
    expect(capturedArgs).toContain("--")
    expect(capturedArgs).toContain("foot")
  })
})

// ─── focusNiriWorkspace ───────────────────────────────────────────────────────

describe("focusNiriWorkspace", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action focus-workspace with string ref", async () => {
    await focusNiriWorkspace("main")

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("focus-workspace")
    expect(capturedArgs).toContain("main")
  })

  test("calls niri msg action focus-workspace with numeric ref (index)", async () => {
    await focusNiriWorkspace(2)

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("focus-workspace")
    expect(capturedArgs).toContain("2")
  })
})

// ─── snapshotWindowIds ────────────────────────────────────────────────────────
// These tests use _listWindows injection — no _exec.run interception needed.

describe("snapshotWindowIds", () => {
  test("returns new window IDs that appear after spawn", async () => {
    const beforeWindows: NiriWindow[] = [
      { id: 1, is_focused: false, is_floating: false, is_urgent: false },
    ]
    const afterWindows: NiriWindow[] = [
      { id: 1, is_focused: false, is_floating: false, is_urgent: false },
      { id: 2, is_focused: true, is_floating: false, is_urgent: false },
    ]

    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      // First call: before snapshot; subsequent: new window appeared
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
    expect(listFn).toHaveBeenCalledTimes(2) // 1 before + 1 after poll
  })

  test("returns empty array on timeout when no new windows appear", async () => {
    const singleWindow: NiriWindow[] = [
      { id: 1, is_focused: false, is_floating: false, is_urgent: false },
    ]

    // Always returns the same window — no new windows appear
    const listFn = mock(async () => singleWindow)
    const spawnFn = mock(async () => {})

    const result = await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 1,   // 1ms — expires after first sleep
      initialDelayMs: 0,
    })

    expect(result).toEqual([])
  })

  test("uses injectable _sleep for timing control (no real delays)", async () => {
    // trackingSleep doesn't actually wait — proves _sleep injection is used
    const sleepCalls: number[] = []
    const trackingSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const singleWindow: NiriWindow[] = [
      { id: 1, is_focused: false, is_floating: false, is_urgent: false },
    ]
    const listFn = mock(async () => singleWindow)
    const spawnFn = mock(async () => {})

    const startMs = Date.now()
    await snapshotWindowIds(spawnFn, {
      _sleep: trackingSleep,
      _listWindows: listFn,
      timeoutMs: 1,  // 1ms → immediately times out
      initialDelayMs: 100,
    })
    const elapsed = Date.now() - startMs

    // Completes nearly instantly because trackingSleep has no real delay
    expect(elapsed).toBeLessThan(500)
  })

  test("implements exponential backoff up to maxDelayMs", async () => {
    const sleepCalls: number[] = []
    const trackingSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const INITIAL = 50
    const MAX = 400

    // Return new window on the 5th listFn call (3 polls with no new window, then new on 4th poll)
    let callCount = 0
    const listFn = mock(async () => {
      callCount++
      if (callCount < 5) {
        return [{ id: 1, is_focused: false, is_floating: false, is_urgent: false } as NiriWindow]
      }
      return [
        { id: 1, is_focused: false, is_floating: false, is_urgent: false } as NiriWindow,
        { id: 2, is_focused: true, is_floating: false, is_urgent: false } as NiriWindow,
      ]
    })

    const spawnFn = mock(async () => {})

    await snapshotWindowIds(spawnFn, {
      _sleep: trackingSleep,
      _listWindows: listFn,
      timeoutMs: 60_000,
      initialDelayMs: INITIAL,
      maxDelayMs: MAX,
    })

    // 3 failed polls + 1 successful = 4 sleeps before the successful poll
    // sleepCalls: [50, 100, 200, (400 would be next but we return before)]
    expect(sleepCalls.length).toBeGreaterThanOrEqual(3)
    expect(sleepCalls[0]).toBe(INITIAL)     // 50
    expect(sleepCalls[1]).toBe(INITIAL * 2) // 100
    expect(sleepCalls[2]).toBe(INITIAL * 4) // 200
    // All delays must not exceed maxDelayMs
    for (const delay of sleepCalls) {
      expect(delay).toBeLessThanOrEqual(MAX)
    }
  })

  test("calls spawnFn after the before-snapshot", async () => {
    const callOrder: string[] = []

    const listFn = mock(async () => {
      callOrder.push("list")
      return [{ id: 1, is_focused: false, is_floating: false, is_urgent: false } as NiriWindow]
    })

    const spawnFn = mock(async () => {
      callOrder.push("spawn")
    })

    await snapshotWindowIds(spawnFn, {
      _sleep: noopSleep,
      _listWindows: listFn,
      timeoutMs: 1, // immediate timeout after first poll
      initialDelayMs: 0,
    })

    // Before-snapshot is the first call, spawn happens after that
    expect(callOrder[0]).toBe("list")
    expect(callOrder[1]).toBe("spawn")
  })
})

// ─── focusNiriWindow ──────────────────────────────────────────────────────────

describe("focusNiriWindow", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action focus-window --id with windowId", async () => {
    await focusNiriWindow(42)

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("focus-window")
    expect(capturedArgs).toContain("--id")
    expect(capturedArgs).toContain("42")
  })
})

// ─── setNiriColumnWidth ───────────────────────────────────────────────────────

describe("setNiriColumnWidth", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action set-column-width with change string", async () => {
    await setNiriColumnWidth("50%")

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("set-column-width")
    expect(capturedArgs).toContain("50%")
  })
})

// ─── consumeOrExpelWindowLeft ─────────────────────────────────────────────────

describe("consumeOrExpelWindowLeft", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action consume-or-expel-window-left with --id when windowId provided", async () => {
    await consumeOrExpelWindowLeft(99)

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("consume-or-expel-window-left")
    expect(capturedArgs).toContain("--id")
    expect(capturedArgs).toContain("99")
  })

  test("calls niri msg action consume-or-expel-window-left without --id when no windowId provided", async () => {
    await consumeOrExpelWindowLeft()

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("consume-or-expel-window-left")
    expect(capturedArgs).not.toContain("--id")
  })
})

// ─── niriSpawnSh ──────────────────────────────────────────────────────────────

describe("niriSpawnSh", () => {
  beforeEach(() => resetMocks())

  test("calls niri msg action spawn-sh -- with shell command string", async () => {
    await niriSpawnSh("cd /tmp && ghostty")

    expect(capturedArgs).toContain("action")
    expect(capturedArgs).toContain("spawn-sh")
    expect(capturedArgs).toContain("--")
    expect(capturedArgs).toContain("cd /tmp && ghostty")
  })
})

// ─── NiriCommands interface type-check ────────────────────────────────────────
// Structural check: assign module exports to NiriCommands — TypeScript will
// catch missing or mismatched function signatures at bun run typecheck time.

describe("NiriCommands interface", () => {
  test("module exports satisfy NiriCommands interface (structural check)", () => {
    const commands: import("@/lib/niri").NiriCommands = {
      isNiriRunning,
      listNiriWindows,
      listNiriWorkspaces,
      setNiriWorkspaceName,
      unsetNiriWorkspaceName,
      moveWindowToWorkspace,
      niriSpawn,
      focusNiriWorkspace,
      focusNiriWorkspaceDown,
      snapshotWindowIds,
      focusNiriWindow,
      setNiriColumnWidth,
      consumeOrExpelWindowLeft,
      niriSpawnSh,
    }
    // Runtime check: all 14 functions are present and callable
    expect(typeof commands.isNiriRunning).toBe("function")
    expect(typeof commands.listNiriWindows).toBe("function")
    expect(typeof commands.listNiriWorkspaces).toBe("function")
    expect(typeof commands.setNiriWorkspaceName).toBe("function")
    expect(typeof commands.unsetNiriWorkspaceName).toBe("function")
    expect(typeof commands.moveWindowToWorkspace).toBe("function")
    expect(typeof commands.niriSpawn).toBe("function")
    expect(typeof commands.focusNiriWorkspace).toBe("function")
    expect(typeof commands.focusNiriWorkspaceDown).toBe("function")
    expect(typeof commands.snapshotWindowIds).toBe("function")
    expect(typeof commands.focusNiriWindow).toBe("function")
    expect(typeof commands.setNiriColumnWidth).toBe("function")
    expect(typeof commands.consumeOrExpelWindowLeft).toBe("function")
    expect(typeof commands.niriSpawnSh).toBe("function")
  })
})

// ─── Phase 20 mock.module pattern demo ───────────────────────────────────────
// This demonstrates that @/lib/niri can be fully replaced via mock.module()
// for consumer tests (Phase 20 niri-integration). The module is flat exported
// async functions with no class instances or side-effects on import.
//
// Example Phase 20 usage:
//   mock.module("@/lib/niri", () => ({
//     isNiriRunning: mock(async () => true),
//     listNiriWindows: mock(async () => []),
//     listNiriWorkspaces: mock(async () => []),
//     setNiriWorkspaceName: mock(async () => {}),
//     moveWindowToWorkspace: mock(async () => {}),
//     niriSpawn: mock(async () => {}),
//     focusNiriWorkspace: mock(async () => {}),
//     snapshotWindowIds: mock(async () => []),
//   }))
