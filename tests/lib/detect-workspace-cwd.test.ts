import { describe, test, expect, beforeEach, afterAll, vi } from "@test/api"
import { join } from "path"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import {
  cleanup,
  realInvalidateConfigCache,
  realWriteWorkspace,
} from "../helpers"
import type { Workspace } from "@/lib/config"

// ============================================================
// Isolation strategy:
//
// detectWorkspaceFromCwd tests:
//   - The per-file GIT_STACKS_CONFIG_DIR redirects workspace storage to a fixture.
//   - Each test writes real workspace YAML files via realWriteWorkspace, then
//     cleans up in beforeEach.
//   - detectWorkspaceFromCwd calls listWorkspaces() which reads the real YAML files.
//   - No config or path module replacement is required.
// ============================================================

const configDir = process.env.GIT_STACKS_CONFIG_DIR!
mkdirSync(join(configDir, "workspaces"), { recursive: true })
mkdirSync(join(configDir, "templates"), { recursive: true })

const isolated = { configDir, cleanup: () => cleanup(configDir) }

// Import detectWorkspaceFromCwd from workspace-ops.
// No need to mock @/lib/config — we write real YAML files to the temp dir.
// GIT_STACKS_CONFIG_DIR directs real file I/O to this test file's fixture.
const { detectWorkspaceFromCwd }: {
  detectWorkspaceFromCwd: (cwd?: string) => { ok: true; workspace: Workspace } | { ok: false; error: "no_match" }
} = await import("@/lib/workspace-status")

// Keep module namespaces intact so replacements made later in this file can be
// observed through their exported bindings.
const workspaceResolution = await import("@/lib/workspace-resolution")
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

function workspaceRoot(name: string): string {
  return join(configDir, "ws-root", "tasks", name)
}

// Helper to write a workspace YAML to the temp configDir
function writeWorkspace(ws: Workspace) {
  realWriteWorkspace(ws)
}

// Helper to clear all workspace files before each test
function clearWorkspaces() {
  rmSync(join(configDir, "workspaces"), { recursive: true, force: true })
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
  writeFileSync(join(configDir, "config.yml"), `workspace_root: ${join(configDir, "ws-root")}\n`)
  // Reset the real config module's process-global index with the filesystem
  // fixture. Otherwise removed YAML can remain visible to a later test.
  realInvalidateConfigCache()
}

// --- detectWorkspaceFromCwd tests ---

describe("detectWorkspaceFromCwd", () => {
  beforeEach(() => {
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

  test("exact workspace root CWD returns that workspace", () => {
    writeWorkspace(makeWorktreeWorkspace("root-ws", "/tmp/missing/root-ws/repo-a"))

    const result = detectWorkspaceFromCwd(workspaceRoot("root-ws"))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("root-ws")
  })

  test("non-repo subdirectory under workspace root returns that workspace", () => {
    writeWorkspace(makeWorktreeWorkspace("subroot-ws", "/tmp/missing/subroot-ws/repo-a"))

    const result = detectWorkspaceFromCwd(join(workspaceRoot("subroot-ws"), "notes", "scratch"))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("subroot-ws")
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

  test("worktree task_path beats broader workspace root candidate", () => {
    writeWorkspace(makeWorktreeWorkspace("root-parent", join(workspaceRoot("root-parent"), "repo-a")))
    writeWorkspace(makeWorktreeWorkspace("nested-worktree", join(workspaceRoot("root-parent"), "repo-a", "nested")))

    const result = detectWorkspaceFromCwd(join(workspaceRoot("root-parent"), "repo-a", "nested", "src"))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("nested-worktree")
  })

  test("workspace root prefix collision guard keeps sibling workspace names separate", () => {
    writeWorkspace(makeWorktreeWorkspace("repo-na", "/tmp/missing/repo-na/repo-a"))

    const result = detectWorkspaceFromCwd(workspaceRoot("repo-name"))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_match")
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
    const taskPath = `~/tilde-ws-detect/repo-a`
    const resolvedPath = join(process.env.HOME!, "tilde-ws-detect/repo-a")

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

  test("workspace root detection tolerates missing worktree paths", () => {
    writeWorkspace(makeWorktreeWorkspace("missing-worktree", "/tmp/does/not/exist/missing-worktree/repo-a"))

    const result = detectWorkspaceFromCwd(workspaceRoot("missing-worktree"))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("missing-worktree")
  })
})

// --- resolveOptionalWorkspace tests ---

describe("resolveOptionalWorkspace", () => {
  beforeEach(() => {
    clearWorkspaces()
  })

  test("explicit workspace wins before cwd detection", () => {
    writeWorkspace(makeWorktreeWorkspace("explicit-ws", "/tmp/missing/explicit-ws/repo-a"))
    writeWorkspace(makeWorktreeWorkspace("cwd-ws", "/tmp/missing/cwd-ws/repo-a"))

    const result = workspaceResolution.resolveOptionalWorkspace("explicit-ws", {
      cwd: workspaceRoot("cwd-ws"),
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.workspace.name).toBe("explicit-ws")
      expect(result.source).toBe("explicit")
    }
  })

  test("cwd detection runs before opt-in env fallback", () => {
    writeWorkspace(makeWorktreeWorkspace("cwd-first", "/tmp/missing/cwd-first/repo-a"))
    writeWorkspace(makeWorktreeWorkspace("env-second", "/tmp/missing/env-second/repo-a"))

    const result = workspaceResolution.resolveOptionalWorkspace(undefined, {
      cwd: workspaceRoot("cwd-first"),
      env: { GS_WORKSPACE_NAME: "env-second" },
      allowEnvFallback: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.workspace.name).toBe("cwd-first")
      expect(result.source).toBe("cwd")
    }
  })

  test("env fallback is disabled unless caller opts in", () => {
    writeWorkspace(makeWorktreeWorkspace("env-only", "/tmp/missing/env-only/repo-a"))

    const result = workspaceResolution.resolveOptionalWorkspace(undefined, {
      cwd: "/tmp/outside/all/workspaces",
      env: { GS_WORKSPACE_NAME: "env-only" },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("no_match")
  })

  test("opt-in env fallback resolves after cwd no_match", () => {
    writeWorkspace(makeWorktreeWorkspace("env-only", "/tmp/missing/env-only/repo-a"))

    const result = workspaceResolution.resolveOptionalWorkspace(undefined, {
      cwd: "/tmp/outside/all/workspaces",
      env: { GS_WORKSPACE_NAME: "env-only" },
      allowEnvFallback: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.workspace.name).toBe("env-only")
      expect(result.source).toBe("env")
    }
  })
})

// --- resolveWorkspaceArg tests ---

describe("resolveWorkspaceArg", () => {
  let exitCode: number | undefined
  const originalExit = process.exit.bind(process)
  const originalCwd = process.cwd()

  const exitMock = vi.fn((code?: number) => {
    exitCode = code
    throw new Error(`process.exit(${code})`)
  })

  beforeEach(() => {
    clearWorkspaces()
    process.chdir(configDir)
    exitCode = undefined
    // @ts-ignore — override process.exit for testing
    process.exit = exitMock
  })

  afterAll(() => {
    // @ts-ignore — restore process.exit
    process.exit = originalExit
    process.chdir(originalCwd)
  })

  test("explicit workspace name that exists returns the name", () => {
    writeWorkspace(makeWorktreeWorkspace("my-ws", "/tmp/tasks/my-ws/repo-a"))

    const result = (issueUtils as any).resolveWorkspaceArg("my-ws", "jira", "link")
    expect(result).toBe("my-ws")
    expect(exitCode).toBeUndefined()
  })

  test("explicit workspace name that does not exist calls process.exit(1)", () => {
    expect(() => (issueUtils as any).resolveWorkspaceArg("bad-ws", "jira", "link")).toThrow()
    expect(exitCode).toBe(1)
  })

  test("undefined workspaceName with CWD inside a worktree returns detected workspace name", () => {
    const taskPath = join(configDir, "detected-ws", "repo-a")
    mkdirSync(taskPath, { recursive: true })
    writeWorkspace(makeWorktreeWorkspace("detected-ws", taskPath))
    process.chdir(taskPath)

    const result = (issueUtils as any).resolveWorkspaceArg(undefined, "jira", "unlink")
    expect(result).toBe("detected-ws")
    expect(exitCode).toBeUndefined()
  })

  test("undefined workspaceName with CWD outside all worktrees calls process.exit(1)", () => {
    expect(() => (issueUtils as any).resolveWorkspaceArg(undefined, "jira", "open")).toThrow()
    expect(exitCode).toBe(1)
  })

  test("exit error message for CWD no_match mentions tracker and action names", () => {
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
