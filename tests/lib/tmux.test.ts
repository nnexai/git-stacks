import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import type { CmdResult } from "@/lib/tmux"

// ─── Mock setup ───────────────────────────────────────────────────────────────
// Strategy: import tmux module with cache-busting, then mutate _exec.run.
// _exec is a plain exported object — its properties are mutable in ESM.
// All shell-calling functions call _exec.run, so replacing it intercepts all.

// @ts-ignore — query param cache-busting for bun module cache
const tmuxModule = await import("@/lib/tmux?tmux-test")

const {
  killTmuxSession,
  tmuxSessionExists,
  focusTmuxSession,
  createTmuxSession,
  openTmuxSession,
  getTmuxMainPane,
  addTmuxPane,
  sendToTmuxPane,
  focusTmuxPane,
  _exec,
} = tmuxModule

// Captured args and configurable result for _exec.run
let capturedArgs: string[] = []
let mockResult: CmdResult = { exitCode: 0, stdout: "" }

const mockRun = mock(async (args: string[]): Promise<CmdResult> => {
  capturedArgs = [...args]
  return mockResult
})

// Mutate the object property — works because object properties are mutable
// even when module exports are sealed
_exec.run = mockRun

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetMocks(exitCode = 0, stdout = "") {
  capturedArgs = []
  mockResult = { exitCode, stdout }
  mockRun.mockClear()
}

// ─── killTmuxSession ──────────────────────────────────────────────────────────

describe("killTmuxSession", () => {
  beforeEach(() => resetMocks())

  test("calls kill-session -t with session name", async () => {
    await killTmuxSession("my-workspace")

    expect(capturedArgs).toEqual(["kill-session", "-t", "my-workspace"])
  })

  test("passes session name with special characters", async () => {
    await killTmuxSession("feature/my-branch")

    expect(capturedArgs).toContain("-t")
    expect(capturedArgs).toContain("feature/my-branch")
  })
})

// ─── tmuxSessionExists ────────────────────────────────────────────────────────

describe("tmuxSessionExists", () => {
  beforeEach(() => resetMocks())

  test("returns true when exitCode is 0", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    expect(await tmuxSessionExists("ws")).toBe(true)
    expect(capturedArgs).toEqual(["has-session", "-t", "ws"])
  })

  test("returns false when exitCode is 1 (session not found)", async () => {
    mockResult = { exitCode: 1, stdout: "can't find session: ws" }
    expect(await tmuxSessionExists("ws")).toBe(false)
  })

  test("returns false when exitCode is non-zero", async () => {
    mockResult = { exitCode: 127, stdout: "" }
    expect(await tmuxSessionExists("nonexistent")).toBe(false)
  })
})

// ─── focusTmuxSession ─────────────────────────────────────────────────────────

describe("focusTmuxSession", () => {
  let originalTmux: string | undefined

  beforeEach(() => {
    resetMocks()
    originalTmux = process.env.TMUX
  })

  afterEach(() => {
    if (originalTmux === undefined) {
      delete process.env.TMUX
    } else {
      process.env.TMUX = originalTmux
    }
  })

  test("calls switch-client when TMUX env is set", async () => {
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0"
    await focusTmuxSession("ws")

    expect(capturedArgs).toEqual(["switch-client", "-t", "ws"])
  })

  test("calls attach-session when TMUX env is unset", async () => {
    delete process.env.TMUX
    await focusTmuxSession("ws")

    expect(capturedArgs).toEqual(["attach-session", "-t", "ws"])
  })

  test("calls attach-session when TMUX is empty string", async () => {
    process.env.TMUX = ""
    await focusTmuxSession("my-session")

    expect(capturedArgs).toEqual(["attach-session", "-t", "my-session"])
  })
})

// ─── createTmuxSession ────────────────────────────────────────────────────────

describe("createTmuxSession", () => {
  beforeEach(() => resetMocks())

  test("calls new-session -d with name and cwd", async () => {
    await createTmuxSession("/home/user/workspaces/tasks/ws", "ws")

    expect(capturedArgs).toEqual([
      "new-session", "-d", "-s", "ws", "-c", "/home/user/workspaces/tasks/ws",
    ])
  })
})

// ─── getTmuxMainPane ──────────────────────────────────────────────────────────

describe("getTmuxMainPane", () => {
  beforeEach(() => resetMocks())

  test("returns first pane ID from stdout", async () => {
    mockResult = { exitCode: 0, stdout: "%5\n%6\n%7\n" }
    const pane = await getTmuxMainPane("my-session")

    expect(pane).toBe("%5")
    expect(capturedArgs).toEqual(["list-panes", "-t", "my-session", "-F", "#{pane_id}"])
  })

  test("returns %0 when stdout is empty", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    const pane = await getTmuxMainPane("my-session")

    expect(pane).toBe("%0")
  })

  test("returns %0 when stdout is only whitespace", async () => {
    mockResult = { exitCode: 0, stdout: "   \n  " }
    const pane = await getTmuxMainPane("my-session")

    expect(pane).toBe("%0")
  })

  test("returns single pane ID when only one pane", async () => {
    mockResult = { exitCode: 0, stdout: "%3\n" }
    const pane = await getTmuxMainPane("ws")

    expect(pane).toBe("%3")
  })
})

// ─── addTmuxPane ──────────────────────────────────────────────────────────────

describe("addTmuxPane", () => {
  beforeEach(() => resetMocks())

  test("calls split-window with -v for down direction", async () => {
    mockResult = { exitCode: 0, stdout: "%8\n" }
    const pane = await addTmuxPane("ws", "down")

    expect(capturedArgs).toContain("split-window")
    expect(capturedArgs).toContain("-t")
    expect(capturedArgs).toContain("ws")
    expect(capturedArgs).toContain("-v")
    expect(capturedArgs).not.toContain("-h")
    expect(capturedArgs).not.toContain("-b")
    expect(pane).toBe("%8")
  })

  test("calls split-window with -h for right direction", async () => {
    mockResult = { exitCode: 0, stdout: "%9\n" }
    const pane = await addTmuxPane("ws", "right")

    expect(capturedArgs).toContain("-h")
    expect(capturedArgs).not.toContain("-v")
    expect(capturedArgs).not.toContain("-b")
    expect(pane).toBe("%9")
  })

  test("calls split-window with -v and -b for up direction", async () => {
    mockResult = { exitCode: 0, stdout: "%10\n" }
    const pane = await addTmuxPane("ws", "up")

    expect(capturedArgs).toContain("-v")
    expect(capturedArgs).toContain("-b")
    expect(pane).toBe("%10")
  })

  test("calls split-window with -h and -b for left direction", async () => {
    mockResult = { exitCode: 0, stdout: "%11\n" }
    const pane = await addTmuxPane("ws", "left")

    expect(capturedArgs).toContain("-h")
    expect(capturedArgs).toContain("-b")
    expect(pane).toBe("%11")
  })

  test("returns null on non-zero exit code", async () => {
    mockResult = { exitCode: 1, stdout: "" }
    const pane = await addTmuxPane("ws", "down")

    expect(pane).toBeNull()
  })

  test("includes -P and pane_id format in args", async () => {
    mockResult = { exitCode: 0, stdout: "%2\n" }
    await addTmuxPane("ws")

    expect(capturedArgs).toContain("-P")
    expect(capturedArgs).toContain("-F")
    expect(capturedArgs).toContain("#{pane_id}")
  })

  test("defaults to down direction", async () => {
    mockResult = { exitCode: 0, stdout: "%0\n" }
    await addTmuxPane("ws")

    expect(capturedArgs).toContain("-v")
    expect(capturedArgs).not.toContain("-b")
  })
})

// ─── sendToTmuxPane ───────────────────────────────────────────────────────────

describe("sendToTmuxPane", () => {
  beforeEach(() => resetMocks())

  test("calls send-keys with pane ID, text, and Enter", async () => {
    await sendToTmuxPane("%0", "ls -la")

    expect(capturedArgs).toEqual(["send-keys", "-t", "%0", "ls -la", "Enter"])
  })

  test("passes global pane ID without session prefix", async () => {
    await sendToTmuxPane("%5", "npm start")

    expect(capturedArgs).toContain("%5")
    expect(capturedArgs).not.toContain(":")
  })
})

// ─── focusTmuxPane ────────────────────────────────────────────────────────────

describe("focusTmuxPane", () => {
  beforeEach(() => resetMocks())

  test("calls select-pane -t with pane ID", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    const result = await focusTmuxPane("%0")

    expect(capturedArgs).toEqual(["select-pane", "-t", "%0"])
    expect(result).toBe(true)
  })

  test("returns true on exitCode 0", async () => {
    mockResult = { exitCode: 0, stdout: "" }
    expect(await focusTmuxPane("%3")).toBe(true)
  })

  test("returns false on non-zero exitCode", async () => {
    mockResult = { exitCode: 1, stdout: "" }
    expect(await focusTmuxPane("%99")).toBe(false)
  })
})
