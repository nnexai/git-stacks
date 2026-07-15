import { describe, test, expect, mock } from "@test/api"
import type { CmdResult } from "@/lib/cmux"

// ─── Mock setup ───────────────────────────────────────────────────────────────
// Strategy: import cmux module with cache-busting, then mutate _exec.run.
// _exec is a plain exported object — its properties are mutable in ESM.
// Multiple cmux functions make sequential _exec.run calls (e.g. createCmuxWorkspace
// calls new-workspace, rename-workspace, select-workspace), so we track all calls.

const cmuxModule = await import("@/lib/cmux")

const {
  createCmuxWorkspace,
  focusCmuxWorkspace,
  addCmuxPane,
  addCmuxSurface,
  sendToCmuxSurface,
  focusCmuxSurface,
  getCmuxMainPane,
  _exec,
} = cmuxModule

// Multi-call tracker: callResults[i] is returned on the i-th _exec.run call
let allCalls: string[][] = []
let callResults: CmdResult[] = []

const mockRun = mock(async (args: string[]): Promise<CmdResult> => {
  const callIndex = allCalls.length
  allCalls.push([...args])
  return callResults[callIndex] ?? { exitCode: 0, stdout: "" }
})

_exec.run = mockRun

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetMocks(...results: CmdResult[]) {
  allCalls = []
  callResults = results
  mockRun.mockClear()
}

function singleResult(exitCode = 0, stdout = "") {
  resetMocks({ exitCode, stdout })
}

// ─── createCmuxWorkspace ──────────────────────────────────────────────────────

describe("createCmuxWorkspace", () => {
  test("calls new-workspace, rename-workspace, and select-workspace in sequence", async () => {
    resetMocks(
      { exitCode: 0, stdout: "OK workspace:42\n" },  // new-workspace
      { exitCode: 0, stdout: "" },                    // rename-workspace
      { exitCode: 0, stdout: "" },                    // select-workspace
    )
    const ref = await createCmuxWorkspace("/tmp/tasks/ws", "my-ws")

    expect(ref).toBe("workspace:42")
    expect(allCalls).toHaveLength(3)
    expect(allCalls[0]).toEqual(["new-workspace", "--cwd", "/tmp/tasks/ws"])
    expect(allCalls[1]).toEqual(["rename-workspace", "--workspace", "workspace:42", "my-ws"])
    expect(allCalls[2]).toEqual(["select-workspace", "--workspace", "workspace:42"])
  })

  test("parses workspace ref without OK prefix", async () => {
    resetMocks({ exitCode: 0, stdout: "workspace:5\n" })
    const ref = await createCmuxWorkspace("/tmp", "ws")

    expect(ref).toBe("workspace:5")
  })

  test("throws when output does not contain workspace ref", async () => {
    resetMocks({ exitCode: 0, stdout: "unexpected output here\n" })

    await expect(createCmuxWorkspace("/tmp", "ws")).rejects.toThrow(
      "cmux new-workspace: unexpected output"
    )
  })

  test("throws when output is empty", async () => {
    resetMocks({ exitCode: 0, stdout: "" })

    await expect(createCmuxWorkspace("/tmp", "ws")).rejects.toThrow(
      "cmux new-workspace: unexpected output"
    )
  })
})

// ─── focusCmuxWorkspace ───────────────────────────────────────────────────────

describe("focusCmuxWorkspace", () => {
  test("calls select-workspace --workspace with ref", async () => {
    singleResult(0)
    const result = await focusCmuxWorkspace("workspace:3")

    expect(allCalls[0]).toEqual(["select-workspace", "--workspace", "workspace:3"])
    expect(result).toBe(true)
  })

  test("returns true on exitCode 0", async () => {
    singleResult(0)
    expect(await focusCmuxWorkspace("workspace:1")).toBe(true)
  })

  test("returns false on non-zero exitCode", async () => {
    singleResult(1)
    expect(await focusCmuxWorkspace("workspace:99")).toBe(false)
  })
})

// ─── addCmuxPane ──────────────────────────────────────────────────────────────

describe("addCmuxPane", () => {
  test("calls new-pane with direction and workspace", async () => {
    singleResult(0, "pane:2 surface:3\n")
    const result = await addCmuxPane("workspace:1", "down")

    expect(allCalls[0]).toEqual(["new-pane", "--direction", "down", "--workspace", "workspace:1"])
    expect(result).not.toBeNull()
    expect(result?.paneRef).toBe("pane:2")
    expect(result?.surfaceRef).toBe("surface:3")
  })

  test("returns paneRef and surfaceRef from output", async () => {
    singleResult(0, "OK pane:5 surface:7\n")
    const result = await addCmuxPane("workspace:2", "right")

    expect(result?.paneRef).toBe("pane:5")
    expect(result?.surfaceRef).toBe("surface:7")
  })

  test("returns null on non-zero exitCode", async () => {
    singleResult(1)
    const result = await addCmuxPane("workspace:1", "down")

    expect(result).toBeNull()
  })

  test("returns null when output does not contain pane and surface refs", async () => {
    singleResult(0, "unexpected output\n")
    const result = await addCmuxPane("workspace:1")

    expect(result).toBeNull()
  })

  test("defaults to down direction", async () => {
    singleResult(0, "pane:1 surface:1\n")
    await addCmuxPane("workspace:1")

    expect(allCalls[0]).toContain("down")
  })
})

// ─── addCmuxSurface ───────────────────────────────────────────────────────────

describe("addCmuxSurface", () => {
  test("calls new-surface with pane and workspace", async () => {
    singleResult(0, "surface:8\n")
    const result = await addCmuxSurface("workspace:1", "pane:2")

    expect(allCalls[0]).toEqual(["new-surface", "--pane", "pane:2", "--workspace", "workspace:1"])
    expect(result).toBe("surface:8")
  })

  test("returns null on non-zero exitCode", async () => {
    singleResult(1)
    const result = await addCmuxSurface("workspace:1", "pane:1")

    expect(result).toBeNull()
  })

  test("returns null when output has no surface ref", async () => {
    singleResult(0, "no ref here\n")
    const result = await addCmuxSurface("workspace:1", "pane:1")

    expect(result).toBeNull()
  })
})

// ─── sendToCmuxSurface ────────────────────────────────────────────────────────

describe("sendToCmuxSurface", () => {
  test("calls send with workspace, surface, and text", async () => {
    singleResult(0)
    await sendToCmuxSurface("workspace:1", "surface:2", "npm start\n")

    expect(allCalls[0]).toEqual([
      "send", "--workspace", "workspace:1", "--surface", "surface:2", "npm start\n",
    ])
  })

  test("passes text verbatim including newlines", async () => {
    singleResult(0)
    await sendToCmuxSurface("workspace:3", "surface:5", "cd /tmp && ls\n")

    expect(allCalls[0]).toContain("cd /tmp && ls\n")
  })
})

// ─── focusCmuxSurface ─────────────────────────────────────────────────────────

describe("focusCmuxSurface", () => {
  test("calls move-surface with surface, workspace, and --focus true", async () => {
    singleResult(0)
    const result = await focusCmuxSurface("workspace:1", "surface:3")

    expect(allCalls[0]).toEqual([
      "move-surface", "--surface", "surface:3", "--workspace", "workspace:1", "--focus", "true",
    ])
    expect(result).toBe(true)
  })

  test("returns true on exitCode 0", async () => {
    singleResult(0)
    expect(await focusCmuxSurface("workspace:1", "surface:1")).toBe(true)
  })

  test("returns false on non-zero exitCode", async () => {
    singleResult(1)
    expect(await focusCmuxSurface("workspace:1", "surface:1")).toBe(false)
  })
})

// ─── getCmuxMainPane ──────────────────────────────────────────────────────────

describe("getCmuxMainPane", () => {
  test("calls list-panes then list-pane-surfaces to get refs", async () => {
    resetMocks(
      { exitCode: 0, stdout: "* pane:3  /home\n" },          // list-panes
      { exitCode: 0, stdout: "* surface:7  bash\n" },         // list-pane-surfaces
    )
    const result = await getCmuxMainPane("workspace:2")

    expect(allCalls[0]).toEqual(["list-panes", "--workspace", "workspace:2"])
    expect(allCalls[1]).toEqual(["list-pane-surfaces", "--workspace", "workspace:2", "--pane", "pane:3"])
    expect(result.paneRef).toBe("pane:3")
    expect(result.surfaceRef).toBe("surface:7")
  })

  test("falls back to pane:1 and surface:1 when commands fail", async () => {
    resetMocks(
      { exitCode: 1, stdout: "" },  // list-panes fails
      { exitCode: 1, stdout: "" },  // list-pane-surfaces fails
    )
    const result = await getCmuxMainPane("workspace:1")

    expect(result.paneRef).toBe("pane:1")
    expect(result.surfaceRef).toBe("surface:1")
  })

  test("uses pane:1 fallback when list-panes returns no match", async () => {
    resetMocks(
      { exitCode: 0, stdout: "no-match\n" },     // list-panes with no pane ref
      { exitCode: 0, stdout: "* surface:2\n" },  // list-pane-surfaces
    )
    const result = await getCmuxMainPane("workspace:1")

    expect(result.paneRef).toBe("pane:1")
    // list-pane-surfaces still called with fallback pane:1
    expect(allCalls[1]).toContain("pane:1")
  })

  test("uses surface:1 fallback when list-pane-surfaces returns no match", async () => {
    resetMocks(
      { exitCode: 0, stdout: "* pane:4\n" },
      { exitCode: 0, stdout: "no-surface-here\n" },
    )
    const result = await getCmuxMainPane("workspace:1")

    expect(result.paneRef).toBe("pane:4")
    expect(result.surfaceRef).toBe("surface:1")
  })
})
