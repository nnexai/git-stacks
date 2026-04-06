import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { cleanup, makeConfigMock } from "../helpers"

const tempDirs: string[] = []

// ─── Config mocks ─────────────────────────────────────────────────────────────
const writeWorkspaceMock = mock((_ws: any) => {})
const readGlobalConfigMock = mock(() => ({
  workspace_root: "/tmp/phase-78-root",
  integrations: {},
  ports: { range_start: 10000, range_end: 65000 },
}))

// ─── Git mocks ────────────────────────────────────────────────────────────────
const createWorktreeMock = mock(async (_repo: string, _path: string, _branch: string) => {})
const removeWorktreeMock = mock(async (_repo: string, _path: string) => {})
const ensureUpstreamTrackingMock = mock(async (_repo: string, _branch: string) => ({ tracked: false }))

// ─── Files mocks ──────────────────────────────────────────────────────────────
const applyFileOpsForRepoMock = mock(() => ({ ok: true as const }))
const applyFileOpsForWorkspaceMock = mock(() => ({ ok: true as const }))

// ─── Workspace env mocks ──────────────────────────────────────────────────────
const writeEnvFilesMock = mock(() => {})

// ─── Integration runner mocks ─────────────────────────────────────────────────
const runIntegrationGenerateMock = mock(async () => [] as any[])

// ─── Module mocks ─────────────────────────────────────────────────────────────
mock.module("@/lib/config", () =>
  makeConfigMock({
    writeWorkspace: writeWorkspaceMock,
    readGlobalConfig: readGlobalConfigMock,
    isWorktreeRepo: mock((repo: any) => repo.mode === "worktree"),
  })
)

mock.module("@/lib/git", () => ({
  // createWorkspace consumes these directly:
  createWorktree: createWorktreeMock,
  removeWorktree: removeWorktreeMock,
  ensureUpstreamTracking: ensureUpstreamTrackingMock,
  // Existing clean/close/merge/remove paths in workspace-lifecycle.ts also import
  // these from "./git". Provide harmless stubs so the module loads cleanly.
  checkBranchExists: mock(async () => false),
  getMergeConflicts: mock(async () => [] as string[]),
  mergeNoFF: mock(async () => ({ ok: true })),
  deleteLocalBranch: mock(async () => {}),
}))

mock.module("@/lib/files", () => ({
  applyFileOpsForRepo: applyFileOpsForRepoMock,
  applyFileOpsForWorkspace: applyFileOpsForWorkspaceMock,
  warnExternalFiles: mock(() => [] as string[]),
}))

mock.module("@/lib/workspace-env", () => ({
  writeEnvFiles: writeEnvFilesMock,
  buildBaseEnv: mock(() => ({})),
  buildRepoEnv: mock(() => ({})),
  mergeEnv: mock(() => ({})),
  buildWorkspaceEnv: mock(async () => ({})),
}))

mock.module("@/lib/integrations/runner", () => ({
  runIntegrationGenerate: runIntegrationGenerateMock,
  runIntegrationCleanup: mock(async () => {}),
}))

mock.module("@/lib/integrations", () => ({
  IntegrationContext: {},
  integrations: [],
}))

mock.module("@/lib/workspace-status", () => ({
  getDirtyWorktrees: mock(async () => []),
  getWorkspaceListInfo: mock(async () => []),
  getWorkspaceStatus: mock(async () => []),
  detectWorkspaceFromCwd: mock(() => ({ ok: false, error: "no_match" })),
}))

mock.module("@/lib/paths", () => ({
  HOME: "/tmp/phase-78-home",
  DEFAULT_WORKSPACE_ROOT: "/tmp/phase-78-root",
  WS_CONFIG_DIR: "/tmp/phase-78-config",
  WORKSPACES_DIR: "/tmp/phase-78-config/workspaces",
  GLOBAL_CONFIG_FILE: "/tmp/phase-78-config/config.yml",
  REGISTRY_FILE: "/tmp/phase-78-config/registry.yml",
  TEMPLATES_DIR: "/tmp/phase-78-config/templates",
  MESSAGES_DIR: "/tmp/phase-78-config/messages",
  PORTS_LOCK_FILE: "/tmp/phase-78-config/.ports.lock",
  getMainDir: (wsRoot: string) => `${wsRoot}/main`,
  // Use a unique tasks dir per test run so workspace-instance fixtures don't collide
  // across runs that may try to write to disk.
  getTasksDir: mock((wsRoot: string) => `${wsRoot}/tasks`),
  expandHome: (p: string) => p,
}))

mock.module("@/lib/observability", () => ({
  timeOperation: mock(async (_cat: string, _op: string, fn: () => any) => fn()),
  logDebug: mock(() => {}),
}))

// Hook injection: createWorkspace -> runWorkspaceHooks -> _exec.spawn (the seam
// from Phase 75 already exported on workspace-lifecycle). We control hook
// success/failure by replacing _exec.spawn directly on the module.

// ─── Module-under-test loaded LAST so all mocks are in place ──────────────────
const { createWorkspace, _exec } = await import("@/lib/workspace-lifecycle")

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRepos(names: string[]) {
  return names.map((name) => ({
    name,
    repo: name,
    type: "other" as const,
    mode: "worktree" as const,
    main_path: `/tmp/main/${name}`,
    task_path: `/tmp/phase-78-root/tasks/test-ws/${name}`,
    base_branch: "main",
  }))
}

// Default spawn stub: every hook command exits 0 (success).
function defaultSpawn(_args: any): any {
  return {
    exited: Promise.resolve(0),
    stdout: null,
    stderr: null,
  }
}

beforeEach(() => {
  writeWorkspaceMock.mockClear()
  createWorktreeMock.mockClear()
  removeWorktreeMock.mockClear()
  ensureUpstreamTrackingMock.mockClear()
  applyFileOpsForRepoMock.mockClear()
  applyFileOpsForWorkspaceMock.mockClear()
  writeEnvFilesMock.mockClear()
  runIntegrationGenerateMock.mockClear()

  // Reset default behaviors
  createWorktreeMock.mockImplementation(async () => {})
  removeWorktreeMock.mockImplementation(async () => {})
  ensureUpstreamTrackingMock.mockImplementation(async () => ({ tracked: false }))
  applyFileOpsForRepoMock.mockImplementation(() => ({ ok: true as const }))
  applyFileOpsForWorkspaceMock.mockImplementation(() => ({ ok: true as const }))
  runIntegrationGenerateMock.mockImplementation(async () => [])

  // Reset spawn seam to a passing default
  _exec.spawn = defaultSpawn as any
})

afterAll(() => {
  for (const dir of tempDirs) cleanup(dir)
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createWorkspace", () => {
  describe("happy path (Behavior 1)", () => {
    test("commits workspace YAML and runs integration generate when all steps succeed", async () => {
      const messages: string[] = []
      const result = await createWorkspace(
        { wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a", "b"]) },
        (m) => messages.push(m),
      )

      expect(result.ok).toBe(true)
      expect(createWorktreeMock).toHaveBeenCalledTimes(2)
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(1)
      expect(runIntegrationGenerateMock).toHaveBeenCalledTimes(1)
      expect(removeWorktreeMock).not.toHaveBeenCalled()
      // No "Rollback:" messages on the happy path
      expect(messages.some((m) => m.startsWith("Rollback:"))).toBe(false)
    })
  })

  describe("worktree failure mid-stream (Behavior 2 — success criterion 1)", () => {
    test("rolls back created worktrees in LIFO order and never writes YAML", async () => {
      // Repo A succeeds, Repo B throws
      let calls = 0
      createWorktreeMock.mockImplementation(async (_repo, _path) => {
        calls++
        if (calls === 2) throw new Error("simulated B failure")
      })

      const messages: string[] = []
      const result = await createWorkspace(
        { wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a", "b"]) },
        (m) => messages.push(m),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("simulated B failure") // D-17 verbatim preservation
        expect(result.rollbackErrors).toEqual([])
      }
      // CRITICAL: writeWorkspace NEVER called (success criterion 1, D-10)
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(0)
      expect(runIntegrationGenerateMock).toHaveBeenCalledTimes(0)
      // Repo A's worktree was removed (only one — B's forward never pushed its undo)
      expect(removeWorktreeMock).toHaveBeenCalledTimes(1)
      expect(removeWorktreeMock).toHaveBeenCalledWith(
        "/tmp/main/a",
        expect.stringContaining("/a"),
      )
      // Rollback message routed through onProgress (D-14, D-15)
      expect(messages.some((m) => m === "Rollback: create worktree a")).toBe(true)
    })
  })

  describe("post_create hook failure (Behavior 3 — D-13)", () => {
    test("rolls back all tracked steps when post_create hook throws", async () => {
      // All worktrees succeed; post_create hook fails (spawn returns exitCode 1).
      _exec.spawn = ((_args: any) => ({
        exited: Promise.resolve(1),
        stdout: null,
        stderr: null,
      })) as any

      const result = await createWorkspace(
        {
          wsName: "test-ws",
          branch: "feature/test",
          repos: makeRepos(["a", "b"]),
          wsHooks: { post_create: ["echo done"] },
        },
        () => {},
      )

      expect(result.ok).toBe(false)
      // Both worktrees rolled back in LIFO order (b first, then a)
      expect(removeWorktreeMock).toHaveBeenCalledTimes(2)
      expect(removeWorktreeMock.mock.calls[0]?.[0]).toBe("/tmp/main/b")
      expect(removeWorktreeMock.mock.calls[1]?.[0]).toBe("/tmp/main/a")
      // CRITICAL: writeWorkspace NEVER called (D-10)
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(0)
      expect(runIntegrationGenerateMock).toHaveBeenCalledTimes(0)
    })
  })

  describe("undo failure during rollback (Behavior 4 — ENGN-03 best-effort)", () => {
    test("continues remaining undos when one undo throws", async () => {
      // Repo A and B succeed; Repo C throws.
      // Repo B's removeWorktree throws; Repo A's removeWorktree succeeds.
      createWorktreeMock.mockImplementation(async (_repo, path) => {
        if (path.endsWith("/c")) throw new Error("simulated C failure")
      })
      removeWorktreeMock.mockImplementation(async (_repo, path) => {
        if (path.endsWith("/b")) throw new Error("simulated remove B failure")
      })

      const messages: string[] = []
      const result = await createWorkspace(
        { wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a", "b", "c"]) },
        (m) => messages.push(m),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("simulated C failure") // D-17 preservation
        expect(result.rollbackErrors.length).toBeGreaterThanOrEqual(1)
        expect(
          result.rollbackErrors.some((e) =>
            e.startsWith("Rollback error: create worktree b failed"),
          ),
        ).toBe(true)
      }
      // BOTH B and A's removeWorktree were attempted (best-effort per ENGN-03)
      expect(removeWorktreeMock).toHaveBeenCalledTimes(2)
      // Streamed message for the failure (D-16 mirroring)
      expect(
        messages.some((m) => m.startsWith("Rollback error: create worktree b failed")),
      ).toBe(true)
      // CRITICAL: writeWorkspace NEVER called
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(0)
    })
  })

  describe("integration generate failure (Behavior 5 — D-11 post-commit, no rollback)", () => {
    test("returns ok:true even when runIntegrationGenerate throws", async () => {
      runIntegrationGenerateMock.mockImplementation(async () => {
        throw new Error("integration boom")
      })

      const messages: string[] = []
      const result = await createWorkspace(
        { wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a"]) },
        (m) => messages.push(m),
      )

      expect(result.ok).toBe(true)
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(1) // commit happened
      expect(removeWorktreeMock).not.toHaveBeenCalled() // no rollback
      // Failure surfaced through onProgress (D-11)
      expect(messages.some((m) => m.includes("integration generate failed"))).toBe(true)
    })
  })

  describe("onProgress messages during rollback (Behavior 6 — D-14, D-15)", () => {
    test("rollback messages flow through onProgress with 'Rollback: ' prefix", async () => {
      // Two worktrees, second fails — onProgress spy should receive a "Rollback: " message.
      let calls = 0
      createWorktreeMock.mockImplementation(async () => {
        calls++
        if (calls === 2) throw new Error("simulated second failure")
      })

      const messages: string[] = []
      await createWorkspace(
        { wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a", "b"]) },
        (m) => messages.push(m),
      )

      // At least one Rollback: -prefixed message
      expect(messages.some((m) => m.startsWith("Rollback: "))).toBe(true)
    })
  })

  describe("D-03 facade lock", () => {
    test("createWorkspace is NOT exported from workspace-ops.ts", async () => {
      const ops = await import("@/lib/workspace-ops")
      expect((ops as any).createWorkspace).toBeUndefined()
    })
  })
})
