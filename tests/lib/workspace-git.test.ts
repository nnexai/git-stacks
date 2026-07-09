import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync } from "fs"
import { join } from "path"
import type { Workspace, WorkspaceRepo } from "@/lib/config"
import { cleanup, makeConfigMock, makeGitMock, makeTmpDir } from "../helpers"

const tempDirs: string[] = []

const workspaceExistsMock = mock((_name: string) => false)
const readWorkspaceMock = mock((_name: string) => ({}) as Workspace)
const getRepoPathMock = mock((repo: WorkspaceRepo) =>
  repo.mode === "worktree" ? repo.task_path : repo.main_path
)
const isGitRepoMock = mock((repo: WorkspaceRepo) => repo.mode !== "dir")
const isWorktreeRepoMock = mock((repo: WorkspaceRepo) => repo.mode === "worktree")

const fetchOriginMock = mock(async (_repoPath: string) => {})
const pushBranchMock = mock(async (_repoPath: string, _branch: string, _opts: Record<string, unknown>) => ({ ok: true, commits: 0 }))
const getCommitsAheadMock = mock(async (_repoPath: string, _baseRef: string, _headRef: string) => 0)
const rebaseBranchMock = mock(async (_repoPath: string, _baseRef: string) => ({ ok: true }))
const mergeBranchFFMock = mock(async (_repoPath: string, _baseRef: string) => ({ ok: true }))
const getCommitsBehindMock = mock(async (_repoPath: string, _baseRef: string, _headRef: string) => 0)
const getMergeConflictsMock = mock(async (_repoPath: string, _baseRef: string, _branch: string) => ({ status: "clean" } as any))
const isRepoDirtyMock = mock(async (_repoPath: string) => false)
const stashPushMock = mock(async (_repoPath: string, _message: string) => ({ ok: true }))
const stashPopMock = mock(async (_repoPath: string) => ({ ok: true }))
const hasAutoStashMock = mock(async (_repoPath: string) => false)
const pullFFOnlyMock = mock(async (_repoPath: string, _branch: string) => ({ ok: true, commits: 0 }))
const getCurrentBranchMock = mock(async (_repoPath: string) => "feature/test")

mock.module("@/lib/config", () =>
  makeConfigMock({
    workspaceExists: workspaceExistsMock,
    readWorkspace: readWorkspaceMock,
    getRepoPath: getRepoPathMock,
    isGitRepo: isGitRepoMock,
    isWorktreeRepo: isWorktreeRepoMock,
  })
)

mock.module("@/lib/git", () =>
  makeGitMock({
    fetchOrigin: fetchOriginMock,
    pushBranch: pushBranchMock,
    getCommitsAhead: getCommitsAheadMock,
    rebaseBranch: rebaseBranchMock,
    mergeBranchFF: mergeBranchFFMock,
    getCommitsBehind: getCommitsBehindMock,
    getMergeConflicts: getMergeConflictsMock,
    isRepoDirty: isRepoDirtyMock,
    stashPush: stashPushMock,
    stashPop: stashPopMock,
    hasAutoStash: hasAutoStashMock,
    pullFFOnly: pullFFOnlyMock,
    getCurrentBranch: getCurrentBranchMock,
  })
)

const { pushWorkspace, syncWorkspace, pullWorkspace, _exec } = await import("../../src/lib/workspace-git")

let tempRoot = ""

beforeEach(() => {
  tempRoot = makeTmpDir("workspace-git")
  tempDirs.push(tempRoot)

  workspaceExistsMock.mockReset()
  readWorkspaceMock.mockReset()
  getRepoPathMock.mockReset()
  isGitRepoMock.mockReset()
  isWorktreeRepoMock.mockReset()
  fetchOriginMock.mockReset()
  pushBranchMock.mockReset()
  getCommitsAheadMock.mockReset()
  rebaseBranchMock.mockReset()
  mergeBranchFFMock.mockReset()
  getCommitsBehindMock.mockReset()
  getMergeConflictsMock.mockReset()
  isRepoDirtyMock.mockReset()
  stashPushMock.mockReset()
  stashPopMock.mockReset()
  hasAutoStashMock.mockReset()
  pullFFOnlyMock.mockReset()
  getCurrentBranchMock.mockReset()

  workspaceExistsMock.mockImplementation(() => true)
  getRepoPathMock.mockImplementation((repo: WorkspaceRepo) =>
    repo.mode === "worktree" ? repo.task_path : repo.main_path
  )
  isGitRepoMock.mockImplementation((repo: WorkspaceRepo) => repo.mode !== "dir")
  isWorktreeRepoMock.mockImplementation((repo: WorkspaceRepo) => repo.mode === "worktree")
  fetchOriginMock.mockImplementation(async () => {})
  pushBranchMock.mockImplementation(async () => ({ ok: true, commits: 0 }))
  getCommitsAheadMock.mockImplementation(async () => 0)
  rebaseBranchMock.mockImplementation(async () => ({ ok: true }))
  mergeBranchFFMock.mockImplementation(async () => ({ ok: true }))
  getCommitsBehindMock.mockImplementation(async () => 0)
  getMergeConflictsMock.mockImplementation(async () => ({ status: "clean" } as any))
  isRepoDirtyMock.mockImplementation(async () => false)
  stashPushMock.mockImplementation(async () => ({ ok: true }))
  stashPopMock.mockImplementation(async () => ({ ok: true }))
  hasAutoStashMock.mockImplementation(async () => false)
  pullFFOnlyMock.mockImplementation(async () => ({ ok: true, commits: 0 }))
  getCurrentBranchMock.mockImplementation(async () => "feature/test")
})

afterAll(() => {
  for (const dir of tempDirs) {
    cleanup(dir)
  }
})

function makeRepo(name: string, mode: WorkspaceRepo["mode"], overrides: Partial<WorkspaceRepo> = {}): WorkspaceRepo {
  const repoRoot = join(tempRoot, mode === "worktree" ? "tasks" : "main", name)
  return {
    name,
    repo: name,
    type: "other",
    mode,
    main_path: repoRoot,
    task_path: repoRoot,
    ...overrides,
  } as WorkspaceRepo
}

function makeWorkspace(repos: WorkspaceRepo[]): Workspace {
  return {
    name: "feature-ws",
    branch: "feature/test",
    created: "2026-04-05T00:00:00.000Z",
    repos,
  } as Workspace
}

function worktreePath(repo: WorkspaceRepo): string {
  return repo.task_path!
}

describe("workspace-git _exec seam", () => {
  test("_exec exports pushBranch and fetchOrigin seam properties", () => {
    expect(typeof _exec.pushBranch).toBe("function")
    expect(typeof _exec.fetchOrigin).toBe("function")
  })

  test("pushWorkspace uses _exec.pushBranch and passes correct repoPath, branch, and options", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
    })
    mkdirSync(worktreePath(worktreeRepo), { recursive: true })
    readWorkspaceMock.mockImplementation(() => makeWorkspace([worktreeRepo]))

    const originalPushBranch = _exec.pushBranch
    const calls: any[] = []
    _exec.pushBranch = async (repoPath: any, branch: any, opts: any) => {
      calls.push({ repoPath, branch, opts })
      return { ok: true, commits: 1 }
    }

    try {
      const result = await pushWorkspace("feature-ws", {
        force: true,
        forceWithLease: true,
        setUpstream: true,
      })
      expect(result.ok).toBe(true)
      expect(calls.length).toBe(1)
      expect(calls[0].repoPath).toBe(worktreePath(worktreeRepo))
      expect(calls[0].branch).toBe("feature/test")
      expect(calls[0].opts).toMatchObject({ force: true, forceWithLease: true, setUpstream: true })
    } finally {
      _exec.pushBranch = originalPushBranch
    }
  })

  test("syncWorkspace uses _exec.fetchOrigin, _exec.getMergeConflicts, and _exec.rebaseBranch", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
      base_branch: "main",
    })
    mkdirSync(worktreePath(worktreeRepo), { recursive: true })
    readWorkspaceMock.mockImplementation(() => makeWorkspace([worktreeRepo]))
    getCommitsBehindMock.mockImplementation(async () => 2)

    const originalFetchOrigin = _exec.fetchOrigin
    const originalGetMergeConflicts = _exec.getMergeConflicts
    const originalRebaseBranch = _exec.rebaseBranch

    const fetchCalls: any[] = []
    const conflictCalls: any[] = []
    const rebaseCalls: any[] = []

    _exec.fetchOrigin = async (repoPath: any) => {
      fetchCalls.push(repoPath)
    }
    _exec.getMergeConflicts = async (repoPath: any, baseRef: any, branch: any) => {
      conflictCalls.push({ repoPath, baseRef, branch })
      return { status: "clean" } as any
    }
    _exec.rebaseBranch = async (repoPath: any, baseRef: any) => {
      rebaseCalls.push({ repoPath, baseRef })
      return { ok: true }
    }

    try {
      const result = await syncWorkspace("feature-ws", { strategy: "rebase" })
      expect(result.ok).toBe(true)
      expect(fetchCalls).toContain(worktreePath(worktreeRepo))
      expect(conflictCalls.some(c => c.repoPath === worktreePath(worktreeRepo) && c.baseRef === "origin/main" && c.branch === "feature/test")).toBe(true)
      expect(rebaseCalls.some(c => c.repoPath === worktreePath(worktreeRepo) && c.baseRef === "origin/main")).toBe(true)
    } finally {
      _exec.fetchOrigin = originalFetchOrigin
      _exec.getMergeConflicts = originalGetMergeConflicts
      _exec.rebaseBranch = originalRebaseBranch
    }
  })
})

describe("workspace-git", () => {
  test("pushWorkspace dry-run reports ahead commits and skips trunk and dir repos", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
      base_branch: "main",
    })
    const trunkRepo = makeRepo("web", "trunk")
    const dirRepo = makeRepo("docs", "dir")
    mkdirSync(worktreePath(worktreeRepo), { recursive: true })

    const workspace = makeWorkspace([worktreeRepo, trunkRepo, dirRepo])
    readWorkspaceMock.mockImplementation(() => workspace)
    getCommitsAheadMock.mockImplementation(async (repoPath: string) =>
      repoPath === worktreePath(worktreeRepo) ? 4 : 0
    )

    const rows: Array<{ repo: string; status: string; detail: string }> = []
    const result = await pushWorkspace("feature-ws", { dryRun: true }, (row) => rows.push(row))

    expect(result.ok).toBe(true)
    expect(result.pushed).toEqual([{ repo: "api", commits: 4 }])
    expect(result.skipped).toEqual([
      { repo: "web", reason: "trunk" },
      { repo: "docs", reason: "dir" },
    ])
    expect(getCommitsAheadMock).toHaveBeenCalledWith(
      worktreeRepo.task_path,
      "origin/feature/test",
      "HEAD"
    )
    expect(rows).toEqual([
      { repo: "web", status: "skipped", detail: "trunk" },
      { repo: "docs", status: "skipped", detail: "dir" },
      { repo: "api", status: "pushed", detail: "would push 4 commits" },
    ])
  })

  test("pushWorkspace forwards force and upstream options to pushBranch", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
    })
    mkdirSync(worktreePath(worktreeRepo), { recursive: true })

    readWorkspaceMock.mockImplementation(() => makeWorkspace([worktreeRepo]))
    pushBranchMock.mockImplementation(async () => ({ ok: true, commits: 2 }))

    const result = await pushWorkspace("feature-ws", {
      force: true,
      forceWithLease: true,
      setUpstream: true,
    })

    expect(result.ok).toBe(true)
    expect(pushBranchMock).toHaveBeenCalledWith(worktreePath(worktreeRepo), "feature/test", {
      force: true,
      forceWithLease: true,
      setUpstream: true,
    })
  })

  test("syncWorkspace aborts early when an auto-stash already exists", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
      base_branch: "main",
    })
    mkdirSync(worktreePath(worktreeRepo), { recursive: true })

    readWorkspaceMock.mockImplementation(() => makeWorkspace([worktreeRepo]))
    hasAutoStashMock.mockImplementation(async () => true)

    const result = await syncWorkspace("feature-ws", {
      strategy: "rebase",
      stash: true,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("already has a git-stacks auto-stash entry")
    expect(fetchOriginMock).not.toHaveBeenCalled()
  })

  test("syncWorkspace fetches, checks conflicts, rebases, and restores stashes on success", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
      base_branch: "main",
    })
    mkdirSync(worktreePath(worktreeRepo), { recursive: true })

    readWorkspaceMock.mockImplementation(() => makeWorkspace([worktreeRepo]))
    isRepoDirtyMock.mockImplementation(async () => true)
    getCommitsBehindMock.mockImplementation(async () => 2)
    getMergeConflictsMock.mockImplementation(async () => ({ status: "clean" } as any))
    rebaseBranchMock.mockImplementation(async () => ({ ok: true }))

    const rows: Array<{ repo: string; status: string; detail: string; conflicts: string[] }> = []
    const result = await syncWorkspace(
      "feature-ws",
      { strategy: "rebase", stash: true },
      (row) => rows.push(row)
    )

    expect(result.ok).toBe(true)
    expect(result.synced).toEqual([{ repo: "api", commits: 2 }])
    expect(fetchOriginMock).toHaveBeenCalledWith(worktreePath(worktreeRepo))
    expect(getMergeConflictsMock).toHaveBeenCalledWith(
      worktreePath(worktreeRepo),
      "origin/main",
      "feature/test"
    )
    expect(rebaseBranchMock).toHaveBeenCalledWith(worktreePath(worktreeRepo), "origin/main")
    expect(rows.some((row) => row.status === "stashing")).toBe(true)
    expect(rows.some((row) => row.status === "fetching")).toBe(true)
    expect(rows.some((row) => row.status === "rebasing")).toBe(true)
    expect(rows.some((row) => row.status === "popping")).toBe(true)
    expect(rows.some((row) => row.status === "synced" && row.detail.includes("+2 commits"))).toBe(true)
  })

  test("syncWorkspace reports a merge preflight error as a failure in normal mode", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
      base_branch: "main",
    })
    mkdirSync(worktreePath(worktreeRepo), { recursive: true })
    readWorkspaceMock.mockImplementation(() => makeWorkspace([worktreeRepo]))
    getMergeConflictsMock.mockImplementation(async () => ({
      status: "error",
      error: "cannot resolve origin/main",
    } as any))

    const rows: Array<{ repo: string; status: string; detail: string }> = []
    const result = await syncWorkspace("feature-ws", { strategy: "rebase" }, (row) => rows.push(row))

    expect(result.ok).toBe(false)
    expect(result.error).toContain("Merge preflight failed")
    expect(result.error).toContain("api (cannot resolve origin/main)")
    expect(result.skipped).toContainEqual({ repo: "api", reason: "cannot resolve origin/main" })
    expect(rebaseBranchMock).not.toHaveBeenCalled()
    expect(rows).toContainEqual(expect.objectContaining({
      repo: "api",
      status: "failed",
      detail: "cannot resolve origin/main",
    }))
  })

  test("syncWorkspace best-effort syncs clean repos but still fails operational preflight errors", async () => {
    const brokenRepo = makeRepo("broken", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "broken"),
      base_branch: "main",
    })
    const cleanRepo = makeRepo("clean", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "clean"),
      base_branch: "main",
    })
    mkdirSync(worktreePath(brokenRepo), { recursive: true })
    mkdirSync(worktreePath(cleanRepo), { recursive: true })
    readWorkspaceMock.mockImplementation(() => makeWorkspace([brokenRepo, cleanRepo]))
    getCommitsBehindMock.mockImplementation(async () => 1)
    getMergeConflictsMock.mockImplementation(async (repoPath: string) => (
      repoPath === worktreePath(brokenRepo)
        ? { status: "error", error: "unsupported merge-tree behavior" }
        : { status: "clean" }
    ) as any)

    const rows: Array<{ repo: string; status: string; detail: string }> = []
    const result = await syncWorkspace(
      "feature-ws",
      { strategy: "rebase", bestEffort: true },
      (row) => rows.push(row)
    )

    expect(result.ok).toBe(false)
    expect(result.synced).toEqual([{ repo: "clean", commits: 1 }])
    expect(result.skipped).toContainEqual({ repo: "broken", reason: "unsupported merge-tree behavior" })
    expect(rebaseBranchMock).toHaveBeenCalledTimes(1)
    expect(rebaseBranchMock).toHaveBeenCalledWith(worktreePath(cleanRepo), "origin/main")
    expect(rows).toContainEqual(expect.objectContaining({
      repo: "broken",
      status: "failed",
      detail: "unsupported merge-tree behavior",
    }))
  })

  test("pullWorkspace fails wrong and detached branches without fetching or pulling them", async () => {
    const wrongRepo = makeRepo("wrong", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "wrong"),
    })
    const detachedRepo = makeRepo("detached", "trunk", {
      main_path: join(tempRoot, "main", "detached"),
      base_branch: "main",
    })
    const cleanRepo = makeRepo("clean", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "clean"),
    })
    mkdirSync(worktreePath(wrongRepo), { recursive: true })
    mkdirSync(detachedRepo.main_path, { recursive: true })
    mkdirSync(worktreePath(cleanRepo), { recursive: true })
    getCurrentBranchMock.mockImplementation(async (repoPath: string) => {
      if (repoPath === worktreePath(wrongRepo)) return "other-branch"
      if (repoPath === detachedRepo.main_path) return "HEAD"
      return "feature/test"
    })

    const result = await pullWorkspace(makeWorkspace([wrongRepo, detachedRepo, cleanRepo]))

    expect(result.ok).toBe(false)
    expect(result.failed).toContainEqual(expect.objectContaining({
      repo: "wrong",
      reason: "branch mismatch: current 'other-branch', expected 'feature/test'",
    }))
    expect(result.failed).toContainEqual(expect.objectContaining({
      repo: "detached",
      reason: "branch mismatch: current 'HEAD', expected 'main'",
    }))
    expect(fetchOriginMock).toHaveBeenCalledTimes(1)
    expect(fetchOriginMock).toHaveBeenCalledWith(cleanRepo.main_path)
    expect(pullFFOnlyMock).toHaveBeenCalledTimes(1)
    expect(pullFFOnlyMock).toHaveBeenCalledWith(cleanRepo.task_path, "feature/test")
  })
})
