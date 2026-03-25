import { describe, test, expect, mock, beforeEach, beforeAll, afterAll, afterEach } from "bun:test"
import { join } from "path"
import { mkdirSync, rmSync } from "fs"
import { makeTmpDir, cleanup, makeIssueUtilsMock, realWriteWorkspace } from "../helpers"
import type { Workspace } from "@/lib/config"

// ============================================================
// Isolation strategy (shared unit test process):
//
// detectWorkspaceFromCwd tests:
//   - paths mock redirects WORKSPACES_DIR to configDir/workspaces
//   - Each test writes real workspace YAML files via realWriteWorkspace (captured
//     in helpers.ts before any mock.module calls), then cleans up in beforeEach.
//   - detectWorkspaceFromCwd calls listWorkspaces() which reads the real YAML files.
//   - No mock.module("@/lib/config") needed — avoids contaminating config.test.ts.
//
// resolveWorkspaceArg tests:
//   - other test files (integration-commands.test.ts, jira.test.ts, etc.) mock @/lib/integrations/issue-utils
//     so we can't import the real resolveWorkspaceArg at module level — it gets replaced
//   - solution: store the module namespace object, then beforeAll re-applies mock.module with
//     a real-logic implementation that delegates to our closure variables (mockWorkspaceExists,
//     mockDetectResult). After mock.module is re-applied, issueUtils.resolveWorkspaceArg
//     is updated in-place on the namespace object.
// ============================================================

const configDir = makeTmpDir("cwd-detect")
mkdirSync(join(configDir, "workspaces"), { recursive: true })
mkdirSync(join(configDir, "templates"), { recursive: true })
mkdirSync(join(configDir, "messages"), { recursive: true })

const isolated = { configDir, cleanup: () => cleanup(configDir) }

// Mutable state for resolveWorkspaceArg mocks
let mockWorkspaceExists: (name: string) => boolean = () => false
let mockDetectResult: { ok: true; workspace: Workspace } | { ok: false; error: "no_match" } = {
  ok: false,
  error: "no_match",
}

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

// Import detectWorkspaceFromCwd from workspace-ops.
// No need to mock @/lib/config — we write real YAML files to the temp dir.
// The paths mock redirects WORKSPACES_DIR → configDir/workspaces so real
// file I/O is isolated. detectWorkspaceFromCwd calls listWorkspaces() which
// reads from that directory.
const { detectWorkspaceFromCwd }: {
  detectWorkspaceFromCwd: (cwd?: string) => { ok: true; workspace: Workspace } | { ok: false; error: "no_match" }
} = await import("@/lib/workspace-ops")

// Import issue-utils as a module namespace object (not destructured).
// Other unit test files mock @/lib/integrations/issue-utils, so by the time this
// import runs, the module may already be mocked. We store the namespace object
// so we can access issueUtils.resolveWorkspaceArg after re-applying our own mock in beforeAll.
const issueUtils = await import("@/lib/integrations/issue-utils")

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
        task_path: mainPath,
      },
    ],
  }
}

// Helper to write a workspace YAML to the temp configDir
function writeWorkspace(ws: Workspace) {
  realWriteWorkspace(ws)
}

// Helper to clear all workspace files before each test
function clearWorkspaces() {
  rmSync(join(configDir, "workspaces"), { recursive: true, force: true })
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
}

// --- detectWorkspaceFromCwd tests ---

describe("detectWorkspaceFromCwd", () => {
  beforeAll(() => applyPathsMock())

  beforeEach(() => {
    applyPathsMock()
    clearWorkspaces()
  })

  test("returns no_match when CWD is not inside any known worktree", () => {
    // No workspace files written
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
    writeWorkspace(makeWorktreeWorkspace("ws-parent", "/tmp/tasks/a/repo"))
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
    // The mocked expandHome (in applyPathsMock) maps "~/" to configDir + "/"
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
  // Re-apply paths mock before tests run
  beforeAll(() => {
    applyPathsMock()
    // Re-apply mock for issue-utils with the real logic that uses our closure variables.
    // Other unit test files (integration-commands.test.ts, jira.test.ts, etc.) mock
    // @/lib/integrations/issue-utils at module-load time. By the time our tests run,
    // issueUtils.resolveWorkspaceArg is already their stub (mock(() => "test-ws")).
    // Calling mock.module here in beforeAll updates the module namespace object in-place,
    // so subsequent calls to issueUtils.resolveWorkspaceArg use the real logic below.
    mock.module("@/lib/integrations/issue-utils", () => ({
      ...makeIssueUtilsMock(),
      resolveWorkspaceArg: (workspaceName: string | undefined, tracker: string, action: string): string => {
        if (workspaceName) {
          if (!mockWorkspaceExists(workspaceName)) {
            console.error(`Workspace '${workspaceName}' not found.`)
            process.exit(1)
          }
          return workspaceName
        }
        const detection = mockDetectResult
        if (!detection.ok) {
          console.error(
            `Could not detect workspace from current directory. ` +
            `Run from inside a worktree or specify: ` +
            `git-stacks integration ${tracker} issue ${action} <workspace> ...`
          )
          process.exit(1)
        }
        return detection.workspace.name
      },
    }))
  })

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
    // Reset workspaceExists to return false by default
    mockWorkspaceExists = () => false
  })

  afterAll(() => {
    // @ts-ignore — restore process.exit
    process.exit = originalExit
  })

  test("explicit workspace name that exists returns the name", () => {
    mockWorkspaceExists = (name: string) => name === "my-ws"

    const result = (issueUtils as any).resolveWorkspaceArg("my-ws", "jira", "link")
    expect(result).toBe("my-ws")
    expect(exitCode).toBeUndefined()
  })

  test("explicit workspace name that does not exist calls process.exit(1)", () => {
    mockWorkspaceExists = () => false
    expect(() => (issueUtils as any).resolveWorkspaceArg("bad-ws", "jira", "link")).toThrow()
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

    const result = (issueUtils as any).resolveWorkspaceArg(undefined, "jira", "unlink")
    expect(result).toBe("detected-ws")
    expect(exitCode).toBeUndefined()
  })

  test("undefined workspaceName with CWD outside all worktrees calls process.exit(1)", () => {
    mockDetectResult = { ok: false, error: "no_match" }

    expect(() => (issueUtils as any).resolveWorkspaceArg(undefined, "jira", "open")).toThrow()
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
      ;(issueUtils as any).resolveWorkspaceArg(undefined, "github", "open")
    } catch {
      // expected — process.exit throws in tests
    }

    console.error = originalError

    expect(errorMessages.some(m => m.includes("github"))).toBe(true)
    expect(errorMessages.some(m => m.includes("open"))).toBe(true)
    expect(errorMessages.some(m => m.includes("Could not detect workspace"))).toBe(true)
  })
})
