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
const getMergeConflictsMock = mock(async (_repoPath: string, _baseRef: string, _branch: string) => [] as string[])
const isRepoDirtyMock = mock(async (_repoPath: string) => false)
const stashPushMock = mock(async (_repoPath: string, _message: string) => ({ ok: true }))
const stashPopMock = mock(async (_repoPath: string) => ({ ok: true }))
const hasAutoStashMock = mock(async (_repoPath: string) => false)
const pullFFOnlyMock = mock(async (_repoPath: string, _branch: string) => ({ ok: true, commits: 0 }))

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
  })
)

const { pushWorkspace, syncWorkspace } = await import("../../src/lib/workspace-git")

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
  getMergeConflictsMock.mockImplementation(async () => [])
  isRepoDirtyMock.mockImplementation(async () => false)
  stashPushMock.mockImplementation(async () => ({ ok: true }))
  stashPopMock.mockImplementation(async () => ({ ok: true }))
  hasAutoStashMock.mockImplementation(async () => false)
  pullFFOnlyMock.mockImplementation(async () => ({ ok: true, commits: 0 }))
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
    getMergeConflictsMock.mockImplementation(async () => [])
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
})
