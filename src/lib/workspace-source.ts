import { type RepoRegistryEntry, type WorkspaceRepo, type WorkspaceSource } from "./config"
import { checkBranchExists, deleteRef, fetchSourceRef, resolveRef } from "./git"
import { parseForgeSourceUrl, type ForgeSourceId, type ForgeSourceResolutionError } from "./integrations/forge-source"

export type PrepareWorkspaceSourceInputs = {
  sourceUrl: string
  repoOverride?: string
  repos: WorkspaceRepo[]
  registry: RepoRegistryEntry[]
  workspaceName: string
  branch?: string
  dryRun?: boolean
}

export type WorkspaceSourceFailure = {
  ok: false
  error: ForgeSourceResolutionError
  message: string
}

export type PreparedWorkspaceSource = {
  ok: true
  branch: string
  matchedRepoName: string
  sourceMetadata: WorkspaceSource
  fetchedRef: string
  preview: {
    source: string
    forge: ForgeSourceId
    change: string
    matchedRepo: string
    sourceBranch: string
    sourceRef: string
    targetBranch: string
    workspaceName: string
  }
}

export const _source = {
  fetchSourceRef,
  deleteRef,
  resolveRef,
  checkBranchExists,
}

function sanitizeBranch(raw: string): string | null {
  const branch = raw.trim().replace(/\s+/g, "-").replace(/[~^:?*[\]\\]+/g, "-")
  if (!branch) return null
  return branch
}

function findRepoMatch(
  parsedRepoPath: string,
  repos: WorkspaceRepo[],
  registry: RepoRegistryEntry[],
  repoOverride?: string,
): { ok: true; repo: WorkspaceRepo; registryEntry: RepoRegistryEntry } | WorkspaceSourceFailure {
  const registryMap = new Map(registry.map((entry) => [entry.name, entry]))
  const templateRepos = repos.filter((repo) => {
    const entry = registryMap.get(repo.repo)
    return entry?.forge_metadata?.repo_path === parsedRepoPath
  })

  if (templateRepos.length === 0) {
    return { ok: false, error: "repo_not_matched", message: `No template repo matched source repository '${parsedRepoPath}'.` }
  }

  const pick = repoOverride
    ? templateRepos.find((repo) => repo.name === repoOverride || repo.repo === repoOverride)
    : templateRepos.length === 1
      ? templateRepos[0]
      : undefined

  if (!pick) {
    return {
      ok: false,
      error: "ambiguous_repo",
      message: `Multiple template repos match source '${parsedRepoPath}'. Use --repo <name>.`,
    }
  }

  const registryEntry = registryMap.get(pick.repo)
  if (!registryEntry) {
    return { ok: false, error: "template_repo_missing", message: `Template repo '${pick.repo}' missing from registry.` }
  }

  if (pick.mode !== "worktree") {
    return { ok: false, error: "not_worktree_mode", message: `Repo '${pick.name}' is not worktree mode.` }
  }

  return { ok: true, repo: pick, registryEntry }
}

export function formatWorkspaceSourceError(failure: WorkspaceSourceFailure): string {
  if (failure.error === "ambiguous_repo") {
    return `${failure.message} Try again with --repo <name>.`
  }
  if (failure.error === "template_repo_missing") {
    return `${failure.message} Ensure your --template includes the source repo.`
  }
  return failure.message
}

export async function prepareWorkspaceSource(inputs: PrepareWorkspaceSourceInputs): Promise<PreparedWorkspaceSource | WorkspaceSourceFailure> {
  const parsed = parseForgeSourceUrl(inputs.sourceUrl)
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      message: parsed.error === "unsupported_forge" ? "Unsupported forge URL." : "Could not parse source URL.",
    }
  }

  const match = findRepoMatch(parsed.repoPath, inputs.repos, inputs.registry, inputs.repoOverride)
  if (!match.ok) return match

  const sourceBranch = `source/${parsed.forge}-${parsed.changeType}-${parsed.changeNumber}`
  const sourceRef = `refs/heads/${sourceBranch}`
  const targetBranchRaw = inputs.branch?.trim() || sourceBranch
  const targetBranch = sanitizeBranch(targetBranchRaw)
  if (!targetBranch) {
    return { ok: false, error: "branch_conflict", message: `Invalid branch name '${targetBranchRaw}'.` }
  }

  const fetchedRef = `refs/git-stacks/sources/${parsed.forge}/${parsed.changeNumber}/${match.repo.repo}`

  if (!inputs.dryRun) {
    if (process.env.GS_TEST_SKIP_SOURCE_FETCH !== "1") {
      const fetchResult = await _source.fetchSourceRef(match.repo.main_path, "origin", sourceRef, fetchedRef)
      if (!fetchResult.ok) {
        return {
          ok: false,
          error: "metadata_unavailable",
          message: `Failed to fetch source ref for ${parsed.forge} (${inputs.sourceUrl}, ${sourceRef}). Check auth/credentials and fork access.`,
        }
      }
    }

    const existingBranch = await _source.checkBranchExists(match.repo.main_path, targetBranch)
    if (existingBranch) {
      const existingSha = await _source.resolveRef(match.repo.main_path, targetBranch)
      const fetchedSha = await _source.resolveRef(match.repo.main_path, fetchedRef)
      if (!existingSha.ok || !fetchedSha.ok || existingSha.sha !== fetchedSha.sha) {
        return {
          ok: false,
          error: "branch_conflict",
          message: `Existing local branch '${targetBranch}' does not match fetched source ref.`,
        }
      }
    }
  }

  return {
    ok: true,
    branch: targetBranch,
    matchedRepoName: match.repo.name,
    fetchedRef,
    sourceMetadata: {
      kind: "forge",
      forge: parsed.forge,
      base_url: parsed.baseUrl,
      url: inputs.sourceUrl,
      change_type: parsed.changeType,
      change_number: parsed.changeNumber,
      repo: match.repo.name,
      repo_path: parsed.repoPath,
      source_branch: sourceBranch,
      source_ref: sourceRef,
      target_branch: targetBranch,
      web_url: parsed.webUrl,
      fetched_ref: fetchedRef,
    },
    preview: {
      source: inputs.sourceUrl,
      forge: parsed.forge,
      change: `${parsed.changeType}#${parsed.changeNumber}`,
      matchedRepo: match.repo.name,
      sourceBranch,
      sourceRef,
      targetBranch,
      workspaceName: inputs.workspaceName,
    },
  }
}
