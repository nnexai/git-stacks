import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { existsSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "fs"
import { execSync } from "child_process"
import { makeTmpDir, cleanup, makeGitRepo } from "../helpers"
import {
  writeStack,
  writeWorkspace,
  workspaceExists,
  workspacePath,
  stackPath,
  writeGlobalConfig,
  StackSchema,
  WorkspaceSchema,
} from "../../src/lib/config"
import {
  createWorktree,
  isWorktreeRegistered,
} from "../../src/lib/git"
import {
  mergeWorkspace,
  removeWorkspace,
  cleanWorkspace,
  renameWorkspace,
} from "../../src/lib/workspace-ops"
import { GLOBAL_CONFIG_FILE } from "../../src/lib/paths"

// Additional imports for dry-run and FILES-17 tests
import { workspacePath as wsPath } from "../../src/lib/config"

// Unique suffix per test file run to avoid collisions between parallel test runs
const FILE_RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Generate a unique workspace name for a test.
 * Uses a per-test counter so names don't collide within a single test run.
 */
let _testCounter = 0
function uniqueWsName(prefix = "test-ws"): string {
  _testCounter++
  return `_wsops-${prefix}-${FILE_RUN_ID}-${_testCounter}`
}

function uniqueStackName(prefix = "test-stack"): string {
  return `_wsops-${prefix}-${FILE_RUN_ID}-${_testCounter}`
}

/**
 * Save and restore the global config file around each test so tests don't
 * corrupt the user's real workspace_root setting.
 */
let _savedGlobalConfig: string | null = null

function saveGlobalConfig() {
  if (existsSync(GLOBAL_CONFIG_FILE)) {
    const { readFileSync } = require("fs")
    _savedGlobalConfig = readFileSync(GLOBAL_CONFIG_FILE, "utf-8")
  } else {
    _savedGlobalConfig = null
  }
}

function restoreGlobalConfig() {
  if (_savedGlobalConfig !== null) {
    mkdirSync(require("path").dirname(GLOBAL_CONFIG_FILE), { recursive: true })
    writeFileSync(GLOBAL_CONFIG_FILE, _savedGlobalConfig, "utf-8")
  } else {
    try { unlinkSync(GLOBAL_CONFIG_FILE) } catch { /* didn't exist */ }
  }
}

/**
 * Core fixture builder: creates real git repos, stack YAML, workspace YAML,
 * and actual git worktrees. Returns all handles needed for assertions.
 *
 * Caller provides wsName and stackName to ensure uniqueness per test.
 */
async function setupWorkspaceFixture(
  tmp: string,
  wsName: string,
  stackName: string,
  opts: { repoCount?: number } = {}
) {
  const repoCount = opts.repoCount ?? 1

  // Set up workspace root structure inside tmp
  const wsRoot = join(tmp, "workspaces")
  const tasksDir = join(wsRoot, "tasks")
  const mainDir = join(wsRoot, "main")
  mkdirSync(tasksDir, { recursive: true })
  mkdirSync(mainDir, { recursive: true })

  // Write global config pointing to tmp workspace root
  writeGlobalConfig({ workspace_root: wsRoot, integrations: {} })

  // Create real git repos and record their paths
  const repos: Array<{ name: string; repoPath: string; worktreePath: string }> = []
  for (let i = 0; i < repoCount; i++) {
    const name = `repo-${i}`
    const repoPath = makeGitRepo(mainDir, name)
    const worktreePath = join(tasksDir, wsName, name)
    repos.push({ name, repoPath, worktreePath })
  }

  const branchName = "feature/test"

  // Write stack YAML
  writeStack(StackSchema.parse({
    name: stackName,
    repos: repos.map((r) => ({
      name: r.name,
      path: r.repoPath,
      type: "other",
      default_mode: "worktree",
      default_branch: "main",
    })),
  }))

  // Write workspace YAML
  writeWorkspace(WorkspaceSchema.parse({
    name: wsName,
    branch: branchName,
    created: new Date().toISOString(),
    repos: repos.map((r) => ({
      name: r.name,
      stack: stackName,
      type: "other",
      mode: "worktree",
      main_path: r.repoPath,
      task_path: r.worktreePath,
    })),
  }))

  // Create actual worktrees in git
  for (const repo of repos) {
    await createWorktree(repo.repoPath, repo.worktreePath, branchName)
  }

  return { repos, wsRoot, tasksDir, branchName, stackName }
}

/**
 * Cleanup function: removes workspace YAML, stack YAML, and tmp dir.
 */
function cleanupFixture(wsName: string, stackName: string, tmp: string) {
  // Remove workspace YAML if it still exists
  const wsYaml = workspacePath(wsName)
  if (existsSync(wsYaml)) {
    try { unlinkSync(wsYaml) } catch { /* ignore */ }
  }

  // Remove stack YAML
  const sYaml = stackPath(stackName)
  if (existsSync(sYaml)) {
    try { unlinkSync(sYaml) } catch { /* ignore */ }
  }

  // Clean tmp dir (worktrees, repos)
  cleanup(tmp)
}

// ============================================================================
// describe("mergeWorkspace") — BUG-01
// ============================================================================

describe("mergeWorkspace", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-ops-merge")
    saveGlobalConfig()
  })

  afterEach(() => {
    restoreGlobalConfig()
  })

  test("merges all repos and deletes workspace YAML on success", async () => {
    const wsName = uniqueWsName("merge-success")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Add a commit to the worktree so merge has something to do
    const repo = repos[0]
    const opts = { cwd: repo.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo.worktreePath, "feature.txt"), "feature content\n")
    execSync("git add .", opts)
    execSync('git commit -m "feature commit"', opts)

    const result = await mergeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    expect(workspaceExists(wsName)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })

  test("preserves workspace YAML when merge fails (BUG-01)", async () => {
    const wsName = uniqueWsName("merge-fail")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 2 })

    // Add a commit to repo-0 worktree on feature/test
    const repo0 = repos[0]
    const opts0 = { cwd: repo0.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo0.worktreePath, "feature0.txt"), "feature content\n")
    execSync("git add .", opts0)
    execSync('git commit -m "feature commit for repo-0"', opts0)

    // Create a conflict for repo-1:
    // Add same file to both main and feature/test with different content
    const repo1 = repos[1]

    // Commit on main first (while feature/test exists as a worktree)
    const repoOpts1 = { cwd: repo1.repoPath, stdio: "pipe" as const }
    writeFileSync(join(repo1.repoPath, "conflict.txt"), "main version\n")
    execSync("git add .", repoOpts1)
    execSync('git commit -m "main: add conflict.txt"', repoOpts1)

    // Commit same file with different content on feature/test
    const wtOpts1 = { cwd: repo1.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo1.worktreePath, "conflict.txt"), "feature version\n")
    execSync("git add .", wtOpts1)
    execSync('git commit -m "feature: add conflict.txt"', wtOpts1)

    // The conflict pre-check in mergeWorkspace will detect this and fail
    const result = await mergeWorkspace(wsName, { force: true })

    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe("string")
    expect(result.error!.length).toBeGreaterThan(0)

    // Workspace YAML must still exist (BUG-01 fix verification)
    expect(workspaceExists(wsName)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })
})

// ============================================================================
// describe("removeWorkspace") — BUG-02
// ============================================================================

describe("removeWorkspace", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-ops-remove")
    saveGlobalConfig()
  })

  afterEach(() => {
    restoreGlobalConfig()
  })

  test("removes worktrees and deletes workspace YAML", async () => {
    const wsName = uniqueWsName("remove-success")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const repo = repos[0]
    expect(existsSync(repo.worktreePath)).toBe(true)
    expect(workspaceExists(wsName)).toBe(true)

    const result = await removeWorkspace(wsName, { force: true })

    expect(result.ok).toBe(true)
    expect(workspaceExists(wsName)).toBe(false)
    expect(existsSync(repo.worktreePath)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })

  test("preserves YAML when worktree removal fails (BUG-02)", async () => {
    const wsName = uniqueWsName("remove-fail")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 2 })

    // Corrupt repo-1's main .git so `git worktree remove` cannot succeed:
    // Removing the objects directory makes git unable to operate on the repo
    const repo1 = repos[1]
    const gitObjectsDir = join(repo1.repoPath, ".git", "objects")
    rmSync(gitObjectsDir, { recursive: true, force: true })

    const result = await removeWorkspace(wsName, { force: true })

    // Operation fails because one worktree removal failed
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe("string")
    expect(result.error!.length).toBeGreaterThan(0)

    // Workspace YAML must still exist (BUG-02 fix verification)
    expect(workspaceExists(wsName)).toBe(true)

    // Cleanup manually since removeWorkspace failed
    cleanupFixture(wsName, stackName, tmp)
  })
})

// ============================================================================
// describe("cleanWorkspace") — BUG-02 (clean variant)
// ============================================================================

describe("cleanWorkspace", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-ops-clean")
    saveGlobalConfig()
  })

  afterEach(() => {
    restoreGlobalConfig()
  })

  test("removes worktrees without deleting workspace YAML", async () => {
    const wsName = uniqueWsName("clean-success")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const repo = repos[0]
    expect(existsSync(repo.worktreePath)).toBe(true)
    expect(workspaceExists(wsName)).toBe(true)

    const result = await cleanWorkspace(wsName, { force: true })

    expect(result.ok).toBe(true)
    // Workspace YAML must still exist after clean (clean != remove)
    expect(workspaceExists(wsName)).toBe(true)
    // Worktree directory must be gone
    expect(existsSync(repo.worktreePath)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })
})

// ============================================================================
// describe("renameWorkspace") — BUG-03
// ============================================================================

describe("renameWorkspace", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-ops-rename")
    saveGlobalConfig()
  })

  afterEach(() => {
    restoreGlobalConfig()
  })

  test("re-registers worktrees at new paths", async () => {
    const wsName = uniqueWsName("rename-from")
    const newWsName = uniqueWsName("rename-to")
    const stackName = uniqueStackName()

    const { repos, tasksDir } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const repo = repos[0]
    const oldWorktreePath = repo.worktreePath
    const newWorktreePath = join(tasksDir, newWsName, repo.name)

    expect(workspaceExists(wsName)).toBe(true)

    const result = await renameWorkspace(wsName, newWsName)

    expect(result.ok).toBe(true)

    // New workspace YAML exists, old one does not
    expect(workspaceExists(newWsName)).toBe(true)
    expect(workspaceExists(wsName)).toBe(false)

    // New worktree path exists on disk, old one does not
    expect(existsSync(newWorktreePath)).toBe(true)
    expect(existsSync(oldWorktreePath)).toBe(false)

    // New worktree is registered in git (BUG-03 fix verification)
    expect(await isWorktreeRegistered(repo.repoPath, newWorktreePath)).toBe(true)

    // Old worktree path is NOT registered in git
    expect(await isWorktreeRegistered(repo.repoPath, oldWorktreePath)).toBe(false)

    cleanupFixture(newWsName, stackName, tmp)
  })

  test("only re-registers worktree-mode repos, not trunk", async () => {
    const wsName = uniqueWsName("rename-trunk")
    const newWsName = uniqueWsName("rename-trunk-to")
    const stackName = uniqueStackName()

    // Set up fixture with 1 worktree repo
    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Now add a trunk repo to the workspace YAML by re-writing it
    const trunkRepoPath = makeGitRepo(join(tmp, "workspaces", "main"), "trunk-repo")
    const { readWorkspace } = await import("../../src/lib/config")
    const workspace = readWorkspace(wsName)
    workspace.repos.push({
      name: "trunk-repo",
      stack: stackName,
      type: "other" as const,
      mode: "trunk" as const,
      main_path: trunkRepoPath,
      task_path: trunkRepoPath, // trunk: task_path == main_path
    })
    writeWorkspace(workspace)

    const result = await renameWorkspace(wsName, newWsName)

    expect(result.ok).toBe(true)
    expect(workspaceExists(newWsName)).toBe(true)
    expect(workspaceExists(wsName)).toBe(false)

    // Read the renamed workspace and verify trunk repo's main_path is unchanged
    const renamed = readWorkspace(newWsName)
    const trunkRepo = renamed.repos.find((r) => r.name === "trunk-repo")
    expect(trunkRepo).toBeDefined()
    expect(trunkRepo!.main_path).toBe(trunkRepoPath)

    // Worktree repo path was updated to new name
    const wtRepo = renamed.repos.find((r) => r.name === repos[0].name)
    expect(wtRepo).toBeDefined()
    expect(wtRepo!.task_path).toContain(newWsName)

    cleanupFixture(newWsName, stackName, tmp)
  })
})

// ============================================================================
// describe("dry-run") — SAFE-01
// ============================================================================

describe("dry-run", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-ops-dryrun")
    saveGlobalConfig()
  })

  afterEach(() => {
    restoreGlobalConfig()
  })

  // Test 1 (SAFE-01 remove dry-run): removeWorkspace with dryRun=true returns ok=true,
  // emits [dry-run] prefixed lines, and leaves workspace YAML and worktree intact
  test("SAFE-01 remove dry-run: does not delete worktree or config YAML", async () => {
    const wsName = uniqueWsName("remove-dry")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    const result = await removeWorkspace(wsName, { force: true, dryRun: true }, msg => messages.push(msg))

    // Returns ok: true
    expect(result.ok).toBe(true)

    // Emits [dry-run] prefixed lines for worktree and config
    expect(messages.some(m => m.includes("[dry-run] would remove worktree:"))).toBe(true)
    expect(messages.some(m => m.includes("[dry-run] would delete config:"))).toBe(true)

    // Ends with completion message
    expect(messages[messages.length - 1]).toBe("Dry run complete. No changes made.")

    // Workspace YAML and worktree still exist
    expect(workspaceExists(wsName)).toBe(true)
    expect(existsSync(repos[0].worktreePath)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 2 (SAFE-01 clean dry-run): cleanWorkspace with dryRun=true returns ok=true,
  // emits [dry-run] lines, worktrees still exist
  test("SAFE-01 clean dry-run: does not remove worktrees", async () => {
    const wsName = uniqueWsName("clean-dry")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    const result = await cleanWorkspace(wsName, { force: true, dryRun: true }, msg => messages.push(msg))

    expect(result.ok).toBe(true)

    // Emits [dry-run] prefixed lines for worktree
    expect(messages.some(m => m.includes("[dry-run] would remove worktree:"))).toBe(true)

    // Ends with completion message
    expect(messages[messages.length - 1]).toBe("Dry run complete. No changes made.")

    // Worktrees still exist
    expect(existsSync(repos[0].worktreePath)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 3 (SAFE-01 merge dry-run): mergeWorkspace with dryRun=true returns ok=true,
  // no actual merge, branch and worktree still exist
  test("SAFE-01 merge dry-run: does not merge or delete anything", async () => {
    const wsName = uniqueWsName("merge-dry")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Add a commit to the worktree so there's something to merge
    const repo = repos[0]
    const opts = { cwd: repo.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo.worktreePath, "feature.txt"), "feature content\n")
    execSync("git add .", opts)
    execSync('git commit -m "feature commit"', opts)

    const messages: string[] = []
    const result = await mergeWorkspace(wsName, { force: true, dryRun: true }, msg => messages.push(msg))

    expect(result.ok).toBe(true)

    // Emits [dry-run] messages for merge, worktree removal, branch deletion, and config deletion
    expect(messages.some(m => m.includes("[dry-run] would merge"))).toBe(true)
    expect(messages.some(m => m.includes("[dry-run] would remove worktree:"))).toBe(true)
    expect(messages.some(m => m.includes("[dry-run] would delete branch:"))).toBe(true)
    expect(messages.some(m => m.includes("[dry-run] would delete config:"))).toBe(true)

    // Ends with completion message
    expect(messages[messages.length - 1]).toBe("Dry run complete. No changes made.")

    // Workspace YAML and worktree still exist
    expect(workspaceExists(wsName)).toBe(true)
    expect(existsSync(repos[0].worktreePath)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 4 (SAFE-01 rename dry-run): renameWorkspace with dryRun=true returns ok=true,
  // old workspace YAML still exists, new one does not
  test("SAFE-01 rename dry-run: does not re-register worktrees or rename config", async () => {
    const wsName = uniqueWsName("rename-dry-from")
    const newWsName = uniqueWsName("rename-dry-to")
    const stackName = uniqueStackName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    const result = await renameWorkspace(wsName, newWsName, { dryRun: true }, msg => messages.push(msg))

    expect(result.ok).toBe(true)

    // Emits [dry-run] messages for worktree re-registration and config rename
    expect(messages.some(m => m.includes("[dry-run] would re-register worktree:"))).toBe(true)
    expect(messages.some(m => m.includes("[dry-run] would rename config:"))).toBe(true)

    // Ends with completion message
    expect(messages[messages.length - 1]).toBe("Dry run complete. No changes made.")

    // Old workspace YAML still exists, new one does not
    expect(workspaceExists(wsName)).toBe(true)
    expect(workspaceExists(newWsName)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 5 (FILES-17 remove warns external): removeWorkspace (real run) with external file
  // destination emits warning via onProgress before teardown
  test("FILES-17 remove real: emits external file warning via onProgress", async () => {
    const wsName = uniqueWsName("remove-ext")
    const stackName = uniqueStackName()

    const { repos, wsRoot, tasksDir } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Re-write workspace YAML with an external symlink target
    const { readWorkspace } = await import("../../src/lib/config")
    const workspace = readWorkspace(wsName)
    workspace.files = { symlink: ["/tmp/some-external-target"] }
    writeWorkspace(workspace)

    const messages: string[] = []
    const result = await removeWorkspace(wsName, { force: true }, msg => messages.push(msg))

    // Should succeed overall
    expect(result.ok).toBe(true)

    // Must emit the external warning before teardown
    expect(messages.some(m => m.includes("Warning: external destination"))).toBe(true)
    expect(messages.some(m => m.includes("/tmp/some-external-target"))).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 6 (FILES-17 clean warns external): cleanWorkspace (real run) with external file
  // destination emits warning via onProgress
  test("FILES-17 clean real: emits external file warning via onProgress", async () => {
    const wsName = uniqueWsName("clean-ext")
    const stackName = uniqueStackName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Re-write workspace YAML with an external symlink target
    const { readWorkspace } = await import("../../src/lib/config")
    const workspace = readWorkspace(wsName)
    workspace.files = { symlink: ["/tmp/some-external-target"] }
    writeWorkspace(workspace)

    const messages: string[] = []
    const result = await cleanWorkspace(wsName, { force: true }, msg => messages.push(msg))

    expect(result.ok).toBe(true)
    expect(messages.some(m => m.includes("Warning: external destination"))).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 7 (SAFE-01 dry-run shows external warnings): removeWorkspace with dryRun=true
  // also emits external file warnings via onProgress
  test("SAFE-01 dry-run also shows external file warnings", async () => {
    const wsName = uniqueWsName("remove-dry-ext")
    const stackName = uniqueStackName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Re-write workspace YAML with an external symlink target
    const { readWorkspace } = await import("../../src/lib/config")
    const workspace = readWorkspace(wsName)
    workspace.files = { symlink: ["/tmp/some-external-target"] }
    writeWorkspace(workspace)

    const messages: string[] = []
    const result = await removeWorkspace(wsName, { force: true, dryRun: true }, msg => messages.push(msg))

    expect(result.ok).toBe(true)

    // External warning AND [dry-run] lines both present
    expect(messages.some(m => m.includes("Warning: external destination"))).toBe(true)
    expect(messages.some(m => m.includes("[dry-run] would remove worktree:"))).toBe(true)
    expect(messages[messages.length - 1]).toBe("Dry run complete. No changes made.")

    // Workspace and worktree still exist
    expect(workspaceExists(wsName)).toBe(true)
    expect(existsSync(repos[0].worktreePath)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })
})
