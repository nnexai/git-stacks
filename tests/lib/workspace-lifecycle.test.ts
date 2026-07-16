import { afterAll, beforeEach, describe, expect, mock, test } from "@test/api"
import { existsSync, mkdirSync } from "fs"
import { join } from "path"
import { runProcess } from "../process"
import { cleanup, makeConfigMock, makeTmpDir } from "../helpers"

const tempDirs: string[] = []

// ─── Config mocks ─────────────────────────────────────────────────────────────
const workspaceExistsMock = mock((_name: string) => false)
const readWorkspaceMock = mock((_name: string) => ({}) as any)
const readGlobalConfigMock = mock(() => ({
  workspace_root: "/tmp/phase-75-root",
  integrations: {},
  ports: { range_start: 10000, range_end: 65000 },
}))
const deleteWorkspaceMock = mock((_name: string) => {})
const workspaceFilePathMock = mock((name: string) => `/tmp/phase-75-config/workspaces/${name}.yml`)

// ─── Git mocks ────────────────────────────────────────────────────────────────
const getMergeConflictsMock = mock(async () => ({ status: "clean" } as any))
const checkBranchExistsMock = mock(async () => false)
const removeWorktreeMock = mock(async (_mainPath: string, _taskPath: string) => {})

// ─── Integration runner mock ──────────────────────────────────────────────────
const runIntegrationCleanupMock = mock(async () => {})

// ─── Files mock ───────────────────────────────────────────────────────────────
const warnExternalFilesMock = mock(() => [] as string[])

// ─── Workspace env mock ───────────────────────────────────────────────────────
const buildBaseEnvMock = mock((_workspace: any, _tasksDir: string, triggeredBy: string) => ({
  GS_WORKSPACE_NAME: "test-ws",
  GS_WORKSPACE_BRANCH: "feature/test",
  GS_WORKSPACE_PATH: "/tmp/phase-75-root/tasks/test-ws",
  GS_TRIGGERED_BY: triggeredBy,
}))
const buildRepoEnvMock = mock((_baseEnv: any, _repo: any) => ({}))

// ─── Workspace status mock ────────────────────────────────────────────────────
const getDirtyWorktreesMock = mock(async () => [] as string[])

// ─── Paths mock ───────────────────────────────────────────────────────────────
const getTasksDirMock = mock((_wsRoot: string) => "/tmp/phase-75-root/tasks")

mock.module("@/lib/config", () =>
  makeConfigMock({
    workspaceExists: workspaceExistsMock,
    readWorkspace: readWorkspaceMock,
    readGlobalConfig: readGlobalConfigMock,
    deleteWorkspace: deleteWorkspaceMock,
    workspaceFilePath: workspaceFilePathMock,
    isWorktreeRepo: mock((repo: any) => repo.mode === "worktree"),
  })
)

mock.module("@/lib/git", () => ({
  getMergeConflicts: getMergeConflictsMock,
  checkBranchExists: checkBranchExistsMock,
  removeWorktree: removeWorktreeMock,
  mergeNoFF: mock(async () => ({ ok: true })),
  deleteLocalBranch: mock(async () => {}),
}))

mock.module("@/lib/integrations/runner", () => ({
  runIntegrationCleanup: runIntegrationCleanupMock,
}))

mock.module("@/lib/integrations", () => ({
  IntegrationContext: {},
}))

mock.module("@/lib/files", () => ({
  warnExternalFiles: warnExternalFilesMock,
}))

mock.module("@/lib/workspace-env", () => ({
  buildBaseEnv: buildBaseEnvMock,
  buildRepoEnv: buildRepoEnvMock,
  mergeEnv: mock(() => ({})),
  writeEnvFiles: mock(async () => {}),
  buildWorkspaceEnv: mock(async () => ({})),
}))

mock.module("@/lib/workspace-status", () => ({
  getDirtyWorktrees: getDirtyWorktreesMock,
  getWorkspaceListInfo: mock(async () => []),
  getWorkspaceStatus: mock(async () => []),
  detectWorkspaceFromCwd: mock(() => ({ ok: false, error: "no_match" })),
}))

mock.module("@/lib/paths", () => ({
  HOME: "/tmp/phase-75-home",
  DEFAULT_WORKSPACE_ROOT: "/tmp/phase-75-root",
  WS_CONFIG_DIR: "/tmp/phase-75-config",
  WORKSPACES_DIR: "/tmp/phase-75-config/workspaces",
  GLOBAL_CONFIG_FILE: "/tmp/phase-75-config/config.yml",
  REGISTRY_FILE: "/tmp/phase-75-config/registry.yml",
  TEMPLATES_DIR: "/tmp/phase-75-config/templates",
  PORTS_LOCK_FILE: "/tmp/phase-75-config/.ports.lock",
  getMainDir: (_wsRoot: string) => `${_wsRoot}/main`,
  getTasksDir: getTasksDirMock,
  expandHome: (p: string) => p,
}))

mock.module("@/lib/observability", () => ({
  timeOperation: mock(async (_cat: string, _op: string, fn: () => any) => fn()),
  logDebug: mock(() => {}),
}))

const {
  closeWorkspace,
  inspectWorkspaceRemoval,
  commitWorkspaceRemoval,
  _exec,
} = await import("../../packages/core/src/workspace-lifecycle")

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeTestWorkspace(hooks?: { pre_close?: string[] }): any {
  return {
    name: "test-ws",
    branch: "feature/test",
    created: "2026-04-05T00:00:00.000Z",
    repos: [],
    hooks: hooks ?? { pre_close: ["echo PRE_CLOSE"] },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("workspace-lifecycle exec seam", () => {
  let tempRoot = ""

  beforeEach(() => {
    tempRoot = makeTmpDir("ws-lifecycle")
    tempDirs.push(tempRoot)

    workspaceExistsMock.mockReset()
    readWorkspaceMock.mockReset()
    getDirtyWorktreesMock.mockReset()
    runIntegrationCleanupMock.mockReset()
    removeWorktreeMock.mockReset()
    deleteWorkspaceMock.mockReset()
    workspaceFilePathMock.mockReset()
    buildBaseEnvMock.mockReset()

    workspaceExistsMock.mockImplementation(() => true)
    getDirtyWorktreesMock.mockImplementation(async () => [])
    runIntegrationCleanupMock.mockImplementation(async () => {})
    removeWorktreeMock.mockImplementation(async () => {})
    deleteWorkspaceMock.mockImplementation(() => {})
    workspaceFilePathMock.mockImplementation((name: string) => `/tmp/phase-75-config/workspaces/${name}.yml`)
    buildBaseEnvMock.mockImplementation((_workspace: any, _tasksDir: string, triggeredBy: string) => ({
      GS_WORKSPACE_NAME: "test-ws",
      GS_WORKSPACE_BRANCH: "feature/test",
      GS_WORKSPACE_PATH: "/tmp/phase-75-root/tasks/test-ws",
      GS_TRIGGERED_BY: triggeredBy,
    }))

    // Restore the real spawn implementation before each test
    _exec.spawn = (args: any): any => {
      const proc = runProcess(args.cmd, {
        cwd: args.cwd,
        env: args.env,
        stdout: args.stdout,
        stderr: args.stderr,
      })
      return {
        exited: proc.exited,
        stdout: args.stdout === "pipe" ? (proc.stdout ?? null) : null,
        stderr: args.stderr === "pipe" ? (proc.stderr ?? null) : null,
      }
    }
  })

  afterAll(() => {
    for (const dir of tempDirs) {
      cleanup(dir)
    }
  })

  test("closeWorkspace calls _exec.spawn with cmd=['/bin/sh', '-c', hook] stdout=inherit stderr=inherit and GS_TRIGGERED_BY=close", async () => {
    const workspace = makeTestWorkspace({ pre_close: ["echo PRE_CLOSE"] })
    readWorkspaceMock.mockImplementation(() => workspace)

    const spawnCalls: any[] = []
    _exec.spawn = (args: any): any => {
      spawnCalls.push(args)
      return {
        exited: Promise.resolve(0),
        stdout: null,
        stderr: null,
      }
    }

    const result = await closeWorkspace("test-ws", {})

    expect(result.ok).toBe(true)
    expect(spawnCalls.length).toBeGreaterThanOrEqual(1)
    const hookCall = spawnCalls.find((c) => c.cmd[2] === "echo PRE_CLOSE")
    expect(hookCall).toBeDefined()
    expect(hookCall.cmd).toEqual(["/bin/sh", "-c", "echo PRE_CLOSE"])
    expect(hookCall.stdout).toBe("inherit")
    expect(hookCall.stderr).toBe("inherit")
    expect(hookCall.env.GS_TRIGGERED_BY).toBe("close")
  })

  test("closeWorkspace captured=true calls _exec.spawn with stdout=pipe stderr=pipe and forwards output lines through onProgress", async () => {
    const workspace = makeTestWorkspace({ pre_close: ["echo PRE_CLOSE"] })
    readWorkspaceMock.mockImplementation(() => workspace)

    const progressLines: string[] = []

    _exec.spawn = (args: any): any => {
      const encoder = new TextEncoder()
      // Create a readable stream that emits the hook output then closes
      const makeStream = (text: string) => new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(encoder.encode(text + "\n"))
          ctrl.close()
        },
      })

      return {
        exited: Promise.resolve(0),
        stdout: args.stdout === "pipe" ? makeStream("PRE_CLOSE") : null,
        stderr: args.stderr === "pipe" ? makeStream("") : null,
      }
    }

    const result = await closeWorkspace("test-ws", { captured: true }, (msg) => progressLines.push(msg))

    expect(result.ok).toBe(true)
    expect(progressLines).toContain("PRE_CLOSE")
    expect(progressLines).toContain("Closed 'test-ws'.")
  })

  test("inspectWorkspaceRemoval reports every dirty blocker with zero mutation", async () => {
    const workspace = makeTestWorkspace()
    readWorkspaceMock.mockImplementation(() => workspace)
    getDirtyWorktreesMock.mockImplementation(async () => ["api", "worker"])

    const inspected = await inspectWorkspaceRemoval("test-ws")

    expect(inspected).toMatchObject({
      ok: false,
      code: "workspace_dirty",
      blocking_repositories: ["api", "worker"],
    })
    expect(inspected).toHaveProperty("plan")
    expect(removeWorktreeMock).not.toHaveBeenCalled()
    expect(deleteWorkspaceMock).not.toHaveBeenCalled()
    expect(runIntegrationCleanupMock).not.toHaveBeenCalled()
  })

  test("commitWorkspaceRemoval bypasses only an inspected dirty guard when explicitly authorized", async () => {
    const taskPath = join(tempRoot, "tasks", "test-ws", "api")
    mkdirSync(taskPath, { recursive: true })
    getTasksDirMock.mockImplementation(() => join(tempRoot, "tasks"))
    readWorkspaceMock.mockImplementation(() => ({
      ...makeTestWorkspace({ pre_close: ["exit 23"] }),
      repos: [{ name: "api", repo: "api", type: "other", mode: "worktree", main_path: join(tempRoot, "main", "api"), task_path: taskPath }],
    }))
    getDirtyWorktreesMock.mockImplementation(async () => ["api"])
    _exec.spawn = () => ({ exited: Promise.resolve(23), stdout: null, stderr: null }) as any

    const inspected = await inspectWorkspaceRemoval("test-ws")
    expect(inspected.ok).toBe(false)
    if (inspected.ok || inspected.code !== "workspace_dirty") throw new Error("expected dirty inspection")

    const refused = await commitWorkspaceRemoval(inspected.plan)
    expect(refused).toMatchObject({ ok: false, code: "workspace_dirty", blocking_repositories: ["api"] })
    expect(removeWorktreeMock).not.toHaveBeenCalled()

    const forced = await commitWorkspaceRemoval(inspected.plan, { allow_dirty: true })
    expect(forced.ok).toBe(false)
    expect(forced.error).toContain("pre_close")
    expect(removeWorktreeMock).not.toHaveBeenCalled()
    expect(deleteWorkspaceMock).not.toHaveBeenCalled()
    expect(existsSync(taskPath)).toBe(true)
  })

  test("commitWorkspaceRemoval reports phases immediately before their destructive calls", async () => {
    const taskPath = join(tempRoot, "tasks", "test-ws", "api")
    mkdirSync(taskPath, { recursive: true })
    getTasksDirMock.mockImplementation(() => join(tempRoot, "tasks"))
    readWorkspaceMock.mockImplementation(() => ({
      ...makeTestWorkspace({}),
      repos: [{ name: "api", repo: "api", type: "other", mode: "worktree", main_path: join(tempRoot, "main", "api"), task_path: taskPath }],
    }))
    const calls: string[] = []
    removeWorktreeMock.mockImplementation(async () => { calls.push("removeWorktree") })
    deleteWorkspaceMock.mockImplementation(() => { calls.push("deleteWorkspace") })

    const inspected = await inspectWorkspaceRemoval("test-ws")
    expect(inspected.ok).toBe(true)
    if (!inspected.ok) throw new Error("expected clean inspection")

    const committed = await commitWorkspaceRemoval(inspected.plan, {
      onPhase: async (phase) => { calls.push(phase) },
    })

    expect(committed.ok).toBe(true)
    expect(calls).toEqual([
      "removing_worktrees",
      "removeWorktree",
      "deleting_workspace_files",
      "deleteWorkspace",
    ])
  })
})
