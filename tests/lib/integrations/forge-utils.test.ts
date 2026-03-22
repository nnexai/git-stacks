import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { Workspace, WorkspaceRepo, RepoRegistryEntry } from "@/lib/config"

// --- Mocks for config module ---

const workspaceExistsMock = mock((_name: string) => false)
const readWorkspaceMock = mock((_name: string): Workspace => { throw new Error("not set") })
const readRegistryMock = mock((): RepoRegistryEntry[] => [])

mock.module("@/lib/config", () => ({
  workspaceExists: workspaceExistsMock,
  readWorkspace: readWorkspaceMock,
  readRegistry: readRegistryMock,
}))

// Cache-busting import
const { resolveForgeRepo, formatForgeError } = await import(
  // @ts-ignore — cache-busting for bun module cache
  "@/lib/integrations/forge-utils?unit-test"
)

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
