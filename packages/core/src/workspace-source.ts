import { type RepoRegistryEntry, type WorkspaceRepo, type WorkspaceSource } from "./config"
import { createHash } from "node:crypto"

import { checkBranchExists, deleteRef, fetchSourceRef, resolveRef } from "./git"
import { parseForgeSourceUrl, type ForgeSourceId, type ForgeSourceResolutionError } from "./integrations/forge-source"
import { resolveForgeChangeSource, type TrustedForgeChange } from "./integrations/forge-source-resolver"

export type PrepareReviewedWorkspaceSourceInputs = {
  trusted_source: TrustedForgeChange
  matched_repo: WorkspaceRepo
  workspace_name: string
  operation_id: string
  branch?: string
  dry_run?: boolean
}

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
  /** Retry-safe cleanup for a private ref when its first deletion attempt failed. */
  cleanup?: () => Promise<void>
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
  cleanup?: () => Promise<void>
}

export type PreparedReviewedWorkspaceSource = PreparedWorkspaceSource & { cleanup: () => Promise<void> }

export const _source = {
  fetchSourceRef,
  deleteRef,
  resolveRef,
  checkBranchExists,
  resolveForgeChangeSource,
}

function sanitizeBranch(raw: string): string | null {
  const branch = raw.trim().replace(/\s+/g, "-").replace(/[~^:?*[\]\\]+/g, "-")
  if (!branch) return null
  return branch
}

function privateSourceRef(inputs: PrepareReviewedWorkspaceSourceInputs): string {
  const digest = createHash("sha256")
    .update(inputs.operation_id)
    .update("\0")
    .update(inputs.trusted_source.canonical_url)
    .update("\0")
    .update(inputs.matched_repo.repo)
    .digest("hex")
    .slice(0, 24)
  return `refs/git-stacks/review/${inputs.matched_repo.repo}/${digest}`
}

function trustedFetchUrl(source: TrustedForgeChange["source"]): string | null {
  if (source.fetch.https) {
    try {
      const parsed = new URL(source.fetch.https)
      const expectedPath = `${source.repository.path.replace(/^\/+|\/+$/g, "")}.git`.toLowerCase()
      const actualPath = parsed.pathname.replace(/^\/+|\/+$/g, "").toLowerCase()
      if (
        !parsed.username
        && !parsed.password
        && parsed.protocol === "https:"
        && parsed.host.toLowerCase() === source.repository.host
        && actualPath === expectedPath
      ) {
        return source.fetch.https
      }
    } catch {
      // Fall through to a separately supplied SSH coordinate.
    }
  }
  const ssh = source.fetch.ssh?.trim()
  if (!ssh || /\s/.test(ssh) || ssh.startsWith("-")) return null
  const match = /^git@([^:]+):(.+)\.git$/.exec(ssh)
  return match
    && match[1].toLowerCase() === source.repository.host
    && match[2].toLowerCase() === source.repository.path.toLowerCase()
    ? ssh
    : null
}

export async function prepareReviewedWorkspaceSource(
  inputs: PrepareReviewedWorkspaceSourceInputs,
): Promise<PreparedReviewedWorkspaceSource | WorkspaceSourceFailure> {
  if (inputs.matched_repo.mode !== "worktree") {
    return { ok: false, error: "not_worktree_mode", message: "The selected repository must use worktree mode." }
  }
  const source = inputs.trusted_source
  const targetBranchRaw = inputs.branch?.trim() || source.source.branch
  const targetBranch = sanitizeBranch(targetBranchRaw)
  if (!targetBranch) return { ok: false, error: "branch_conflict", message: "The reviewed branch name is invalid." }
  const fetchedRef = privateSourceRef(inputs)
  const fetchUrl = trustedFetchUrl(source.source)
  if (!fetchUrl) {
    return { ok: false, error: "fork_unreachable", message: "The source repository has no usable fetch coordinate." }
  }

  let cleaned = false
  const cleanup = async () => {
    if (cleaned) return
    await _source.deleteRef(inputs.matched_repo.main_path, fetchedRef)
    cleaned = true
  }
  const failAfterCleanup = async (failure: WorkspaceSourceFailure): Promise<WorkspaceSourceFailure> => {
    try {
      await cleanup()
      return failure
    } catch {
      return { ...failure, cleanup }
    }
  }

  if (!inputs.dry_run) {
    let fetchResult: Awaited<ReturnType<typeof _source.fetchSourceRef>>
    try {
      fetchResult = await _source.fetchSourceRef(
        inputs.matched_repo.main_path,
        fetchUrl,
        source.source.ref,
        fetchedRef,
      )
    } catch {
      return failAfterCleanup({
        ok: false,
        error: "fork_unreachable",
        message: `Could not fetch the ${source.provider} source repository. Check repository access and authentication.`,
      })
    }
    if (!fetchResult.ok) {
      return failAfterCleanup({
        ok: false,
        error: "fork_unreachable",
        message: `Could not fetch the ${source.provider} source repository. Check repository access and authentication.`,
      })
    }

    let fetched: Awaited<ReturnType<typeof _source.resolveRef>>
    try {
      fetched = await _source.resolveRef(inputs.matched_repo.main_path, fetchedRef)
    } catch {
      return failAfterCleanup({ ok: false, error: "source_changed", message: "The provider source changed after review. Resolve the change again." })
    }
    if (!fetched.ok || fetched.sha !== source.source.sha) {
      return failAfterCleanup({
        ok: false,
        error: "source_changed",
        message: "The provider source changed after review. Resolve the change again.",
      })
    }

    try {
      if (await _source.checkBranchExists(inputs.matched_repo.main_path, targetBranch)) {
        const existing = await _source.resolveRef(inputs.matched_repo.main_path, targetBranch)
        if (!existing.ok || existing.sha !== source.source.sha) {
          return failAfterCleanup({
            ok: false,
            error: "branch_conflict",
            message: `The existing local branch '${targetBranch}' points at a different commit.`,
          })
        }
      }
    } catch {
      return failAfterCleanup({ ok: false, error: "branch_conflict", message: `The local branch '${targetBranch}' could not be verified.` })
    }
  }

  const origin = new URL(source.canonical_url).origin
  return {
    ok: true,
    branch: targetBranch,
    matchedRepoName: inputs.matched_repo.name,
    fetchedRef,
    cleanup,
    sourceMetadata: {
      kind: "forge",
      forge: source.provider,
      base_url: origin,
      url: source.canonical_url,
      change_type: source.provider === "gitlab" ? "mr" : "pr",
      change_number: source.change_number,
      repo: inputs.matched_repo.name,
      repo_path: source.target.repository.path,
      source_branch: source.source.branch,
      source_ref: source.source.ref,
      target_branch: source.target.branch,
      web_url: source.canonical_url,
      fetched_ref: fetchedRef,
    },
    preview: {
      source: source.canonical_url,
      forge: source.provider,
      change: `${source.provider === "gitlab" ? "mr" : "pr"}#${source.change_number}`,
      matchedRepo: inputs.matched_repo.name,
      sourceBranch: source.source.branch,
      sourceRef: source.source.ref,
      targetBranch,
      workspaceName: inputs.workspace_name,
    },
  }
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
  const configuredHosts = inputs.registry.reduce<{ github: string[]; gitlab: string[] }>((hosts, entry) => {
    const forge = entry.forge_metadata?.forge
    const baseUrl = entry.forge_metadata?.base_url
    if (baseUrl && (forge === "github" || forge === "gitlab")) hosts[forge].push(baseUrl)
    return hosts
  }, { github: [], gitlab: [] })
  const parsed = parseForgeSourceUrl(inputs.sourceUrl, configuredHosts)
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      message: parsed.error === "unsupported_forge" ? "Unsupported forge URL." : "Could not parse source URL.",
    }
  }

  const match = findRepoMatch(parsed.repoPath, inputs.repos, inputs.registry, inputs.repoOverride)
  if (!match.ok) return match

  if (parsed.forge !== "gitea") {
    const resolved = await _source.resolveForgeChangeSource({
      url: inputs.sourceUrl,
      configured_hosts: configuredHosts,
    })
    if (!resolved.ok) {
      const error: ForgeSourceResolutionError = resolved.error === "cli_unavailable"
        ? "cli_unavailable"
        : resolved.error === "auth_required"
          ? "auth_required"
          : resolved.error === "malformed_url"
            ? "url_parse_failed"
            : resolved.error === "unsupported_host"
              ? "unsupported_forge"
              : "metadata_unavailable"
      return { ok: false, error, message: `Could not resolve the ${parsed.forge} change source.` }
    }
    return prepareReviewedWorkspaceSource({
      trusted_source: resolved.change,
      matched_repo: match.repo,
      workspace_name: inputs.workspaceName,
      operation_id: `${inputs.workspaceName}\0${resolved.change.canonical_url}`,
      branch: inputs.branch,
      dry_run: inputs.dryRun,
    })
  }

  // Legacy Gitea CLI behavior remains intentionally outside the Phase 126 reviewed resolver.
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
