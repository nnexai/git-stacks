import {
  workspaceExists,
  readWorkspace,
  readRegistry,
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
  const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")

  let repo: WorkspaceRepo
  if (repoArg !== undefined) {
    // Check if repo exists at all first (for better error messages)
    const allMatch = workspace.repos.find((r) => r.name === repoArg)
    if (!allMatch) {
      return { ok: false, error: "repo_not_found", name: repoArg }
    }
    if (allMatch.mode !== "worktree") {
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

  return { ok: true, workspace, repo, repoPath: repo.task_path, baseBranch }
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
