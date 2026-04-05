import { $ } from "bun"
import {
  workspaceExists,
  readWorkspace,
  readRegistry,
  getRepoPath,
  isWorktreeRepo,
  type WorktreeRepo,
  type WorkspaceRepo,
  type Workspace,
  type ForgeType,
} from "../config"

// --- Types ---

export type ForgeRepoResolution = {
  ok: true
  workspace: Workspace
  repo: WorkspaceRepo
  repoPath: string       // repo.task_path — the CWD for forge CLI
  baseBranch: string     // repo.base_branch ?? registry.default_branch ?? "main"
}

export type ForgeRepoResolutionError =
  | { ok: false; error: "workspace_not_found"; name: string }
  | { ok: false; error: "repo_required"; worktreeRepos: string[] }
  | { ok: false; error: "repo_not_found"; name: string }
  | { ok: false; error: "not_worktree_mode"; repo: string }
  | { ok: false; error: "forge_not_configured"; repo: string; expected: string; actual: ForgeType }

// --- Resolution ---

export function resolveForgeRepo(
  workspaceName: string,
  repoArg: string | undefined,
  forge: string
): ForgeRepoResolution | ForgeRepoResolutionError {
  if (!workspaceExists(workspaceName)) {
    return { ok: false, error: "workspace_not_found", name: workspaceName }
  }

  const workspace = readWorkspace(workspaceName)
  const worktreeRepos = workspace.repos.filter(isWorktreeRepo)

  let repo: WorktreeRepo
  if (repoArg !== undefined) {
    // Check if repo exists at all first (for better error messages)
    const allMatch = workspace.repos.find((r) => r.name === repoArg)
    if (!allMatch) {
      return { ok: false, error: "repo_not_found", name: repoArg }
    }
    if (!isWorktreeRepo(allMatch)) {
      return { ok: false, error: "not_worktree_mode", repo: repoArg }
    }
    repo = allMatch
  } else if (worktreeRepos.length === 1) {
    repo = worktreeRepos[0]
  } else if (worktreeRepos.length === 0) {
    return { ok: false, error: "repo_required", worktreeRepos: [] }
  } else {
    return { ok: false, error: "repo_required", worktreeRepos: worktreeRepos.map((r) => r.name) }
  }

  // Validate forge configuration (FORGE-11 / D-14)
  const registry = readRegistry()
  const registryEntry = registry.find((r) => r.name === repo.repo)
  if (registryEntry?.forge !== forge) {
    return {
      ok: false,
      error: "forge_not_configured",
      repo: repo.name,
      expected: forge,
      actual: registryEntry?.forge,
    }
  }

  const baseBranch = repo.base_branch ?? registryEntry?.default_branch ?? "main"

  return { ok: true, workspace, repo, repoPath: getRepoPath(repo), baseBranch }
}

export function resolveForgeRepoAnyMode(
  workspaceName: string,
  repoArg: string | undefined,
  forge: string
): ForgeRepoResolution | ForgeRepoResolutionError {
  if (!workspaceExists(workspaceName)) {
    return { ok: false, error: "workspace_not_found", name: workspaceName }
  }

  const workspace = readWorkspace(workspaceName)

  let repo: WorkspaceRepo
  if (repoArg !== undefined) {
    const match = workspace.repos.find((r) => r.name === repoArg)
    if (!match) {
      return { ok: false, error: "repo_not_found", name: repoArg }
    }
    repo = match
  } else if (workspace.repos.length === 1) {
    repo = workspace.repos[0]
  } else {
    // Validate forge config to auto-select when exactly one repo has the correct forge
    const registry = readRegistry()
    const forgeMatches = workspace.repos.filter((r) => {
      const entry = registry.find((reg) => reg.name === r.repo)
      return entry?.forge === forge
    })
    if (forgeMatches.length === 1) {
      repo = forgeMatches[0]
    } else {
      return {
        ok: false,
        error: "repo_required",
        worktreeRepos: workspace.repos.map((r) => r.name),
      }
    }
  }

  // Validate forge configuration
  const registry = readRegistry()
  const registryEntry = registry.find((r) => r.name === repo.repo)
  if (registryEntry?.forge !== forge) {
    return {
      ok: false,
      error: "forge_not_configured",
      repo: repo.name,
      expected: forge,
      actual: registryEntry?.forge,
    }
  }

  const baseBranch = repo.base_branch ?? registryEntry?.default_branch ?? "main"

  // Use main_path — always a real git clone regardless of mode
  return { ok: true, workspace, repo, repoPath: repo.main_path, baseBranch }
}

// --- CWD Detection ---

/** Resolve repo path from CWD by finding the git toplevel. Returns null if not in a git repo. */
export async function resolveRepoCwd(): Promise<string | null> {
  const result = await $`git rev-parse --show-toplevel`.quiet().nothrow()
  if (result.exitCode !== 0) return null
  return result.text().trim()
}

// --- Forge Detection ---

/** Injectable executor for detection shell commands. Tests can replace these. */
export const _detect = {
  which: async (cmd: string): Promise<boolean> => {
    const result = await $`which ${cmd}`.quiet().nothrow()
    return result.exitCode === 0
  },
  gitRemoteUrl: async (repoPath: string): Promise<string | null> => {
    const result = await $`git -C ${repoPath} remote get-url origin`.quiet().nothrow()
    if (result.exitCode !== 0) return null
    return result.text().trim()
  },
  teaPullsLs: async (repoPath: string): Promise<boolean> => {
    const proc = Bun.spawn(["tea", "pulls", "ls", "--limit", "1"], {
      cwd: repoPath,
      stdout: "ignore",
      stderr: "ignore",
    })
    return (await proc.exited) === 0
  },
}

export async function detectGitHubForge(repoPath: string): Promise<boolean> {
  const installed = await _detect.which("gh")
  if (!installed) return false
  const remoteUrl = await _detect.gitRemoteUrl(repoPath)
  if (!remoteUrl) return false
  return remoteUrl.includes("github.com")
}

export async function detectGitLabForge(repoPath: string): Promise<boolean> {
  const installed = await _detect.which("glab")
  if (!installed) return false
  const remoteUrl = await _detect.gitRemoteUrl(repoPath)
  if (!remoteUrl) return false
  // Only match gitlab.com SaaS with high confidence (per Pitfall 4 in RESEARCH.md)
  return remoteUrl.includes("gitlab.com")
}

export async function detectGiteaForge(repoPath: string): Promise<boolean> {
  const installed = await _detect.which("tea")
  if (!installed) return false
  // tea resolves login from remote URL — if `tea pulls ls` succeeds, the repo matches a configured login
  return await _detect.teaPullsLs(repoPath)
}

/** Run all forge detections and return the ones that matched. */
export async function detectForgeForRepo(repoPath: string): Promise<NonNullable<ForgeType>[]> {
  const results: NonNullable<ForgeType>[] = []
  if (await detectGitHubForge(repoPath)) results.push("github")
  if (await detectGitLabForge(repoPath)) results.push("gitlab")
  if (await detectGiteaForge(repoPath)) results.push("gitea")
  return results
}

// --- Error formatting ---

export function formatForgeError(err: ForgeRepoResolutionError): string {
  switch (err.error) {
    case "workspace_not_found":
      return `Workspace '${err.name}' not found.`
    case "repo_required":
      return err.worktreeRepos.length === 0
        ? "No worktree-mode repos in this workspace."
        : `Multiple worktree repos — specify one: ${err.worktreeRepos.join(", ")}`
    case "repo_not_found":
      return `Repo '${err.name}' not found in workspace.`
    case "not_worktree_mode":
      return `Repo '${err.repo}' is in trunk mode — PR operations require worktree mode.`
    case "forge_not_configured":
      return err.actual
        ? `Repo '${err.repo}' is configured for ${err.actual}, not ${err.expected}. Update forge in registry with 'git-stacks repo edit'.`
        : `Repo '${err.repo}' has no forge configured. Set forge to '${err.expected}' via 'git-stacks repo add' or edit the registry YAML.`
  }
}
