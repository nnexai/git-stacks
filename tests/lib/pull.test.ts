import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test"
import { join } from "path"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { execSync } from "child_process"
import type { Workspace } from "@/lib/config"
import { applyTestGitEnv, cleanup, makeTmpDir, gitExecOptions } from "../helpers"

// Import real functions from git.ts (no config dependency, safe to import directly)
import { pullFFOnly } from "../../src/lib/git"
import { pullWorkspace } from "../../src/lib/workspace-git"

const tmpDirs: string[] = []
let gitEnvDir: string
let restoreGitEnv: (() => void) | undefined

beforeEach(() => {
  gitEnvDir = makeTmpDir("pull-git-env")
  restoreGitEnv = applyTestGitEnv(gitEnvDir)
})

afterEach(() => {
  restoreGitEnv?.()
  cleanup(gitEnvDir)
})

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

// --- Helpers ---

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, gitExecOptions(cwd)).toString().trim()
}

function createBareAndClone(tmp: string, name: string, branch = "main"): { barePath: string; clonePath: string } {
  const barePath = join(tmp, `${name}-bare`)
  const clonePath = join(tmp, `${name}-clone`)
  mkdirSync(barePath, { recursive: true })
  execSync(`git init --bare -b ${branch}`, gitExecOptions(barePath, tmp))
  execSync(`git clone ${barePath} ${clonePath}`, gitExecOptions(tmp, tmp))
  git(clonePath, 'config user.email "test@test.com"')
  git(clonePath, 'config user.name "Test"')
  git(clonePath, "config commit.gpgsign false")
  writeFileSync(join(clonePath, "README.md"), "init")
  git(clonePath, "add .")
  git(clonePath, 'commit -m "initial"')
  git(clonePath, `push origin ${branch}`)
  return { barePath, clonePath }
}

function pushUpstreamCommit(barePath: string, tmp: string, filename: string, branch = "main"): void {
  const pushClone = join(tmp, `push-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  execSync(`git clone -b ${branch} ${barePath} ${pushClone}`, gitExecOptions(tmp, tmp))
  git(pushClone, 'config user.email "test@test.com"')
  git(pushClone, 'config user.name "Test"')
  git(pushClone, "config commit.gpgsign false")
  writeFileSync(join(pushClone, filename), `content-${Date.now()}`)
  git(pushClone, "add .")
  git(pushClone, 'commit -m "upstream commit"')
  git(pushClone, `push origin ${branch}`)
}

function makeWorkspace(name: string, branch: string, repos: Workspace["repos"]): Workspace {
  return {
    name,
    branch,
    created: new Date().toISOString(),
    repos,
  } as Workspace
}

// --- pullFFOnly tests ---

describe("pullFFOnly", () => {
  test("pulls new commits and returns commit count", async () => {
    const tmp = makeTmpDir("pull-ff")
    tmpDirs.push(tmp)

    const { barePath, clonePath } = createBareAndClone(tmp, "repo1")
    pushUpstreamCommit(barePath, tmp, "file1.txt")

    const result = await pullFFOnly(clonePath, "main")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.commits).toBe(1)
    }
  })

  test("returns ok with 0 commits when already up to date", async () => {
    const tmp = makeTmpDir("pull-ff-uptodate")
    tmpDirs.push(tmp)

    const { clonePath } = createBareAndClone(tmp, "repo1")

    const result = await pullFFOnly(clonePath, "main")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.commits).toBe(0)
    }
  })

  test("returns diverged when branches diverge", async () => {
    const tmp = makeTmpDir("pull-ff-diverge")
    tmpDirs.push(tmp)

    const { barePath, clonePath } = createBareAndClone(tmp, "repo1")

    // Push upstream commit
    pushUpstreamCommit(barePath, tmp, "upstream.txt")

    // Create local divergent commit
    writeFileSync(join(clonePath, "local.txt"), "local")
    git(clonePath, "add .")
    git(clonePath, 'commit -m "local commit"')

    const result = await pullFFOnly(clonePath, "main")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("diverged")
    }
  })
})

// --- pullWorkspace tests ---
// Pass Workspace objects directly to avoid config module isolation issues.

describe("pullWorkspace", () => {
  test("pulls all repos in a workspace", async () => {
    const tmp = makeTmpDir("pull-ws-all")
    tmpDirs.push(tmp)

    const repo1 = createBareAndClone(tmp, "repo1")
    const repo2 = createBareAndClone(tmp, "repo2")

    // Create worktrees for both repos
    const wt1 = join(tmp, "tasks", "test-ws", "repo1")
    const wt2 = join(tmp, "tasks", "test-ws", "repo2")
    mkdirSync(join(tmp, "tasks", "test-ws"), { recursive: true })
    git(repo1.clonePath, `worktree add -b feat-branch ${wt1}`)
    git(repo2.clonePath, `worktree add -b feat-branch ${wt2}`)

    // Push feature branches to remote first
    git(repo1.clonePath, "push origin feat-branch")
    git(repo2.clonePath, "push origin feat-branch")

    pushUpstreamCommit(repo1.barePath, tmp, "new1.txt", "feat-branch")
    pushUpstreamCommit(repo2.barePath, tmp, "new2.txt", "feat-branch")

    const ws = makeWorkspace("test-ws", "feat-branch", [
      { name: "repo1", repo: "repo1", type: "other", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
      { name: "repo2", repo: "repo2", type: "other", mode: "worktree", main_path: repo2.clonePath, task_path: wt2, base_branch: "main" },
    ] as Workspace["repos"])

    const result = await pullWorkspace(ws)
    expect(result.ok).toBe(true)
    expect(result.pulled.length).toBe(2)
    expect(result.pulled[0].commits).toBe(1)
    expect(result.pulled[1].commits).toBe(1)
  })

  test("skips dirty repos with warning", async () => {
    const tmp = makeTmpDir("pull-ws-dirty")
    tmpDirs.push(tmp)

    const repo1 = createBareAndClone(tmp, "repo1")
    const wt1 = join(tmp, "tasks", "dirty-ws", "repo1")
    mkdirSync(join(tmp, "tasks", "dirty-ws"), { recursive: true })
    git(repo1.clonePath, `worktree add -b feat-dirty ${wt1}`)
    git(repo1.clonePath, "push origin feat-dirty")

    // Make the worktree dirty
    writeFileSync(join(wt1, "uncommitted.txt"), "dirty")

    const ws = makeWorkspace("dirty-ws", "feat-dirty", [
      { name: "repo1", repo: "repo1", type: "other", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
    ] as Workspace["repos"])

    const result = await pullWorkspace(ws)
    expect(result.ok).toBe(false)
    expect(result.skipped.length).toBe(1)
    expect(result.skipped[0].reason).toBe("dirty")
  })

  test("reports diverged repos as failed", async () => {
    const tmp = makeTmpDir("pull-ws-diverge")
    tmpDirs.push(tmp)

    const repo1 = createBareAndClone(tmp, "repo1")
    const wt1 = join(tmp, "tasks", "diverge-ws", "repo1")
    mkdirSync(join(tmp, "tasks", "diverge-ws"), { recursive: true })
    git(repo1.clonePath, `worktree add -b feat-div ${wt1}`)
    git(repo1.clonePath, "push origin feat-div")

    // Push upstream
    pushUpstreamCommit(repo1.barePath, tmp, "upstream.txt", "feat-div")

    // Local divergent commit in worktree
    writeFileSync(join(wt1, "local-div.txt"), "local")
    git(wt1, "add .")
    git(wt1, 'commit -m "local diverge"')

    const ws = makeWorkspace("diverge-ws", "feat-div", [
      { name: "repo1", repo: "repo1", type: "other", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
    ] as Workspace["repos"])

    const result = await pullWorkspace(ws)
    expect(result.ok).toBe(false)
    expect(result.failed.length).toBe(1)
    expect(result.failed[0].reason).toContain("diverged")
  })

  test("worktree repos pull workspace branch, trunk repos pull base_branch", async () => {
    const tmp = makeTmpDir("pull-ws-mixed")
    tmpDirs.push(tmp)

    const repo1 = createBareAndClone(tmp, "repo1")
    const repo2 = createBareAndClone(tmp, "repo2")

    // Worktree repo with feature branch
    const wt1 = join(tmp, "tasks", "mixed-ws", "repo1")
    mkdirSync(join(tmp, "tasks", "mixed-ws"), { recursive: true })
    git(repo1.clonePath, `worktree add -b feat-mixed ${wt1}`)
    git(repo1.clonePath, "push origin feat-mixed")
    pushUpstreamCommit(repo1.barePath, tmp, "wt-update.txt", "feat-mixed")

    // Trunk repo uses main branch
    pushUpstreamCommit(repo2.barePath, tmp, "trunk-update.txt", "main")

    const ws = makeWorkspace("mixed-ws", "feat-mixed", [
      { name: "repo1", repo: "repo1", type: "other", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
      { name: "repo2", repo: "repo2", type: "other", mode: "trunk", main_path: repo2.clonePath, task_path: repo2.clonePath, base_branch: "main" },
    ] as Workspace["repos"])

    const result = await pullWorkspace(ws)
    expect(result.ok).toBe(true)
    expect(result.pulled.length).toBe(2)
    // repo1 (worktree) pulled feat-mixed, repo2 (trunk) pulled main
    expect(result.pulled[0].repo).toBe("repo1")
    expect(result.pulled[0].commits).toBe(1)
    expect(result.pulled[1].repo).toBe("repo2")
    expect(result.pulled[1].commits).toBe(1)
  })

  test("deduplicates fetch per main_path while rejecting a worktree on another branch", async () => {
    const tmp = makeTmpDir("pull-ws-dedup")
    tmpDirs.push(tmp)

    const repo1 = createBareAndClone(tmp, "repo1")

    // Two worktrees from the same repo (same main_path)
    const wt1 = join(tmp, "tasks", "dedup-ws", "wt1")
    const wt2 = join(tmp, "tasks", "dedup-ws", "wt2")
    mkdirSync(join(tmp, "tasks", "dedup-ws"), { recursive: true })
    git(repo1.clonePath, `worktree add -b feat-a ${wt1}`)
    git(repo1.clonePath, `worktree add -b feat-b ${wt2}`)
    git(repo1.clonePath, "push origin feat-a")
    git(repo1.clonePath, "push origin feat-b")

    pushUpstreamCommit(repo1.barePath, tmp, "shared-update.txt", "feat-a")
    pushUpstreamCommit(repo1.barePath, tmp, "shared-update2.txt", "feat-b")

    const ws = makeWorkspace("dedup-ws", "feat-a", [
      { name: "wt1", repo: "repo1", type: "other", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
      { name: "wt2", repo: "repo1", type: "other", mode: "worktree", main_path: repo1.clonePath, task_path: wt2, base_branch: "main" },
    ] as Workspace["repos"])

    // Track fetching events to verify deduplication
    const fetchEvents: string[] = []
    const result = await pullWorkspace(ws, (row) => {
      if (row.status === "fetching") fetchEvents.push(row.repo)
    })

    // The workspace declares feat-a, so the feat-b worktree is rejected before fetch/pull.
    expect(fetchEvents).toEqual(["wt1"])
    expect(result.pulled).toHaveLength(1)
    expect(result.failed).toContainEqual(expect.objectContaining({
      repo: "wt2",
      reason: "branch mismatch: current 'feat-b', expected 'feat-a'",
    }))
  })

  test("returns error for nonexistent workspace by name", async () => {
    const result = await pullWorkspace("nonexistent-ws-xyz123")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not found")
  })
})
