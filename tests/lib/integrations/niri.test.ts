import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag } from "@/lib/integrations/types"

// === Register ALL mocks BEFORE any integration imports ===

const mockIsNiriRunning = mock(async () => true)
const mockListNiriWorkspaces = mock(async () => [] as any[])
const mockListNiriWindows = mock(async () => [] as any[])
const mockSetNiriWorkspaceName = mock(async () => {})
const mockUnsetNiriWorkspaceName = mock(async () => {})
const mockMoveWindowToWorkspace = mock(async () => {})
const mockFocusNiriWorkspace = mock(async () => {})
const mockFocusNiriWorkspaceDown = mock(async () => {})
const mockNiriSpawn = mock(async () => {})

mock.module("@/lib/niri", () => ({
  isNiriRunning: mockIsNiriRunning,
  listNiriWindows: mockListNiriWindows,
  listNiriWorkspaces: mockListNiriWorkspaces,
  setNiriWorkspaceName: mockSetNiriWorkspaceName,
  unsetNiriWorkspaceName: mockUnsetNiriWorkspaceName,
  moveWindowToWorkspace: mockMoveWindowToWorkspace,
  focusNiriWorkspace: mockFocusNiriWorkspace,
  focusNiriWorkspaceDown: mockFocusNiriWorkspaceDown,
  niriSpawn: mockNiriSpawn,
  snapshotWindowIds: mock(async () => []),
}))

mock.module("@clack/prompts", () => ({
  spinner: () => ({ start: mock(() => {}), stop: mock(() => {}) }),
  log: { warn: mock(() => {}) },
}))

mock.module("@/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
}))

// Cache-busted import after all mocks registered
const { niriIntegration } = await import(
  // @ts-ignore
  "@/lib/integrations/niri?niri-integration-test"
)

// === Shared test context ===
const fakeCtx: IntegrationContext = {
  workspace: { name: "test-ws", branch: "feat/test", repos: [], settings: {} } as any,
  tasksDir: "/tmp/tasks",
  config: { integrations: { niri: { enabled: true } } } as any,
}
const emptyBag: ArtifactBag = {}

beforeEach(() => {
  mockIsNiriRunning.mockReset()
  mockListNiriWorkspaces.mockReset()
  mockListNiriWindows.mockReset()
  mockSetNiriWorkspaceName.mockReset()
  mockUnsetNiriWorkspaceName.mockReset()
  mockMoveWindowToWorkspace.mockReset()
  mockFocusNiriWorkspace.mockReset()
  mockFocusNiriWorkspaceDown.mockReset()
  mockNiriSpawn.mockReset()
  // Re-set default implementations
  mockIsNiriRunning.mockImplementation(async () => true)
  mockListNiriWorkspaces.mockImplementation(async () => [])
  mockListNiriWindows.mockImplementation(async () => [])
})

// ===================================================================
// NIRI_SOCKET gate (NIRI-08)
// ===================================================================
describe("NIRI_SOCKET gate (NIRI-08)", () => {
  test("open() returns null when isNiriRunning returns false", async () => {
    mockIsNiriRunning.mockImplementation(async () => false)

    const result = await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(result).toBeNull()
  })

  test("no niri calls made when gated", async () => {
    mockIsNiriRunning.mockImplementation(async () => false)

    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockSetNiriWorkspaceName.mock.calls.length).toBe(0)
    expect(mockListNiriWorkspaces.mock.calls.length).toBe(0)
    expect(mockFocusNiriWorkspace.mock.calls.length).toBe(0)
    expect(mockFocusNiriWorkspaceDown.mock.calls.length).toBe(0)
  })
})

// ===================================================================
// Workspace creation (NIRI-01, NIRI-04)
// ===================================================================
describe("workspace creation (NIRI-01, NIRI-04)", () => {
  test("creates named workspace when not already named — focusNiriWorkspaceDown then setNiriWorkspaceName", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [])

    await niriIntegration.open(fakeCtx, null, emptyBag)

    // First open: must create a NEW workspace via focusNiriWorkspaceDown, then name it
    expect(mockFocusNiriWorkspaceDown.mock.calls.length).toBe(1)
    expect(mockSetNiriWorkspaceName.mock.calls.length).toBe(1)
    expect(mockSetNiriWorkspaceName.mock.calls[0][0]).toBe("test-ws")
    // Must NOT call focusNiriWorkspace on first open
    expect(mockFocusNiriWorkspace.mock.calls.length).toBe(0)
  })

  test("skips setNiriWorkspaceName and focusNiriWorkspaceDown when workspace already named", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [
      { id: 1, idx: 0, name: "test-ws", is_active: true, is_focused: true, is_urgent: false },
    ])

    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockSetNiriWorkspaceName.mock.calls.length).toBe(0)
    expect(mockFocusNiriWorkspaceDown.mock.calls.length).toBe(0)
  })

  test("focusNiriWorkspace called when workspace already named (re-open)", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [
      { id: 1, idx: 0, name: "test-ws", is_active: true, is_focused: true, is_urgent: false },
    ])

    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockFocusNiriWorkspace.mock.calls.length).toBe(1)
    expect(mockFocusNiriWorkspace.mock.calls[0][0]).toBe("test-ws")
  })
})

// ===================================================================
// Window moves (NIRI-02)
// ===================================================================
describe("window moves (NIRI-02)", () => {
  test("moves windows by niriWindowIds", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 0, app_id: "code", title: "", niriWindowIds: [42] },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(1)
    expect(mockMoveWindowToWorkspace.mock.calls[0][0]).toBe(42)
    expect(mockMoveWindowToWorkspace.mock.calls[0][1]).toBe("test-ws")
  })

  test("moves multiple niriWindowIds from single artifact", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 0, app_id: "code", title: "", niriWindowIds: [42, 43] },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(2)
    expect(mockMoveWindowToWorkspace.mock.calls[0][0]).toBe(42)
    expect(mockMoveWindowToWorkspace.mock.calls[1][0]).toBe(43)
  })

  test("skips window with no niriWindowIds", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "" },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(0)
  })

  test("skips window with empty niriWindowIds array", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "", niriWindowIds: [] },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(0)
  })

  test("moveWindowToWorkspace failure does not abort — integration returns null", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 0, app_id: "code", title: "", niriWindowIds: [42] },
    }
    mockMoveWindowToWorkspace.mockImplementation(async () => {
      throw new Error("move failed")
    })

    const result = await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(result).toBeNull()
    // Integration should NOT throw
  })
})

// ===================================================================
// User commands (NIRI-03, NIRI-09)
// ===================================================================
describe("user commands (NIRI-03, NIRI-09)", () => {
  test("spawns commands via niriSpawn with env var substitution (no shell)", async () => {
    const ctxWithCommands: IntegrationContext = {
      ...fakeCtx,
      config: { integrations: { niri: { enabled: true, commands: ["ghostty -e tmux attach $WS_WORKSPACE"] } } } as any,
    }

    await niriIntegration.open(ctxWithCommands, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(1)
    expect(mockNiriSpawn.mock.calls[0][0]).toEqual(["ghostty", "-e", "tmux", "attach", "test-ws"])
  })

  test("does not call niriSpawn when commands absent", async () => {
    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(0)
  })
})

// ===================================================================
// Cleanup (NIRI-05)
// ===================================================================
describe("cleanup (NIRI-05)", () => {
  test("unsets workspace name when workspace exists", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [
      { id: 1, idx: 0, name: "test-ws", is_active: true, is_focused: true, is_urgent: false },
    ])

    await niriIntegration.cleanup!(fakeCtx)

    expect(mockUnsetNiriWorkspaceName.mock.calls.length).toBe(1)
    expect(mockUnsetNiriWorkspaceName.mock.calls[0][0]).toBe("test-ws")
  })

  test("no-op when isNiriRunning returns false", async () => {
    mockIsNiriRunning.mockImplementation(async () => false)

    await niriIntegration.cleanup!(fakeCtx)

    expect(mockUnsetNiriWorkspaceName.mock.calls.length).toBe(0)
  })

  test("no-op when workspace name not found in niri", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [
      { id: 1, idx: 0, name: "other-ws", is_active: true, is_focused: true, is_urgent: false },
    ])

    await niriIntegration.cleanup!(fakeCtx)

    expect(mockUnsetNiriWorkspaceName.mock.calls.length).toBe(0)
  })
})

// ===================================================================
// Registration metadata (TEST-04)
// ===================================================================
describe("registration (TEST-04)", () => {
  test("niriIntegration has correct metadata", () => {
    expect(niriIntegration.id).toBe("niri")
    expect(niriIntegration.order).toBe(30)
    expect(niriIntegration.enabledByDefault).toBe(false)
  })
})
