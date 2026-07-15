import { describe, test, expect, mock, beforeEach } from "@test/api"
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

mock.module("../../../packages/core/src/aerospace", () => ({
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
mock.module("../../../packages/core/src/prompt-capability", () => ({
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
const { aerospaceIntegration, validateAerospaceConfig, _runtime } = await import(
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
  _runtime.spawn = mock((_args: readonly string[]) => ({
    pid: 1234,
    exited: Promise.resolve(0),
    stdout: null,
    stderr: null,
    kill: () => true,
    unref: () => {},
  }))
  mockIsAerospaceRunning.mockClear()
  mockListWindows.mockClear()
  mockListWorkspaces.mockClear()
  mockMoveNodeToWorkspace.mockClear()
  // Restore original implementations (mockClear only resets call tracking, not overridden implementations)
  mockFlattenWorkspaceTree.mockImplementation(async (workspace?: string) => {
    flattenedWorkspaces.push(workspace ?? "")
  })
  mockSetLayout.mockImplementation(async (layout: string, windowId?: number) => {
    layoutCalls.push({ layout, windowId })
  })
  mockFocusWindow.mockImplementation(async (windowId: number) => {
    focusedWindows.push(windowId)
  })
  mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>) => {
    try { await spawnFn() } catch { /* platform differences (e.g. no `open -a` on Linux) */ }
    return [...mockSnapshotResult]
  })
  mockExecRun.mockImplementation(async (args: string[]) => {
    execCalls.push([...args])
    return { exitCode: 0, stdout: "" }
  })
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

  test("begin() returns an unavailable snapshot when aerospace is not running", async () => {
    mockIsRunning = false
    const snapshot = await detector!.begin()
    expect(snapshot._brand).toBe("aerospace")
    expect(snapshot.available).toBe(false)
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
      available: true,
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
      available: true,
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
    expect(layoutCalls).toContainEqual({ layout: "h_tiles", windowId: 10 })
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
      expect(layoutCalls).toContainEqual({ layout: layoutType, windowId: 10 })
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
    expect(layoutCalls).toContainEqual({ layout: "h_tiles", windowId: 10 })
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
    expect(layoutCalls).toContainEqual({ layout: "v_tiles", windowId: 10 })
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

  test("source command reuses artifact bag without spawning new windows", async () => {
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
    mockSnapshotWindowIds.mockClear()

    await aerospaceIntegration.open(ctx, null, bag)

    expect(mockSnapshotWindowIds).not.toHaveBeenCalled()
    expect(movedWindows).toContainEqual({ windowId: 42, workspace: "dev" })
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

  test("skips a command with an unknown repo without spawn, move, or layout", async () => {
    mockWorkspaces = [{ workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 }]
    mockWindows = [{ windowId: 10, workspace: "dev" } as AerospaceWindow]
    mockSnapshotResult = [100]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true, workspaces: [{
            workspace: "dev",
            commands: [{ command: "echo hello", repo: "typo" }],
          }],
        },
      },
    })
    mockSnapshotWindowIds.mockClear()

    await aerospaceIntegration.open(ctx, null, {})

    expect(mockSnapshotWindowIds).not.toHaveBeenCalled()
    expect(movedWindows).toHaveLength(0)
    expect(layoutCalls).toHaveLength(0)
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

// ─── multi-workspace loop tests (PROC-01) ──────────────────────────────────

describe("multi-workspace loop", () => {
  test("iterates all entries in order — flatten per entry (PROC-01)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", flatten_before_open: true },
            { workspace: "3", flatten_before_open: true },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Both workspaces should have been flattened in order
    expect(flattenedWorkspaces).toEqual(["2", "3"])
  })

  test("iterates all entries — layout applied per entry (PROC-01)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    // Set up mockWindows to contain windows in both workspaces
    mockWindows = [
      { windowId: 10, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "2" },
      { windowId: 20, appName: "Firefox", windowTitle: "Page", appPid: 200, workspace: "3" },
    ]
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
    await aerospaceIntegration.open(ctx, null, {})
    expect(layoutCalls).toContainEqual({ layout: "h_tiles", windowId: 10 })
    expect(layoutCalls).toContainEqual({ layout: "v_accordion", windowId: 20 })
    expect(layoutCalls).toHaveLength(2)
  })

  test("commands execute per entry with correct workspace targeting (PROC-01)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    // First call returns [50], second returns [60]
    let snapshotCallCount = 0
    mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>) => {
      try { await spawnFn() } catch {}
      snapshotCallCount++
      return snapshotCallCount === 1 ? [50] : [60]
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", commands: [{ app: "kitty" }] },
            { workspace: "3", commands: [{ app: "firefox" }] },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(movedWindows).toContainEqual({ windowId: 50, workspace: "2" })
    expect(movedWindows).toContainEqual({ windowId: 60, workspace: "3" })
  })

  test("single-entry array produces one iteration (edge case)", async () => {
    mockWorkspaces = [
      { workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [{ workspace: "dev", flatten_before_open: true }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(flattenedWorkspaces).toEqual(["dev"])
  })

  test("entry failure does not abort loop — skip-and-continue (D-01)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    // Make flattenWorkspaceTree throw for workspace "2"
    mockFlattenWorkspaceTree.mockImplementation(async (workspace?: string) => {
      if (workspace === "2") throw new Error("flatten broke")
      flattenedWorkspaces.push(workspace ?? "")
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", flatten_before_open: true },
            { workspace: "3", flatten_before_open: true },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Workspace "3" should still have been flattened despite "2" failing
    expect(flattenedWorkspaces).toContain("3")
  })
})

// ─── bag routing tests (PROC-02) ───────────────────────────────────────────

describe("bag routing", () => {
  test("bag windows are moved to workspaces[0] only (PROC-02)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [42, 43] },
      } as WindowArtifact,
      intellij: {
        kind: "window", pid: 5678, app_id: "intellij", title: "project",
        windowIds: { aerospace: [99] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2" },
            { workspace: "3" },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    // All bag windows should go to workspace "2" (index 0)
    expect(movedWindows).toContainEqual({ windowId: 42, workspace: "2" })
    expect(movedWindows).toContainEqual({ windowId: 43, workspace: "2" })
    expect(movedWindows).toContainEqual({ windowId: 99, workspace: "2" })
    // No bag windows should go to workspace "3"
    const ws3Moves = movedWindows.filter(m => m.workspace === "3")
    expect(ws3Moves).toHaveLength(0)
  })

  test("subsequent entries do NOT receive bag windows (PROC-02)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "4", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [10] },
      } as WindowArtifact,
    }
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2" },
            { workspace: "3" },
            { workspace: "4" },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    // Window 10 should only be moved to workspace "2"
    const window10Moves = movedWindows.filter(m => m.windowId === 10)
    expect(window10Moves).toHaveLength(1)
    expect(window10Moves[0].workspace).toBe("2")
  })

  test("subsequent entries get their own command-launched windows only (PROC-02)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [10] },
      } as WindowArtifact,
    }
    // Commands return different window IDs per call
    let snapshotCallCount = 0
    mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>) => {
      try { await spawnFn() } catch {}
      snapshotCallCount++
      return snapshotCallCount === 1 ? [50] : [60]
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", commands: [{ app: "kitty" }] },
            { workspace: "3", commands: [{ app: "firefox" }] },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    // Bag window 10 → workspace "2" only
    expect(movedWindows).toContainEqual({ windowId: 10, workspace: "2" })
    // Command windows: 50 → workspace "2", 60 → workspace "3"
    expect(movedWindows).toContainEqual({ windowId: 50, workspace: "2" })
    expect(movedWindows).toContainEqual({ windowId: 60, workspace: "3" })
    // No bag window should appear in workspace "3"
    const ws3Moves = movedWindows.filter(m => m.workspace === "3")
    expect(ws3Moves.every(m => m.windowId !== 10)).toBe(true)
  })
})

// ─── listWorkspaces hoist tests (PROC-03) ──────────────────────────────────

describe("listWorkspaces hoist", () => {
  test("listWorkspaces called exactly once for multi-entry config (PROC-03)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "4", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2" },
            { workspace: "3" },
            { workspace: "4" },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // listWorkspaces should be called exactly once (hoisted before loop)
    expect(mockListWorkspaces).toHaveBeenCalledTimes(1)
  })

  test("listWorkspaces called exactly once for single-entry config (PROC-03)", async () => {
    mockWorkspaces = [
      { workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [{ workspace: "dev" }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(mockListWorkspaces).toHaveBeenCalledTimes(1)
  })

  test("unknown workspace name produces error before any windows are moved (PROC-03)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [42] },
      } as WindowArtifact,
    }
    // Config references workspace "3" which does not exist
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2" },
            { workspace: "3" },  // unknown
          ],
        },
      },
    })
    const result = await aerospaceIntegration.open(ctx, null, bag)
    expect(result).toBeNull()
    // No windows should have been moved — validation failed upfront
    expect(movedWindows).toHaveLength(0)
  })

  test("all workspace names valid — loop executes normally", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", flatten_before_open: true },
            { workspace: "3", flatten_before_open: true },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Both entries processed
    expect(flattenedWorkspaces).toEqual(["2", "3"])
  })
})

// ─── deferred focus tests (D-05, D-06) ─────────────────────────────────────

describe("deferred focus", () => {
  test("workspace-level focus applies after all entries complete (D-05)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", flatten_before_open: true },
            { workspace: "3", focus: true, flatten_before_open: true },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Both entries should have been processed (flatten proves loop ran)
    expect(flattenedWorkspaces).toEqual(["2", "3"])
    // Focus should have been applied to workspace "3" (the entry with focus: true)
    expect(execCalls.some(c => c[0] === "workspace" && c[1] === "3")).toBe(true)
  })

  test("workspace-level focus targets the entry with focus: true, not the last entry", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", focus: true },
            { workspace: "3" },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Focus should go to "2" (the entry with focus: true), not "3" (last entry)
    const focusCalls = execCalls.filter(c => c[0] === "workspace")
    expect(focusCalls).toHaveLength(1)
    expect(focusCalls[0][1]).toBe("2")
  })

  test("no workspace focus when no entry has focus: true", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2" },
            { workspace: "3" },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(execCalls.some(c => c[0] === "workspace")).toBe(false)
  })

  test("window-level focus (command focus: true) deferred to post-loop (D-06)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    // First command returns window 50, second returns window 60
    let snapshotCallCount = 0
    mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>) => {
      try { await spawnFn() } catch {}
      snapshotCallCount++
      return snapshotCallCount === 1 ? [50] : [60]
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", commands: [{ app: "kitty", focus: true }] },
            { workspace: "3", commands: [{ app: "firefox" }] },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Window 50 from entry 0's command should be focused post-loop
    expect(focusedWindows).toContain(50)
  })

  test("last command with focus: true wins window-level focus", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    let snapshotCallCount = 0
    mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>) => {
      try { await spawnFn() } catch {}
      snapshotCallCount++
      return snapshotCallCount === 1 ? [50] : [60]
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", commands: [{ app: "kitty", focus: true }] },
            { workspace: "3", commands: [{ app: "firefox", focus: true }] },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    // Last command with focus: true wins — window 60 from entry 1
    expect(focusedWindows).toContain(60)
  })
})

// ─── beforeSet accumulation tests (PROC-04) ────────────────────────────────

describe("beforeSet accumulation", () => {
  test("snapshotWindowIds receives beforeSet containing prior entry window IDs (PROC-04)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [10] },
      } as WindowArtifact,
    }
    // Capture a snapshot of beforeSet contents at each call (beforeSet is a live reference)
    const capturedBeforeSets: Set<number>[] = []
    mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>, opts?: any) => {
      try { await spawnFn() } catch {}
      capturedBeforeSets.push(new Set(opts?.beforeSet ?? []))
      return [100 + capturedBeforeSets.length]
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", commands: [{ app: "kitty" }] },
            { workspace: "3", commands: [{ app: "firefox" }] },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    // Second snapshotWindowIds call (entry index 1) should have beforeSet containing:
    // - bag window IDs (10) from entry 0
    // - command window IDs (101) from entry 0
    expect(capturedBeforeSets.length).toBeGreaterThanOrEqual(2)
    const secondCallBeforeSet = capturedBeforeSets[1]
    expect(secondCallBeforeSet.has(10)).toBe(true)   // bag window from entry 0
    expect(secondCallBeforeSet.has(101)).toBe(true)  // command window from entry 0
  })

  test("beforeSet is empty for first entry's commands (no prior entries)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    // Capture beforeSet SIZE at call time (beforeSet is a live reference —
    // the production code adds returned window IDs to it after the mock returns)
    const capturedSizes: number[] = []
    mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>, opts?: any) => {
      try { await spawnFn() } catch {}
      capturedSizes.push(opts?.beforeSet?.size ?? -1)
      return [50]
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2", commands: [{ app: "kitty" }] },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(capturedSizes).toHaveLength(1)
    // beforeSet should have been empty at call time (no prior entries, no bag windows)
    expect(capturedSizes[0]).toBe(0)
  })

  test("bag window IDs are added to beforeSet for subsequent entries (PROC-04)", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    const bag: ArtifactBag = {
      vscode: {
        kind: "window", pid: 1234, app_id: "vscode", title: "project",
        windowIds: { aerospace: [10, 11] },
      } as WindowArtifact,
    }
    // Capture a snapshot of beforeSet contents at each call
    const capturedBeforeSets: Set<number>[] = []
    mockSnapshotWindowIds.mockImplementation(async (spawnFn: () => Promise<void>, opts?: any) => {
      try { await spawnFn() } catch {}
      capturedBeforeSets.push(new Set(opts?.beforeSet ?? []))
      return [200]
    })
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [
            { workspace: "2" },
            { workspace: "3", commands: [{ app: "firefox" }] },
          ],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, bag)
    // Entry 0 has no commands, so no snapshotWindowIds call for it
    // Entry 1 has a command — its beforeSet should contain bag window IDs 10 and 11
    expect(capturedBeforeSets).toHaveLength(1)
    expect(capturedBeforeSets[0].has(10)).toBe(true)
    expect(capturedBeforeSets[0].has(11)).toBe(true)
  })
})

// ─── setLayout with windowId tests ─────────────────────────────────────────

describe("setLayout with windowId", () => {
  test("setLayout receives windowId from target workspace window", async () => {
    mockWorkspaces = [
      { workspace: "dev", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    mockWindows = [
      { windowId: 77, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "dev" },
    ]
    const ctx = makeCtx({
      wsIntegrations: {
        aerospace: {
          enabled: true,
          workspaces: [{ workspace: "dev", layout: "h_tiles" }],
        },
      },
    })
    await aerospaceIntegration.open(ctx, null, {})
    expect(layoutCalls).toContainEqual({ layout: "h_tiles", windowId: 77 })
  })

  test("setLayout with windowId avoids cross-entry focus contamination", async () => {
    mockWorkspaces = [
      { workspace: "2", isFocused: false, isVisible: false, monitorId: 1 },
      { workspace: "3", isFocused: false, isVisible: false, monitorId: 1 },
    ]
    mockWindows = [
      { windowId: 10, appName: "Chrome", windowTitle: "Tab", appPid: 100, workspace: "2" },
      { windowId: 20, appName: "Firefox", windowTitle: "Page", appPid: 200, workspace: "3" },
    ]
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
    await aerospaceIntegration.open(ctx, null, {})
    // Each layout call should have its own workspace's windowId
    expect(layoutCalls).toContainEqual({ layout: "h_tiles", windowId: 10 })
    expect(layoutCalls).toContainEqual({ layout: "v_accordion", windowId: 20 })
    // Layout should NOT have been called without windowId
    expect(layoutCalls.every(c => c.windowId !== undefined)).toBe(true)
  })
})
