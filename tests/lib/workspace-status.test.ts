import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import type { Workspace, WorkspaceRepo } from "@/lib/config"
import { cleanup, makeConfigMock, makeGitMock, makeTmpDir } from "../helpers"

const tempDirs: string[] = []

const getRepoPathMock = mock((repo: WorkspaceRepo) =>
  repo.mode === "worktree" ? repo.task_path : repo.main_path
)
const isGitRepoMock = mock((repo: WorkspaceRepo) => repo.mode !== "dir")
const isWorktreeRepoMock = mock((repo: WorkspaceRepo) => repo.mode === "worktree")
const listWorkspacesMock = mock(() => [] as Workspace[])

const isRepoDirtyMock = mock(async (_repoPath: string) => false)
const getGitLineChangesMock = mock(async (_repoPath: string) => ({ additions: 0, removals: 0 }))
const getCurrentBranchMock = mock(async (_repoPath: string) => "main")
const getCommitsAheadMock = mock(async (_repoPath: string, _baseRef: string, _headRef: string) => 0)
const getCommitsBehindMock = mock(async (_repoPath: string, _baseRef: string, _headRef: string) => 0)
const isFetchStaleMock = mock(async (_repoPath: string) => false)

mock.module("@/lib/config", () =>
  makeConfigMock({
    getRepoPath: getRepoPathMock,
    isGitRepo: isGitRepoMock,
    isWorktreeRepo: isWorktreeRepoMock,
    listWorkspaces: listWorkspacesMock,
  })
)

mock.module("@/lib/git", () =>
  makeGitMock({
    isRepoDirty: isRepoDirtyMock,
    getGitLineChanges: getGitLineChangesMock,
    getCurrentBranch: getCurrentBranchMock,
    getCommitsAhead: getCommitsAheadMock,
    getCommitsBehind: getCommitsBehindMock,
    isFetchStale: isFetchStaleMock,
  })
)

const { getWorkspaceListInfo, getWorkspaceStatus } = await import("../../src/lib/workspace-status")

let tempRoot = ""

beforeEach(() => {
  tempRoot = makeTmpDir("workspace-status")
  tempDirs.push(tempRoot)

  getRepoPathMock.mockReset()
  isGitRepoMock.mockReset()
  isWorktreeRepoMock.mockReset()
  listWorkspacesMock.mockReset()
  isRepoDirtyMock.mockReset()
  getGitLineChangesMock.mockReset()
  getCurrentBranchMock.mockReset()
  getCommitsAheadMock.mockReset()
  getCommitsBehindMock.mockReset()
  isFetchStaleMock.mockReset()

  getRepoPathMock.mockImplementation((repo: WorkspaceRepo) =>
    repo.mode === "worktree" ? repo.task_path : repo.main_path
  )
  isGitRepoMock.mockImplementation((repo: WorkspaceRepo) => repo.mode !== "dir")
  isWorktreeRepoMock.mockImplementation((repo: WorkspaceRepo) => repo.mode === "worktree")
  listWorkspacesMock.mockImplementation(() => [])
  isRepoDirtyMock.mockImplementation(async () => false)
  getGitLineChangesMock.mockImplementation(async () => ({ additions: 0, removals: 0 }))
  getCurrentBranchMock.mockImplementation(async () => "main")
  getCommitsAheadMock.mockImplementation(async () => 0)
  getCommitsBehindMock.mockImplementation(async () => 0)
  isFetchStaleMock.mockImplementation(async () => false)
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
    description: "focused status coverage",
    created: "2026-04-01T00:00:00.000Z",
    last_opened: "2026-04-04T00:00:00.000Z",
    repos,
  } as Workspace
}

function worktreePath(repo: WorkspaceRepo): string {
  return repo.task_path!
}

describe("workspace-status", () => {
  test("getWorkspaceListInfo aggregates dirty repos, ahead/behind totals, and fetch staleness", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
      base_branch: "main",
    })
    const trunkRepo = makeRepo("web", "trunk", {
      main_path: join(tempRoot, "main", "web"),
    })

    mkdirSync(worktreePath(worktreeRepo), { recursive: true })
    mkdirSync(trunkRepo.main_path, { recursive: true })

    isRepoDirtyMock.mockImplementation(async (repoPath: string) => repoPath === worktreePath(worktreeRepo))
    getCurrentBranchMock.mockImplementation(async (repoPath: string) =>
      repoPath === trunkRepo.main_path ? "release/1.2" : "feature/test"
    )
    getCommitsAheadMock.mockImplementation(async (_repoPath: string, baseRef: string) =>
      baseRef === "origin/main" ? 2 : 1
    )
    getCommitsBehindMock.mockImplementation(async (_repoPath: string, baseRef: string) =>
      baseRef === "origin/main" ? 3 : 5
    )
    isFetchStaleMock.mockImplementation(async (repoPath: string) => repoPath === trunkRepo.main_path)

    const info = await getWorkspaceListInfo(makeWorkspace([worktreeRepo, trunkRepo]))

    expect(info.dirty).toBe(true)
    expect(info.dirtyRepos).toEqual(["api"])
    expect(info.worktreeCount).toBe(1)
    expect(info.trunkCount).toBe(1)
    expect(info.repoCount).toBe(2)
    expect(info.ahead).toBe(3)
    expect(info.behind).toBe(5)
    expect(info.aheadBehindStale).toBe(true)
    expect(getCommitsAheadMock).toHaveBeenCalledWith(worktreePath(worktreeRepo), "origin/main", "HEAD")
    expect(getCommitsAheadMock).toHaveBeenCalledWith(trunkRepo.main_path, "origin/release/1.2", "HEAD")
    expect(getCurrentBranchMock).toHaveBeenCalledTimes(1)
  })

  test("getWorkspaceStatus uses worktree and trunk base refs correctly and skips missing repo paths", async () => {
    const worktreeRepo = makeRepo("api", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "api"),
      base_branch: "develop",
    })
    const trunkRepo = makeRepo("web", "trunk", {
      main_path: join(tempRoot, "main", "web"),
    })
    const missingRepo = makeRepo("missing", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "missing"),
      base_branch: "main",
    })

    mkdirSync(worktreePath(worktreeRepo), { recursive: true })
    mkdirSync(trunkRepo.main_path, { recursive: true })

    isRepoDirtyMock.mockImplementation(async (repoPath: string) => repoPath === worktreePath(worktreeRepo))
    getCurrentBranchMock.mockImplementation(async (repoPath: string) =>
      repoPath === trunkRepo.main_path ? "release/1.2" : "feature/api"
    )
    getCommitsAheadMock.mockImplementation(async (_repoPath: string, baseRef: string) =>
      baseRef === "origin/develop" ? 4 : 1
    )
    getCommitsBehindMock.mockImplementation(async (_repoPath: string, baseRef: string) =>
      baseRef === "origin/develop" ? 2 : 0
    )

    const status = await getWorkspaceStatus(makeWorkspace([worktreeRepo, trunkRepo, missingRepo]))

    expect(status).toEqual([
      {
        name: "api",
        exists: true,
        dirty: true,
        branch: "feature/api",
        mode: "worktree",
        ahead: 4,
        behind: 2,
        additions: 0,
        removals: 0,
        degraded: false,
        fetch_stale: false,
      },
      {
        name: "web",
        exists: true,
        dirty: false,
        branch: "release/1.2",
        mode: "trunk",
        ahead: 1,
        behind: 0,
        additions: 0,
        removals: 0,
        degraded: false,
        fetch_stale: false,
      },
      {
        name: "missing",
        exists: false,
        dirty: false,
        branch: "—",
        mode: "worktree",
        ahead: 0,
        behind: 0,
        additions: 0,
        removals: 0,
        degraded: false,
        fetch_stale: false,
      },
    ])
    expect(getCommitsAheadMock).toHaveBeenCalledWith(worktreePath(worktreeRepo), "origin/develop", "HEAD")
    expect(getCommitsAheadMock).toHaveBeenCalledWith(trunkRepo.main_path, "origin/release/1.2", "HEAD")
    expect(isRepoDirtyMock).toHaveBeenCalledTimes(2)
  })

  test("treats a worktree deleted during Git status as an expected missing repository", async () => {
    const repo = makeRepo("raced", "worktree", {
      task_path: join(tempRoot, "tasks", "feature-ws", "raced"),
    })
    mkdirSync(worktreePath(repo), { recursive: true })
    isRepoDirtyMock.mockImplementation(async (path: string) => {
      rmSync(path, { recursive: true, force: true })
      throw new Error("git status exited 128: not a git repository")
    })

    expect(await getWorkspaceStatus(makeWorkspace([repo]))).toEqual([{
      name: "raced", exists: false, dirty: false, branch: "—", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false, fetch_stale: false,
    }])
  })

  test("projects staged, unstaged, and untracked line totals from the Git observer", async () => {
    const repo = makeRepo("lines", "worktree", { task_path: join(tempRoot, "tasks", "feature-ws", "lines") })
    mkdirSync(worktreePath(repo), { recursive: true })
    getGitLineChangesMock.mockImplementation(async () => ({ additions: 12, removals: 4 }))
    const [status] = await getWorkspaceStatus(makeWorkspace([repo]))
    expect(status).toMatchObject({ additions: 12, removals: 4, dirty: false })
    expect(getGitLineChangesMock).toHaveBeenCalledTimes(1)
  })
})
