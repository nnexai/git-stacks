import { describe, test, expect, beforeEach, afterAll } from "@test/api"
import { join } from "path"
import { mkdirSync, rmSync } from "fs"
import { makeTmpDir, cleanup, realInvalidateConfigCache, realWriteWorkspace } from "../helpers"
import type { Workspace } from "@/lib/config"

// ============================================================
// Isolation strategy:
//
// - The per-file GIT_STACKS_CONFIG_DIR redirects workspace storage to a fixture
// - Each test writes real workspace YAML files via realWriteWorkspace
// - getWorkspacePaths calls readWorkspace() which reads real YAML files
// - Existing directories on disk are created for repos that should NOT be skipped
// ============================================================

const configDir = process.env.GIT_STACKS_CONFIG_DIR!
mkdirSync(join(configDir, "workspaces"), { recursive: true })
mkdirSync(join(configDir, "templates"), { recursive: true })

// Create real directories for test repos that should exist on disk
const testMainDir = makeTmpDir("paths-main")
const testTaskDir = makeTmpDir("paths-tasks")
mkdirSync(join(testTaskDir, "test-ws", "api"), { recursive: true })
mkdirSync(join(testMainDir, "shared"), { recursive: true })
mkdirSync(join(testTaskDir, "test-ws", "frontend"), { recursive: true })

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
    clearWorkspaces()
    realInvalidateConfigCache()
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
