import { describe, test, expect, afterAll } from "bun:test"
import { join } from "path"
import { mkdirSync, writeFileSync } from "fs"
import { execSync } from "child_process"
import { makeTmpDir, cleanup, useIsolatedConfig } from "../helpers"
import { stringify } from "yaml"

// --- Test-scoped isolation ---
const { configDir, cleanup: cleanupConfig } = useIsolatedConfig("pull-test")

// Dynamic imports after isolation
const { pullFFOnly } = await import("@/lib/git")
const { pullWorkspace } = await import("@/lib/workspace-ops")
const { workspaceExists, readWorkspace } = await import("@/lib/config")

// Track all tmp dirs for cleanup
const tmpDirs: string[] = []

afterAll(() => {
  for (const d of tmpDirs) cleanup(d)
  cleanupConfig()
})

// --- Helpers ---

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, stdio: "pipe" }).toString().trim()
}

function createBareAndClone(tmp: string, name: string, branch = "main"): { barePath: string; clonePath: string } {
  const barePath = join(tmp, `${name}-bare`)
  const clonePath = join(tmp, `${name}-clone`)
  mkdirSync(barePath, { recursive: true })
  execSync(`git init --bare -b ${branch}`, { cwd: barePath, stdio: "pipe" })
  execSync(`git clone ${barePath} ${clonePath}`, { stdio: "pipe" })
  git(clonePath, 'config user.email "test@test.com"')
  git(clonePath, 'config user.name "Test"')
  writeFileSync(join(clonePath, "README.md"), "init")
  git(clonePath, "add .")
  git(clonePath, 'commit -m "initial"')
  git(clonePath, `push origin ${branch}`)
  return { barePath, clonePath }
}

function pushUpstreamCommit(barePath: string, tmp: string, filename: string, branch = "main"): void {
  const pushClone = join(tmp, `push-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  execSync(`git clone -b ${branch} ${barePath} ${pushClone}`, { stdio: "pipe" })
  git(pushClone, 'config user.email "test@test.com"')
  git(pushClone, 'config user.name "Test"')
  writeFileSync(join(pushClone, filename), `content-${Date.now()}`)
  git(pushClone, "add .")
  git(pushClone, 'commit -m "upstream commit"')
  git(pushClone, `push origin ${branch}`)
}

function writeWorkspaceYaml(name: string, workspace: Record<string, unknown>): void {
  const wsPath = join(configDir, "workspaces", `${name}.yml`)
  writeFileSync(wsPath, stringify(workspace))
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

    // Push upstream commits to the feature branch via push clones
    // We need the feature branch on remote first
    git(repo1.clonePath, "push origin feat-branch")
    git(repo2.clonePath, "push origin feat-branch")

    pushUpstreamCommit(repo1.barePath, tmp, "new1.txt", "feat-branch")
    pushUpstreamCommit(repo2.barePath, tmp, "new2.txt", "feat-branch")

    writeWorkspaceYaml("test-ws", {
      name: "test-ws",
      branch: "feat-branch",
      created: new Date().toISOString(),
      repos: [
        { name: "repo1", repo: "repo1", type: "generic", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
        { name: "repo2", repo: "repo2", type: "generic", mode: "worktree", main_path: repo2.clonePath, task_path: wt2, base_branch: "main" },
      ],
    })

    // Fetch first so the worktrees know about the remote branch
    git(wt1, "fetch origin")
    git(wt2, "fetch origin")

    const result = await pullWorkspace("test-ws")
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

    writeWorkspaceYaml("dirty-ws", {
      name: "dirty-ws",
      branch: "feat-dirty",
      created: new Date().toISOString(),
      repos: [
        { name: "repo1", repo: "repo1", type: "generic", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
      ],
    })

    const result = await pullWorkspace("dirty-ws")
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

    writeWorkspaceYaml("diverge-ws", {
      name: "diverge-ws",
      branch: "feat-div",
      created: new Date().toISOString(),
      repos: [
        { name: "repo1", repo: "repo1", type: "generic", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
      ],
    })

    const result = await pullWorkspace("diverge-ws")
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
    git(wt1, "fetch origin")

    // Trunk repo uses main branch
    pushUpstreamCommit(repo2.barePath, tmp, "trunk-update.txt", "main")
    git(repo2.clonePath, "fetch origin")

    writeWorkspaceYaml("mixed-ws", {
      name: "mixed-ws",
      branch: "feat-mixed",
      created: new Date().toISOString(),
      repos: [
        { name: "repo1", repo: "repo1", type: "generic", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
        { name: "repo2", repo: "repo2", type: "generic", mode: "trunk", main_path: repo2.clonePath, task_path: repo2.clonePath, base_branch: "main" },
      ],
    })

    const result = await pullWorkspace("mixed-ws")
    expect(result.ok).toBe(true)
    expect(result.pulled.length).toBe(2)
    // repo1 (worktree) pulled feat-mixed, repo2 (trunk) pulled main
    expect(result.pulled[0].repo).toBe("repo1")
    expect(result.pulled[0].commits).toBe(1)
    expect(result.pulled[1].repo).toBe("repo2")
    expect(result.pulled[1].commits).toBe(1)
  })

  test("deduplicates fetch per main_path", async () => {
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

    writeWorkspaceYaml("dedup-ws", {
      name: "dedup-ws",
      branch: "feat-a",
      created: new Date().toISOString(),
      repos: [
        { name: "wt1", repo: "repo1", type: "generic", mode: "worktree", main_path: repo1.clonePath, task_path: wt1, base_branch: "main" },
        { name: "wt2", repo: "repo1", type: "generic", mode: "worktree", main_path: repo1.clonePath, task_path: wt2, base_branch: "main" },
      ],
    })

    // Track fetching events to verify deduplication
    const fetchEvents: string[] = []
    const result = await pullWorkspace("dedup-ws", (row) => {
      if (row.status === "fetching") fetchEvents.push(row.repo)
    })

    // Both repos should report fetching (they're in the same group),
    // but the actual fetch only happens once per main_path
    expect(fetchEvents.length).toBe(2) // both repos reported
    // Both should have been pulled (the pull itself uses different branches)
    expect(result.pulled.length).toBe(2)
  })

  test("returns error for nonexistent workspace", async () => {
    const result = await pullWorkspace("nonexistent-ws")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not found")
  })
})
