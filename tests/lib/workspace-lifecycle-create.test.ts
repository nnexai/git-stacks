import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
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
const createWorktreeMock = mock(async (_repo: string, _path: string, _branch: string) => ({ createdWorktree: true, createdBranch: true }))
const createWorktreeFromRefMock = mock(async (_repo: string, _path: string, _branch: string, _ref: string) => ({ createdWorktree: true, createdBranch: true }))
const removeWorktreeMock = mock(async (_repo: string, _path: string) => {})
const ensureUpstreamTrackingMock = mock(async (_repo: string, _branch: string) => ({ tracked: false }))
const deleteLocalBranchMock = mock(async () => ({ ok: true as const }))
const compareAndSwapBranchMock = mock(async () => ({ ok: true as const }))

// ─── Files mocks ──────────────────────────────────────────────────────────────
const applyFileOpsForRepoMock = mock((_source?: any, _repo?: any) => ({ ok: true as const } as { ok: true } | { ok: false; error: string }))
const applyFileOpsForWorkspaceMock = mock((_source?: any, _workspace?: any, _wsDir?: string) => (
  { ok: true as const } as { ok: true } | { ok: false; error: string }
))

// ─── Workspace env mocks ──────────────────────────────────────────────────────
const writeEnvFilesMock = mock(() => {})

// ─── Integration runner mocks ─────────────────────────────────────────────────
const runIntegrationGenerateMock = mock(async () => [] as any[])
const composeTemplatesMock = mock((_names: string[]) => ({
  name: "my-template",
  schema_version: "1" as const,
  repos: [],
  labels: ["template:shared", "included:ops"],
}))

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
  createWorktreeFromRef: createWorktreeFromRefMock,
  removeWorktree: removeWorktreeMock,
  ensureUpstreamTracking: ensureUpstreamTrackingMock,
  // Existing clean/close/merge/remove paths in workspace-lifecycle.ts also import
  // these from "./git". Provide harmless stubs so the module loads cleanly.
  checkBranchExists: mock(async () => false),
  getMergeConflicts: mock(async () => ({ status: "clean" })),
  mergeNoFF: mock(async () => ({ ok: true })),
  deleteLocalBranch: deleteLocalBranchMock,
  compareAndSwapBranch: compareAndSwapBranchMock,
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

mock.module("@/lib/composition", () => ({
  composeTemplates: composeTemplatesMock,
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
  createWorktreeFromRefMock.mockClear()
  removeWorktreeMock.mockClear()
  ensureUpstreamTrackingMock.mockClear()
  deleteLocalBranchMock.mockClear()
  compareAndSwapBranchMock.mockClear()
  applyFileOpsForRepoMock.mockClear()
  applyFileOpsForWorkspaceMock.mockClear()
  writeEnvFilesMock.mockClear()
  runIntegrationGenerateMock.mockClear()
  composeTemplatesMock.mockClear()

  // Reset default behaviors
  createWorktreeMock.mockImplementation(async () => ({ createdWorktree: true, createdBranch: true }))
  createWorktreeFromRefMock.mockImplementation(async () => ({ createdWorktree: true, createdBranch: true }))
  deleteLocalBranchMock.mockResolvedValue({ ok: true })
  compareAndSwapBranchMock.mockResolvedValue({ ok: true })
  removeWorktreeMock.mockImplementation(async () => {})
  ensureUpstreamTrackingMock.mockImplementation(async () => ({ tracked: false }))
  applyFileOpsForRepoMock.mockImplementation(() => ({ ok: true as const }))
  applyFileOpsForWorkspaceMock.mockImplementation(() => ({ ok: true as const }))
  runIntegrationGenerateMock.mockImplementation(async () => [])
  composeTemplatesMock.mockImplementation((_names: string[]) => ({
    name: "my-template",
    schema_version: "1" as const,
    repos: [],
    labels: ["template:shared", "included:ops"],
  }))

  // Reset spawn seam to a passing default
  _exec.spawn = defaultSpawn as any
})

afterAll(() => {
  for (const dir of tempDirs) cleanup(dir)
  mock.restore()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createWorkspace", () => {
  test("serializes concurrent creation attempts for the same workspace name", async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    createWorktreeMock.mockImplementationOnce(async () => {
      await blocked
      return { createdWorktree: true, createdBranch: true }
    })

    const first = createWorkspace({ wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a"]) })
    await Promise.resolve()
    const second = await createWorkspace({ wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a"]) })
    release()
    const firstResult = await first

    expect(firstResult.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, error: expect.stringContaining("already in progress") })
    expect(writeWorkspaceMock).toHaveBeenCalledTimes(1)
  })

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

    test("copies composed template labels when the caller passes no explicit labels", async () => {
      const result = await createWorkspace({
        wsName: "test-ws",
        branch: "feature/test",
        templateName: "my-template",
        repos: makeRepos(["a"]),
      })

      expect(result.ok).toBe(true)
      expect(composeTemplatesMock).toHaveBeenCalledWith(["my-template"])
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(1)
      expect(writeWorkspaceMock.mock.calls[0]?.[0]).toMatchObject({
        labels: ["template:shared", "included:ops"],
      })
    })

    test("prefers caller-supplied composed template labels and deduplicates user labels", async () => {
      const result = await createWorkspace({
        wsName: "test-ws",
        branch: "feature/test",
        templateName: "my-template",
        templateLabels: ["template:shared", "team:platform"],
        labels: ["team:platform", "cli:one"],
        repos: makeRepos(["a"]),
      })

      expect(result.ok).toBe(true)
      expect(composeTemplatesMock).not.toHaveBeenCalled()
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(1)
      expect(writeWorkspaceMock.mock.calls[0]?.[0]).toMatchObject({
        labels: ["template:shared", "team:platform", "cli:one"],
      })
    })

    test("passes sync-bearing repo and workspace files through file-op surfaces", async () => {
      const repos = makeRepos(["a"]) as Array<ReturnType<typeof makeRepos>[number] & { files?: any }>
      repos[0]!.files = { sync: [{ source: "repo-src", target: "repo-target", git_exclude: true }] }
      const wsFiles = { sync: [{ source: "ws-src", target: "ws-target", git_exclude: true }] }

      const result = await createWorkspace({
        wsName: "test-ws",
        branch: "feature/test",
        repos,
        wsFiles,
      })

      expect(result.ok).toBe(true)
      expect(applyFileOpsForRepoMock).toHaveBeenCalledWith(
        expect.objectContaining({ files: repos[0]!.files }),
        expect.objectContaining({ files: repos[0]!.files }),
      )
      expect(applyFileOpsForWorkspaceMock).toHaveBeenCalledWith(
        { files: wsFiles },
        expect.objectContaining({ files: wsFiles }),
        expect.stringContaining("/tasks/test-ws"),
      )
    })

    test("materializes files.sync targets during workspace creation", async () => {
      applyFileOpsForWorkspaceMock.mockImplementation((_source, _workspace, wsDir) => {
        const target = join(wsDir ?? "", "synced", "config.txt")
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, "create sync\n")
        return { ok: true as const }
      })

      const wsFiles = { sync: [{ source: "private/config.txt", target: "synced/config.txt" }] }
      const result = await createWorkspace({
        wsName: "test-ws",
        branch: "feature/test",
        repos: makeRepos(["a"]),
        wsFiles,
      })

      const target = "/tmp/phase-78-root/tasks/test-ws/synced/config.txt"
      expect(result.ok).toBe(true)
      expect(existsSync(target)).toBe(true)
      expect(readFileSync(target, "utf-8")).toBe("create sync\n")
    })

    test("fails workspace creation when files.sync target is unsafe or conflicting", async () => {
      applyFileOpsForWorkspaceMock.mockImplementation(() => ({
        ok: false as const,
        error: "Sync target already exists: synced/config.txt",
      }))

      const result = await createWorkspace({
        wsName: "test-ws",
        branch: "feature/test",
        repos: makeRepos(["a"]),
        wsFiles: { sync: [{ source: "private/config.txt", target: "synced/config.txt" }] },
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("Sync target")
      }
      expect(writeWorkspaceMock).not.toHaveBeenCalled()
    })

    test("persists wsCommands directly into saved workspace yaml object", async () => {
      const wsCommands = {
        preverify: "echo pre",
        verify: "bun test",
        postverify: "echo post",
      }
      const result = await createWorkspace({
        wsName: "test-ws",
        branch: "feature/test",
        repos: makeRepos(["a"]),
        wsCommands,
      })

      expect(result.ok).toBe(true)
      expect(writeWorkspaceMock).toHaveBeenCalledTimes(1)
      expect(writeWorkspaceMock.mock.calls[0]?.[0]).toMatchObject({
        commands: wsCommands,
      })
    })
  })

  describe("worktree failure mid-stream (Behavior 2 — success criterion 1)", () => {
    test("rolls back created worktrees in LIFO order and never writes YAML", async () => {
      // Repo A succeeds, Repo B throws
      let calls = 0
      createWorktreeMock.mockImplementation(async (_repo, _path) => {
        calls++
        if (calls === 2) throw new Error("simulated B failure")
        return { createdWorktree: true, createdBranch: true }
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

  describe("worktree ownership compensation", () => {
    test("removes a new branch after a later repo fails", async () => {
      let calls = 0
      createWorktreeMock.mockImplementation(async () => {
        calls++
        if (calls === 2) throw new Error("later repo failed")
        return { createdWorktree: true, createdBranch: true }
      })

      const result = await createWorkspace({
        wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a", "b"]),
      })

      expect(result.ok).toBe(false)
      expect(removeWorktreeMock).toHaveBeenCalledWith("/tmp/main/a", expect.any(String))
      expect(deleteLocalBranchMock).toHaveBeenCalledWith("/tmp/main/a", "feature/test")
      expect(writeWorkspaceMock).not.toHaveBeenCalled()
    })

    test("restores a moved source branch after a later repo fails", async () => {
      let calls = 0
      createWorktreeFromRefMock.mockImplementation(async () => {
        calls++
        if (calls === 2) throw new Error("later repo failed")
        return {
          createdWorktree: true,
          createdBranch: false,
          movedBranch: { previousSha: "before", createdSha: "source" },
        }
      })

      const result = await createWorkspace({
        wsName: "test-ws",
        branch: "feature/test",
        repos: makeRepos(["a", "b"]),
        sourceStartRefs: { a: "source/a", b: "source/b" },
      })

      expect(result.ok).toBe(false)
      expect(compareAndSwapBranchMock).toHaveBeenCalledWith("/tmp/main/a", "feature/test", "source", "before")
      expect(deleteLocalBranchMock).not.toHaveBeenCalled()
    })

    test("does not remove a pre-existing worktree after a later repo fails", async () => {
      let calls = 0
      createWorktreeMock.mockImplementation(async () => {
        calls++
        if (calls === 2) throw new Error("later repo failed")
        return { createdWorktree: false, createdBranch: false }
      })

      await createWorkspace({
        wsName: "test-ws", branch: "feature/test", repos: makeRepos(["a", "b"]),
      })

      expect(removeWorktreeMock).not.toHaveBeenCalled()
      expect(deleteLocalBranchMock).not.toHaveBeenCalled()
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
        return { createdWorktree: true, createdBranch: true }
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
        return { createdWorktree: true, createdBranch: true }
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
