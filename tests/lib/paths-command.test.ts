import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test"
import { join } from "path"
import { mkdirSync, rmSync } from "fs"
import { makeTmpDir, cleanup, realWriteWorkspace } from "../helpers"
import type { Workspace } from "@/lib/config"

// ============================================================
// Isolation strategy:
//
// - paths mock redirects WORKSPACES_DIR to configDir/workspaces
// - Each test writes real workspace YAML files via realWriteWorkspace
//   (captured in helpers.ts before any mock.module calls)
// - getWorkspacePaths calls readWorkspace() which reads real YAML files
// - Existing directories on disk are created for repos that should NOT be skipped
// ============================================================

const configDir = makeTmpDir("paths-cmd")
mkdirSync(join(configDir, "workspaces"), { recursive: true })
mkdirSync(join(configDir, "templates"), { recursive: true })
mkdirSync(join(configDir, "messages"), { recursive: true })

// Create real directories for test repos that should exist on disk
const testMainDir = makeTmpDir("paths-main")
const testTaskDir = makeTmpDir("paths-tasks")
mkdirSync(join(testTaskDir, "test-ws", "api"), { recursive: true })
mkdirSync(join(testMainDir, "shared"), { recursive: true })
mkdirSync(join(testTaskDir, "test-ws", "frontend"), { recursive: true })

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

// Dynamic import after mock is applied
const { getWorkspacePaths } = await import("@/commands/workspace")

afterAll(() => {
  cleanup(configDir)
  cleanup(testMainDir)
  cleanup(testTaskDir)
})

// --- Test workspace factory ---

function makeTestWorkspace(): Workspace {
  return {
    name: "test-ws",
    schema_version: "1",
    branch: "feature/test",
    created: "2026-03-26",
    repos: [
      {
        name: "api",
        repo: "api",
        type: "typescript",
        mode: "worktree",
        main_path: join(testMainDir, "api"),
        task_path: join(testTaskDir, "test-ws", "api"),
      },
      {
        name: "shared",
        repo: "shared",
        type: "typescript",
        mode: "trunk",
        main_path: join(testMainDir, "shared"),
        task_path: join(testMainDir, "shared"),
      },
      {
        name: "frontend",
        repo: "frontend",
        type: "typescript",
        mode: "worktree",
        main_path: join(testMainDir, "frontend"),
        task_path: join(testTaskDir, "test-ws", "frontend"),
      },
    ],
  }
}

function makeMissingPathWorkspace(): Workspace {
  return {
    name: "test-ws-missing",
    schema_version: "1",
    branch: "feature/missing",
    created: "2026-03-26",
    repos: [
      {
        name: "valid-repo",
        repo: "valid-repo",
        type: "typescript",
        mode: "worktree",
        main_path: join(testMainDir, "valid-repo"),
        task_path: join(testTaskDir, "test-ws", "api"), // exists on disk
      },
      {
        name: "missing-repo",
        repo: "missing-repo",
        type: "typescript",
        mode: "worktree",
        main_path: join(testMainDir, "missing-repo"),
        task_path: "/tmp/nonexistent-path-abc123-paths-test", // does NOT exist
      },
    ],
  }
}

function writeWorkspace(ws: Workspace) {
  realWriteWorkspace(ws)
}

function clearWorkspaces() {
  rmSync(join(configDir, "workspaces"), { recursive: true, force: true })
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
}

describe("getWorkspacePaths", () => {
  beforeEach(() => {
    applyPathsMock()
    clearWorkspaces()
    // Write the test workspaces
    writeWorkspace(makeTestWorkspace())
    writeWorkspace(makeMissingPathWorkspace())
  })

  test("returns all repo paths -- worktree emit task_path, trunk emit main_path", () => {
    const result = getWorkspacePaths("test-ws", {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paths).toEqual([
      join(testTaskDir, "test-ws", "api"),
      join(testMainDir, "shared"),
      join(testTaskDir, "test-ws", "frontend"),
    ])
  })

  test("--prefix prepends each path with the prefix string space-separated", () => {
    const result = getWorkspacePaths("test-ws", { prefix: "--add-dir" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paths).toEqual([
      `--add-dir ${join(testTaskDir, "test-ws", "api")}`,
      `--add-dir ${join(testMainDir, "shared")}`,
      `--add-dir ${join(testTaskDir, "test-ws", "frontend")}`,
    ])
  })

  test("--filter worktree only includes worktree-mode repos", () => {
    const result = getWorkspacePaths("test-ws", { filter: "worktree" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paths).toEqual([
      join(testTaskDir, "test-ws", "api"),
      join(testTaskDir, "test-ws", "frontend"),
    ])
    // trunk repo "shared" should not appear
    expect(result.paths.every(p => !p.includes("shared"))).toBe(true)
  })

  test("--filter trunk only includes trunk-mode repos", () => {
    const result = getWorkspacePaths("test-ws", { filter: "trunk" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paths).toEqual([
      join(testMainDir, "shared"),
    ])
  })

  test("--prefix combined with --filter", () => {
    const result = getWorkspacePaths("test-ws", { prefix: "-w", filter: "worktree" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paths).toEqual([
      `-w ${join(testTaskDir, "test-ws", "api")}`,
      `-w ${join(testTaskDir, "test-ws", "frontend")}`,
    ])
  })

  test("nonexistent workspace returns error", () => {
    const result = getWorkspacePaths("no-such-ws", {})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("not found")
  })

  test("skipped repos appear in skipped array when path does not exist on disk", () => {
    const result = getWorkspacePaths("test-ws-missing", {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // valid-repo should be in paths, missing-repo should be skipped
    expect(result.paths.length).toBe(1)
    expect(result.paths[0]).toBe(join(testTaskDir, "test-ws", "api"))
    expect(result.skipped.length).toBe(1)
    expect(result.skipped[0]).toContain("missing-repo")
  })
})
