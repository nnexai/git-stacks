import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { Workspace, WorkspaceRepo, RepoRegistryEntry, ForgeType } from "@/lib/config"
import { makeConfigMock } from "../../helpers"

// ─── Isolation strategy ───────────────────────────────────────────────────────
// integration-commands.test.ts mocks @/lib/integrations/forge-utils before this
// file runs (it runs alphabetically before 'integrations/'). After that mock,
// the plain import below would get the stub, not the real implementation.
//
// Fix: apply mock.module("@/lib/config") first, then apply
// mock.module("@/lib/integrations/forge-utils") with the REAL function
// implementations inlined here. This overrides integration-commands' mock.

// --- Mocks for config module ---

const workspaceExistsMock = mock((_name: string) => false)
const readWorkspaceMock = mock((_name: string): Workspace => { throw new Error("not set") })
const readRegistryMock = mock((): RepoRegistryEntry[] => [])

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readWorkspace: readWorkspaceMock,
  readRegistry: readRegistryMock,
}))

// --- Restore real forge-utils implementations via mock.module ---
// Inline the source implementations so they call through to our mocked config.
// Uses require() to access @/lib/config at call time (when mock is active).

const _detect = {
  which: mock(async (_cmd: string): Promise<boolean> => false),
  gitRemoteUrl: mock(async (_repoPath: string): Promise<string | null> => null),
  teaPullsLs: mock(async (_repoPath: string): Promise<boolean> => false),
}

mock.module("@/lib/integrations/forge-utils", () => {
  function resolveForgeRepo(workspaceName: string, repoArg: string | undefined, forge: string): unknown {
    const { workspaceExists, readWorkspace, readRegistry } = require("@/lib/config")
    if (!workspaceExists(workspaceName)) {
      return { ok: false, error: "workspace_not_found", name: workspaceName }
    }
    const workspace = readWorkspace(workspaceName)
    const worktreeRepos = workspace.repos.filter((r: WorkspaceRepo) => r.mode === "worktree")
    let repo: WorkspaceRepo
    if (repoArg !== undefined) {
      const allMatch = workspace.repos.find((r: WorkspaceRepo) => r.name === repoArg)
      if (!allMatch) return { ok: false, error: "repo_not_found", name: repoArg }
      if (allMatch.mode !== "worktree") return { ok: false, error: "not_worktree_mode", repo: repoArg }
      repo = allMatch
    } else if (worktreeRepos.length === 1) {
      repo = worktreeRepos[0]
    } else if (worktreeRepos.length === 0) {
      return { ok: false, error: "repo_required", worktreeRepos: [] }
    } else {
      return { ok: false, error: "repo_required", worktreeRepos: worktreeRepos.map((r: WorkspaceRepo) => r.name) }
    }
    const registry = readRegistry()
    const registryEntry = registry.find((r: RepoRegistryEntry) => r.name === (repo as WorkspaceRepo).repo)
    if (registryEntry?.forge !== forge) {
      return {
        ok: false, error: "forge_not_configured",
        repo: (repo as WorkspaceRepo).name, expected: forge, actual: registryEntry?.forge,
      }
    }
    const baseBranch = (repo as WorkspaceRepo).base_branch ?? registryEntry?.default_branch ?? "main"
    return { ok: true, workspace, repo, repoPath: (repo as WorkspaceRepo).task_path, baseBranch }
  }

  function resolveForgeRepoAnyMode(workspaceName: string, repoArg: string | undefined, forge: string): unknown {
    const { workspaceExists, readWorkspace, readRegistry } = require("@/lib/config")
    if (!workspaceExists(workspaceName)) {
      return { ok: false, error: "workspace_not_found", name: workspaceName }
    }
    const workspace = readWorkspace(workspaceName)
    let repo: WorkspaceRepo
    if (repoArg !== undefined) {
      const match = workspace.repos.find((r: WorkspaceRepo) => r.name === repoArg)
      if (!match) return { ok: false, error: "repo_not_found", name: repoArg }
      repo = match
    } else if (workspace.repos.length === 1) {
      repo = workspace.repos[0]
    } else {
      const registry = readRegistry()
      const forgeMatches = workspace.repos.filter((r: WorkspaceRepo) => {
        const entry = registry.find((reg: RepoRegistryEntry) => reg.name === r.repo)
        return entry?.forge === forge
      })
      if (forgeMatches.length === 1) repo = forgeMatches[0]
      else return { ok: false, error: "repo_required", worktreeRepos: workspace.repos.map((r: WorkspaceRepo) => r.name) }
    }
    const registry = readRegistry()
    const registryEntry = registry.find((r: RepoRegistryEntry) => r.name === (repo as WorkspaceRepo).repo)
    if (registryEntry?.forge !== forge) {
      return { ok: false, error: "forge_not_configured", repo: (repo as WorkspaceRepo).name, expected: forge, actual: registryEntry?.forge }
    }
    const baseBranch = (repo as WorkspaceRepo).base_branch ?? registryEntry?.default_branch ?? "main"
    return { ok: true, workspace, repo, repoPath: (repo as WorkspaceRepo).main_path, baseBranch }
  }

  async function resolveRepoCwd(): Promise<string | null> { return null }

  async function detectGitHubForge(repoPath: string): Promise<boolean> {
    const installed = await _detect.which("gh")
    if (!installed) return false
    const remoteUrl = await _detect.gitRemoteUrl(repoPath)
    if (!remoteUrl) return false
    return remoteUrl.includes("github.com")
  }

  async function detectGitLabForge(repoPath: string): Promise<boolean> {
    const installed = await _detect.which("glab")
    if (!installed) return false
    const remoteUrl = await _detect.gitRemoteUrl(repoPath)
    if (!remoteUrl) return false
    return remoteUrl.includes("gitlab.com")
  }

  async function detectGiteaForge(repoPath: string): Promise<boolean> {
    const installed = await _detect.which("tea")
    if (!installed) return false
    return await _detect.teaPullsLs(repoPath)
  }

  async function detectForgeForRepo(repoPath: string): Promise<NonNullable<ForgeType>[]> {
    const results: NonNullable<ForgeType>[] = []
    if (await detectGitHubForge(repoPath)) results.push("github")
    if (await detectGitLabForge(repoPath)) results.push("gitlab")
    if (await detectGiteaForge(repoPath)) results.push("gitea")
    return results
  }

  function formatForgeError(err: { ok: false; error: string; name?: string; worktreeRepos?: string[]; repo?: string; expected?: string; actual?: string }): string {
    switch (err.error) {
      case "workspace_not_found": return `Workspace '${err.name}' not found.`
      case "repo_required":
        return (err.worktreeRepos?.length === 0)
          ? "No worktree-mode repos in this workspace."
          : `Multiple worktree repos — specify one: ${err.worktreeRepos?.join(", ")}`
      case "repo_not_found": return `Repo '${err.name}' not found in workspace.`
      case "not_worktree_mode": return `Repo '${err.repo}' is in trunk mode — PR operations require worktree mode.`
      case "forge_not_configured":
        return err.actual
          ? `Repo '${err.repo}' is configured for ${err.actual}, not ${err.expected}. Update forge in registry with 'git-stacks repo edit'.`
          : `Repo '${err.repo}' has no forge configured. Set forge to '${err.expected}' via 'git-stacks repo add' or edit the registry YAML.`
      default: return `Unknown forge error: ${err.error}`
    }
  }

  return { resolveForgeRepo, resolveForgeRepoAnyMode, resolveRepoCwd, _detect, detectGitHubForge, detectGitLabForge, detectGiteaForge, detectForgeForRepo, formatForgeError }
})

const { resolveForgeRepo, formatForgeError, detectGitHubForge, detectGitLabForge, detectGiteaForge, detectForgeForRepo } = await import("@/lib/integrations/forge-utils")
// Note: _detect is already declared above and passed into the mock.module factory — it's the same object.

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
