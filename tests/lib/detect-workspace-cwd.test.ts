import { describe, test, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test"
import { join } from "path"
import { mkdirSync } from "fs"
import { makeTmpDir, cleanup } from "../helpers"
import type { Workspace } from "@/lib/config"

// ============================================================
// Single isolated config for ALL tests in this file.
// We do NOT use useIsolatedConfig() here because its mock.module("@/lib/paths") call
// runs at module-load time. Other test files (e.g., config.test.ts) call
// mock.module("@/lib/paths", ...) DURING test execution, overwriting our mock.
// Instead, we manage the configDir directly and re-apply the mock in beforeAll/beforeEach.
// ============================================================

const configDir = makeTmpDir("cwd-detect")
mkdirSync(join(configDir, "workspaces"), { recursive: true })
mkdirSync(join(configDir, "templates"), { recursive: true })
mkdirSync(join(configDir, "messages"), { recursive: true })

// Apply the paths mock now (at module load) so imports get the right paths.
// This will be re-applied in beforeAll to survive contamination from other test files.
function applyPathsMock() {
  mock.module("@/lib/paths", () => ({
    HOME: configDir,
    DEFAULT_WORKSPACE_ROOT: join(configDir, "ws-root"),
    WS_CONFIG_DIR: configDir,
    WORKSPACES_DIR: join(configDir, "workspaces"),
    GLOBAL_CONFIG_FILE: join(configDir, "config.yml"),
    REGISTRY_FILE: join(configDir, "registry.yml"),
    TEMPLATES_DIR: join(configDir, "templates"),
    MESSAGES_DIR: join(configDir, "messages"),
    getMainDir: (wsRoot: string) => join(wsRoot, "main"),
    getTasksDir: (wsRoot: string) => join(wsRoot, "tasks"),
    expandHome: (p: string) => p.startsWith("~/") ? join(configDir, p.slice(2)) : p,
  }))
}

applyPathsMock()

const isolated = { configDir, cleanup: () => cleanup(configDir) }

// Cache-busting imports so they pick up the mocked paths.
const configMod: {
  writeWorkspace: (ws: Workspace) => void
  listWorkspaces: () => Workspace[]
  workspaceExists: (name: string) => boolean
  readWorkspace: (name: string) => Workspace
  [key: string]: unknown
// @ts-ignore — cache-busting avoids contamination from other test files
} = await import("@/lib/config?cwd-detect")

const { writeWorkspace, listWorkspaces } = configMod

const { detectWorkspaceFromCwd, _cwdDetect }: {
  detectWorkspaceFromCwd: (cwd?: string) => { ok: true; workspace: Workspace } | { ok: false; error: "no_match" }
  _cwdDetect: { listWorkspaces: () => Workspace[] }
// @ts-ignore — cache-busting avoids contamination from other test files
} = await import("@/lib/workspace-ops?cwd-detect")

// ============================================================
// Section 2: resolveWorkspaceArg setup
// Uses injectable _resolveWorkspaceDeps (same pattern as _exec in niri/tmux/cmux)
// to avoid bun mock.module cross-file contamination issues.
// ============================================================

// Mutable state for the mock to return different results per test
let mockDetectResult: { ok: true; workspace: Workspace } | { ok: false; error: "no_match" } = {
  ok: false,
  error: "no_match",
}

const { resolveWorkspaceArg, _resolveWorkspaceDeps }: {
  resolveWorkspaceArg: (workspaceName: string | undefined, tracker: string, action: string) => string
  _resolveWorkspaceDeps: {
    workspaceExists: (name: string) => boolean
    detectWorkspaceFromCwd: () => { ok: true; workspace: Workspace } | { ok: false; error: "no_match" }
  }
// @ts-ignore — cache-busting avoids contamination from other test files
} = await import("@/lib/integrations/issue-utils?cwd-detect")

afterAll(() => isolated.cleanup())

// --- Test workspace factory ---

function makeWorktreeWorkspace(name: string, taskPath: string, extraRepos: Workspace["repos"] = []): Workspace {
  return {
    name,
    schema_version: "1",
    branch: `feat/${name}`,
    created: "2026-01-01",
    repos: [
      {
        name: "repo-a",
        repo: "repo-a",
        type: "other",
        mode: "worktree",
        main_path: "/tmp/main/repo-a",
        task_path: taskPath,
      },
      ...extraRepos,
    ],
  }
}

function makeTrunkWorkspace(name: string, mainPath: string): Workspace {
  return {
    name,
    schema_version: "1",
    branch: `feat/${name}`,
    created: "2026-01-01",
    repos: [
      {
        name: "repo-trunk",
        repo: "repo-trunk",
        type: "other",
        mode: "trunk",
        main_path: mainPath,
        task_path: mainPath, // trunk: task_path = main_path
      },
    ],
  }
}

// --- detectWorkspaceFromCwd tests ---

describe("detectWorkspaceFromCwd", () => {
  // Re-apply paths mock before tests run to survive contamination from other test files
  // (e.g., config.test.ts calls mock.module("@/lib/paths", ...) inside tests)
  beforeAll(() => applyPathsMock())

  // Inject the cache-busted listWorkspaces into _cwdDetect so detectWorkspaceFromCwd
  // reads from our isolated config dir (not the stale module-level import from ./config)
  beforeEach(() => {
    applyPathsMock()
    _cwdDetect.listWorkspaces = () => listWorkspaces()
  })

  test("returns no_match when CWD is not inside any known worktree", () => {
    const result = detectWorkspaceFromCwd("/tmp/tasks/nothing-at-all")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_match")
  })

  test("exact CWD match on worktree task_path returns that workspace", () => {
    writeWorkspace(makeWorktreeWorkspace("exact-ws", "/tmp/tasks/exact-ws/repo-a"))

    const result = detectWorkspaceFromCwd("/tmp/tasks/exact-ws/repo-a")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("exact-ws")
  })

  test("subdirectory of worktree task_path returns that workspace", () => {
    writeWorkspace(makeWorktreeWorkspace("subdir-ws", "/tmp/tasks/subdir-ws/repo-a"))

    const result = detectWorkspaceFromCwd("/tmp/tasks/subdir-ws/repo-a/src/components")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("subdir-ws")
  })

  test("CWD outside all worktree task_paths returns no_match", () => {
    writeWorkspace(makeWorktreeWorkspace("other-ws", "/tmp/tasks/other-ws/repo-a"))

    const result = detectWorkspaceFromCwd("/tmp/completely/different/path")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_match")
  })

  test("deepest match wins when CWD matches multiple workspace paths", () => {
    // ws-parent has a shorter task_path
    writeWorkspace(makeWorktreeWorkspace("ws-parent", "/tmp/tasks/a/repo"))
    // ws-nested has task_path that is a subdirectory of ws-parent's repo
    writeWorkspace({
      name: "ws-nested",
      schema_version: "1",
      branch: "feat/ws-nested",
      created: "2026-01-01",
      repos: [
        {
          name: "repo-nested",
          repo: "repo-nested",
          type: "other",
          mode: "worktree",
          main_path: "/tmp/main/repo-nested",
          task_path: "/tmp/tasks/a/repo/nested-subdir",
        },
      ],
    })

    // CWD is inside the more specific path (ws-nested)
    const result = detectWorkspaceFromCwd("/tmp/tasks/a/repo/nested-subdir/src")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("ws-nested")
  })

  test("trunk-mode repos are never matched even if CWD equals main_path", () => {
    writeWorkspace(makeTrunkWorkspace("trunk-ws", "/tmp/main/trunk-repo"))

    const result = detectWorkspaceFromCwd("/tmp/main/trunk-repo")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_match")
  })

  test("trunk-mode CWD subdirectory does not match", () => {
    writeWorkspace(makeTrunkWorkspace("trunk-ws2", "/tmp/main/trunk-repo2"))

    const result = detectWorkspaceFromCwd("/tmp/main/trunk-repo2/src")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_match")
  })

  test("path prefix collision guard: task_path=/tmp/tasks/repo-na, CWD=/tmp/tasks/repo-name does not match", () => {
    writeWorkspace(makeWorktreeWorkspace("collision-ws", "/tmp/tasks/repo-na"))

    const result = detectWorkspaceFromCwd("/tmp/tasks/repo-name")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_match")
  })

  test("tilde paths in task_path are normalized before comparison", () => {
    // useIsolatedConfig mocks expandHome so "~/" expands to configDir + "/"
    // (the mocked expandHome maps "~/" to the isolated config dir)
    const taskPath = `~/tilde-ws-detect/repo-a`
    const resolvedPath = `${isolated.configDir}/tilde-ws-detect/repo-a`

    writeWorkspace({
      name: "tilde-ws",
      schema_version: "1",
      branch: "feat/tilde-ws",
      created: "2026-01-01",
      repos: [
        {
          name: "repo-a",
          repo: "repo-a",
          type: "other",
          mode: "worktree",
          main_path: "/tmp/main/repo-a",
          task_path: taskPath,
        },
      ],
    })

    // detectWorkspaceFromCwd expands "~/" via the mocked expandHome (configDir)
    const result = detectWorkspaceFromCwd(resolvedPath)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("tilde-ws")
  })

  test("workspace with mix of trunk and worktree repos only matches on worktree repos", () => {
    writeWorkspace({
      name: "mixed-ws",
      schema_version: "1",
      branch: "feat/mixed-ws",
      created: "2026-01-01",
      repos: [
        {
          name: "trunk-repo",
          repo: "trunk-repo",
          type: "other",
          mode: "trunk",
          main_path: "/tmp/main/trunk-repo",
          task_path: "/tmp/main/trunk-repo",
        },
        {
          name: "worktree-repo",
          repo: "worktree-repo",
          type: "other",
          mode: "worktree",
          main_path: "/tmp/main/worktree-repo",
          task_path: "/tmp/tasks/mixed-ws/worktree-repo",
        },
      ],
    })

    // Trunk repo should NOT match
    const trunkResult = detectWorkspaceFromCwd("/tmp/main/trunk-repo/src")
    expect(trunkResult.ok).toBe(false)

    // Worktree repo SHOULD match
    const worktreeResult = detectWorkspaceFromCwd("/tmp/tasks/mixed-ws/worktree-repo/src")
    expect(worktreeResult.ok).toBe(true)
    if (worktreeResult.ok) expect(worktreeResult.workspace.name).toBe("mixed-ws")
  })
})

// --- resolveWorkspaceArg tests ---

describe("resolveWorkspaceArg", () => {
  // Re-apply paths mock before tests run (same reason as detectWorkspaceFromCwd above)
  beforeAll(() => applyPathsMock())

  let exitCode: number | undefined
  const originalExit = process.exit.bind(process)

  const exitMock = mock((code?: number) => {
    exitCode = code
    throw new Error(`process.exit(${code})`)
  })

  beforeEach(() => {
    applyPathsMock()
    exitCode = undefined
    // @ts-ignore — override process.exit for testing
    process.exit = exitMock
    // Reset to no match by default
    mockDetectResult = { ok: false, error: "no_match" }
    // Inject cache-busted deps to avoid cross-file contamination
    _resolveWorkspaceDeps.workspaceExists = (name: string) => configMod.workspaceExists(name)
    _resolveWorkspaceDeps.detectWorkspaceFromCwd = () => mockDetectResult
  })

  afterAll(() => {
    // @ts-ignore — restore process.exit
    process.exit = originalExit
  })

  test("explicit workspace name that exists returns the name", () => {
    writeWorkspace({
      name: "my-ws",
      schema_version: "1",
      branch: "feat/my-ws",
      created: "2026-01-01",
      repos: [],
    })

    const result = resolveWorkspaceArg("my-ws", "jira", "link")
    expect(result).toBe("my-ws")
    expect(exitCode).toBeUndefined()
  })

  test("explicit workspace name that does not exist calls process.exit(1)", () => {
    expect(() => resolveWorkspaceArg("bad-ws", "jira", "link")).toThrow()
    expect(exitCode).toBe(1)
  })

  test("undefined workspaceName with CWD inside a worktree returns detected workspace name", () => {
    mockDetectResult = {
      ok: true,
      workspace: {
        name: "detected-ws",
        schema_version: "1",
        branch: "feat/detected-ws",
        created: "2026-01-01",
        repos: [],
      },
    }

    const result = resolveWorkspaceArg(undefined, "jira", "unlink")
    expect(result).toBe("detected-ws")
    expect(exitCode).toBeUndefined()
  })

  test("undefined workspaceName with CWD outside all worktrees calls process.exit(1)", () => {
    mockDetectResult = { ok: false, error: "no_match" }

    expect(() => resolveWorkspaceArg(undefined, "jira", "open")).toThrow()
    expect(exitCode).toBe(1)
  })

  test("exit error message for CWD no_match mentions tracker and action names", () => {
    mockDetectResult = { ok: false, error: "no_match" }

    const errorMessages: string[] = []
    const originalError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      errorMessages.push(args.map(String).join(" "))
    }

    try {
      resolveWorkspaceArg(undefined, "github", "open")
    } catch {
      // expected — process.exit throws in tests
    }

    console.error = originalError

    expect(errorMessages.some(m => m.includes("github"))).toBe(true)
    expect(errorMessages.some(m => m.includes("open"))).toBe(true)
    expect(errorMessages.some(m => m.includes("Could not detect workspace"))).toBe(true)
  })
})
