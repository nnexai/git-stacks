import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag, WindowArtifact } from "@/lib/integrations/types"
import type { AerospaceWindow, AerospaceWorkspace } from "@/lib/aerospace"

// === Register ALL mocks BEFORE any integration imports ===

let mockIsRunning = true
let mockWindows: AerospaceWindow[] = []
let mockWorkspaces: AerospaceWorkspace[] = []
let movedWindows: { windowId: number; workspace: string }[] = []
let moveNodeShouldThrowFor: number[] = []

const mockIsAerospaceRunning = mock(async () => mockIsRunning)
const mockListWindows = mock(async () => mockWindows)
const mockListWorkspaces = mock(async () => mockWorkspaces)
const mockMoveNodeToWorkspace = mock(async (windowId: number, workspace: string) => {
  if (moveNodeShouldThrowFor.includes(windowId)) throw new Error(`move failed for ${windowId}`)
  movedWindows.push({ windowId, workspace })
})

mock.module("@/lib/aerospace", () => ({
  isAerospaceRunning: mockIsAerospaceRunning,
  listWindows: mockListWindows,
  listWorkspaces: mockListWorkspaces,
  moveNodeToWorkspace: mockMoveNodeToWorkspace,
  getVersion: mock(async () => "0.15.2-Beta"),
  focusWindow: mock(async () => {}),
  setLayout: mock(async () => {}),
  flattenWorkspaceTree: mock(async () => {}),
  snapshotWindowIds: mock(async () => []),
  _exec: { run: mock(async () => ({ exitCode: 0, stdout: "" })) },
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
const { aerospaceIntegration } = await import(
  // @ts-ignore
  "@/lib/integrations/aerospace?aerospace-integration-test-v1"
)

// === Helpers ===

function makeCtx(overrides?: {
  wsIntegrations?: Record<string, unknown>
  globalIntegrations?: Record<string, unknown>
  silent?: boolean
}): IntegrationContext {
  return {
    workspace: {
      name: "test-ws",
      branch: "feature/test",
      template: "default",
      repos: [],
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
  mockIsAerospaceRunning.mockClear()
  mockListWindows.mockClear()
  mockListWorkspaces.mockClear()
  mockMoveNodeToWorkspace.mockClear()
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
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspace: "dev" } } })
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
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspace: "dev" } } })
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
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspace: "dev" } } })
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
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspace: "dev" } } })
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
    const ctx = makeCtx({ globalIntegrations: { aerospace: { enabled: true, workspace: "global-ws" } } })
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
      wsIntegrations: { aerospace: { enabled: true, workspace: "ws-target" } },
      globalIntegrations: { aerospace: { enabled: true, workspace: "global-target" } },
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
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspace: "dev" } } })
    const result = await aerospaceIntegration.open(ctx, null, bag)
    expect(result).toBeNull()
    // Window 43 should still have been moved despite 42 failing
    expect(movedWindows).toContainEqual({ windowId: 43, workspace: "dev" })
    expect(movedWindows).not.toContainEqual({ windowId: 42, workspace: "dev" })
  })
})

// ─── cleanup() tests (DETECT-05) ─────────────────────────────────────────────

describe("cleanup()", () => {
  test("is a no-op — does not call any aerospace functions", async () => {
    const ctx = makeCtx({ wsIntegrations: { aerospace: { enabled: true, workspace: "dev" } } })
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
