import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag } from "@/lib/integrations/types"

// === Register ALL mocks BEFORE any integration imports ===

const mockIsNiriRunning = mock(async () => true)
const mockListNiriWorkspaces = mock(async () => [] as any[])
const mockListNiriWindows = mock(async () => [] as any[])
const mockSetNiriWorkspaceName = mock(async () => {})
const mockMoveWindowToWorkspace = mock(async () => {})
const mockFocusNiriWorkspace = mock(async () => {})
const mockRunHooks = mock(async () => {})

mock.module("@/lib/niri", () => ({
  isNiriRunning: mockIsNiriRunning,
  listNiriWindows: mockListNiriWindows,
  listNiriWorkspaces: mockListNiriWorkspaces,
  setNiriWorkspaceName: mockSetNiriWorkspaceName,
  moveWindowToWorkspace: mockMoveWindowToWorkspace,
  focusNiriWorkspace: mockFocusNiriWorkspace,
  niriSpawn: mock(async () => {}),
  snapshotWindowIds: mock(async () => []),
}))

mock.module("@clack/prompts", () => ({
  spinner: () => ({ start: mock(() => {}), stop: mock(() => {}) }),
  log: { warn: mock(() => {}) },
}))

mock.module("@/lib/lifecycle", () => ({
  runHooks: mockRunHooks,
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
  mockMoveWindowToWorkspace.mockReset()
  mockFocusNiriWorkspace.mockReset()
  mockRunHooks.mockReset()
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
  })
})

// ===================================================================
// Workspace creation (NIRI-01, NIRI-04)
// ===================================================================
describe("workspace creation (NIRI-01, NIRI-04)", () => {
  test("creates named workspace when not already named", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [])

    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockSetNiriWorkspaceName.mock.calls.length).toBe(1)
    expect(mockSetNiriWorkspaceName.mock.calls[0][0]).toBe("test-ws")
  })

  test("skips setNiriWorkspaceName when workspace already named", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [
      { id: 1, idx: 0, name: "test-ws", is_active: true, is_focused: true, is_urgent: false },
    ])

    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockSetNiriWorkspaceName.mock.calls.length).toBe(0)
  })

  test("focusNiriWorkspace always called when workspace not already named", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [])

    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockFocusNiriWorkspace.mock.calls.length).toBe(1)
    expect(mockFocusNiriWorkspace.mock.calls[0][0]).toBe("test-ws")
  })

  test("focusNiriWorkspace always called when workspace already named", async () => {
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
  test("moves windows matching by pid", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "vscode" },
    }
    mockListNiriWindows.mockImplementation(async () => [
      { id: 42, pid: 1234, is_focused: false, is_floating: false, is_urgent: false },
    ])

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(1)
    expect(mockMoveWindowToWorkspace.mock.calls[0][0]).toBe(42)
    expect(mockMoveWindowToWorkspace.mock.calls[0][1]).toBe("test-ws")
  })

  test("skips window with no pid match", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "vscode" },
    }
    mockListNiriWindows.mockImplementation(async () => [
      { id: 42, pid: 9999, is_focused: false, is_floating: false, is_urgent: false },
    ])

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(0)
  })

  test("skips niri window with null pid (nullable guard)", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "vscode" },
    }
    mockListNiriWindows.mockImplementation(async () => [
      { id: 42, pid: null, is_focused: false, is_floating: false, is_urgent: false },
    ])

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(0)
  })

  test("moveWindowToWorkspace failure does not abort — integration returns null", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "vscode" },
    }
    mockListNiriWindows.mockImplementation(async () => [
      { id: 42, pid: 1234, is_focused: false, is_floating: false, is_urgent: false },
    ])
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
  test("executes commands via runHooks with hook env", async () => {
    const ctxWithCommands: IntegrationContext = {
      ...fakeCtx,
      config: { integrations: { niri: { enabled: true, commands: ["echo hello"] } } } as any,
    }

    await niriIntegration.open(ctxWithCommands, null, emptyBag)

    expect(mockRunHooks.mock.calls.length).toBe(1)
    const [commands, cwd, env, abortOnFailure] = mockRunHooks.mock.calls[0]
    expect(commands).toEqual(["echo hello"])
    expect(cwd).toBe("/tmp/tasks")
    expect(env).toEqual({
      WS_WORKSPACE: "test-ws",
      WS_BRANCH: "feat/test",
      WS_TASKS_DIR: "/tmp/tasks",
    })
    expect(abortOnFailure).toBe(false)
  })

  test("does not call runHooks when commands absent", async () => {
    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockRunHooks.mock.calls.length).toBe(0)
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
