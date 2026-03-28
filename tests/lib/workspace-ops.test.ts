import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from "bun:test"
import { join } from "path"
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from "fs"
import { execSync } from "child_process"
import {
  makeTmpDir, cleanup, makeGitRepo, useIsolatedConfig,
  realWriteWorkspace as writeWorkspace,
  realWorkspaceExists as workspaceExists,
  realWorkspacePath as workspacePath,
  realWriteGlobalConfig as writeGlobalConfig,
  realReadWorkspace as readWorkspace,
  realTemplateExists as templateExists,
  realWriteTemplate as writeTemplate,
  realCreateWorktree as createWorktree,
  realIsWorktreeRegistered as isWorktreeRegistered,
  realMergeWorkspace as mergeWorkspace,
  realRemoveWorkspace as removeWorkspace,
  realCleanWorkspace as cleanWorkspace,
  realRenameWorkspace as renameWorkspace,
  realCloseWorkspace as closeWorkspace,
  realRenameTemplate as renameTemplate,
  realEditTemplateYaml as editTemplateYaml,
  realEditGlobalConfigYaml as editGlobalConfigYaml,
  realEditRegistryYaml as editRegistryYaml,
  realRunHooks,
  realRunHooksCaptured,
  lifecycleRealExec,
} from "../helpers"
import {
  WorkspaceSchema,
  TemplateSchema,
} from "../../src/lib/config"
import {
  writeEnvFiles,
} from "../../src/lib/workspace-ops"

// Set up isolated config dir once for this file — all tests in this file share it.
const isolated = useIsolatedConfig("ws-ops")

// Restore @/lib/lifecycle to the real implementation so that
// workspace-ops hook execution tests use actual shell commands, not stubs left
// by other test files that call mock.module("@/lib/lifecycle", ...).
mock.module("@/lib/lifecycle", () => ({
  runHooks: realRunHooks,
  runHooksCaptured: realRunHooksCaptured,
  _exec: lifecycleRealExec,
}))

afterAll(() => isolated.cleanup())

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

function uniqueRegistryName(prefix = "test-repo"): string {
  return `_wsops-${prefix}-${FILE_RUN_ID}-${_testCounter}`
}

/**
 * Core fixture builder: creates real git repos, stack YAML, workspace YAML,
 * and actual git worktrees. Returns all handles needed for assertions.
 *
 * Caller provides wsName and registryName to ensure uniqueness per test.
 */
async function setupWorkspaceFixture(
  tmp: string,
  wsName: string,
  registryName: string,
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
  // This now writes to isolated.configDir/config.yml (not real ~/.config/git-stacks)
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

  // Write workspace YAML (registry model — no stack YAML needed)
  writeWorkspace(WorkspaceSchema.parse({
    name: wsName,
    branch: branchName,
    created: new Date().toISOString(),
    repos: repos.map((r) => ({
      name: r.name,
      repo: registryName,
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

  return { repos, wsRoot, tasksDir, branchName, registryName }
}

/**
 * Cleanup function: removes workspace YAML and tmp dir.
 */
function cleanupFixture(wsName: string, _registryName: string, tmp: string) {
  // Remove workspace YAML if it still exists
  const wsYaml = workspacePath(wsName)
  if (existsSync(wsYaml)) {
    try { unlinkSync(wsYaml) } catch { /* ignore */ }
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
  })

  afterEach(() => {
    // tmp dir is cleaned by cleanupFixture — nothing extra needed here
  })

  test("merges all repos and deletes workspace YAML on success", async () => {
    const wsName = uniqueWsName("merge-success")
    const stackName = uniqueRegistryName()

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
    const stackName = uniqueRegistryName()

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

  // Test: mergeWorkspace fires full D-10 lifecycle order
  test("mergeWorkspace fires full D-10 lifecycle order", async () => {
    const wsName = uniqueWsName("merge-d10-order")
    const stackName = uniqueRegistryName()
    const logFile = `/tmp/gsd-hook-log-merge-d10-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Add a commit to the worktree so merge has something to do
    const repo = repos[0]
    const gitOpts = { cwd: repo.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo.worktreePath, "feature.txt"), "feature content\n")
    execSync("git add .", gitOpts)
    execSync('git commit -m "feature commit"', gitOpts)

    const ws = readWorkspace(wsName)
    ws.hooks = {
      pre_close: [`echo PRE_CLOSE >> ${logFile}`],
      post_close: [`echo POST_CLOSE >> ${logFile}`],
      pre_clean: [`echo PRE_CLEAN >> ${logFile}`],
      post_clean: [`echo POST_CLEAN >> ${logFile}`],
      pre_merge: [`echo PRE_MERGE >> ${logFile}`],
      pre_remove: [`echo PRE_REMOVE >> ${logFile}`],
      post_remove: [`echo POST_REMOVE >> ${logFile}`],
      post_merge: [`echo POST_MERGE >> ${logFile}`],
    }
    writeWorkspace(ws)

    const result = await mergeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    expect(workspaceExists(wsName)).toBe(false)

    const log = existsSync(logFile) ? readFileSync(logFile, "utf-8") : ""
    const preCloseIdx = log.indexOf("PRE_CLOSE")
    const postCloseIdx = log.indexOf("POST_CLOSE")
    const preCleanIdx = log.indexOf("PRE_CLEAN")
    const postCleanIdx = log.indexOf("POST_CLEAN")
    const preMergeIdx = log.indexOf("PRE_MERGE")
    const preRemoveIdx = log.indexOf("PRE_REMOVE")
    const postRemoveIdx = log.indexOf("POST_REMOVE")
    const postMergeIdx = log.indexOf("POST_MERGE")

    // All hooks fired
    expect(preCloseIdx).toBeGreaterThanOrEqual(0)
    expect(postCloseIdx).toBeGreaterThanOrEqual(0)
    expect(preCleanIdx).toBeGreaterThanOrEqual(0)
    expect(postCleanIdx).toBeGreaterThanOrEqual(0)
    expect(preMergeIdx).toBeGreaterThanOrEqual(0)
    expect(preRemoveIdx).toBeGreaterThanOrEqual(0)
    expect(postRemoveIdx).toBeGreaterThanOrEqual(0)
    expect(postMergeIdx).toBeGreaterThanOrEqual(0)

    // D-10 order: PRE_CLOSE < POST_CLOSE < PRE_CLEAN < POST_CLEAN < PRE_MERGE < PRE_REMOVE < POST_REMOVE < POST_MERGE
    expect(preCloseIdx).toBeLessThan(postCloseIdx)
    expect(postCloseIdx).toBeLessThan(preCleanIdx)
    expect(preCleanIdx).toBeLessThan(postCleanIdx)
    expect(postCleanIdx).toBeLessThan(preMergeIdx)
    expect(preMergeIdx).toBeLessThan(preRemoveIdx)
    expect(preRemoveIdx).toBeLessThan(postRemoveIdx)
    expect(postRemoveIdx).toBeLessThan(postMergeIdx)

    try { unlinkSync(logFile) } catch { /* ignore */ }
    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: GS_TRIGGERED_BY=merge propagated through entire cascade
  test("mergeWorkspace sets GS_TRIGGERED_BY=merge in all hooks", async () => {
    const wsName = uniqueWsName("merge-triggered-by")
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Add a commit to the worktree so merge has something to do
    const repo = repos[0]
    const gitOpts = { cwd: repo.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo.worktreePath, "feature.txt"), "feature content\n")
    execSync("git add .", gitOpts)
    execSync('git commit -m "feature commit"', gitOpts)

    const ws = readWorkspace(wsName)
    ws.hooks = {
      pre_close: ['test "$GS_TRIGGERED_BY" = "merge"'],
      pre_merge: ['test "$GS_TRIGGERED_BY" = "merge"'],
    }
    writeWorkspace(ws)

    const result = await mergeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: mergeWorkspace aborts if pre_merge hook fails (workspace YAML preserved)
  test("mergeWorkspace aborts if pre_merge hook fails", async () => {
    const wsName = uniqueWsName("merge-abort-pre-merge")
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Add a commit to the worktree so merge has something to do
    const repo = repos[0]
    const gitOpts = { cwd: repo.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo.worktreePath, "feature.txt"), "feature content\n")
    execSync("git add .", gitOpts)
    execSync('git commit -m "feature commit"', gitOpts)

    const ws = readWorkspace(wsName)
    ws.hooks = { pre_merge: ["exit 1"] }
    writeWorkspace(ws)

    const result = await mergeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/pre_merge/)
    // Workspace YAML must still exist (abort before YAML deletion)
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
  })

  afterEach(() => {
    // tmp dir is cleaned by cleanupFixture — nothing extra needed here
  })

  test("removes worktrees and deletes workspace YAML", async () => {
    const wsName = uniqueWsName("remove-success")
    const stackName = uniqueRegistryName()

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
    const stackName = uniqueRegistryName()

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

  // Test: cascades through close and clean before YAML deletion
  test("removeWorkspace cascades through close and clean before YAML deletion", async () => {
    const wsName = uniqueWsName("remove-cascade")
    const stackName = uniqueRegistryName()
    const logFile = `/tmp/gsd-hook-log-remove-cascade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = {
      pre_close: [`echo PRE_CLOSE >> ${logFile}`],
      pre_clean: [`echo PRE_CLEAN >> ${logFile}`],
      pre_remove: [`echo PRE_REMOVE >> ${logFile}`],
    }
    writeWorkspace(ws)

    const result = await removeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)

    const log = existsSync(logFile) ? readFileSync(logFile, "utf-8") : ""
    const preCloseIdx = log.indexOf("PRE_CLOSE")
    const preCleanIdx = log.indexOf("PRE_CLEAN")
    const preRemoveIdx = log.indexOf("PRE_REMOVE")
    expect(preCloseIdx).toBeGreaterThanOrEqual(0)
    expect(preCleanIdx).toBeGreaterThanOrEqual(0)
    expect(preRemoveIdx).toBeGreaterThanOrEqual(0)
    expect(preCloseIdx).toBeLessThan(preCleanIdx)
    expect(preCleanIdx).toBeLessThan(preRemoveIdx)

    // Worktree removed and YAML deleted
    expect(existsSync(repos[0].worktreePath)).toBe(false)
    expect(workspaceExists(wsName)).toBe(false)

    try { unlinkSync(logFile) } catch { /* ignore */ }
    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: post_remove fires after YAML deletion
  test("removeWorkspace fires post_remove after YAML deletion", async () => {
    const wsName = uniqueWsName("remove-post-remove")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = { post_remove: ["echo POST_REMOVE_RAN"] }
    writeWorkspace(ws)

    const result = await removeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    expect(workspaceExists(wsName)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: GS_TRIGGERED_BY=remove propagated through entire cascade
  test("removeWorkspace sets GS_TRIGGERED_BY=remove in all cascaded hooks", async () => {
    const wsName = uniqueWsName("remove-triggered-by")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = {
      pre_close: ['test "$GS_TRIGGERED_BY" = "remove"'],
      pre_clean: ['test "$GS_TRIGGERED_BY" = "remove"'],
      pre_remove: ['test "$GS_TRIGGERED_BY" = "remove"'],
    }
    writeWorkspace(ws)

    const result = await removeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: aborts if clean phase fails (D-03)
  test("removeWorkspace aborts if clean phase fails (D-03)", async () => {
    const wsName = uniqueWsName("remove-abort-clean")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = { pre_clean: ["exit 1"] }
    writeWorkspace(ws)

    const result = await removeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/pre_clean/)
    // YAML still exists (no deletion happened)
    expect(workspaceExists(wsName)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: removeWorkspace deletes workspace folder after YAML deletion (D-11)
  test("removeWorkspace deletes workspace folder (D-11)", async () => {
    const wsName = uniqueWsName("remove-deletes-folder")
    const stackName = uniqueRegistryName()

    const { tasksDir } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const wsDir = join(tasksDir, wsName)
    expect(existsSync(wsDir)).toBe(true)

    const result = await removeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    // Both YAML and folder are gone
    expect(workspaceExists(wsName)).toBe(false)
    expect(existsSync(wsDir)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: removeWorkspace --force with malformed YAML succeeds (D-12)
  test("removeWorkspace --force with malformed YAML succeeds (D-12)", async () => {
    const wsName = uniqueWsName("remove-malformed-force")
    const stackName = uniqueRegistryName()

    const { tasksDir } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Overwrite workspace YAML with garbage (unparseable)
    writeFileSync(workspacePath(wsName), "{{{not valid yaml:::")

    // workspaceExists returns true (file exists), but readWorkspace throws on parse
    expect(existsSync(workspacePath(wsName))).toBe(true)

    const wsDir = join(tasksDir, wsName)
    expect(existsSync(wsDir)).toBe(true)

    const result = await removeWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    // YAML file is deleted
    expect(existsSync(workspacePath(wsName))).toBe(false)
    // Workspace folder is deleted
    expect(existsSync(wsDir)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: removeWorkspace without --force and malformed YAML returns error (D-12)
  test("removeWorkspace without --force and malformed YAML returns error (D-12)", async () => {
    const wsName = uniqueWsName("remove-malformed-no-force")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Overwrite workspace YAML with garbage (unparseable)
    writeFileSync(workspacePath(wsName), "{{{not valid yaml:::")

    const result = await removeWorkspace(wsName, { force: false })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Cannot parse/)
    expect(result.error).toMatch(/--force/)

    // Manually clean up since we have a corrupt file
    try { unlinkSync(workspacePath(wsName)) } catch { /* ignore */ }
    cleanup(tmp)
  })
})

// ============================================================================
// describe("cleanWorkspace") — BUG-02 (clean variant)
// ============================================================================

describe("cleanWorkspace", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-ops-clean")
  })

  afterEach(() => {
    // tmp dir is cleaned by cleanupFixture — nothing extra needed here
  })

  test("removes worktrees without deleting workspace YAML", async () => {
    const wsName = uniqueWsName("clean-success")
    const stackName = uniqueRegistryName()

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

  // Test: cascade order — close before clean
  test("cleanWorkspace calls close before clean (cascade order)", async () => {
    const wsName = uniqueWsName("clean-cascade-order")
    const stackName = uniqueRegistryName()
    const logFile = `/tmp/gsd-hook-log-cascade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = {
      pre_close: [`echo PRE_CLOSE >> ${logFile}`],
      pre_clean: [`echo PRE_CLEAN >> ${logFile}`],
    }
    writeWorkspace(ws)

    const result = await cleanWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)

    const log = existsSync(logFile) ? readFileSync(logFile, "utf-8") : ""
    const preCloseIdx = log.indexOf("PRE_CLOSE")
    const preCleanIdx = log.indexOf("PRE_CLEAN")
    expect(preCloseIdx).toBeGreaterThanOrEqual(0)
    expect(preCleanIdx).toBeGreaterThanOrEqual(0)
    expect(preCloseIdx).toBeLessThan(preCleanIdx)

    try { unlinkSync(logFile) } catch { /* ignore */ }
    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: post_clean fires after worktree removal
  test("cleanWorkspace fires post_clean after worktree removal", async () => {
    const wsName = uniqueWsName("clean-post-clean")
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = { post_clean: ["echo POST_CLEAN_RAN"] }
    writeWorkspace(ws)

    const result = await cleanWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    expect(existsSync(repos[0].worktreePath)).toBe(false)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: GS_TRIGGERED_BY=clean propagated through cascade
  test("cleanWorkspace sets GS_TRIGGERED_BY=clean in all hooks", async () => {
    const wsName = uniqueWsName("clean-triggered-by")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = {
      pre_close: ['test "$GS_TRIGGERED_BY" = "clean"'],
      pre_clean: ['test "$GS_TRIGGERED_BY" = "clean"'],
    }
    writeWorkspace(ws)

    const result = await cleanWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: abort on pre_clean hook failure (D-03)
  test("cleanWorkspace aborts on pre_clean hook failure (D-03)", async () => {
    const wsName = uniqueWsName("clean-abort-pre-clean")
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const ws = readWorkspace(wsName)
    ws.hooks = { pre_clean: ["exit 1"] }
    writeWorkspace(ws)

    const result = await cleanWorkspace(wsName, { force: true })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/pre_clean/)
    // Worktree still exists (aborted before removal)
    expect(existsSync(repos[0].worktreePath)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: per-repo pre_clean fires immediately before each worktree removal (D-08)
  test("per-repo pre_clean fires before worktree removal (D-08)", async () => {
    const wsName = uniqueWsName("clean-repo-pre-clean")
    const stackName = uniqueRegistryName()
    const logFile = `/tmp/gsd-hook-log-repo-preclean-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Patch workspace YAML to add per-repo pre_clean hook
    const ws = readWorkspace(wsName)
    ws.repos[0] = {
      ...ws.repos[0],
      hooks: { pre_clean: [`echo REPO_PRE_CLEAN >> ${logFile}`] },
    }
    writeWorkspace(ws)

    const result = await cleanWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    // Worktree was removed
    expect(existsSync(repos[0].worktreePath)).toBe(false)

    const log = existsSync(logFile) ? readFileSync(logFile, "utf-8") : ""
    expect(log).toContain("REPO_PRE_CLEAN")

    try { unlinkSync(logFile) } catch { /* ignore */ }
    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: cleanWorkspace with deleteFolder:true removes workspace folder (D-08)
  test("cleanWorkspace with deleteFolder:true removes workspace folder", async () => {
    const wsName = uniqueWsName("clean-delete-folder")
    const stackName = uniqueRegistryName()

    const { tasksDir } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Workspace folder must exist before clean
    expect(existsSync(join(tasksDir, wsName))).toBe(true)

    // @ts-ignore — deleteFolder added in this plan
    const result = await cleanWorkspace(wsName, { force: true, deleteFolder: true })
    expect(result.ok).toBe(true)

    // Workspace folder must be gone after clean with deleteFolder:true
    expect(existsSync(join(tasksDir, wsName))).toBe(false)
    // YAML still exists (clean != remove)
    expect(workspaceExists(wsName)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: cleanWorkspace without deleteFolder leaves workspace folder intact
  test("cleanWorkspace without deleteFolder leaves workspace folder", async () => {
    const wsName = uniqueWsName("clean-no-delete-folder")
    const stackName = uniqueRegistryName()

    const { tasksDir, repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const wsDir = join(tasksDir, wsName)
    expect(existsSync(wsDir)).toBe(true)

    const result = await cleanWorkspace(wsName, { force: true })
    expect(result.ok).toBe(true)
    // Worktree inside is removed
    expect(existsSync(repos[0].worktreePath)).toBe(false)
    // But the workspace folder itself must still exist
    expect(existsSync(wsDir)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: cleanWorkspace dry-run with deleteFolder mentions folder
  test("cleanWorkspace dry-run with deleteFolder mentions folder deletion", async () => {
    const wsName = uniqueWsName("clean-dryrun-delete-folder")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    // @ts-ignore — deleteFolder added in this plan
    const result = await cleanWorkspace(wsName, { dryRun: true, deleteFolder: true }, (msg) => messages.push(msg))
    expect(result.ok).toBe(true)
    expect(messages.some(m => m.includes("[dry-run]") && m.includes("folder"))).toBe(true)

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
  })

  afterEach(() => {
    // tmp dir is cleaned by cleanupFixture — nothing extra needed here
  })

  test("re-registers worktrees at new paths", async () => {
    const wsName = uniqueWsName("rename-from")
    const newWsName = uniqueWsName("rename-to")
    const stackName = uniqueRegistryName()

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
    const stackName = uniqueRegistryName()

    // Set up fixture with 1 worktree repo
    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Now add a trunk repo to the workspace YAML by re-writing it
    const trunkRepoPath = makeGitRepo(join(tmp, "workspaces", "main"), "trunk-repo")
    const workspace = readWorkspace(wsName)
    workspace.repos.push({
      name: "trunk-repo",
      repo: stackName,
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
    const trunkRepo = renamed.repos.find((r: { name: string }) => r.name === "trunk-repo")
    expect(trunkRepo).toBeDefined()
    expect(trunkRepo!.main_path).toBe(trunkRepoPath)

    // Worktree repo path was updated to new name
    const wtRepo = renamed.repos.find((r: { name: string }) => r.name === repos[0].name)
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
  })

  afterEach(() => {
    // tmp dir is cleaned by cleanupFixture — nothing extra needed here
  })

  // Test 1 (SAFE-01 remove dry-run): removeWorkspace with dryRun=true returns ok=true,
  // emits [dry-run] prefixed lines, and leaves workspace YAML and worktree intact
  test("SAFE-01 remove dry-run: does not delete worktree or config YAML", async () => {
    const wsName = uniqueWsName("remove-dry")
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    const result = await removeWorkspace(wsName, { force: true, dryRun: true }, (msg: string) => messages.push(msg))

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
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    const result = await cleanWorkspace(wsName, { force: true, dryRun: true }, (msg: string) => messages.push(msg))

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
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Add a commit to the worktree so there's something to merge
    const repo = repos[0]
    const opts = { cwd: repo.worktreePath, stdio: "pipe" as const }
    writeFileSync(join(repo.worktreePath, "feature.txt"), "feature content\n")
    execSync("git add .", opts)
    execSync('git commit -m "feature commit"', opts)

    const messages: string[] = []
    const result = await mergeWorkspace(wsName, { force: true, dryRun: true }, (msg: string) => messages.push(msg))

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
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    const result = await renameWorkspace(wsName, newWsName, { dryRun: true }, (msg: string) => messages.push(msg))

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
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Re-write workspace YAML with an external symlink target
    const workspace = readWorkspace(wsName)
    workspace.files = { symlink: ["/tmp/some-external-target"] }
    writeWorkspace(workspace)

    const messages: string[] = []
    const result = await removeWorkspace(wsName, { force: true }, (msg: string) => messages.push(msg))

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
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Re-write workspace YAML with an external symlink target
    const workspace = readWorkspace(wsName)
    workspace.files = { symlink: ["/tmp/some-external-target"] }
    writeWorkspace(workspace)

    const messages: string[] = []
    const result = await cleanWorkspace(wsName, { force: true }, (msg: string) => messages.push(msg))

    expect(result.ok).toBe(true)
    expect(messages.some(m => m.includes("Warning: external destination"))).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 7 (SAFE-01 dry-run shows external warnings): removeWorkspace with dryRun=true
  // also emits external file warnings via onProgress
  test("SAFE-01 dry-run also shows external file warnings", async () => {
    const wsName = uniqueWsName("remove-dry-ext")
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Re-write workspace YAML with an external symlink target
    const workspace = readWorkspace(wsName)
    workspace.files = { symlink: ["/tmp/some-external-target"] }
    writeWorkspace(workspace)

    const messages: string[] = []
    const result = await removeWorkspace(wsName, { force: true, dryRun: true }, (msg: string) => messages.push(msg))

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

// ============================================================================
// describe("closeWorkspace") — CLOSE-01, CLOSE-02
// ============================================================================

describe("closeWorkspace", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-ops-close")
  })

  afterEach(() => {
    // tmp dir is cleaned by cleanupFixture — nothing extra needed here
  })

  // Test 1: returns { ok: false, error } when workspace does not exist
  test("returns ok:false when workspace does not exist", async () => {
    const result = await closeWorkspace("non-existent-ws-close", {})
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not found/)
  })

  // Test 2: returns { ok: true } for a valid workspace (preserves worktrees + YAML)
  test("returns ok:true for a valid workspace and preserves worktrees and YAML", async () => {
    const wsName = uniqueWsName("close-success")
    const stackName = uniqueRegistryName()

    const { repos } = await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const result = await closeWorkspace(wsName, {})

    expect(result.ok).toBe(true)
    // Workspace YAML must still exist after close
    expect(workspaceExists(wsName)).toBe(true)
    // Worktree directory must still exist after close
    expect(existsSync(repos[0].worktreePath)).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 3: calls onProgress callback with "Closed '{name}'." message
  test("calls onProgress with Closed message", async () => {
    const wsName = uniqueWsName("close-progress")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    const messages: string[] = []
    const result = await closeWorkspace(wsName, {}, (msg: string) => messages.push(msg))

    expect(result.ok).toBe(true)
    expect(messages.some(m => m.includes(`Closed '${wsName}'.`))).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: closeWorkspace fires post_close hook
  test("closeWorkspace fires post_close hook", async () => {
    const wsName = uniqueWsName("close-post-close")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Patch workspace YAML to add post_close hook
    const ws = readWorkspace(wsName)
    ws.hooks = { post_close: ["echo post_close_ran"] }
    writeWorkspace(ws)

    const result = await closeWorkspace(wsName, {})
    expect(result.ok).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: closeWorkspace fires pre_close then post_close in order
  test("closeWorkspace fires pre_close then post_close in order", async () => {
    const wsName = uniqueWsName("close-hook-order")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Patch workspace YAML to add ordered hooks using captured output
    const ws = readWorkspace(wsName)
    ws.hooks = {
      pre_close: ["echo PRE_CLOSE"],
      post_close: ["echo POST_CLOSE"],
    }
    writeWorkspace(ws)

    // Use captured mode so hook output is delivered via onProgress callback
    const captured: string[] = []
    const result = await closeWorkspace(wsName, { captured: true }, (msg: string) => captured.push(msg))
    expect(result.ok).toBe(true)

    // Hook output arrives via captured lines — order verified
    const preIdx = captured.findIndex(l => l.includes("PRE_CLOSE"))
    const postIdx = captured.findIndex(l => l.includes("POST_CLOSE"))
    expect(preIdx).toBeGreaterThanOrEqual(0)
    expect(postIdx).toBeGreaterThanOrEqual(0)
    expect(preIdx).toBeLessThan(postIdx)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test: closeWorkspace sets GS_TRIGGERED_BY=close
  test("closeWorkspace sets GS_TRIGGERED_BY=close", async () => {
    const wsName = uniqueWsName("close-triggered-by")
    const stackName = uniqueRegistryName()

    await setupWorkspaceFixture(tmp, wsName, stackName, { repoCount: 1 })

    // Patch workspace YAML: hook exits 0 only when GS_TRIGGERED_BY=close
    const ws = readWorkspace(wsName)
    ws.hooks = { pre_close: ['test "$GS_TRIGGERED_BY" = "close"'] }
    writeWorkspace(ws)

    const result = await closeWorkspace(wsName, {})
    // Hook exits 0 iff env var is set correctly — if GS_TRIGGERED_BY is wrong, hook fails
    expect(result.ok).toBe(true)

    cleanupFixture(wsName, stackName, tmp)
  })

  // Test 4: pre_close is accepted in WorkspaceHooksSchema (Zod parse succeeds)
  test("pre_close is accepted in WorkspaceHooksSchema", () => {
    const result = WorkspaceSchema.safeParse({
      name: "test",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: [],
      hooks: {
        pre_close: ["echo closing"],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.pre_close).toEqual(["echo closing"])
    }
  })

  // Test 5: pre_close is accepted in TemplateSchema hooks (Zod parse succeeds)
  test("pre_close is accepted in TemplateSchema hooks", () => {
    const result = TemplateSchema.safeParse({
      name: "my-template",
      repos: [],
      hooks: {
        pre_close: ["echo template closing"],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.pre_close).toEqual(["echo template closing"])
    }
  })
})

// ============================================================================
// describe("lifecycle hook schemas") — LC-01 (D-05, D-06, D-07, D-08)
// ============================================================================

describe("lifecycle hook schemas (LC-01)", () => {
  // --- WorkspaceSchema new hook fields ---

  test("WorkspaceSchema accepts post_close in hooks", () => {
    const result = WorkspaceSchema.safeParse({
      name: "test-ws",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: [],
      hooks: {
        post_close: ["echo post_close_ran"],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.post_close).toEqual(["echo post_close_ran"])
    }
  })

  test("WorkspaceSchema accepts pre_clean in hooks", () => {
    const result = WorkspaceSchema.safeParse({
      name: "test-ws",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: [],
      hooks: {
        pre_clean: ["echo pre_clean_ran"],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.pre_clean).toEqual(["echo pre_clean_ran"])
    }
  })

  test("WorkspaceSchema accepts post_clean in hooks", () => {
    const result = WorkspaceSchema.safeParse({
      name: "test-ws",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: [],
      hooks: {
        post_clean: ["echo post_clean_ran"],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.post_clean).toEqual(["echo post_clean_ran"])
    }
  })

  test("WorkspaceSchema accepts pre_merge in hooks", () => {
    const result = WorkspaceSchema.safeParse({
      name: "test-ws",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: [],
      hooks: {
        pre_merge: ["echo pre_merge_ran"],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.pre_merge).toEqual(["echo pre_merge_ran"])
    }
  })

  test("WorkspaceSchema accepts post_remove in hooks", () => {
    const result = WorkspaceSchema.safeParse({
      name: "test-ws",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: [],
      hooks: {
        post_remove: ["echo post_remove_ran"],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.post_remove).toEqual(["echo post_remove_ran"])
    }
  })

  // --- TemplateSchema new hook fields ---

  test("TemplateSchema accepts post_close in hooks", () => {
    const result = TemplateSchema.safeParse({
      name: "my-template",
      repos: [],
      hooks: { post_close: ["echo post_close"] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.post_close).toEqual(["echo post_close"])
    }
  })

  test("TemplateSchema accepts pre_clean in hooks", () => {
    const result = TemplateSchema.safeParse({
      name: "my-template",
      repos: [],
      hooks: { pre_clean: ["echo pre_clean"] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.pre_clean).toEqual(["echo pre_clean"])
    }
  })

  test("TemplateSchema accepts post_clean in hooks", () => {
    const result = TemplateSchema.safeParse({
      name: "my-template",
      repos: [],
      hooks: { post_clean: ["echo post_clean"] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.post_clean).toEqual(["echo post_clean"])
    }
  })

  test("TemplateSchema accepts pre_merge in hooks", () => {
    const result = TemplateSchema.safeParse({
      name: "my-template",
      repos: [],
      hooks: { pre_merge: ["echo pre_merge"] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.pre_merge).toEqual(["echo pre_merge"])
    }
  })

  test("TemplateSchema accepts post_remove in hooks", () => {
    const result = TemplateSchema.safeParse({
      name: "my-template",
      repos: [],
      hooks: { post_remove: ["echo post_remove"] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks?.post_remove).toEqual(["echo post_remove"])
    }
  })

  // --- Per-repo pre_clean (D-08) ---

  test("WorkspaceSchema accepts pre_clean in repo hooks (D-08)", () => {
    const result = WorkspaceSchema.safeParse({
      name: "test-ws",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: [{
        name: "repo-0",
        repo: "my-repo",
        type: "other",
        mode: "worktree",
        main_path: "/tmp/main",
        task_path: "/tmp/task",
        hooks: {
          pre_clean: ["echo repo_pre_clean"],
        },
      }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.repos[0].hooks?.pre_clean).toEqual(["echo repo_pre_clean"])
    }
  })

  // --- Backward compatibility ---

  test("WorkspaceSchema without new hook fields still parses (backward compatible)", () => {
    const result = WorkspaceSchema.safeParse({
      name: "legacy-ws",
      branch: "feature/legacy",
      created: new Date().toISOString(),
      repos: [],
      hooks: {
        pre_create: ["echo pre_create"],
        post_create: ["echo post_create"],
        pre_open: ["echo pre_open"],
        post_open: ["echo post_open"],
        post_merge: ["echo post_merge"],
        pre_remove: ["echo pre_remove"],
        pre_close: ["echo pre_close"],
      },
    })
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// describe("editYaml helpers") — path resolution and Zod validation
// ============================================================================

describe("editYaml helpers", () => {
  test("editTemplateYaml returns correct path and validates", () => {
    const name = `edit-yaml-tpl-${Date.now()}`
    const { path, validate } = editTemplateYaml(name)

    // Path should end with templates/{name}.yml
    expect(path).toMatch(new RegExp(`templates[\\\\/]${name}\\.yml$`))

    // Write a valid template YAML
    mkdirSync(join(isolated.configDir, "templates"), { recursive: true })
    writeFileSync(path, `name: ${name}\nschema_version: "1"\nrepos: []\n`, "utf-8")

    const valid = validate()
    expect(valid.ok).toBe(true)
    expect(valid.error).toBeUndefined()

    // Corrupt the file — validation should fail
    writeFileSync(path, `{{{invalid yaml`, "utf-8")
    const invalid = validate()
    expect(invalid.ok).toBe(false)
    expect(typeof invalid.error).toBe("string")
  })

  test("editGlobalConfigYaml returns correct path and validates", () => {
    const { path, validate } = editGlobalConfigYaml()

    // Path should end with config.yml
    expect(path).toMatch(/config\.yml$/)

    // Write a valid global config YAML
    writeFileSync(path, `workspace_root: /tmp/ws\nintegrations: {}\n`, "utf-8")

    const valid = validate()
    expect(valid.ok).toBe(true)
    expect(valid.error).toBeUndefined()
  })

  test("editRegistryYaml returns correct path and validates", () => {
    const { path, validate } = editRegistryYaml()

    // Path should end with registry.yml
    expect(path).toMatch(/registry\.yml$/)

    // Write a valid registry YAML (empty array)
    writeFileSync(path, `[]\n`, "utf-8")

    const valid = validate()
    expect(valid.ok).toBe(true)
    expect(valid.error).toBeUndefined()
  })
})

// ============================================================================
// describe("renameTemplate") — IDEN-03
// ============================================================================

describe("renameTemplate", () => {
  // Helper: create a minimal template YAML in the isolated config dir
  function createTemplateFixture(name: string, extraWorkspaceTemplate?: string): void {
    mkdirSync(join(isolated.configDir, "templates"), { recursive: true })
    const tpl = TemplateSchema.parse({ name, repos: [] })
    writeTemplate(tpl)

    if (extraWorkspaceTemplate !== undefined) {
      // Write a workspace YAML that references this template
      mkdirSync(join(isolated.configDir, "workspaces"), { recursive: true })
      const ws = WorkspaceSchema.parse({
        name: `ws-for-${name}`,
        branch: "feature/test",
        created: new Date().toISOString(),
        repos: [],
        template: extraWorkspaceTemplate,
      })
      writeWorkspace(ws)
    }
  }

  test("renames template file and updates YAML name field", async () => {
    const oldName = `tpl-rename-from-${FILE_RUN_ID}-${++_testCounter}`
    const newName = `tpl-rename-to-${FILE_RUN_ID}-${_testCounter}`

    createTemplateFixture(oldName)
    expect(templateExists(oldName)).toBe(true)

    const result = await renameTemplate(oldName, newName)

    expect(result.ok).toBe(true)
    expect(templateExists(newName)).toBe(true)
    expect(templateExists(oldName)).toBe(false)
  })

  test("cascades template reference to workspace YAML", async () => {
    const oldName = `tpl-cascade-from-${FILE_RUN_ID}-${++_testCounter}`
    const newName = `tpl-cascade-to-${FILE_RUN_ID}-${_testCounter}`
    const wsName = `ws-for-${oldName}`

    createTemplateFixture(oldName, oldName)

    const result = await renameTemplate(oldName, newName)
    expect(result.ok).toBe(true)

    // Re-read workspace and verify template reference updated
    const updatedWs = readWorkspace(wsName)
    expect(updatedWs.template).toBe(newName)
  })

  test("dry-run reports changes but does not write", async () => {
    const oldName = `tpl-dryrun-from-${FILE_RUN_ID}-${++_testCounter}`
    const newName = `tpl-dryrun-to-${FILE_RUN_ID}-${_testCounter}`

    createTemplateFixture(oldName, oldName)

    const messages: string[] = []
    const result = await renameTemplate(oldName, newName, { dryRun: true }, (msg: string) => messages.push(msg))

    expect(result.ok).toBe(true)
    // Template old still exists, new does not
    expect(templateExists(oldName)).toBe(true)
    expect(templateExists(newName)).toBe(false)
    // Messages contain [dry-run] prefix
    expect(messages.some(m => m.includes("[dry-run]"))).toBe(true)
    // Dry run completion message present
    expect(messages[messages.length - 1]).toContain("Dry run complete")
  })

  test("returns error for nonexistent template", async () => {
    const result = await renameTemplate(`ghost-tpl-${FILE_RUN_ID}`, `new-tpl-${FILE_RUN_ID}`)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not found/)
  })

  test("returns error if new name already exists", async () => {
    const nameA = `tpl-a-${FILE_RUN_ID}-${++_testCounter}`
    const nameB = `tpl-b-${FILE_RUN_ID}-${_testCounter}`

    createTemplateFixture(nameA)
    createTemplateFixture(nameB)

    const result = await renameTemplate(nameA, nameB)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already exists/)
  })
})

// ============================================================================
// describe("writeEnvFiles path boundary") — CR-03
// ============================================================================

describe("writeEnvFiles path boundary", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("ws-env-boundary")
  })

  afterEach(() => cleanup(tmp))

  function makeEnvFixture(envFileName: string) {
    const repoPath = join(tmp, "repo")
    mkdirSync(repoPath, { recursive: true })

    const ws = WorkspaceSchema.parse({
      name: "env-test",
      branch: "main",
      created: "2026-01-01",
      env_file: envFileName,
      repos: [{
        name: "repo",
        repo: "platform",
        type: "other",
        mode: "worktree",
        main_path: repoPath,
        task_path: repoPath,
      }],
    })

    return { ws, repoPath }
  }

  test("normal .env filename writes file at repo root", () => {
    const { ws, repoPath } = makeEnvFixture(".env")
    const warns: string[] = []

    writeEnvFiles(ws, { API_KEY: "test-value" }, (msg) => warns.push(msg))

    const envPath = join(repoPath, ".env")
    expect(existsSync(envPath)).toBe(true)
    expect(warns).toHaveLength(0)
    const content = readFileSync(envPath, "utf-8")
    expect(content).toContain("API_KEY=test-value")
  })

  test("../../outside.env is rejected and onWarn is called", () => {
    const { ws, repoPath } = makeEnvFixture("../../outside.env")
    const warns: string[] = []

    writeEnvFiles(ws, { SECRET: "nope" }, (msg) => warns.push(msg))

    // Warning must be issued — boundary check blocked the write
    expect(warns.length).toBeGreaterThan(0)
    expect(warns[0]).toMatch(/resolves outside repo root/)
    // File must NOT be written inside the repo (the path-traversal destination is outside)
    const insideRepo = join(repoPath, "outside.env")
    expect(existsSync(insideRepo)).toBe(false)
  })

  test("subdir/.env within repo root is written successfully", () => {
    const { ws, repoPath } = makeEnvFixture("subdir/.env")
    mkdirSync(join(repoPath, "subdir"), { recursive: true })
    const warns: string[] = []

    writeEnvFiles(ws, { DB_URL: "postgres://localhost" }, (msg) => warns.push(msg))

    const envPath = join(repoPath, "subdir", ".env")
    expect(existsSync(envPath)).toBe(true)
    expect(warns).toHaveLength(0)
  })

  test("absolute path /tmp/evil.env is rejected and onWarn is called", () => {
    const { ws } = makeEnvFixture("/tmp/evil.env")
    const warns: string[] = []

    writeEnvFiles(ws, { SECRET: "nope" }, (msg) => warns.push(msg))

    expect(existsSync("/tmp/evil.env")).toBe(false)
    expect(warns.length).toBeGreaterThan(0)
    expect(warns[0]).toMatch(/resolves outside repo root/)
  })
})
