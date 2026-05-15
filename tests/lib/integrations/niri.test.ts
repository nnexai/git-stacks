import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag } from "@/lib/integrations/types"

// === Register ALL mocks BEFORE any integration imports ===

const mockIsNiriRunning = mock(async () => true)
const mockListNiriWorkspaces = mock(async () => [] as any[])
const mockListNiriWindows = mock(async () => [] as any[])
const mockSetNiriWorkspaceName = mock(async (_name: string, _workspaceRef?: string | number) => {})
const mockUnsetNiriWorkspaceName = mock(async (_name: string) => {})
const mockMoveWindowToWorkspace = mock(async (_windowId: number, _workspaceRef: string | number) => {})
const mockFocusNiriWorkspace = mock(async (_ref: string | number) => {})
const mockFocusNiriWorkspaceDown = mock(async () => {})
const mockNiriSpawn = mock(async (_cmd: string[]) => {})
const mockFocusNiriWindow = mock(async (_windowId: number) => {})
const mockConsumeOrExpelWindowLeft = mock(async (_windowId?: number) => {})
const mockNiriSpawnSh = mock(async (_cmd: string) => {})
const mockMoveColumnToIndex = mock(async (_index: number) => {})
const mockSetWindowWidth = mock(async (_windowId: number, _change: string) => {})
// snapshotWindowIds: call spawn fn and return [100] to simulate a window appearing
const mockSnapshotWindowIds = mock(async (fn: () => Promise<void>) => {
  await fn()
  return [100]
})

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
  snapshotWindowIds: mockSnapshotWindowIds,
  focusNiriWindow: mockFocusNiriWindow,
  consumeOrExpelWindowLeft: mockConsumeOrExpelWindowLeft,
  niriSpawnSh: mockNiriSpawnSh,
  moveColumnToIndex: mockMoveColumnToIndex,
  setWindowWidth: mockSetWindowWidth,
  setNiriColumnWidth: mock(async () => {}),
  _exec: { run: mock(async () => ({ exitCode: 0, stdout: "" })) },
}))

// Mock @/tui/utils (prompts wrapper) — explicit mock replaces dead @clack/prompts mock
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

mock.module("@/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => []),
  _exec: { run: mock(async () => ({ exitCode: 0 })) },
}))

// Cache-busted import after all mocks registered
const { niriIntegration } = await import(
  // @ts-ignore
  "@/lib/integrations/niri?niri-integration-test-v2"
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
  mockFocusNiriWindow.mockReset()
  mockConsumeOrExpelWindowLeft.mockReset()
  mockNiriSpawnSh.mockReset()
  mockMoveColumnToIndex.mockReset()
  mockSetWindowWidth.mockReset()
  mockSnapshotWindowIds.mockReset()
  // Re-set default implementations
  mockIsNiriRunning.mockImplementation(async () => true)
  mockListNiriWorkspaces.mockImplementation(async () => [])
  mockListNiriWindows.mockImplementation(async () => [])
  mockSnapshotWindowIds.mockImplementation(async (fn: () => Promise<void>) => {
    await fn()
    return [100]
  })
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

    // Called twice: once for re-open setup, once to focus back (since focus: true not set)
    expect(mockFocusNiriWorkspace.mock.calls.length).toBe(2)
    expect(mockFocusNiriWorkspace.mock.calls[0][0]).toBe("test-ws")
  })
})

// ===================================================================
// Window moves (NIRI-02)
// ===================================================================
describe("window moves (NIRI-02)", () => {
  test("moves windows by windowIds['niri']", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 0, app_id: "code", title: "", windowIds: { niri: [42] } },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(1)
    expect(mockMoveWindowToWorkspace.mock.calls[0][0]).toBe(42)
    expect(mockMoveWindowToWorkspace.mock.calls[0][1]).toBe("test-ws")
  })

  test("moves multiple windowIds['niri'] from single artifact", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 0, app_id: "code", title: "", windowIds: { niri: [42, 43] } },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(2)
    expect(mockMoveWindowToWorkspace.mock.calls[0][0]).toBe(42)
    expect(mockMoveWindowToWorkspace.mock.calls[1][0]).toBe(43)
  })

  test("skips window with no windowIds", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "" },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(0)
  })

  test("skips window with empty windowIds['niri'] array", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 1234, app_id: "code", title: "", windowIds: { niri: [] } },
    }

    await niriIntegration.open(fakeCtx, null, bagWithWindow)

    expect(mockMoveWindowToWorkspace.mock.calls.length).toBe(0)
  })

  test("moveWindowToWorkspace failure does not abort — integration returns null", async () => {
    const bagWithWindow: ArtifactBag = {
      vscode: { kind: "window", pid: 0, app_id: "code", title: "", windowIds: { niri: [42] } },
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
// Column config — app: windows (niriSpawn, no shell)
// ===================================================================
describe("column config — app: windows", () => {
  test("app: window uses niriSpawn (direct, no shell)", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [
              { windows: [{ app: "firefox", args: ["--new-window", "localhost:3000"] }] },
            ],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockSnapshotWindowIds.mock.calls.length).toBe(1)
    // The spawn fn passed to snapshotWindowIds should call niriSpawn
    expect(mockNiriSpawn.mock.calls.length).toBe(1)
    expect(mockNiriSpawn.mock.calls[0][0]).toEqual(["firefox", "--new-window", "localhost:3000"])
    // niriSpawnSh must NOT be called for app: windows
    expect(mockNiriSpawnSh.mock.calls.length).toBe(0)
  })

  test("app: window with no args uses niriSpawn with just app name", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(1)
    expect(mockNiriSpawn.mock.calls[0][0]).toEqual(["ghostty"])
  })
})

// ===================================================================
// Column config — command: windows (niriSpawnSh, shell)
// ===================================================================
describe("column config — command: windows", () => {
  test("command: window uses niriSpawnSh (shell)", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ command: "ghostty -e npm run dev" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawnSh.mock.calls.length).toBe(1)
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("ghostty -e npm run dev")
    // niriSpawn must NOT be called for command: windows
    expect(mockNiriSpawn.mock.calls.length).toBe(0)
  })

  test("command: window with repo prepends cd to niriSpawnSh", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      workspace: {
        name: "test-ws",
        branch: "feat/test",
        repos: [{ name: "backend", repo: "backend", task_path: "/path/to/backend", main_path: "/main/backend", mode: "worktree" }],
        settings: {},
      } as any,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [
              { windows: [{ command: "ghostty -e npm run dev", repo: "backend" }] },
            ],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawnSh.mock.calls.length).toBe(1)
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("cd '/path/to/backend' && ghostty -e npm run dev")
  })

  test("command: window with cwd prepends cd to niriSpawnSh", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ command: "ghostty", cwd: "/tmp" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawnSh.mock.calls.length).toBe(1)
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("cd '/tmp' && ghostty")
  })
})

// ===================================================================
// Column config — source: windows (from ArtifactBag)
// ===================================================================
describe("column config — source: windows", () => {
  test("source: window pulls windowIds['niri'] from bag — no spawn", async () => {
    const bagWithVscode: ArtifactBag = {
      vscode: { kind: "window", pid: 123, app_id: "code", title: "VS Code", windowIds: { niri: [77] } },
    }
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ source: "vscode" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, bagWithVscode)

    // No spawn calls — source windows are already on the compositor
    expect(mockNiriSpawn.mock.calls.length).toBe(0)
    expect(mockNiriSpawnSh.mock.calls.length).toBe(0)
    expect(mockSnapshotWindowIds.mock.calls.length).toBe(0)
  })

  test("source: window with windowIds['niri'] as first column window — width applied via setWindowWidth", async () => {
    const bagWithVscode: ArtifactBag = {
      vscode: { kind: "window", pid: 123, app_id: "code", title: "VS Code", windowIds: { niri: [77] } },
    }
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ width: "60%", windows: [{ source: "vscode" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, bagWithVscode)

    // Width applied via setWindowWidth(windowId, width) using source window ID
    expect(mockSetWindowWidth.mock.calls.length).toBe(1)
    expect(mockSetWindowWidth.mock.calls[0][0]).toBe(77)
    expect(mockSetWindowWidth.mock.calls[0][1]).toBe("60%")
  })

  test("source: window missing from bag — skips gracefully", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ source: "missing-integration" }] }],
          },
        },
      } as any,
    }

    // Should not throw — just skip
    const result = await niriIntegration.open(ctx, null, emptyBag)

    expect(result).toBeNull()
    expect(mockNiriSpawn.mock.calls.length).toBe(0)
  })
})

// ===================================================================
// Column config — width and multi-window stacking
// ===================================================================
describe("column config — width and stacking", () => {
  test("applies width via setWindowWidth --id (not focusNiriWindow + setNiriColumnWidth)", async () => {
    // snapshotWindowIds returns [100] by default
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ width: "60%", windows: [{ app: "ghostty" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    // Width applied via setWindowWidth(windowId, width) — no focus dependency
    expect(mockSetWindowWidth.mock.calls.length).toBe(1)
    expect(mockSetWindowWidth.mock.calls[0][0]).toBe(100) // first window ID from snapshot
    expect(mockSetWindowWidth.mock.calls[0][1]).toBe("60%")
  })

  test("no width call when column has no width configured", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockSetWindowWidth.mock.calls.length).toBe(0)
  })

  test("stacks multiple windows in column via consumeOrExpelWindowLeft", async () => {
    // Two windows in the column: IDs 100 and 101
    let callCount = 0
    mockSnapshotWindowIds.mockImplementation(async (fn: () => Promise<void>) => {
      await fn()
      callCount++
      return [callCount === 1 ? 100 : 101]
    })

    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty" }, { app: "firefox" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    // consumeOrExpelWindowLeft called for the 2nd window only
    expect(mockConsumeOrExpelWindowLeft.mock.calls.length).toBe(1)
    expect(mockConsumeOrExpelWindowLeft.mock.calls[0][0]).toBe(101)
  })

  test("no consumeOrExpelWindowLeft for single-window column", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockConsumeOrExpelWindowLeft.mock.calls.length).toBe(0)
  })
})

// ===================================================================
// Column config — no-op when no columns
// ===================================================================
describe("column config — no-op", () => {
  test("no-op when columns not configured", async () => {
    // fakeCtx has no columns in config
    await niriIntegration.open(fakeCtx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(0)
    expect(mockNiriSpawnSh.mock.calls.length).toBe(0)
    expect(mockSnapshotWindowIds.mock.calls.length).toBe(0)
    expect(mockFocusNiriWindow.mock.calls.length).toBe(0)
    expect(mockSetWindowWidth.mock.calls.length).toBe(0)
    expect(mockMoveColumnToIndex.mock.calls.length).toBe(0)
    expect(mockConsumeOrExpelWindowLeft.mock.calls.length).toBe(0)
  })

  test("no-op when columns is empty array", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: { niri: { enabled: true, columns: [] } },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(0)
    expect(mockNiriSpawnSh.mock.calls.length).toBe(0)
  })

  test("no-op when column config is invalid", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: { niri: { enabled: true, columns: [{ windows: [] }] } },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(0)
    expect(mockNiriSpawnSh.mock.calls.length).toBe(0)
    expect(mockMoveColumnToIndex.mock.calls.length).toBe(0)
  })
})

// ===================================================================
// Column config — env var substitution
// ===================================================================
describe("column config — env var substitution", () => {
  test("env var substitution in command", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      workspace: { name: "my-workspace", branch: "feat/test", repos: [], settings: {} } as any,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ command: "ghostty -e echo $GS_WORKSPACE_NAME" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawnSh.mock.calls.length).toBe(1)
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("ghostty -e echo my-workspace")
  })

  test("env var substitution in args", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      workspace: { name: "my-workspace", branch: "feat/test", repos: [], settings: {} } as any,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "firefox", args: ["http://localhost/$GS_WORKSPACE_NAME"] }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(1)
    expect(mockNiriSpawn.mock.calls[0][0]).toEqual(["firefox", "http://localhost/my-workspace"])
  })

  test("env var substitution in cwd", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      workspace: { name: "my-workspace", branch: "feat/test", repos: [], settings: {} } as any,
      tasksDir: "/tmp/tasks",
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ command: "ghostty", cwd: "$GS_WORKSPACE_PATH/mydir" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawnSh.mock.calls.length).toBe(1)
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("cd '/tmp/tasks/mydir' && ghostty")
  })
})

// ===================================================================
// Column config — workspace settings override global config
// ===================================================================
describe("column config — config precedence", () => {
  test("workspace settings columns override global config columns", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      workspace: {
        name: "test-ws",
        branch: "feat/test",
        repos: [],
        settings: {
          integrations: {
            niri: {
              columns: [{ windows: [{ app: "alacritty" }] }],
            },
          },
        },
      } as any,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(1)
    // workspace config wins — alacritty, not ghostty
    expect(mockNiriSpawn.mock.calls[0][0]).toEqual(["alacritty"])
  })

  test("falls back to global config when workspace has no columns", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      workspace: {
        name: "test-ws",
        branch: "feat/test",
        repos: [],
        settings: {
          integrations: { niri: { enabled: true } }, // no columns
        },
      } as any,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawn.mock.calls.length).toBe(1)
    expect(mockNiriSpawn.mock.calls[0][0]).toEqual(["ghostty"])
  })
})

// ===================================================================
// Focus behavior
// ===================================================================
describe("focus behavior", () => {
  test("window with focus: true gets focusNiriWindow after layout", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty", focus: true }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    // focusNiriWindow called: once for reorder (Phase 2a) + once for focus: true window (Phase 2d)
    const focusCalls = mockFocusNiriWindow.mock.calls
    expect(focusCalls.length).toBe(2)
    // Last call is the focus: true window
    expect(focusCalls[focusCalls.length - 1][0]).toBe(100) // window ID from snapshotWindowIds
  })

  test("focus: true on config prevents switching back to original workspace", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [
      { id: 1, idx: 0, name: "other-ws", is_active: false, is_focused: true, is_urgent: false },
    ])

    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: { enabled: true, focus: true },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    // focusNiriWorkspace called only for workspace creation (focusNiriWorkspaceDown),
    // NOT called again to switch back to "other-ws"
    const focusWsCalls = mockFocusNiriWorkspace.mock.calls
    // No re-open focus call since workspace doesn't exist yet (focusNiriWorkspaceDown used)
    expect(focusWsCalls.length).toBe(0)
  })

  test("without focus: true, switches back to originally focused workspace", async () => {
    mockListNiriWorkspaces.mockImplementation(async () => [
      { id: 1, idx: 0, name: "other-ws", is_active: false, is_focused: true, is_urgent: false },
    ])

    await niriIntegration.open(fakeCtx, null, emptyBag)

    // Should switch back to "other-ws" since focus is not set
    const focusWsCalls = mockFocusNiriWorkspace.mock.calls
    expect(focusWsCalls.length).toBe(1)
    expect(focusWsCalls[0][0]).toBe("other-ws")
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
// Column reordering (Phase 2) — move-column-to-index
// ===================================================================
describe("column reordering (Phase 2)", () => {
  test("reorders columns via focusNiriWindow + moveColumnToIndex for multi-column layout", async () => {
    // Two columns, each with 1 app window: IDs 100, 101
    let callCount = 0
    mockSnapshotWindowIds.mockImplementation(async (fn: () => Promise<void>) => {
      await fn()
      callCount++
      return [callCount === 1 ? 100 : 101]
    })

    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [
              { windows: [{ app: "ghostty" }] },
              { windows: [{ app: "firefox" }] },
            ],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    // Phase 2a: focusNiriWindow then moveColumnToIndex for each column (left-to-right)
    const focusCalls = mockFocusNiriWindow.mock.calls
    const moveCalls = mockMoveColumnToIndex.mock.calls
    expect(moveCalls.length).toBe(2)
    // Column 0 (ci=0): focus window 100, move to index 1
    expect(focusCalls[0][0]).toBe(100)
    expect(moveCalls[0][0]).toBe(1)
    // Column 1 (ci=1): focus window 101, move to index 2
    expect(focusCalls[1][0]).toBe(101)
    expect(moveCalls[1][0]).toBe(2)
  })

  test("calls moveColumnToIndex for single-column layout", async () => {
    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [{ windows: [{ app: "ghostty" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    // Single column: still positions it at index 1
    expect(mockMoveColumnToIndex.mock.calls.length).toBe(1)
    expect(mockMoveColumnToIndex.mock.calls[0][0]).toBe(1)
  })

  test("reorders before stacking — moveColumnToIndex calls happen before consumeOrExpelWindowLeft", async () => {
    // 2 columns: first has 2 windows, second has 1. IDs: 100, 101, 102
    let callCount = 0
    mockSnapshotWindowIds.mockImplementation(async (fn: () => Promise<void>) => {
      await fn()
      callCount++
      if (callCount === 1) return [100]
      if (callCount === 2) return [101]
      return [102]
    })

    const callOrder: string[] = []
    mockMoveColumnToIndex.mockImplementation(async (_index: number) => {
      callOrder.push("move")
    })
    mockConsumeOrExpelWindowLeft.mockImplementation(async (_windowId?: number) => {
      callOrder.push("stack")
    })

    const ctx: IntegrationContext = {
      ...fakeCtx,
      config: {
        integrations: {
          niri: {
            enabled: true,
            columns: [
              { windows: [{ app: "ghostty" }, { app: "terminal" }] },
              { windows: [{ app: "firefox" }] },
            ],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    // All move calls must come before any stack calls
    const firstMoveIdx = callOrder.indexOf("move")
    const lastMoveIdx = callOrder.lastIndexOf("move")
    const firstStackIdx = callOrder.indexOf("stack")

    expect(firstMoveIdx).toBeGreaterThanOrEqual(0) // at least one move call
    expect(firstStackIdx).toBeGreaterThanOrEqual(0) // at least one stack call
    expect(lastMoveIdx).toBeLessThan(firstStackIdx) // all moves before first stack
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
