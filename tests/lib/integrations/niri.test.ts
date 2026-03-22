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
const mockFocusNiriWindow = mock(async () => {})
const mockSetNiriColumnWidth = mock(async () => {})
const mockConsumeOrExpelWindowLeft = mock(async () => {})
const mockNiriSpawnSh = mock(async () => {})
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
  setNiriColumnWidth: mockSetNiriColumnWidth,
  consumeOrExpelWindowLeft: mockConsumeOrExpelWindowLeft,
  niriSpawnSh: mockNiriSpawnSh,
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
  mockSetNiriColumnWidth.mockReset()
  mockConsumeOrExpelWindowLeft.mockReset()
  mockNiriSpawnSh.mockReset()
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
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("cd /path/to/backend && ghostty -e npm run dev")
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
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("cd /tmp && ghostty")
  })
})

// ===================================================================
// Column config — source: windows (from ArtifactBag)
// ===================================================================
describe("column config — source: windows", () => {
  test("source: window pulls niriWindowIds from bag — no spawn", async () => {
    const bagWithVscode: ArtifactBag = {
      vscode: { kind: "window", pid: 123, app_id: "code", title: "VS Code", niriWindowIds: [77] },
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

  test("source: window with niriWindowId as first column window — width applied", async () => {
    const bagWithVscode: ArtifactBag = {
      vscode: { kind: "window", pid: 123, app_id: "code", title: "VS Code", niriWindowIds: [77] },
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

    // Width should be applied using the source window's ID
    expect(mockFocusNiriWindow.mock.calls.length).toBe(1)
    expect(mockFocusNiriWindow.mock.calls[0][0]).toBe(77)
    expect(mockSetNiriColumnWidth.mock.calls.length).toBe(1)
    expect(mockSetNiriColumnWidth.mock.calls[0][0]).toBe("60%")
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
  test("applies width via focusNiriWindow + setNiriColumnWidth", async () => {
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

    // After placing windows, focus first window then set width
    expect(mockFocusNiriWindow.mock.calls.length).toBe(1)
    expect(mockFocusNiriWindow.mock.calls[0][0]).toBe(100) // first window ID from snapshot
    expect(mockSetNiriColumnWidth.mock.calls.length).toBe(1)
    expect(mockSetNiriColumnWidth.mock.calls[0][0]).toBe("60%")
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

    expect(mockFocusNiriWindow.mock.calls.length).toBe(0)
    expect(mockSetNiriColumnWidth.mock.calls.length).toBe(0)
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
    expect(mockSetNiriColumnWidth.mock.calls.length).toBe(0)
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
            columns: [{ windows: [{ command: "ghostty -e echo $WS_WORKSPACE" }] }],
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
            columns: [{ windows: [{ app: "firefox", args: ["http://localhost/$WS_WORKSPACE"] }] }],
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
            columns: [{ windows: [{ command: "ghostty", cwd: "$WS_TASKS_DIR/mydir" }] }],
          },
        },
      } as any,
    }

    await niriIntegration.open(ctx, null, emptyBag)

    expect(mockNiriSpawnSh.mock.calls.length).toBe(1)
    expect(mockNiriSpawnSh.mock.calls[0][0]).toBe("cd /tmp/tasks/mydir && ghostty")
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
