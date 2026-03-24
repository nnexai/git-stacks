import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { execSync } from "child_process"
import { writeFileSync } from "fs"
import { makeTmpDir, cleanup, makeGitRepo } from "../helpers"
import {
  createWorktree,
  removeWorktree,
  isWorktreeRegistered,
  mergeNoFF,
  rebaseBranch,
  getCommitsBehind,
  fetchOrigin,
  checkRemoteTrackingRef,
  checkBranchExistsOnRemote,
  hasUpstreamTracking,
  ensureUpstreamTracking,
} from "../../src/lib/git"

// ---------------------------------------------------------------------------
// describe("makeGitRepo") — TEST-01
// ---------------------------------------------------------------------------

describe("makeGitRepo", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("creates a repo with main branch", () => {
    const branch = execSync("git -C " + repoPath + " branch --show-current", {
      stdio: "pipe",
    })
      .toString()
      .trim()
    expect(branch).toBe("main")
  })

  test("has at least one commit", () => {
    // rev-parse HEAD exits 0 only when at least one commit exists
    const result = execSync("git -C " + repoPath + " rev-parse HEAD", {
      stdio: "pipe",
    })
      .toString()
      .trim()
    expect(result.length).toBeGreaterThan(0)
  })

  test("has user identity configured", () => {
    const email = execSync("git -C " + repoPath + " config user.email", {
      stdio: "pipe",
    })
      .toString()
      .trim()
    expect(email).toBe("test@example.com")
  })
})

// ---------------------------------------------------------------------------
// describe("createWorktree")
// ---------------------------------------------------------------------------

describe("createWorktree", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("creates worktree for new branch", async () => {
    const wtPath = join(tmp, "wt", "feat")
    await createWorktree(repoPath, wtPath, "feature/x")
    const registered = await isWorktreeRegistered(repoPath, wtPath)
    expect(registered).toBe(true)
  })

  test("creates worktree for existing branch", async () => {
    const opts = { cwd: repoPath, stdio: "pipe" as const }
    execSync("git branch existing-branch", opts)
    const wtPath = join(tmp, "wt", "existing")
    await createWorktree(repoPath, wtPath, "existing-branch")
    const registered = await isWorktreeRegistered(repoPath, wtPath)
    expect(registered).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// describe("removeWorktree")
// ---------------------------------------------------------------------------

describe("removeWorktree", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("removes a registered worktree", async () => {
    const wtPath = join(tmp, "wt", "remove-me")
    await createWorktree(repoPath, wtPath, "feature/remove-me")
    expect(await isWorktreeRegistered(repoPath, wtPath)).toBe(true)
    await removeWorktree(repoPath, wtPath)
    expect(await isWorktreeRegistered(repoPath, wtPath)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describe("mergeNoFF")
// ---------------------------------------------------------------------------

describe("mergeNoFF", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("merges branch into base with merge commit", async () => {
    // Create a worktree on feature/y and commit a file there
    const wtPath = join(tmp, "wt", "feature-y")
    await createWorktree(repoPath, wtPath, "feature/y")

    const opts = { cwd: wtPath, stdio: "pipe" as const }
    writeFileSync(join(wtPath, "feature.txt"), "feature content\n")
    execSync("git add .", opts)
    execSync('git commit -m "add feature"', opts)

    const result = await mergeNoFF(repoPath, "main", "feature/y")
    expect(result.ok).toBe(true)

    // The feature commit should now be reachable from main
    const log = execSync("git -C " + repoPath + " log --oneline main", {
      stdio: "pipe",
    }).toString()
    expect(log).toContain("add feature")
  })

  test("does not disturb main clone working tree (detached HEAD temp worktree pattern)", async () => {
    // Verify the main clone stays on its original branch (no git checkout is run)
    const branchBefore = execSync("git -C " + repoPath + " rev-parse --abbrev-ref HEAD", {
      stdio: "pipe",
    }).toString().trim()
    expect(branchBefore).toBe("main")

    const wtPath = join(tmp, "wt", "feature-z")
    await createWorktree(repoPath, wtPath, "feature/z")

    const opts = { cwd: wtPath, stdio: "pipe" as const }
    writeFileSync(join(wtPath, "newfile.txt"), "new\n")
    execSync("git add .", opts)
    execSync('git commit -m "feature z commit"', opts)

    const result = await mergeNoFF(repoPath, "main", "feature/z")
    expect(result.ok).toBe(true)

    // Main clone still on main branch (no checkout occurred that changed branches)
    const branchAfter = execSync("git -C " + repoPath + " rev-parse --abbrev-ref HEAD", {
      stdio: "pipe",
    }).toString().trim()
    expect(branchAfter).toBe("main")

    // main branch ref should have advanced to include the merge commit
    const mainLog = execSync("git -C " + repoPath + " log --oneline main", {
      stdio: "pipe",
    }).toString()
    expect(mainLog).toContain("feature z commit")
  })

  test("returns error result on non-existent base branch", async () => {
    const result = await mergeNoFF(repoPath, "nonexistent-base", "main")
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error!.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// describe("rebaseBranch")
// ---------------------------------------------------------------------------

describe("rebaseBranch", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("rebases branch onto upstream", async () => {
    // Create worktree on feature/rebase and add a commit
    const wtPath = join(tmp, "wt", "rebase-ok")
    await createWorktree(repoPath, wtPath, "feature/rebase")

    const wtOpts = { cwd: wtPath, stdio: "pipe" as const }
    writeFileSync(join(wtPath, "feature-r.txt"), "feature rebase\n")
    execSync("git add .", wtOpts)
    execSync('git commit -m "feature rebase commit"', wtOpts)

    // Add a commit to main so there is something to rebase onto
    const repoOpts = { cwd: repoPath, stdio: "pipe" as const }
    writeFileSync(join(repoPath, "main-extra.txt"), "main update\n")
    execSync("git add .", repoOpts)
    execSync('git commit -m "main extra commit"', repoOpts)

    // Rebase the worktree branch onto updated main
    const result = await rebaseBranch(wtPath, "main")
    expect(result.ok).toBe(true)
  })

  test("aborts and returns error on conflict", async () => {
    // Write the same file on both main and the feature branch with conflicting content
    const repoOpts = { cwd: repoPath, stdio: "pipe" as const }

    const wtPath = join(tmp, "wt", "rebase-conflict")
    await createWorktree(repoPath, wtPath, "feature/conflict")

    // Commit a conflicting change on the feature branch first
    const wtOpts = { cwd: wtPath, stdio: "pipe" as const }
    writeFileSync(join(wtPath, "conflict.txt"), "feature version\n")
    execSync("git add .", wtOpts)
    execSync('git commit -m "feature conflict commit"', wtOpts)

    // Now commit a different conflicting change on main for the same file
    writeFileSync(join(repoPath, "conflict.txt"), "main version\n")
    execSync("git add .", repoOpts)
    execSync('git commit -m "main conflict commit"', repoOpts)

    // Rebase should fail and return ok: false
    const result = await rebaseBranch(wtPath, "main")
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe("string")
    expect(result.error!.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// describe("getCommitsBehind")
// ---------------------------------------------------------------------------

describe("getCommitsBehind", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("returns 0 when branches are even", async () => {
    const count = await getCommitsBehind(repoPath, "main", "main")
    expect(count).toBe(0)
  })

  test("returns correct count when behind", async () => {
    // Create a feature branch at current HEAD, then add 2 commits to main
    const opts = { cwd: repoPath, stdio: "pipe" as const }
    execSync("git branch feature-behind", opts)

    writeFileSync(join(repoPath, "extra1.txt"), "extra1\n")
    execSync("git add .", opts)
    execSync('git commit -m "main commit 1"', opts)

    writeFileSync(join(repoPath, "extra2.txt"), "extra2\n")
    execSync("git add .", opts)
    execSync('git commit -m "main commit 2"', opts)

    // feature-behind is 2 commits behind main
    const count = await getCommitsBehind(repoPath, "main", "feature-behind")
    expect(count).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// describe("fetchOrigin")
// ---------------------------------------------------------------------------

describe("fetchOrigin", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("succeeds on a repo with a local origin remote", async () => {
    // Set up a local 'origin' so fetchOrigin has something to fetch from
    const originPath = makeGitRepo(tmp, "origin-repo")
    execSync(`git -C ${repoPath} remote add origin ${originPath}`, { stdio: "pipe" })
    // fetchOrigin should succeed without throwing
    await expect(fetchOrigin(repoPath)).resolves.toBeUndefined()
  })

  test("source contains fetch.timeout=30 flag", async () => {
    // Source-level verification: confirm the timeout flag is baked into the implementation
    const { readFileSync } = await import("fs")
    const source = readFileSync(
      new URL("../../src/lib/git.ts", import.meta.url).pathname,
      "utf-8"
    )
    expect(source).toContain("fetch.timeout=30")
  })
})

// ---------------------------------------------------------------------------
// Helper: set up local origin with optional pushed branches
// ---------------------------------------------------------------------------

function makeRepoWithOrigin(tmp: string): { repoPath: string; originPath: string } {
  const originPath = makeGitRepo(tmp, "origin-bare")
  execSync(`git -C ${originPath} config --bool core.bare false`, { stdio: "pipe" })
  const repoPath = makeGitRepo(tmp, "repo")
  execSync(`git -C ${repoPath} remote add origin ${originPath}`, { stdio: "pipe" })
  execSync(`git -C ${repoPath} push origin main`, { stdio: "pipe" })
  return { repoPath, originPath }
}

// ---------------------------------------------------------------------------
// describe("checkRemoteTrackingRef")
// ---------------------------------------------------------------------------

describe("checkRemoteTrackingRef", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-upstream-test")
    const setup = makeRepoWithOrigin(tmp)
    repoPath = setup.repoPath
    // Push a feature branch so origin/feature-upstream exists
    execSync(`git -C ${repoPath} branch feature-upstream`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} push origin feature-upstream`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} fetch origin`, { stdio: "pipe" })
  })
  afterEach(() => cleanup(tmp))

  test("returns true when origin/<branch> remote-tracking ref exists locally", async () => {
    const result = await checkRemoteTrackingRef(repoPath, "feature-upstream")
    expect(result).toBe(true)
  })

  test("returns false when origin/<branch> does not exist locally", async () => {
    const result = await checkRemoteTrackingRef(repoPath, "branch-not-pushed")
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describe("checkBranchExistsOnRemote")
// ---------------------------------------------------------------------------

describe("checkBranchExistsOnRemote", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-upstream-test")
    const setup = makeRepoWithOrigin(tmp)
    repoPath = setup.repoPath
    execSync(`git -C ${repoPath} branch feature-remote`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} push origin feature-remote`, { stdio: "pipe" })
  })
  afterEach(() => cleanup(tmp))

  test("returns true when branch exists on remote origin", async () => {
    const result = await checkBranchExistsOnRemote(repoPath, "feature-remote")
    expect(result).toBe(true)
  })

  test("returns false when branch does not exist on remote", async () => {
    const result = await checkBranchExistsOnRemote(repoPath, "branch-never-pushed")
    expect(result).toBe(false)
  })

  test("returns false when origin is unreachable (non-existent remote path)", async () => {
    // Override origin to point to a non-existent path to simulate network failure
    execSync(`git -C ${repoPath} remote set-url origin /nonexistent/path/that/does/not/exist`, { stdio: "pipe" })
    const result = await checkBranchExistsOnRemote(repoPath, "feature-remote")
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describe("hasUpstreamTracking")
// ---------------------------------------------------------------------------

describe("hasUpstreamTracking", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-upstream-test")
    const setup = makeRepoWithOrigin(tmp)
    repoPath = setup.repoPath
    execSync(`git -C ${repoPath} branch feature-tracked`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} push origin feature-tracked`, { stdio: "pipe" })
  })
  afterEach(() => cleanup(tmp))

  test("returns true when branch has upstream tracking configured", async () => {
    // Manually set upstream tracking
    execSync(`git -C ${repoPath} branch --set-upstream-to=origin/feature-tracked feature-tracked`, { stdio: "pipe" })
    const result = await hasUpstreamTracking(repoPath, "feature-tracked")
    expect(result).toBe(true)
  })

  test("returns false when branch has no upstream tracking configured", async () => {
    // feature-tracked was created without -u flag so no tracking set
    const result = await hasUpstreamTracking(repoPath, "feature-tracked")
    expect(result).toBe(false)
  })

  test("returns false for a brand-new local branch with no remote", async () => {
    execSync(`git -C ${repoPath} branch brand-new-local`, { stdio: "pipe" })
    const result = await hasUpstreamTracking(repoPath, "brand-new-local")
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describe("ensureUpstreamTracking")
// ---------------------------------------------------------------------------

describe("ensureUpstreamTracking", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-upstream-test")
    const setup = makeRepoWithOrigin(tmp)
    repoPath = setup.repoPath
  })
  afterEach(() => cleanup(tmp))

  test("sets tracking via local ref when origin/<branch> exists after fetch (source: local)", async () => {
    execSync(`git -C ${repoPath} branch feature-local`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} push origin feature-local`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} fetch origin`, { stdio: "pipe" })

    const result = await ensureUpstreamTracking(repoPath, "feature-local")
    expect(result.tracked).toBe(true)
    expect(result.source).toBe("local")
  })

  test("sets tracking via ls-remote when remote ref exists but not fetched locally (source: remote)", async () => {
    const originPath = makeGitRepo(tmp, "origin2")
    const repoPath2 = makeGitRepo(tmp, "repo2")
    execSync(`git -C ${repoPath2} remote add origin ${originPath}`, { stdio: "pipe" })
    execSync(`git -C ${repoPath2} push origin main`, { stdio: "pipe" })

    // Create a branch and push it to origin WITHOUT fetching back (so no local remote-tracking ref)
    execSync(`git -C ${repoPath2} branch feature-remote-only`, { stdio: "pipe" })
    execSync(`git -C ${repoPath2} push origin feature-remote-only`, { stdio: "pipe" })
    // Do NOT run git fetch origin here — so origin/feature-remote-only ref is not in local cache

    const result = await ensureUpstreamTracking(repoPath2, "feature-remote-only")
    expect(result.tracked).toBe(true)
    expect(result.source).toBe("remote")
  })

  test("returns tracked:false for brand-new branch not yet on remote", async () => {
    execSync(`git -C ${repoPath} branch brand-new-not-pushed`, { stdio: "pipe" })
    const result = await ensureUpstreamTracking(repoPath, "brand-new-not-pushed")
    expect(result.tracked).toBe(false)
  })

  test("returns tracked:false immediately when branch already has upstream tracking (skip)", async () => {
    execSync(`git -C ${repoPath} branch already-tracked`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} push origin already-tracked`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} fetch origin`, { stdio: "pipe" })
    execSync(`git -C ${repoPath} branch --set-upstream-to=origin/already-tracked already-tracked`, { stdio: "pipe" })

    const result = await ensureUpstreamTracking(repoPath, "already-tracked")
    // Already tracked — should return tracked:false (skip path, not setting tracking again)
    expect(result.tracked).toBe(false)
  })

  test("is non-fatal when ls-remote fails (network unreachable)", async () => {
    execSync(`git -C ${repoPath} branch offline-branch`, { stdio: "pipe" })
    // Point origin at non-existent path to simulate network failure
    execSync(`git -C ${repoPath} remote set-url origin /nonexistent/path`, { stdio: "pipe" })
    // Should not throw — returns tracked:false
    const result = await ensureUpstreamTracking(repoPath, "offline-branch")
    expect(result.tracked).toBe(false)
  })
})
