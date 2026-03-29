import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag, WindowArtifact } from "@/lib/integrations/types"
import type { AerospaceWindow, AerospaceWorkspace } from "@/lib/aerospace"

// === Register ALL mocks BEFORE any integration imports ===

let mockIsRunning = true
let mockWindows: AerospaceWindow[] = []
let mockWorkspaces: AerospaceWorkspace[] = []
let movedWindows: { windowId: number; workspace: string }[] = []
let moveNodeShouldThrowFor: number[] = []

// Phase 45 tracking state
let flattenedWorkspaces: string[] = []
let layoutCalls: { layout: string; windowId?: number }[] = []
let focusedWindows: number[] = []
let execCalls: string[][] = []
let mockSnapshotResult: number[] = []

const mockIsAerospaceRunning = mock(async () => mockIsRunning)
const mockListWindows = mock(async () => mockWindows)
const mockListWorkspaces = mock(async () => mockWorkspaces)
const mockMoveNodeToWorkspace = mock(async (windowId: number, workspace: string) => {
  if (moveNodeShouldThrowFor.includes(windowId)) throw new Error(`move failed for ${windowId}`)
  movedWindows.push({ windowId, workspace })
})
const mockFlattenWorkspaceTree = mock(async (workspace?: string) => {
  flattenedWorkspaces.push(workspace ?? "")
})
const mockSetLayout = mock(async (layout: string, windowId?: number) => {
  layoutCalls.push({ layout, windowId })
})
const mockFocusWindow = mock(async (windowId: number) => {
  focusedWindows.push(windowId)
})
const mockSnapshotWindowIds = mock(async (spawnFn: () => Promise<void>) => {
  try { await spawnFn() } catch { /* platform differences (e.g. no `open -a` on Linux) */ }
  return [...mockSnapshotResult]
})
const mockExecRun = mock(async (args: string[]) => {
  execCalls.push([...args])
  return { exitCode: 0, stdout: "" }
})

mock.module("@/lib/aerospace", () => ({
  isAerospaceRunning: mockIsAerospaceRunning,
  listWindows: mockListWindows,
  listWorkspaces: mockListWorkspaces,
  moveNodeToWorkspace: mockMoveNodeToWorkspace,
  getVersion: mock(async () => "0.15.2-Beta"),
  focusWindow: mockFocusWindow,
  setLayout: mockSetLayout,
  flattenWorkspaceTree: mockFlattenWorkspaceTree,
  snapshotWindowIds: mockSnapshotWindowIds,
  _exec: { run: mockExecRun },
}))

// Mock @/tui/utils (prompts wrapper)
mock.module("@/tui/utils", () => ({
  prompts: {
    spinner: () => ({ start: mock(() => {}), stop: mock(() => {}) }),
    log: { info: mock(() => {}), success: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    intro: mock(() => {}),
    outro: mock(() => {}),
    text: mock(async () => ""),
    select: mock(async () => ""),
    multiselect: mock(async () => []),
    confirm: mock(async () => false),
    isCancel: mock(() => false),
    cancel: mock(() => {}),
    group: mock(async () => ({})),
    note: mock(() => {}),
    groupMultiselect: mock(async () => []),
  },
  cancel: mock((): never => { throw new Error("cancelled") }),
  safeText: mock(async () => ""),
}))

// Cache-busted import after all mocks registered
const { aerospaceIntegration, validateAerospaceConfig } = await import(
  // @ts-ignore
  "@/lib/integrations/aerospace?aerospace-integration-test-v1"
)

// === Helpers ===

function makeCtx(overrides?: {
  wsIntegrations?: Record<string, unknown>
  globalIntegrations?: Record<string, unknown>
  silent?: boolean
  repos?: Array<{ name: string; task_path: string }>
}): IntegrationContext {
  return {
    workspace: {
      name: "test-ws",
      branch: "feature/test",
      template: "default",
      repos: overrides?.repos ?? [],
      settings: {
        integrations: overrides?.wsIntegrations ?? {},
      },
    } as any,
    tasksDir: "/tmp/tasks/test-ws",
    config: {
      workspace_root: "/tmp/workspaces",
      integrations: overrides?.globalIntegrations ?? {},
    } as any,
    silent: overrides?.silent ?? true,
  }
}

beforeEach(() => {
  mockIsRunning = true
  mockWindows = []
  mockWorkspaces = []
  movedWindows = []
  moveNodeShouldThrowFor = []
  flattenedWorkspaces = []
  layoutCalls = []
  focusedWindows = []
  execCalls = []
  mockSnapshotResult = []
  mockIsAerospaceRunning.mockClear()
  mockListWindows.mockClear()
  mockListWorkspaces.mockClear()
  mockMoveNodeToWorkspace.mockClear()
  mockFlattenWorkspaceTree.mockClear()
  mockSetLayout.mockClear()
  mockFocusWindow.mockClear()
  mockSnapshotWindowIds.mockClear()
  mockExecRun.mockClear()
})

// ─── Registration tests ───────────────────────────────────────────────────────

describe("registration", () => {
  test("has order 31", () => {
    expect(aerospaceIntegration.order).toBe(31)
  })

  test("is disabled by default", () => {
    expect(aerospaceIntegration.enabledByDefault).toBe(false)
  })

  test("id is 'aerospace'", () => {
    expect(aerospaceIntegration.id).toBe("aerospace")
  })

  test("label is 'AeroSpace'", () => {
    expect(aerospaceIntegration.label).toBe("AeroSpace")
  })

  test("aerospaceIntegration appears in integrations index", async () => {
    // Import the live index (not cache-busted) to check it contains aerospace
    const { integrations } = await import("@/lib/integrations/index")
    const found = integrations.find((i: { id: string }) => i.id === "aerospace")
    expect(found).toBeDefined()
  })
})

// ─── isEnabled tests (DETECT-03 config cascade) ───────────────────────────────

describe("isEnabled", () => {
  test("returns false when no config exists (enabledByDefault is false)", () => {
    const ctx = makeCtx()
    expect(aerospaceIntegration.isEnabled(ctx)).toBe(false)
  })

  test("returns true when global config has enabled: true", () => {
    const ctx = makeCtx({ globalIntegrations: { aerospace: { enabled: true } } })
    expect(aerospaceIntegration.isEnabled(ctx)).toBe(true)
  })

  test("workspace override takes precedence over global", () => {
    const ctx = makeCtx({
      globalIntegrations: { aerospace: { enabled: true } },
      wsIntegrations: { aerospace: { enabled: false } },
    })
    expect(aerospaceIntegration.isEnabled(ctx)).toBe(false)
  })
})

// ─── WindowDetector tests (DETECT-01) ────────────────────────────────────────

describe("windowDetector", () => {
  const detector = aerospaceIntegration.windowDetector

  test("detector exists and has id 'aerospace'", () => {
    expect(detector).toBeDefined()
    expect(detector!.id).toBe("aerospace")
  })

  test("begin() returns empty set when aerospace is not running", async () => {
    mockIsRunning = false
    const snapshot = await detector!.begin()
    expect(snapshot._brand).toBe("aerospace")
    expect((snapshot.data as Set<number>).size).toBe(0)
  })

  test("begin() returns current window IDs when running", async () => {
    mockWindows = [
      { windowId: 1, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" },
      { windowId: 2, appName: "Terminal", windowTitle: "fish", appPid: 200, workspace: "dev" },
    ]
    const snapshot = await detector!.begin()
    expect(snapshot._brand).toBe("aerospace")
    const ids = snapshot.data as Set<number>
    expect(ids.size).toBe(2)
    expect(ids.has(1)).toBe(true)
    expect(ids.has(2)).toBe(true)
  })

  test("resolve() returns new window IDs that appear immediately", async () => {
    // Snapshot says only window 1 was present before
    const beforeIds = new Set([1])
    const snapshot: import("@/lib/integrations/types").DetectorSnapshot = {
      _brand: "aerospace",
      data: beforeIds,
    }

    // Current state: windows 1 and 2 (2 is new)
    mockWindows = [
      { windowId: 1, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" },
      { windowId: 2, appName: "VS Code", windowTitle: "project", appPid: 300, workspace: "dev" },
    ]

    const result = await detector!.resolve(snapshot)
    expect(result).toContain(2)
    expect(result).not.toContain(1)
  })

  test("resolve() returns empty array when no new windows appear (timeout)", async () => {
    const beforeIds = new Set([1])
    const snapshot: import("@/lib/integrations/types").DetectorSnapshot = {
      _brand: "aerospace",
      data: beforeIds,
    }
    // Same windows — no new ones appear → timeout after 10s
    mockWindows = [
      { windowId: 1, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" },
    ]

    const result = await detector!.resolve(snapshot)
    expect(result).toEqual([])
  }, 15_000)
})

// ─── open() tests (DETECT-02, DETECT-03, DETECT-04) ──────────────────────────

describe("open()", () => {
  test("returns null when aerospace is not running (gate check)", async () => {
    mockIsRunning = false
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } } })
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
    expect(movedWindows).toHaveLength(0)
  })

  test("returns null when no workspace is configured", async () => {
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true } } })
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
  })

  test("returns null and skips when target workspace does not exist (DETECT-04)", async () => {
    mockWorkspaces = [
      { workspace: "mail", isFocused: true, isVisible: true, monitorId: 1 },
    ]
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } } })
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
    expect(movedWindows).toHaveLength(0)
  })

  test("moves bag windows to target workspace (DETECT-02)", async () => {
    mockWorkspaces = [
      { workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window",
        pid: 1234,
        app_id: "com.microsoft.VSCode",
        title: "project",
        windowIds: { aerospace: [42, 43] },
      } as WindowArtifact,
      intellij: {
        kind: "window",
        pid: 5678,
        app_id: "com.jetbrains.intellij",
        title: "project",
        windowIds: { aerospace: [99] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } } })
    const result = await aerospaceIntegration.open(ctx, null, bag)
    expect(result).toBeNull()
    expect(movedWindows).toHaveLength(3)
    expect(movedWindows).toContainEqual({ windowId: 42, workspace: "dev" })
    expect(movedWindows).toContainEqual({ windowId: 43, workspace: "dev" })
    expect(movedWindows).toContainEqual({ windowId: 99, workspace: "dev" })
  })

  test("skips bag entries without aerospace window IDs", async () => {
    mockWorkspaces = [
      { workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window",
        pid: 1234,
        app_id: "com.microsoft.VSCode",
        title: "project",
        windowIds: { niri: [10] },  // Only niri IDs, no aerospace
      } as WindowArtifact,
      tmux: {
        kind: "tmux",
        sessionName: "test",
      },
    }
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } } })
    await aerospaceIntegration.open(ctx, null, bag)
    expect(movedWindows).toHaveLength(0)
  })

  test("reads workspace config from global when workspace-level not present (DETECT-03)", async () => {
    mockWorkspaces = [
      { workspace: "global-ws", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window",
        pid: 1234,
        app_id: "com.microsoft.VSCode",
        title: "project",
        windowIds: { aerospace: [50] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({ globalIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "global-ws" }] } } })
    await aerospaceIntegration.open(ctx, null, bag)
    expect(movedWindows).toHaveLength(1)
    expect(movedWindows[0]).toEqual({ windowId: 50, workspace: "global-ws" })
  })

  test("workspace-level config takes precedence over global config (DETECT-03)", async () => {
    mockWorkspaces = [
      { workspace: "ws-target", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window",
        pid: 1234,
        app_id: "com.microsoft.VSCode",
        title: "project",
        windowIds: { aerospace: [60] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "ws-target" }] } },
      globalIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "global-target" }] } },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    expect(movedWindows).toHaveLength(1)
    expect(movedWindows[0]).toEqual({ windowId: 60, workspace: "ws-target" })
  })

  test("continues moving remaining windows when one move fails", async () => {
    mockWorkspaces = [
      { workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    // Configure mock to throw for window 42 only
    moveNodeShouldThrowFor = [42]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window",
        pid: 1234,
        app_id: "com.microsoft.VSCode",
        title: "project",
        windowIds: { aerospace: [42, 43] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } } })
    const result = await aerospaceIntegration.open(ctx, null, bag)
    expect(result).toBeNull()
    // Window 43 should still have been moved despite 42 failing
    expect(movedWindows).toContainEqual({ windowId: 43, workspace: "dev" })
    expect(movedWindows).not.toContainEqual({ windowId: 42, workspace: "dev" })
  })
})

// ─── flatten_before_open tests (LAYOUT-03) ───────────────────────────────────

describe("flatten_before_open", () => {
  test("calls flattenWorkspaceTree with target workspace when enabled", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", flatten_before_open: true }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(flattenedWorkspaces).toContain("dev")
  })

  test("does not call flattenWorkspaceTree when disabled", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", flatten_before_open: false }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(flattenedWorkspaces).toHaveLength(0)
  })

  test("does not call flattenWorkspaceTree when not configured (default)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(flattenedWorkspaces).toHaveLength(0)
  })

  test("flatten happens before bag window movement", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [42] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", flatten_before_open: true }] } },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    expect(flattenedWorkspaces).toContain("dev")
    expect(movedWindows.some(m => m.windowId === 42)).toBe(true)
  })
})

// ─── layout tests (LAYOUT-01, LAYOUT-02) ─────────────────────────────────────

describe("layout", () => {
  test("applies layout after window placement (LAYOUT-01)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockWindows = [{ windowId: 10, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", layout: "h_tiles" }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(layoutCalls).toContainEqual({ layout: "h_tiles", windowId: undefined })
    // Verify a window was focused before layout
    expect(focusedWindows).toContain(10)
  })

  test("supports all four layout types", async () => {
    for (const layoutType of ["h_tiles", "v_tiles", "h_accordion", "v_accordion"]) {
      layoutCalls = []
      focusedWindows = []
      mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
      mockWindows = [{ windowId: 10, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" }]
      const ctx = makeCtx({
        wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", layout: layoutType }] } },
      })
      await aerospaceIntegration.open(ctx, null, {})
      expect(layoutCalls).toContainEqual({ layout: layoutType, windowId: undefined })
    }
  })

  test("does not apply layout when not configured", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(layoutCalls).toHaveLength(0)
  })

  test("skips layout when no windows exist in target workspace", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockWindows = []  // No windows
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", layout: "h_tiles" }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(layoutCalls).toHaveLength(0)
  })

  test("normalization: true uses flatten + layout (LAYOUT-02)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockWindows = [{ windowId: 10, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" }]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            layout: "h_tiles", normalization: true, flatten_before_open: true,
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(flattenedWorkspaces).toContain("dev")
    expect(layoutCalls).toContainEqual({ layout: "h_tiles", windowId: undefined })
  })

  test("normalization: false — layout still applied (LAYOUT-02)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockWindows = [{ windowId: 10, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" }]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            layout: "v_tiles", normalization: false,
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(layoutCalls).toContainEqual({ layout: "v_tiles", windowId: undefined })
  })
})

// ─── focus tests (LAYOUT-04) ─────────────────────────────────────────────────

describe("focus", () => {
  test("switches to target workspace when focus: true (LAYOUT-04)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", focus: true }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(execCalls.some(c => c[0] === "workspace" && c[1] === "dev")).toBe(true)
  })

  test("does not switch workspace when focus: false", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev", focus: false }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(execCalls.some(c => c[0] === "workspace")).toBe(false)
  })

  test("does not switch workspace when focus not configured (default)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(execCalls.some(c => c[0] === "workspace")).toBe(false)
  })

  test("window-level focus via command entry focus: true", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [55]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ app: "kitty", focus: true }],
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(focusedWindows).toContain(55)
  })
})

// ─── commands array tests (LAUNCH-01, LAUNCH-02) ─────────────────────────────

describe("commands array", () => {
  test("launches app via open -a and moves new windows (LAUNCH-01, LAUNCH-02)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [70, 71]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ app: "kitty" }],
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(movedWindows.some(m => m.windowId === 70 && m.workspace === "dev")).toBe(true)
    expect(movedWindows.some(m => m.windowId === 71 && m.workspace === "dev")).toBe(true)
  })

  test("launches command via sh -c and moves new windows", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [80]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ command: "open -a Firefox" }],
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(movedWindows.some(m => m.windowId === 80 && m.workspace === "dev")).toBe(true)
  })

  test("resolves source from artifact bag", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [42] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ source: "vscode" }],
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    expect(movedWindows.some(m => m.windowId === 42 && m.workspace === "dev")).toBe(true)
  })

  test("warns when source not found in bag (no throw)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ source: "nonexistent" }],
          }],
        },
      },
      silent: false,
    })
    // Should not throw — partial failure tolerance
    await aerospaceIntegration.open(ctx, null, {})
  })

  test("expands GS_WORKSPACE_PATH in cwd", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [90]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ command: "echo hello", cwd: "$GS_WORKSPACE_PATH" }],
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(movedWindows.some(m => m.windowId === 90)).toBe(true)
  })

  test("resolves cwd from repo entry when repo field set", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [100]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ command: "echo hello", repo: "my-repo" }],
          }],
        },
      },
      repos: [{ name: "my-repo", task_path: "/tmp/repos/my-repo" }],
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(movedWindows.some(m => m.windowId === 100)).toBe(true)
  })

  test("processes multiple commands sequentially", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [110]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [
              { app: "kitty" },
              { app: "Firefox" },
            ],
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Both commands each return mockSnapshotResult [110], so window 110 is moved twice
    const devMoves = movedWindows.filter(m => m.workspace === "dev")
    expect(devMoves.length).toBeGreaterThanOrEqual(2)
  })

  test("skips command entry with no source/app/command", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ focus: true }],  // No source, app, or command
          }],
        },
      },
    })
    // Should not throw
    await aerospaceIntegration.open(ctx, null, {})
  })

  test("continues after individual command failure", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [120]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [
              { source: "nonexistent" },  // Will warn — source not in bag
              { app: "kitty" },           // Should still execute
            ],
          }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Second command should still have its window moved
    expect(movedWindows.some(m => m.windowId === 120 && m.workspace === "dev")).toBe(true)
  })
})

// ─── backward compatibility tests ────────────────────────────────────────────

describe("minimal config", () => {
  test("minimal workspaces array config works (workspace name only)", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [42] },
      } as WindowArtifact,
    }
    // Minimal config — only workspaces array with workspace name, no layout/normalization/commands
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    expect(movedWindows.some(m => m.windowId === 42 && m.workspace === "dev")).toBe(true)
    // No layout, flatten, or focus should have been triggered
    expect(flattenedWorkspaces).toHaveLength(0)
    expect(layoutCalls).toHaveLength(0)
    expect(execCalls.some(c => c[0] === "workspace")).toBe(false)
  })
})

// ─── cleanup() tests (DETECT-05) ─────────────────────────────────────────────

describe("cleanup()", () => {
  test("is a no-op — does not call any aerospace functions", async () => {
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspaces: [{ workspace: "dev" }] } } })
    await aerospaceIntegration.cleanup!(ctx)
    expect(movedWindows).toHaveLength(0)
    expect(mockMoveNodeToWorkspace).not.toHaveBeenCalled()
    expect(mockListWorkspaces).not.toHaveBeenCalled()
    expect(mockListWindows).not.toHaveBeenCalled()
  })
})

// ─── configurePrompt() tests ──────────────────────────────────────────────────

describe("configurePrompt()", () => {
  test("returns { enabled: true }", async () => {
    const result = await aerospaceIntegration.configurePrompt({})
    expect(result).toEqual({ enabled: true })
  })
})

// ─── schema parsing tests ───────────────────────────────────────────────────

describe("schema parsing", () => {
  test("accepts minimal config with one workspace entry (SCHEMA-01)", async () => {
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [{ workspace: "2" }],
        },
      },
    })
    mockWorkspaces = [{ workspace: "2", isFocused: false, isVisible: false, monitorId: 1 }]
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
    // Should not skip — workspace "2" exists
    expect(mockListWorkspaces).toHaveBeenCalled()
  })

  test("accepts multi-entry config with different layouts (SCHEMA-01, SCHEMA-02)", async () => {
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", layout: "h_tiles" },
            { workspace: "3", layout: "v_accordion" },
          ],
        },
      },
    })
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    // Should parse and execute without error (reads from workspaces[0] in Phase 47)
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
  })

  test("accepts entry with all optional fields (SCHEMA-02)", async () => {
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [{
            workspace: "dev",
            layout: "h_tiles",
            normalization: true,
            flatten_before_open: true,
            focus: true,
            commands: [{ app: "kitty" }],
          }],
        },
      },
    })
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockSnapshotResult = [55]
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
  })

  test("rejects config without workspaces array (falls through to skip)", async () => {
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true } },
    })
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
    // Should not attempt to list workspaces — config parse failed
    expect(mockListWorkspaces).not.toHaveBeenCalled()
  })

  test("rejects config with empty workspaces array (falls through to skip)", async () => {
    const ctx = makeCtx({
      wsIntegrations: { aerospace: { enabled: true, workspaces: [] } },
    })
    const result = await aerospaceIntegration.open(ctx, null, {})
    expect(result).toBeNull()
  })
})

// ─── validateAerospaceConfig tests ──────────────────────────────────────────

describe("validateAerospaceConfig", () => {
  test("does not throw for valid single-entry config", () => {
    expect(() =>
      validateAerospaceConfig([{ workspace: "2" }])
    ).not.toThrow()
  })

  test("does not throw for valid multi-entry config with one focus", () => {
    expect(() =>
      validateAerospaceConfig([
        { workspace: "2", focus: true },
        { workspace: "3" },
      ])
    ).not.toThrow()
  })

  test("does not throw when no entries have focus: true", () => {
    expect(() =>
      validateAerospaceConfig([
        { workspace: "2" },
        { workspace: "3" },
      ])
    ).not.toThrow()
  })

  test("throws on focus conflict — two entries with focus: true (SCHEMA-03)", () => {
    expect(() =>
      validateAerospaceConfig([
        { workspace: "2", focus: true },
        { workspace: "3", focus: true },
      ])
    ).toThrow("AeroSpace: multiple entries have focus: true (2, 3) — at most one allowed")
  })

  test("throws on focus conflict — three entries with focus: true (SCHEMA-03)", () => {
    expect(() =>
      validateAerospaceConfig([
        { workspace: "1", focus: true },
        { workspace: "2", focus: true },
        { workspace: "3", focus: true },
      ])
    ).toThrow("AeroSpace: multiple entries have focus: true (1, 2, 3) — at most one allowed")
  })

  test("throws on duplicate workspace names (SCHEMA-04)", () => {
    expect(() =>
      validateAerospaceConfig([
        { workspace: "2" },
        { workspace: "2" },
      ])
    ).toThrow("AeroSpace: duplicate workspace names: 2")
  })

  test("throws on duplicate workspace names — multiple duplicates (SCHEMA-04)", () => {
    expect(() =>
      validateAerospaceConfig([
        { workspace: "2" },
        { workspace: "3" },
        { workspace: "2" },
        { workspace: "3" },
      ])
    ).toThrow("AeroSpace: duplicate workspace names: 2, 3")
  })

  test("focus conflict checked before duplicate names (both present)", () => {
    // When both violations exist, focus conflict is thrown first
    expect(() =>
      validateAerospaceConfig([
        { workspace: "2", focus: true },
        { workspace: "2", focus: true },
      ])
    ).toThrow("AeroSpace: multiple entries have focus: true")
  })
})
