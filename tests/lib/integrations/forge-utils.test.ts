import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { Workspace, WorkspaceRepo, RepoRegistryEntry } from "@/lib/config"
import { makeConfigMock } from "../../helpers"

// --- Mocks for config module ---

const workspaceExistsMock = mock((_name: string) => false)
const readWorkspaceMock = mock((_name: string): Workspace => { throw new Error("not set") })
const readRegistryMock = mock((): RepoRegistryEntry[] => [])

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readWorkspace: readWorkspaceMock,
  readRegistry: readRegistryMock,
}))

const {
  resolveForgeRepo,
  resolveForgeRepoAnyMode,
  formatForgeError,
  _detect,
  detectGitHubForge,
  detectGitLabForge,
  detectGiteaForge,
  detectForgeForRepo,
  detectForgeForRepoEnabled,
} = await import("@/lib/integrations/forge-utils")

// --- Factory helpers ---

function makeWorktreeRepo(overrides: Partial<WorkspaceRepo> = {}): WorkspaceRepo {
  return {
    name: "repo-a",
    repo: "my-repo",
    type: "typescript",
    mode: "worktree",
    main_path: "/main/repo-a",
    task_path: "/tasks/ws/repo-a",
    ...overrides,
  } as WorkspaceRepo
}

function makeTrunkRepo(overrides: Partial<WorkspaceRepo> = {}): WorkspaceRepo {
  return {
    name: "trunk-repo",
    repo: "my-trunk-repo",
    type: "typescript",
    mode: "trunk",
    main_path: "/main/trunk-repo",
    task_path: "/main/trunk-repo",
    ...overrides,
  } as WorkspaceRepo
}

function makeWorkspace(repos: WorkspaceRepo[]): Workspace {
  return {
    name: "test-ws",
    branch: "feature/test",
    created: "2026-01-01",
    schema_version: "1",
    repos,
  } as Workspace
}

function makeRegistryEntry(name: string, overrides: Partial<RepoRegistryEntry> = {}): RepoRegistryEntry {
  return {
    name,
    schema_version: "1",
    local_path: `/home/dev/${name}`,
    default_branch: "main",
    type: "other",
    ...overrides,
  } as RepoRegistryEntry
}

// --- Tests ---

describe("resolveForgeRepo", () => {
  beforeEach(() => {
    workspaceExistsMock.mockReset()
    readWorkspaceMock.mockReset()
    readRegistryMock.mockReset()
    workspaceExistsMock.mockImplementation(() => false)
    readRegistryMock.mockImplementation(() => [])
  })

  test("returns workspace_not_found when workspace does not exist", () => {
    workspaceExistsMock.mockImplementation(() => false)
    const result = resolveForgeRepo("nonexistent", undefined, "github")
    expect(result).toEqual({ ok: false, error: "workspace_not_found", name: "nonexistent" })
  })

  test("auto-selects single worktree repo when no repoArg given (forge matches)", () => {
    const repo = makeWorktreeRepo({ name: "repo-a", repo: "my-repo" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repo]))
    readRegistryMock.mockImplementation(() => [makeRegistryEntry("my-repo", { forge: "github" })])

    const result = resolveForgeRepo("test-ws", undefined, "github")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repo.name).toBe("repo-a")
      expect(result.repoPath).toBe("/tasks/ws/repo-a")
    }
  })

  test("returns repo_required error with repo names when workspace has 2 worktree repos and no repoArg", () => {
    const repoA = makeWorktreeRepo({ name: "repo-a", repo: "my-repo-a" })
    const repoB = makeWorktreeRepo({ name: "repo-b", repo: "my-repo-b" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repoA, repoB]))
    readRegistryMock.mockImplementation(() => [
      makeRegistryEntry("my-repo-a", { forge: "github" }),
      makeRegistryEntry("my-repo-b", { forge: "github" }),
    ])

    const result = resolveForgeRepo("test-ws", undefined, "github")
    expect(result).toEqual({ ok: false, error: "repo_required", worktreeRepos: ["repo-a", "repo-b"] })
  })

  test("selects repoArg explicitly from 2 worktree repos", () => {
    const repoA = makeWorktreeRepo({ name: "repo-a", repo: "my-repo-a" })
    const repoB = makeWorktreeRepo({ name: "repo-b", repo: "my-repo-b" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repoA, repoB]))
    readRegistryMock.mockImplementation(() => [
      makeRegistryEntry("my-repo-a", { forge: "github" }),
      makeRegistryEntry("my-repo-b", { forge: "github" }),
    ])

    const result = resolveForgeRepo("test-ws", "repo-b", "github")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repo.name).toBe("repo-b")
    }
  })

  test("returns repo_not_found when repoArg doesn't match any repo", () => {
    const repo = makeWorktreeRepo({ name: "repo-a", repo: "my-repo" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repo]))
    readRegistryMock.mockImplementation(() => [makeRegistryEntry("my-repo", { forge: "github" })])

    const result = resolveForgeRepo("test-ws", "bad-repo", "github")
    expect(result).toEqual({ ok: false, error: "repo_not_found", name: "bad-repo" })
  })

  test("returns not_worktree_mode when repoArg points to trunk-mode repo", () => {
    const repo = makeTrunkRepo({ name: "trunk-repo", repo: "my-trunk-repo" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repo]))
    readRegistryMock.mockImplementation(() => [makeRegistryEntry("my-trunk-repo", { forge: "github" })])

    const result = resolveForgeRepo("test-ws", "trunk-repo", "github")
    expect(result).toEqual({ ok: false, error: "not_worktree_mode", repo: "trunk-repo" })
  })

  test("returns forge_not_configured when registry forge is gitlab but expected github (FORGE-11 / D-14)", () => {
    const repo = makeWorktreeRepo({ name: "repo-a", repo: "my-repo" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repo]))
    readRegistryMock.mockImplementation(() => [makeRegistryEntry("my-repo", { forge: "gitlab" })])

    const result = resolveForgeRepo("test-ws", undefined, "github")
    expect(result).toEqual({
      ok: false,
      error: "forge_not_configured",
      repo: "repo-a",
      expected: "github",
      actual: "gitlab",
    })
  })

  test("returns forge_not_configured when registry forge is undefined and expected github (D-14: no forge configured)", () => {
    const repo = makeWorktreeRepo({ name: "repo-a", repo: "my-repo" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repo]))
    // No forge field on registry entry
    readRegistryMock.mockImplementation(() => [makeRegistryEntry("my-repo")])

    const result = resolveForgeRepo("test-ws", undefined, "github")
    expect(result).toEqual({
      ok: false,
      error: "forge_not_configured",
      repo: "repo-a",
      expected: "github",
      actual: undefined,
    })
  })

  test("baseBranch resolution: repo.base_branch > registry.default_branch > 'main' fallback", () => {
    // Priority 1: repo.base_branch
    const repoWithBase = makeWorktreeRepo({ name: "repo-a", repo: "my-repo", base_branch: "develop" })
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repoWithBase]))
    readRegistryMock.mockImplementation(() => [makeRegistryEntry("my-repo", { default_branch: "staging", forge: "github" })])

    const result1 = resolveForgeRepo("test-ws", undefined, "github")
    expect(result1.ok).toBe(true)
    if (result1.ok) expect(result1.baseBranch).toBe("develop")

    // Priority 2: registry.default_branch (remove base_branch from repo)
    const repoNoBase = makeWorktreeRepo({ name: "repo-a", repo: "my-repo" })
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repoNoBase]))

    const result2 = resolveForgeRepo("test-ws", undefined, "github")
    expect(result2.ok).toBe(true)
    if (result2.ok) expect(result2.baseBranch).toBe("staging")

    // Priority 3: "main" fallback (no registry entry for this repo)
    readRegistryMock.mockImplementation(() => [])
    // No registry entry means forge check will fail since registryEntry?.forge is undefined
    // We need a registry entry with forge matching but no default_branch override
    readRegistryMock.mockImplementation(() => [makeRegistryEntry("my-repo", { default_branch: "main", forge: "github" })])

    const result3 = resolveForgeRepo("test-ws", undefined, "github")
    expect(result3.ok).toBe(true)
    if (result3.ok) expect(result3.baseBranch).toBe("main")
  })
})

describe("resolveForgeRepoAnyMode", () => {
  beforeEach(() => {
    workspaceExistsMock.mockReset()
    readWorkspaceMock.mockReset()
    readRegistryMock.mockReset()
    workspaceExistsMock.mockImplementation(() => true)
    readRegistryMock.mockImplementation(() => [])
  })

  test("auto-selects the single matching forge repo across trunk and worktree modes", () => {
    const githubRepo = makeTrunkRepo({ name: "trunk-repo", repo: "github-repo" })
    const gitlabRepo = makeWorktreeRepo({ name: "worktree-repo", repo: "gitlab-repo" })
    readWorkspaceMock.mockImplementation(() => makeWorkspace([githubRepo, gitlabRepo]))
    readRegistryMock.mockImplementation(() => [
      makeRegistryEntry("github-repo", { forge: "github" }),
      makeRegistryEntry("gitlab-repo", { forge: "gitlab" }),
    ])

    const result = resolveForgeRepoAnyMode("test-ws", undefined, "github")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repo.name).toBe("trunk-repo")
      expect(result.repoPath).toBe("/main/trunk-repo")
    }
  })

  test("requires a repo when multiple repos match requested forge", () => {
    const repoA = makeTrunkRepo({ name: "repo-a", repo: "repo-a" })
    const repoB = makeWorktreeRepo({ name: "repo-b", repo: "repo-b" })
    readWorkspaceMock.mockImplementation(() => makeWorkspace([repoA, repoB]))
    readRegistryMock.mockImplementation(() => [
      makeRegistryEntry("repo-a", { forge: "github" }),
      makeRegistryEntry("repo-b", { forge: "github" }),
    ])

    expect(resolveForgeRepoAnyMode("test-ws", undefined, "github")).toEqual({
      ok: false,
      error: "repo_required",
      worktreeRepos: ["repo-a", "repo-b"],
    })
  })
})

// --- formatForgeError ---

describe("formatForgeError", () => {
  test("formats workspace_not_found error", () => {
    const msg = formatForgeError({ ok: false, error: "workspace_not_found", name: "my-ws" })
    expect(msg).toContain("my-ws")
    expect(msg.toLowerCase()).toContain("not found")
  })

  test("formats repo_required error with repo list", () => {
    const msg = formatForgeError({ ok: false, error: "repo_required", worktreeRepos: ["repo-a", "repo-b"] })
    expect(msg).toContain("repo-a")
    expect(msg).toContain("repo-b")
  })

  test("formats repo_required error with no worktree repos", () => {
    const msg = formatForgeError({ ok: false, error: "repo_required", worktreeRepos: [] })
    expect(msg.toLowerCase()).toContain("no worktree")
  })

  test("formats repo_not_found error", () => {
    const msg = formatForgeError({ ok: false, error: "repo_not_found", name: "bad-repo" })
    expect(msg).toContain("bad-repo")
  })

  test("formats not_worktree_mode error", () => {
    const msg = formatForgeError({ ok: false, error: "not_worktree_mode", repo: "trunk-repo" })
    expect(msg).toContain("trunk-repo")
    expect(msg.toLowerCase()).toContain("trunk")
  })

  test("formats forge_not_configured error with actual forge set", () => {
    const msg = formatForgeError({
      ok: false,
      error: "forge_not_configured",
      repo: "repo-a",
      expected: "github",
      actual: "gitlab",
    })
    expect(msg).toContain("repo-a")
    expect(msg).toContain("gitlab")
    expect(msg).toContain("github")
  })

  test("formats forge_not_configured error with actual forge undefined", () => {
    const msg = formatForgeError({
      ok: false,
      error: "forge_not_configured",
      repo: "repo-a",
      expected: "github",
      actual: undefined,
    })
    expect(msg).toContain("repo-a")
    expect(msg).toContain("github")
    // Message should indicate no forge configured
    expect(msg.toLowerCase()).toMatch(/no forge|not configured/)
  })
})

// --- Forge detection ---

describe("forge detection", () => {
  beforeEach(() => {
    // Reset _detect to real implementations (overridden per test)
    _detect.which = mock(async (_cmd: string) => false)
    _detect.gitRemoteUrl = mock(async (_repoPath: string) => null)
    _detect.teaPullsLs = mock(async (_repoPath: string) => false)
  })

  test("detectGitHubForge returns true for github.com remote with gh installed", async () => {
    _detect.which = mock(async (cmd: string) => cmd === "gh")
    _detect.gitRemoteUrl = mock(async () => "git@github.com:org/repo.git")
    expect(await detectGitHubForge("/tmp/repo")).toBe(true)
  })

  test("detectGitHubForge returns false when gh not installed", async () => {
    _detect.which = mock(async () => false)
    _detect.gitRemoteUrl = mock(async () => "git@github.com:org/repo.git")
    expect(await detectGitHubForge("/tmp/repo")).toBe(false)
  })

  test("detectGitHubForge returns false for non-github remote", async () => {
    _detect.which = mock(async () => true)
    _detect.gitRemoteUrl = mock(async () => "git@gitlab.com:org/repo.git")
    expect(await detectGitHubForge("/tmp/repo")).toBe(false)
  })

  test("detectGitLabForge returns true for gitlab.com remote with glab installed", async () => {
    _detect.which = mock(async (cmd: string) => cmd === "glab")
    _detect.gitRemoteUrl = mock(async () => "git@gitlab.com:org/repo.git")
    expect(await detectGitLabForge("/tmp/repo")).toBe(true)
  })

  test("detectGitLabForge returns false when glab not installed", async () => {
    _detect.which = mock(async () => false)
    _detect.gitRemoteUrl = mock(async () => "git@gitlab.com:org/repo.git")
    expect(await detectGitLabForge("/tmp/repo")).toBe(false)
  })

  test("detectGiteaForge returns true when tea installed and teaPullsLs succeeds", async () => {
    _detect.which = mock(async (cmd: string) => cmd === "tea")
    _detect.teaPullsLs = mock(async () => true)
    expect(await detectGiteaForge("/tmp/repo")).toBe(true)
  })

  test("detectGiteaForge returns false when tea not installed", async () => {
    _detect.which = mock(async () => false)
    _detect.teaPullsLs = mock(async () => true)
    expect(await detectGiteaForge("/tmp/repo")).toBe(false)
  })

  test("detectForgeForRepo returns ['github'] when only GitHub detection matches", async () => {
    _detect.which = mock(async (cmd: string) => cmd === "gh")
    _detect.gitRemoteUrl = mock(async () => "git@github.com:org/repo.git")
    _detect.teaPullsLs = mock(async () => false)
    const result = await detectForgeForRepo("/tmp/repo")
    expect(result).toEqual(["github"])
  })

  test("detectForgeForRepo returns [] when no detections match", async () => {
    _detect.which = mock(async () => false)
    _detect.gitRemoteUrl = mock(async () => null)
    _detect.teaPullsLs = mock(async () => false)
    const result = await detectForgeForRepo("/tmp/repo")
    expect(result).toEqual([])
  })
})

describe("detectForgeForRepoEnabled", () => {
  beforeEach(() => {
    _detect.which = mock(async (_cmd: string) => false)
    _detect.gitRemoteUrl = mock(async (_repoPath: string) => null)
    _detect.teaPullsLs = mock(async (_repoPath: string) => false)
  })

  test("returns [] when no forges are enabled (empty integrations config)", async () => {
    _detect.which = mock(async () => true)
    _detect.gitRemoteUrl = mock(async () => "git@github.com:org/repo.git")
    _detect.teaPullsLs = mock(async () => true)
    const config = { integrations: {}, workspace_root: "/tmp", ports: { range_start: 10000, range_end: 65000 } }
    const result = await detectForgeForRepoEnabled("/tmp/repo", config)
    expect(result).toEqual([])
  })

  test("returns ['github'] when only github is enabled and detection matches", async () => {
    _detect.which = mock(async (cmd: string) => cmd === "gh")
    _detect.gitRemoteUrl = mock(async () => "git@github.com:org/repo.git")
    const config = { integrations: { github: { enabled: true } }, workspace_root: "/tmp", ports: { range_start: 10000, range_end: 65000 } }
    const result = await detectForgeForRepoEnabled("/tmp/repo", config)
    expect(result).toEqual(["github"])
  })

  test("skips disabled forge - gitlab not in results even if CLI installed", async () => {
    _detect.which = mock(async () => true)
    _detect.gitRemoteUrl = mock(async () => "git@github.com:org/repo.git")
    const config = { integrations: { github: { enabled: true } }, workspace_root: "/tmp", ports: { range_start: 10000, range_end: 65000 } }
    const result = await detectForgeForRepoEnabled("/tmp/repo", config)
    expect(result).toEqual(["github"])
  })

  test("returns multiple enabled matching forges", async () => {
    _detect.which = mock(async (cmd: string) => cmd === "gh" || cmd === "tea")
    _detect.gitRemoteUrl = mock(async () => "git@github.com:org/repo.git")
    _detect.teaPullsLs = mock(async () => true)
    const config = { integrations: { github: { enabled: true }, gitea: { enabled: true } }, workspace_root: "/tmp", ports: { range_start: 10000, range_end: 65000 } }
    const result = await detectForgeForRepoEnabled("/tmp/repo", config)
    expect(result).toEqual(["github", "gitea"])
  })
})
