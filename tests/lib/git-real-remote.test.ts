import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import {
  applyTestGitEnv,
  cleanup,
  gitExecOptions,
  makeRepoWithRemote,
  makeTmpDir,
} from "../helpers"
import {
  checkRemoteTrackingRef,
  createWorktree,
  ensureUpstreamTracking,
  fetchOrigin,
  getCommitsAhead,
  getCommitsBehind,
  isFetchStale,
  isRepoDirty,
  pullFFOnly,
  pushBranch,
} from "../../packages/core/src/git"

let tmpDir: string
let gitEnvDir: string
let restoreGitEnv: (() => void) | undefined

beforeEach(() => {
  gitEnvDir = makeTmpDir("git-real-remote-env")
  restoreGitEnv = applyTestGitEnv(gitEnvDir)
  tmpDir = makeTmpDir("git-real-remote")
})

afterEach(() => {
  restoreGitEnv?.()
  cleanup(gitEnvDir)
  cleanup(tmpDir)
})

function clonePeer(originDir: string, name: string): string {
  const peer = join(tmpDir, name)
  execSync(`git clone ${originDir} ${peer}`, gitExecOptions(tmpDir, tmpDir))
  execSync('git config user.email "test@example.com"', gitExecOptions(peer, tmpDir))
  execSync('git config user.name "Test User"', gitExecOptions(peer, tmpDir))
  execSync("git config commit.gpgsign false", gitExecOptions(peer, tmpDir))
  return peer
}

function commitFile(repoPath: string, fileName: string, content: string, message: string) {
  writeFileSync(join(repoPath, fileName), content)
  execSync("git add .", gitExecOptions(repoPath, tmpDir))
  execSync(`git commit -m ${JSON.stringify(message)}`, gitExecOptions(repoPath, tmpDir))
}

function checkout(repoPath: string, branch: string, args = "") {
  execSync(`git checkout ${args} ${branch}`.trim(), gitExecOptions(repoPath, tmpDir))
}

describe("git real remote branch state", () => {
  test("createWorktree creates remote-only branches from origin and configures upstream", async () => {
    const { originDir, mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/bootstrap")
    const peer = clonePeer(originDir, "peer-worktree")
    const branch = "feat/remote-worktree"
    const worktreePath = join(tmpDir, "remote-worktree")

    checkout(peer, branch, "-b")
    commitFile(peer, "remote-worktree.txt", "remote branch\n", "remote worktree branch")
    execSync(`git push origin ${branch}`, gitExecOptions(peer, tmpDir))
    const remoteHead = execSync("git rev-parse HEAD", gitExecOptions(peer, tmpDir)).toString().trim()

    execSync(`git branch -D ${branch} || true`, gitExecOptions(mainPath, tmpDir))
    execSync(`git update-ref -d refs/remotes/origin/${branch} || true`, gitExecOptions(mainPath, tmpDir))

    await createWorktree(mainPath, worktreePath, branch)

    const worktreeHead = execSync("git rev-parse HEAD", gitExecOptions(worktreePath, tmpDir)).toString().trim()
    const upstreamRemote = execSync(`git config branch.${branch}.remote`, gitExecOptions(worktreePath, tmpDir)).toString().trim()
    const upstreamMerge = execSync(`git config branch.${branch}.merge`, gitExecOptions(worktreePath, tmpDir)).toString().trim()

    expect(worktreeHead).toBe(remoteHead)
    expect(existsSync(join(worktreePath, "remote-worktree.txt"))).toBe(true)
    expect(upstreamRemote).toBe("origin")
    expect(upstreamMerge).toBe(`refs/heads/${branch}`)
  })

  test("getCommitsAhead and getCommitsBehind report divergence after peer pushes", async () => {
    const { originDir, mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/counts")
    const peer = clonePeer(originDir, "peer")

    commitFile(peer, "peer.txt", "peer\n", "peer update")
    execSync("git push origin main", gitExecOptions(peer, tmpDir))
    await fetchOrigin(mainPath)
    expect(await getCommitsBehind(mainPath, "origin/main", "main")).toBe(1)

    commitFile(mainPath, "local.txt", "local\n", "local update")
    expect(await getCommitsAhead(mainPath, "origin/main", "main")).toBe(1)
  })

  test("isFetchStale uses the common git dir for worktrees", async () => {
    const { mainPath, taskPath } = makeRepoWithRemote(tmpDir, "api", "feat/stale")

    expect(await isFetchStale(taskPath, 60_000)).toBe(true)

    await fetchOrigin(mainPath)
    expect(await isFetchStale(taskPath, 60_000)).toBe(false)

    const fetchHeadPath = execSync("git rev-parse --git-path FETCH_HEAD", gitExecOptions(mainPath, tmpDir)).toString().trim()
    const fetchHead = fetchHeadPath.startsWith("/") ? fetchHeadPath : join(mainPath, fetchHeadPath)
    expect(existsSync(fetchHead)).toBe(true)
    const staleTime = new Date(Date.now() - 120_000)
    utimesSync(fetchHead, staleTime, staleTime)
    expect(await isFetchStale(taskPath, 60_000)).toBe(true)
  })

  test("ensureUpstreamTracking distinguishes existing, local ref, remote-only, and missing branches", async () => {
    const { originDir, mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/tracked")
    const peer = clonePeer(originDir, "peer-tracking")

    expect(await ensureUpstreamTracking(mainPath, "main")).toEqual({ tracked: false })

    checkout(peer, "local-ref", "-b")
    commitFile(peer, "local-ref.txt", "local ref\n", "local ref")
    execSync("git push origin local-ref", gitExecOptions(peer, tmpDir))
    await fetchOrigin(mainPath)
    execSync("git branch local-ref main", gitExecOptions(mainPath, tmpDir))
    expect(await ensureUpstreamTracking(mainPath, "local-ref")).toEqual({ tracked: true, source: "local" })

    checkout(peer, "remote-only", "-b")
    commitFile(peer, "remote-only.txt", "remote only\n", "remote only")
    execSync("git push origin remote-only", gitExecOptions(peer, tmpDir))
    execSync("git branch remote-only main", gitExecOptions(mainPath, tmpDir))
    execSync("git update-ref -d refs/remotes/origin/remote-only", gitExecOptions(mainPath, tmpDir))
    expect(await checkRemoteTrackingRef(mainPath, "remote-only")).toBe(false)
    expect(await ensureUpstreamTracking(mainPath, "remote-only")).toEqual({ tracked: true, source: "remote" })

    execSync("git branch brand-new main", gitExecOptions(mainPath, tmpDir))
    expect(await ensureUpstreamTracking(mainPath, "brand-new")).toEqual({ tracked: false })
  })
})

describe("git real remote push and pull", () => {
  test("pushBranch pushes commits and reports no-op when up to date", async () => {
    const { mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/push")

    commitFile(mainPath, "push.txt", "push\n", "push update")
    expect(await pushBranch(mainPath, "main")).toEqual({ ok: true, commits: 1 })

    expect(await pushBranch(mainPath, "main")).toEqual({ ok: true, commits: 0 })
  })

  test("pushBranch returns structured non-fast-forward failures", async () => {
    const { originDir, mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/push-reject")
    const peer = clonePeer(originDir, "peer-push")

    commitFile(peer, "peer.txt", "peer\n", "peer update")
    execSync("git push origin main", gitExecOptions(peer, tmpDir))
    commitFile(mainPath, "local.txt", "local\n", "local update")

    const result = await pushBranch(mainPath, "main")

    expect(result).toEqual({ ok: false, reason: "non-fast-forward (use --force-with-lease)" })
  })

  test("pullFFOnly fast-forwards and reports no-op when already current", async () => {
    const { originDir, mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/pull")
    const peer = clonePeer(originDir, "peer-pull")

    commitFile(peer, "remote.txt", "remote\n", "remote update")
    execSync("git push origin main", gitExecOptions(peer, tmpDir))

    expect(await pullFFOnly(mainPath, "main")).toEqual({ ok: true, commits: 1 })
    expect(await pullFFOnly(mainPath, "main")).toEqual({ ok: true, commits: 0 })
  })

  test("pullFFOnly returns structured failures for divergence and missing remote branches", async () => {
    const { originDir, mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/pull-fail")
    const peer = clonePeer(originDir, "peer-pull-fail")

    commitFile(peer, "remote.txt", "remote\n", "remote update")
    execSync("git push origin main", gitExecOptions(peer, tmpDir))
    commitFile(mainPath, "local.txt", "local\n", "local update")

    expect(await pullFFOnly(mainPath, "main")).toEqual({ ok: false, reason: "diverged: main" })
    expect(await pullFFOnly(mainPath, "missing-branch")).toEqual({ ok: false, reason: "no remote branch: missing-branch" })
  })

  test("dirty worktree state is reported from real repository state", async () => {
    const { mainPath } = makeRepoWithRemote(tmpDir, "api", "feat/dirty")

    expect(await isRepoDirty(mainPath)).toBe(false)

    writeFileSync(join(mainPath, "dirty.txt"), "dirty\n")

    expect(await isRepoDirty(mainPath)).toBe(true)
  })

  test("dirty status preserves invalid repository failures for callers to classify", async () => {
    const invalidPath = join(tmpDir, "not-a-repository")
    mkdirSync(invalidPath, { recursive: true })

    await expect(isRepoDirty(invalidPath)).rejects.toThrow(
      `Failed to read repository status at '${invalidPath}': fatal: not a git repository`,
    )
  })
})
