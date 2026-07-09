import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { execSync } from "child_process"
import { readFileSync, writeFileSync, utimesSync } from "fs"
import {
  makeTmpDir,
  cleanup,
  makeBareRemote,
  makeGitRepo,
  applyHostileGlobalGitEnv,
  applyTestGitEnv,
  gitExecOptions,
} from "../helpers"
import {
  createWorktree,
  removeWorktree,
  isWorktreeRegistered,
  mergeNoFF,
  rebaseBranch,
  getCommitsBehind,
  getCommitsAhead,
  isFetchStale,
  fetchOrigin,
  pushBranch,
  checkRemoteTrackingRef,
  checkBranchExistsOnRemote,
  hasUpstreamTracking,
  ensureUpstreamTracking,
  stashPush,
  stashPop,
  hasAutoStash,
} from "../../src/lib/git"

let gitEnvDir: string
let restoreGitEnv: (() => void) | undefined

beforeEach(() => {
  gitEnvDir = makeTmpDir("git-test-env")
  restoreGitEnv = applyTestGitEnv(gitEnvDir)
})

afterEach(() => {
  restoreGitEnv?.()
  cleanup(gitEnvDir)
})

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

describe("isolated Git fixtures", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("git-fixture-isolation")
  })

  afterEach(() => cleanup(tmp))

  test("bare remotes advertise a valid main HEAD", () => {
    const originPath = makeBareRemote(tmp)
    const head = execSync("git symbolic-ref HEAD", gitExecOptions(originPath, tmp))
      .toString()
      .trim()

    expect(head).toBe("refs/heads/main")
  })

  test("hostile global signing and hooks cannot affect source commits or release tags", () => {
    const restoreHostileEnv = applyHostileGlobalGitEnv(tmp)
    const hostileHooks = join(tmp, ".hostile-git-home", "hooks")

    try {
      const hostileOptions = { cwd: tmp, env: process.env, stdio: "pipe" as const }
      expect(
        execSync("git config --global --get commit.gpgsign", hostileOptions).toString().trim()
      ).toBe("true")
      expect(
        execSync("git config --global --get tag.gpgSign", hostileOptions).toString().trim()
      ).toBe("true")
      expect(
        execSync("git config --global --get core.hooksPath", hostileOptions).toString().trim()
      ).toBe(hostileHooks)

      const sourceRepo = makeGitRepo(tmp, "source-fixture")
      writeFileSync(join(sourceRepo, "source.txt"), "source fixture\n")
      const sourceOptions = gitExecOptions(sourceRepo, tmp)
      execSync("git add source.txt", sourceOptions)
      execSync('git commit -m "source fixture commit"', sourceOptions)

      const releaseRepo = makeGitRepo(tmp, "release-fixture")
      const releaseOptions = gitExecOptions(releaseRepo, tmp)
      execSync('git tag -a v-test -m "release fixture tag"', releaseOptions)

      expect(
        execSync("git branch --show-current", sourceOptions).toString().trim()
      ).toBe("main")
      expect(
        execSync("git tag --list v-test", releaseOptions).toString().trim()
      ).toBe("v-test")
    } finally {
      restoreHostileEnv()
    }
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
    const mainHead = execSync("git rev-parse HEAD", gitExecOptions(repoPath, tmp)).toString().trim()

    await createWorktree(repoPath, wtPath, "feature/x")

    const registered = await isWorktreeRegistered(repoPath, wtPath)
    const wtHead = execSync("git rev-parse HEAD", gitExecOptions(wtPath, tmp)).toString().trim()
    expect(registered).toBe(true)
    expect(wtHead).toBe(mainHead)
  })

  test("creates worktree for existing local branch at that branch history", async () => {
    const opts = gitExecOptions(repoPath, tmp)
    execSync("git branch existing-branch", opts)
    const seedPath = join(tmp, "seed-existing")
    execSync(`git worktree add ${seedPath} existing-branch`, opts)
    writeFileSync(join(seedPath, "existing.txt"), "existing branch\n")
    execSync("git add .", gitExecOptions(seedPath, tmp))
    execSync('git commit -m "existing branch commit"', gitExecOptions(seedPath, tmp))
    const branchHead = execSync("git rev-parse HEAD", gitExecOptions(seedPath, tmp)).toString().trim()
    execSync(`git worktree remove ${seedPath} --force`, opts)

    const wtPath = join(tmp, "wt", "existing")
    await createWorktree(repoPath, wtPath, "existing-branch")

    const registered = await isWorktreeRegistered(repoPath, wtPath)
    const wtHead = execSync("git rev-parse HEAD", gitExecOptions(wtPath, tmp)).toString().trim()
    expect(registered).toBe(true)
    expect(wtHead).toBe(branchHead)
    expect(readFileSync(join(wtPath, "existing.txt"), "utf8")).toBe("existing branch\n")
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
// describe("pushBranch")
// ---------------------------------------------------------------------------

describe("pushBranch", () => {
  let tmp: string
  let remotePath: string
  let localPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-push")
    remotePath = join(tmp, "remote.git")
    execSync(`git init --bare -b main ${remotePath}`, gitExecOptions(tmp, tmp))
    localPath = join(tmp, "local")
    execSync(`git clone ${remotePath} ${localPath}`, gitExecOptions(tmp, tmp))
    const opts = gitExecOptions(localPath, tmp)
    execSync("git checkout -b main", opts)
    execSync('git config user.email "test@example.com"', opts)
    execSync('git config user.name "Test User"', opts)
    execSync("git config commit.gpgsign false", opts)
    writeFileSync(join(localPath, "README.md"), "init\n")
    execSync("git add .", opts)
    execSync('git commit -m "init"', opts)
  })

  afterEach(() => cleanup(tmp))

  test("pushes branch to origin and returns commit count", async () => {
    const result = await pushBranch(localPath, "main")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.commits).toBeGreaterThanOrEqual(0)
    }
    const remoteMain = execSync(`git --git-dir ${remotePath} rev-parse --verify refs/heads/main`, { stdio: "pipe" }).toString().trim()
    expect(remoteMain.length).toBeGreaterThan(0)
  })

  test("returns ok with 0 commits when nothing to push", async () => {
    await pushBranch(localPath, "main", { setUpstream: true })
    const result = await pushBranch(localPath, "main")
    expect(result).toEqual({ ok: true, commits: 0 })
  })

  test("returns error for non-fast-forward push", async () => {
    await pushBranch(localPath, "main", { setUpstream: true })

    const otherClone = join(tmp, "other")
    execSync(`git clone ${remotePath} ${otherClone}`, gitExecOptions(tmp, tmp))
    const otherOpts = gitExecOptions(otherClone, tmp)
    execSync('git config user.email "test@example.com"', otherOpts)
    execSync('git config user.name "Test User"', otherOpts)
    execSync("git config commit.gpgsign false", otherOpts)
    writeFileSync(join(otherClone, "remote.txt"), "remote\n")
    execSync("git add .", otherOpts)
    execSync('git commit -m "remote advance"', otherOpts)
    execSync("git push origin main", otherOpts)

    const localOpts = gitExecOptions(localPath, tmp)
    writeFileSync(join(localPath, "local.txt"), "local\n")
    execSync("git add .", localOpts)
    execSync('git commit -m "local advance"', localOpts)

    const result = await pushBranch(localPath, "main")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("non-fast-forward")
    }
  })

  test("force-with-lease succeeds on diverged branch", async () => {
    await pushBranch(localPath, "main", { setUpstream: true })

    const otherClone = join(tmp, "other")
    execSync(`git clone ${remotePath} ${otherClone}`, gitExecOptions(tmp, tmp))
    const otherOpts = gitExecOptions(otherClone, tmp)
    execSync('git config user.email "test@example.com"', otherOpts)
    execSync('git config user.name "Test User"', otherOpts)
    execSync("git config commit.gpgsign false", otherOpts)
    writeFileSync(join(otherClone, "remote.txt"), "remote\n")
    execSync("git add .", otherOpts)
    execSync('git commit -m "remote advance"', otherOpts)
    execSync("git push origin main", otherOpts)

    execSync("git -C " + localPath + " fetch origin", gitExecOptions(tmp, tmp))
    const localOpts = gitExecOptions(localPath, tmp)
    execSync("git reset --hard HEAD~0", localOpts)
    writeFileSync(join(localPath, "local-force.txt"), "force\n")
    execSync("git add .", localOpts)
    execSync('git commit -m "local force advance"', localOpts)

    const result = await pushBranch(localPath, "main", { forceWithLease: true })
    expect(result.ok).toBe(true)
  })

  test("set-upstream passes -u flag", async () => {
    const result = await pushBranch(localPath, "main", { setUpstream: true })
    expect(result.ok).toBe(true)

    const remote = execSync("git -C " + localPath + " config branch.main.remote", { stdio: "pipe" }).toString().trim()
    expect(remote).toBe("origin")
  })
})

// ---------------------------------------------------------------------------
// describe("stash primitives")
// ---------------------------------------------------------------------------

describe("stash primitives", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-stash")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("stashPush stashes dirty tracked files", async () => {
    writeFileSync(join(repoPath, "README.md"), "modified content\n")

    const result = await stashPush(repoPath, "git-stacks auto-stash (sync)")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stashRef).toBe("stash@{0}")
    }
    const status = execSync(`git -C ${repoPath} status --porcelain`, { stdio: "pipe" }).toString().trim()
    expect(status).toBe("")
  })

  test("stashPush stashes untracked files", async () => {
    writeFileSync(join(repoPath, "new-file.txt"), "new content\n")

    const result = await stashPush(repoPath, "git-stacks auto-stash (sync)")

    expect(result.ok).toBe(true)
    const status = execSync(`git -C ${repoPath} status --porcelain`, { stdio: "pipe" }).toString().trim()
    expect(status).toBe("")
  })

  test("stashPush returns an error when nothing needs stashing", async () => {
    const result = await stashPush(repoPath, "git-stacks auto-stash (sync)")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("nothing to stash")
    }
  })

  test("stashPop restores stashed changes", async () => {
    writeFileSync(join(repoPath, "README.md"), "modified content\n")
    const stashResult = await stashPush(repoPath, "git-stacks auto-stash (sync)")
    expect(stashResult.ok).toBe(true)

    const result = await stashPop(repoPath)

    expect(result.ok).toBe(true)
    expect(readFileSync(join(repoPath, "README.md"), "utf-8")).toBe("modified content\n")
  })

  test("stashPop reports conflicts and preserves the stash entry", async () => {
    const opts = { cwd: repoPath, stdio: "pipe" as const }

    writeFileSync(join(repoPath, "README.md"), "stashed change\n")
    const stashResult = await stashPush(repoPath, "git-stacks auto-stash (sync)")
    expect(stashResult.ok).toBe(true)

    writeFileSync(join(repoPath, "README.md"), "committed change\n")
    execSync("git add .", opts)
    execSync('git commit -m "conflicting change"', opts)

    const result = await stashPop(repoPath)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.conflict).toBe(true)
      expect(result.error).toContain("CONFLICT")
    }
    const stashList = execSync(`git -C ${repoPath} stash list`, { stdio: "pipe" }).toString()
    expect(stashList).toContain("git-stacks auto-stash (sync)")
  })

  test("hasAutoStash returns false on a clean repo", async () => {
    expect(await hasAutoStash(repoPath)).toBe(false)
  })

  test("hasAutoStash returns true when an auto-stash exists", async () => {
    writeFileSync(join(repoPath, "README.md"), "dirty\n")
    const stashResult = await stashPush(repoPath, "git-stacks auto-stash (sync)")
    expect(stashResult.ok).toBe(true)

    expect(await hasAutoStash(repoPath)).toBe(true)
  })

  test("hasAutoStash ignores non-matching stash messages", async () => {
    writeFileSync(join(repoPath, "README.md"), "dirty\n")
    execSync(`git -C ${repoPath} stash push --include-untracked -m "manual stash"`, { stdio: "pipe" })

    expect(await hasAutoStash(repoPath)).toBe(false)
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

function makeRepoWithOrigin(tmp: string, repoName = "repo"): { repoPath: string; originPath: string } {
  // Create a true bare repo as origin (no initial commit — accepts any push)
  const originPath = makeBareRemote(tmp, `${repoName}-origin`)
  const repoPath = makeGitRepo(tmp, repoName)
  const opts = gitExecOptions(repoPath, tmp)
  execSync(`git remote add origin ${originPath}`, opts)
  execSync("git push origin main", opts)
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
    const opts = gitExecOptions(repoPath, tmp)
    execSync("git branch feature-upstream", opts)
    execSync("git push origin feature-upstream", opts)
    execSync("git fetch origin", opts)
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
    const opts = gitExecOptions(repoPath, tmp)
    execSync("git branch feature-remote", opts)
    execSync("git push origin feature-remote", opts)
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
    execSync(
      "git remote set-url origin /nonexistent/path/that/does/not/exist",
      gitExecOptions(repoPath, tmp)
    )
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
    const opts = gitExecOptions(repoPath, tmp)
    execSync("git branch feature-tracked", opts)
    execSync("git push origin feature-tracked", opts)
  })
  afterEach(() => cleanup(tmp))

  test("returns true when branch has upstream tracking configured", async () => {
    // Manually set upstream tracking
    execSync(
      "git branch --set-upstream-to=origin/feature-tracked feature-tracked",
      gitExecOptions(repoPath, tmp)
    )
    const result = await hasUpstreamTracking(repoPath, "feature-tracked")
    expect(result).toBe(true)
  })

  test("returns false when branch has no upstream tracking configured", async () => {
    // feature-tracked was created without -u flag so no tracking set
    const result = await hasUpstreamTracking(repoPath, "feature-tracked")
    expect(result).toBe(false)
  })

  test("returns false for a brand-new local branch with no remote", async () => {
    execSync("git branch brand-new-local", gitExecOptions(repoPath, tmp))
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
    const opts = gitExecOptions(repoPath, tmp)
    execSync("git branch feature-local", opts)
    execSync("git push origin feature-local", opts)
    execSync("git fetch origin", opts)

    const result = await ensureUpstreamTracking(repoPath, "feature-local")
    expect(result.tracked).toBe(true)
    expect(result.source).toBe("local")
  })

  test("sets tracking via ls-remote when remote ref exists but not fetched locally (source: remote)", async () => {
    // Set up a second pair to avoid name collisions with beforeEach setup
    const { repoPath: repoPath2, originPath: originPath2 } = makeRepoWithOrigin(tmp, "repo2")

    // Push the branch from origin directly (simulates a colleague pushing) so it exists on remote
    // but repoPath2 never fetched it — so no local remote-tracking ref exists
    execSync("git branch feature-remote-only", gitExecOptions(originPath2, tmp))

    // Create the local branch in repoPath2 (no push, no fetch — so origin/feature-remote-only not in local refs)
    const repoOptions = gitExecOptions(repoPath2, tmp)
    execSync("git branch feature-remote-only", repoOptions)
    // Verify no local remote-tracking ref exists
    const localRef = execSync(
      `git rev-parse --verify origin/feature-remote-only 2>/dev/null || echo "missing"`,
      repoOptions
    ).toString().trim()
    expect(localRef).toBe("missing")

    const result = await ensureUpstreamTracking(repoPath2, "feature-remote-only")
    expect(result.tracked).toBe(true)
    expect(result.source).toBe("remote")
  })

  test("returns tracked:false for brand-new branch not yet on remote", async () => {
    execSync("git branch brand-new-not-pushed", gitExecOptions(repoPath, tmp))
    const result = await ensureUpstreamTracking(repoPath, "brand-new-not-pushed")
    expect(result.tracked).toBe(false)
  })

  test("returns tracked:false immediately when branch already has upstream tracking (skip)", async () => {
    const opts = gitExecOptions(repoPath, tmp)
    execSync("git branch already-tracked", opts)
    execSync("git push origin already-tracked", opts)
    execSync("git fetch origin", opts)
    execSync("git branch --set-upstream-to=origin/already-tracked already-tracked", opts)

    const result = await ensureUpstreamTracking(repoPath, "already-tracked")
    // Already tracked — should return tracked:false (skip path, not setting tracking again)
    expect(result.tracked).toBe(false)
  })

  test("is non-fatal when ls-remote fails (network unreachable)", async () => {
    const opts = gitExecOptions(repoPath, tmp)
    execSync("git branch offline-branch", opts)
    // Point origin at non-existent path to simulate network failure
    execSync("git remote set-url origin /nonexistent/path", opts)
    // Should not throw — returns tracked:false
    const result = await ensureUpstreamTracking(repoPath, "offline-branch")
    expect(result.tracked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describe("getCommitsAhead")
// ---------------------------------------------------------------------------

describe("getCommitsAhead", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-ahead")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("returns 0 when HEAD matches base", async () => {
    const count = await getCommitsAhead(repoPath, "main", "HEAD")
    expect(count).toBe(0)
  })

  test("returns correct count when branch is ahead", async () => {
    // Create a branch and add commits
    execSync("git -C " + repoPath + " checkout -b feature", { stdio: "pipe" })
    writeFileSync(join(repoPath, "a.txt"), "a")
    execSync("git -C " + repoPath + " add . && git -C " + repoPath + " commit -m 'commit 1'", { stdio: "pipe" })
    writeFileSync(join(repoPath, "b.txt"), "b")
    execSync("git -C " + repoPath + " add . && git -C " + repoPath + " commit -m 'commit 2'", { stdio: "pipe" })

    const count = await getCommitsAhead(repoPath, "main", "HEAD")
    expect(count).toBe(2)
  })

  test("returns 0 for non-existent repo path", async () => {
    const count = await getCommitsAhead("/nonexistent/path", "main", "HEAD")
    expect(count).toBe(0)
  })

  test("mirrors getCommitsBehind — ahead and behind are inverse ranges", async () => {
    // Create a branch, add commits, then go back to main and add different commits
    execSync("git -C " + repoPath + " checkout -b feature", { stdio: "pipe" })
    writeFileSync(join(repoPath, "feature.txt"), "feature")
    execSync("git -C " + repoPath + " add . && git -C " + repoPath + " commit -m 'feature commit'", { stdio: "pipe" })

    execSync("git -C " + repoPath + " checkout main", { stdio: "pipe" })
    writeFileSync(join(repoPath, "main-new.txt"), "main")
    execSync("git -C " + repoPath + " add . && git -C " + repoPath + " commit -m 'main commit'", { stdio: "pipe" })

    // From feature's perspective relative to main:
    const ahead = await getCommitsAhead(repoPath, "main", "feature")
    const behind = await getCommitsBehind(repoPath, "main", "feature")
    expect(ahead).toBe(1)   // feature has 1 commit not in main
    expect(behind).toBe(1)  // main has 1 commit not in feature
  })
})

// ---------------------------------------------------------------------------
// describe("isFetchStale")
// ---------------------------------------------------------------------------

describe("isFetchStale", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-stale")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("returns true when FETCH_HEAD does not exist (never fetched)", async () => {
    // A fresh makeGitRepo has no FETCH_HEAD
    const stale = await isFetchStale(repoPath)
    expect(stale).toBe(true)
  })

  test("returns false when FETCH_HEAD was just written", async () => {
    // Create FETCH_HEAD with current timestamp
    const gitDir = join(repoPath, ".git")
    writeFileSync(join(gitDir, "FETCH_HEAD"), "dummy")
    const stale = await isFetchStale(repoPath)
    expect(stale).toBe(false)
  })

  test("returns true when FETCH_HEAD is older than threshold", async () => {
    const gitDir = join(repoPath, ".git")
    const fetchHeadPath = join(gitDir, "FETCH_HEAD")
    writeFileSync(fetchHeadPath, "dummy")
    // Set mtime to 20 minutes ago
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000)
    utimesSync(fetchHeadPath, twentyMinAgo, twentyMinAgo)
    const stale = await isFetchStale(repoPath)
    expect(stale).toBe(true)
  })

  test("respects custom threshold", async () => {
    const gitDir = join(repoPath, ".git")
    const fetchHeadPath = join(gitDir, "FETCH_HEAD")
    writeFileSync(fetchHeadPath, "dummy")
    // Set mtime to 2 minutes ago
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
    utimesSync(fetchHeadPath, twoMinAgo, twoMinAgo)

    // With 1 minute threshold: should be stale
    const staleShort = await isFetchStale(repoPath, 60 * 1000)
    expect(staleShort).toBe(true)

    // With 5 minute threshold: should not be stale
    const staleLong = await isFetchStale(repoPath, 5 * 60 * 1000)
    expect(staleLong).toBe(false)
  })

  test("returns true for non-existent repo path", async () => {
    const stale = await isFetchStale("/nonexistent/path")
    expect(stale).toBe(true)
  })

  test("works in worktree (uses git-common-dir)", async () => {
    // Create a worktree — FETCH_HEAD lives in the main repo, not the worktree
    const wtPath = join(tmp, "worktree")
    execSync("git -C " + repoPath + " checkout -b wt-branch", { stdio: "pipe" })
    execSync("git -C " + repoPath + " checkout main", { stdio: "pipe" })
    execSync("git -C " + repoPath + " worktree add " + wtPath + " wt-branch", { stdio: "pipe" })

    // Write FETCH_HEAD in the main repo's .git dir
    const mainGitDir = join(repoPath, ".git")
    writeFileSync(join(mainGitDir, "FETCH_HEAD"), "dummy")

    // isFetchStale on the worktree should find the main repo's FETCH_HEAD via --git-common-dir
    const stale = await isFetchStale(wtPath)
    expect(stale).toBe(false)

    // Clean up worktree
    execSync("git -C " + repoPath + " worktree remove " + wtPath + " --force", { stdio: "pipe" })
  })
})
