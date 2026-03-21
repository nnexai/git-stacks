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
