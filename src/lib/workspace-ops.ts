import { existsSync, unlinkSync, readFileSync, writeFileSync, lstatSync, rmSync } from "fs"
import { join, resolve } from "path"
import { parse } from "yaml"
import {
  readWorkspace,
  writeWorkspace,
  workspaceExists,
  workspacePath,
  listWorkspaces,
  readGlobalConfig,
  WorkspaceSchema,
  TemplateSchema,
  GlobalConfigSchema,
  RepoRegistrySchema,
  templatePath,
  templateExists,
  readTemplate,
  writeTemplate,
  type Workspace,
  type GlobalConfig,
} from "./config"
import { getTasksDir, GLOBAL_CONFIG_FILE, REGISTRY_FILE, expandHome } from "./paths"
import {
  isRepoDirty,
  getCurrentBranch,
  createWorktree,
  removeWorktree,
  checkBranchExists,
  getMergeConflicts,
  mergeNoFF,
  deleteLocalBranch,
  fetchOrigin,
  pullFFOnly,
  rebaseBranch,
  mergeBranchFF,
  getCommitsBehind,
  ensureUpstreamTracking,
} from "./git"
import { type IntegrationContext } from "./integrations"
import { runIntegrations, runIntegrationCleanup } from "./integrations/runner"
import { runHooks, runHooksCaptured } from "./lifecycle"
import { applyFileOpsForRepo, applyFileOpsForWorkspace, warnExternalFiles } from "./files"
import { $ } from "bun"
import { allocatePorts } from "./ports"

export type ProgressCallback = (message: string) => void

export type WorkspaceListInfo = {
  name: string
  branch: string
  description: string
  created: string
  age: string // human-readable: "2h", "3d", "1w", "2mo", "1y"
  lastOpened: string   // human-readable age from last_opened, falls back to created
  dirty: boolean | null // null = not checked
  dirtyRepos: string[] // names of dirty repos (empty if not checked)
  worktreeCount: number
  trunkCount: number
  repoCount: number    // worktreeCount + trunkCount
}

function formatAge(created: string): string {
  const createdDate = new Date(created)
  const now = new Date()
  const diffMs = now.getTime() - createdDate.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffHours < 1) return "now"
  if (diffDays < 1) return `${Math.floor(diffHours)}h`
  if (diffDays < 7) return `${Math.floor(diffDays)}d`
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w`
  if (diffDays < 365) return `${Math.round(diffDays / 30)}mo`
  return `${Math.round(diffDays / 365)}y`
}

export async function getWorkspaceListInfo(
  workspace: Workspace,
  _checkStatus = true   // kept for backward compat; dirty checks always run now
): Promise<WorkspaceListInfo> {
  const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
  const trunkRepos = workspace.repos.filter((r) => r.mode === "trunk")

  // Always run dirty checks (dirty check is always on now per UX-04, checkStatus ignored)
  const results = await Promise.all(
    worktreeRepos
      .filter((repo) => existsSync(repo.task_path))
      .map(async (repo) => ({ name: repo.name, dirty: await isRepoDirty(repo.task_path) }))
  )
  const dirtyRepos: string[] = results.filter((r) => r.dirty).map((r) => r.name)
  const dirty: boolean = dirtyRepos.length > 0

  return {
    name: workspace.name,
    branch: workspace.branch,
    description: workspace.description ?? "",
    created: workspace.created,
    age: formatAge(workspace.created),
    lastOpened: formatAge(workspace.last_opened ?? workspace.created),
    dirty,
    dirtyRepos,
    worktreeCount: worktreeRepos.length,
    trunkCount: trunkRepos.length,
    repoCount: worktreeRepos.length + trunkRepos.length,
  }
}

export function mergeEnv(workspace: Workspace): Record<string, string> {
  const merged: Record<string, string> = {}
  if (workspace.env) Object.assign(merged, workspace.env)
  // Inject resolved ports as env vars (PORT-INJECT-01)
  if (workspace.ports) {
    for (const [key, value] of Object.entries(workspace.ports)) {
      if (typeof value === "number") {
        merged[key] = String(value)
      }
    }
  }
  return merged
}

export function buildBaseEnv(
  workspace: Workspace,
  tasksDir: string,
  triggeredBy: string
): Record<string, string> {
  return {
    GS_WORKSPACE_NAME: workspace.name,
    GS_WORKSPACE_BRANCH: workspace.branch,
    GS_WORKSPACE_PATH: tasksDir,
    GS_TRIGGERED_BY: triggeredBy,
    ...mergeEnv(workspace),
  }
}

export function buildRepoEnv(
  baseEnv: Record<string, string>,
  repo: { name: string; task_path: string; main_path: string }
): Record<string, string> {
  return {
    ...baseEnv,
    GS_REPO_NAME: repo.name,
    GS_REPO_PATH: repo.task_path,
    GS_REPO_CLONE_PATH: repo.main_path,
  }
}

export function writeEnvFiles(
  workspace: Workspace,
  mergedEnv: Record<string, string>,
  onWarn?: (msg: string) => void
): void {
  const envFileName = workspace.env_file
  if (!envFileName) return

  for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) continue

    // Per D-08/D-09: reject env_file paths that escape repo root
    const resolvedTarget = resolve(repo.task_path, envFileName)
    const resolvedRoot = resolve(repo.task_path)
    if (!resolvedTarget.startsWith(resolvedRoot + "/") && resolvedTarget !== resolvedRoot) {
      onWarn?.(`skipping env file write: '${envFileName}' resolves outside repo root '${repo.task_path}'`)
      continue
    }

    const targetPath = resolvedTarget

    // Guard: if the env file is a symlink, skip and warn — never write through a symlink
    try {
      const stat = lstatSync(targetPath)
      if (stat.isSymbolicLink()) {
        onWarn?.(`skipping env file write: ${targetPath} is a symlink`)
        continue
      }
    } catch {
      // targetPath does not exist yet — fall through to create it
    }

    let content: string
    if (existsSync(targetPath)) {
      // Merge: walk existing lines, update matching config keys in-place, preserve rest
      const existing = readFileSync(targetPath, "utf-8")
      const written = new Set<string>()
      const lines = existing.replace(/\n$/, "").split("\n").map(line => {
        const m = line.match(/^([^=\s#][^=]*)=(.*)$/)
        if (m && m[1] in mergedEnv) {
          written.add(m[1])
          return `${m[1]}=${mergedEnv[m[1]]}`
        }
        return line
      })
      // Append config keys not already in the file
      for (const [k, v] of Object.entries(mergedEnv)) {
        if (!written.has(k)) lines.push(`${k}=${v}`)
      }
      content = lines.join("\n") + "\n"
    } else {
      content = Object.entries(mergedEnv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
    }

    writeFileSync(targetPath, content, "utf-8")
  }
}

export type RepoStatus = {
  name: string
  exists: boolean
  dirty: boolean
  branch: string
  mode: "trunk" | "worktree"
}

export async function getDirtyWorktrees(workspace: Workspace): Promise<string[]> {
  const results = await Promise.all(
    workspace.repos
      .filter((r) => r.mode === "worktree" && existsSync(r.task_path))
      .map(async (repo) => ({ name: repo.name, dirty: await isRepoDirty(repo.task_path) }))
  )
  return results.filter((r) => r.dirty).map((r) => r.name)
}


export async function getWorkspaceStatus(workspace: Workspace): Promise<RepoStatus[]> {
  return Promise.all(
    workspace.repos.map(async (repo) => {
      const exists = existsSync(repo.task_path)
      const [dirty, branch] =
        exists && repo.mode === "worktree"
          ? await Promise.all([isRepoDirty(repo.task_path), getCurrentBranch(repo.task_path)])
          : [false, "—"]
      return { name: repo.name, exists, dirty, branch, mode: repo.mode }
    })
  )
}

async function _executeClean(
  workspace: Workspace,
  config: GlobalConfig,
  tasksDir: string,
  opts: { captured?: boolean; force?: boolean; deleteFolder?: boolean; triggeredBy: string },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  // Step 1: Call _executeClose (cascade: close before clean, per D-02)
  const closeResult = await _executeClose(workspace, config, tasksDir, {
    captured: opts.captured,
    triggeredBy: opts.triggeredBy,
  }, onProgress)
  if (!closeResult.ok) return closeResult  // D-03: abort on failure

  const baseEnv = buildBaseEnv(workspace, tasksDir, opts.triggeredBy)
  const wsDir = join(tasksDir, workspace.name)
  const hookCwd = existsSync(wsDir) ? wsDir : tasksDir

  // Step 2: Run workspace-level pre_clean hooks (D-05)
  if (workspace.hooks?.pre_clean?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.pre_clean, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.pre_clean, hookCwd, baseEnv)
      }
    } catch (err) {
      return { ok: false, error: `pre_clean hook failed (${err})` }
    }
  }

  // Step 3: Per-repo pre_clean + worktree removal (interleaved, D-08)
  const failures: string[] = []
  for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) {
      onProgress?.(`skip  ${repo.name} (already removed)`)
      continue
    }
    // Per-repo pre_clean hook fires immediately before this repo's worktree removal
    if (repo.hooks?.pre_clean?.length) {
      const repoEnv = buildRepoEnv(baseEnv, repo)
      try {
        if (opts.captured) {
          await runHooksCaptured(repo.hooks.pre_clean, repo.task_path, repoEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runHooks(repo.hooks.pre_clean, repo.task_path, repoEnv)
        }
      } catch (err) {
        return { ok: false, error: `pre_clean[${repo.name}] hook failed (${err})` }  // D-03: abort
      }
    }
    try {
      await removeWorktree(repo.main_path, repo.task_path)
      onProgress?.(`removed  ${repo.name}`)
    } catch (err) {
      failures.push(`${repo.name} (${err})`)
    }
  }

  if (failures.length > 0) {
    return { ok: false, error: `Could not clean worktrees:\n  ${failures.join("\n  ")}` }
  }

  // Step 4: Run workspace-level post_clean hooks (D-06)
  if (workspace.hooks?.post_clean?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.post_clean, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.post_clean, hookCwd, baseEnv)
      }
    } catch (err) {
      return { ok: false, error: `post_clean hook failed (${err})` }
    }
  }

  // Step 5: Delete workspace folder if requested (D-08)
  if (opts.deleteFolder) {
    const wsFolderDir = join(tasksDir, workspace.name)
    if (existsSync(wsFolderDir)) {
      rmSync(wsFolderDir, { recursive: true, force: true })
      onProgress?.(`deleted  tasks/${workspace.name}/`)
    }
  }

  return { ok: true }
}

export async function cleanWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean; captured?: boolean; deleteFolder?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(name)) {
    return { ok: false, error: `Workspace '${name}' not found.` }
  }

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const workspace = readWorkspace(name)

  if (!opts.force) {
    const dirty = await getDirtyWorktrees(workspace)
    if (dirty.length > 0) {
      return { ok: false, error: `Dirty worktrees: ${dirty.join(", ")}` }
    }
  }

  // External file warnings (FILES-17) — emitted in both dry-run and real runs
  const wsDir = join(tasksDir, workspace.name)
  const externalWarnings = warnExternalFiles(workspace, wsDir, tasksDir)
  for (const w of externalWarnings) {
    onProgress?.(w)
  }

  // Dry-run short-circuit — skip cascade, hooks, and worktree removal
  if (opts.dryRun) {
    onProgress?.("[dry-run] would close workspace (run pre_close, integration cleanup, post_close)")
    for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
      if (!existsSync(repo.task_path)) continue
      onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
    }
    if (opts.deleteFolder) {
      onProgress?.(`[dry-run] would delete folder: tasks/${name}/`)
    }
    onProgress?.("Dry run complete. No changes made.")
    return { ok: true }
  }

  return _executeClean(workspace, config, tasksDir, {
    captured: opts.captured,
    force: opts.force,
    deleteFolder: opts.deleteFolder,
    triggeredBy: "clean",
  }, onProgress)
}

async function _executeClose(
  workspace: Workspace,
  config: GlobalConfig,
  tasksDir: string,
  opts: { captured?: boolean; triggeredBy: string },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  const env = buildBaseEnv(workspace, tasksDir, opts.triggeredBy)
  const wsDir = join(tasksDir, workspace.name)
  const hookCwd = existsSync(wsDir) ? wsDir : tasksDir

  // Run pre_close hooks if present
  if (workspace.hooks?.pre_close?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.pre_close, hookCwd, env,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.pre_close, hookCwd, env)
      }
    } catch (err) {
      return { ok: false, error: `pre_close hook failed (${err})` }
    }
  }

  // Run integration cleanup (e.g., end tmux session, unname niri workspace)
  const ctx: IntegrationContext = { workspace, tasksDir, config }
  await runIntegrationCleanup(ctx)

  // Run post_close hooks if present
  if (workspace.hooks?.post_close?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.post_close, hookCwd, env,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.post_close, hookCwd, env)
      }
    } catch (err) {
      return { ok: false, error: `post_close hook failed (${err})` }
    }
  }

  onProgress?.(`Closed '${workspace.name}'.`)
  return { ok: true }
}

export async function closeWorkspace(
  name: string,
  opts: { captured?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(name)) {
    return { ok: false, error: `Workspace '${name}' not found.` }
  }
  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const workspace = readWorkspace(name)
  return _executeClose(workspace, config, tasksDir, { captured: opts.captured, triggeredBy: "close" }, onProgress)
}

export async function removeWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean; captured?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(name) && !existsSync(workspacePath(name))) {
    return { ok: false, error: `Workspace '${name}' not found.` }
  }

  // Try to parse workspace YAML — if malformed, --force allows name-based fallback (D-12)
  let workspace: ReturnType<typeof readWorkspace> | null = null
  try {
    workspace = readWorkspace(name)
  } catch (_parseErr) {
    if (!opts.force) {
      return {
        ok: false,
        error: `Cannot parse workspace YAML for '${name}'. Use --force to remove directory and config without worktree cleanup.`,
      }
    }
  }

  // Force fallback for malformed YAML: name-based directory removal only (D-12)
  if (workspace === null) {
    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const wsDir = join(tasksDir, name)
    if (existsSync(wsDir)) {
      rmSync(wsDir, { recursive: true, force: true })
      onProgress?.(`deleted  tasks/${name}/ (force)`)
    }
    unlinkSync(workspacePath(name))
    onProgress?.(`Workspace '${name}' force-removed (YAML was unparseable).`)
    return { ok: true }
  }

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)

  if (!opts.force) {
    const dirty = await getDirtyWorktrees(workspace)
    if (dirty.length > 0) {
      return { ok: false, error: `Dirty worktrees: ${dirty.join(", ")}` }
    }
  }

  // External file warnings (FILES-17)
  const wsDir = join(tasksDir, workspace.name)
  const externalWarnings = warnExternalFiles(workspace, wsDir, tasksDir)
  for (const w of externalWarnings) {
    onProgress?.(w)
  }

  // Dry-run short-circuit
  if (opts.dryRun) {
    onProgress?.("[dry-run] would close workspace (run pre_close, integration cleanup, post_close)")
    for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
      if (!existsSync(repo.task_path)) continue
      onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
    }
    onProgress?.(`[dry-run] would delete config: workspaces/${name}.yml`)
    onProgress?.("Dry run complete. No changes made.")
    return { ok: true }
  }

  // Step 1: Cascade through clean (which cascades through close) per D-02
  const cleanResult = await _executeClean(workspace, config, tasksDir, {
    captured: opts.captured,
    force: opts.force,
    deleteFolder: true,  // D-11: remove always deletes the folder
    triggeredBy: "remove",
  }, onProgress)
  if (!cleanResult.ok) return cleanResult  // D-03: abort on failure

  const baseEnv = buildBaseEnv(workspace, tasksDir, "remove")
  const hookCwd = existsSync(wsDir) ? wsDir : tasksDir

  // Step 2: Run pre_remove hooks
  if (workspace.hooks?.pre_remove?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.pre_remove, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.pre_remove, hookCwd, baseEnv)
      }
    } catch (err) {
      return { ok: false, error: `pre_remove hook failed (${err})` }
    }
  }

  // Step 3: Delete workspace YAML
  unlinkSync(workspacePath(name))

  // Step 4: Run post_remove hooks (D-06)
  if (workspace.hooks?.post_remove?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.post_remove, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.post_remove, hookCwd, baseEnv)
      }
    } catch (err) {
      // post_remove failure: YAML already deleted, log but don't fail
      onProgress?.(`post_remove hook error: ${err}`)
    }
  }

  onProgress?.(`Workspace '${name}' removed.`)
  return { ok: true }
}

export async function mergeWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean; captured?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(name)) {
    return { ok: false, error: `Workspace '${name}' not found.` }
  }

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")

  if (!opts.force) {
    const dirty = await getDirtyWorktrees(workspace)
    if (dirty.length > 0) {
      return { ok: false, error: `Dirty worktrees: ${dirty.join(", ")}` }
    }
  }

  // External file warnings (SAFE-01 completeness) — emitted in both dry-run and real runs
  const wsDir = join(tasksDir, workspace.name)
  const externalWarnings = warnExternalFiles(workspace, wsDir, tasksDir)
  for (const w of externalWarnings) {
    onProgress?.(w)
  }

  // Resolve base branches from workspace repo data (registry model)
  const repoBases = worktreeRepos.map((repo) => {
    const baseBranch = repo.base_branch ?? "main"
    return { repo, baseBranch }
  })

  // Conflict pre-check (runs in both dry-run and real — read-only)
  const conflicting: string[] = []
  for (const { repo, baseBranch } of repoBases) {
    const branchExists = await checkBranchExists(repo.main_path, workspace.branch)
    if (!branchExists) continue
    const conflicts = await getMergeConflicts(repo.main_path, baseBranch, workspace.branch)
    if (conflicts.length > 0) {
      conflicting.push(`${repo.name} (${conflicts.join(", ")})`)
    }
  }
  if (conflicting.length > 0) {
    return { ok: false, error: `Merge conflicts detected:\n  ${conflicting.join("\n  ")}` }
  }

  // Dry-run short-circuit — skip hooks, just describe what would happen
  if (opts.dryRun) {
    onProgress?.("[dry-run] would close workspace (run pre_close, integration cleanup, post_close)")
    for (const { repo, baseBranch } of repoBases) {
      onProgress?.(`[dry-run] would merge ${workspace.branch} into ${baseBranch} (${repo.name})`)
    }
    for (const repo of worktreeRepos) {
      if (existsSync(repo.task_path)) {
        onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
      }
      onProgress?.(`[dry-run] would delete branch: ${workspace.branch} (${repo.name})`)
    }
    onProgress?.(`[dry-run] would delete config: workspaces/${name}.yml`)
    onProgress?.("Dry run complete. No changes made.")
    return { ok: true }
  }

  // D-10 Steps 1-6: close cascade + clean cascade via _executeClean
  // _executeClean internally calls _executeClose, so the full order is:
  // pre_close -> integration cleanup -> post_close -> pre_clean -> per-repo pre_clean + worktree removal -> post_clean
  const cleanResult = await _executeClean(workspace, config, tasksDir, {
    captured: opts.captured,
    force: opts.force,
    deleteFolder: true,  // D-11/D-13: merge = total erasure, always delete folder
    triggeredBy: "merge",
  }, onProgress)
  if (!cleanResult.ok) return cleanResult

  const baseEnv = buildBaseEnv(workspace, tasksDir, "merge")
  const hookCwd = existsSync(wsDir) ? wsDir : tasksDir

  // D-10 Step 7: pre_merge hooks
  if (workspace.hooks?.pre_merge?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.pre_merge, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.pre_merge, hookCwd, baseEnv)
      }
    } catch (err) {
      return { ok: false, error: `pre_merge hook failed (${err})` }
    }
  }

  // D-10 Step 8: git merge + branch delete
  for (const { repo, baseBranch } of repoBases) {
    const branchExists = await checkBranchExists(repo.main_path, workspace.branch)
    if (!branchExists) {
      onProgress?.(`skip  ${repo.name} (branch '${workspace.branch}' not found)`)
      continue
    }
    const result = await mergeNoFF(repo.main_path, baseBranch, workspace.branch)
    if (!result.ok) {
      return { ok: false, error: `Merge failed for '${repo.name}' (${result.error})` }
    }
    onProgress?.(`merged  ${repo.name}  ->  ${baseBranch}`)
  }

  for (const { repo } of repoBases) {
    await deleteLocalBranch(repo.main_path, workspace.branch)
  }

  // D-10 Step 9: pre_remove hooks
  if (workspace.hooks?.pre_remove?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.pre_remove, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.pre_remove, hookCwd, baseEnv)
      }
    } catch (err) {
      return { ok: false, error: `pre_remove hook failed (${err})` }
    }
  }

  // D-10 Step 10: YAML delete
  unlinkSync(workspacePath(name))

  // D-10 Step 11: post_remove hooks
  if (workspace.hooks?.post_remove?.length) {
    try {
      if (opts.captured) {
        await runHooksCaptured(workspace.hooks.post_remove, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runHooks(workspace.hooks.post_remove, hookCwd, baseEnv)
      }
    } catch (err) {
      // post_remove failure: YAML already deleted, log but don't fail
      onProgress?.(`post_remove hook error: ${err}`)
    }
  }

  // D-10 Step 12: post_merge hooks (D-11: fires after post_remove)
  if (workspace.hooks?.post_merge?.length) {
    const mergeBaseEnv = {
      ...baseEnv,
      GS_MERGED_BRANCH: workspace.branch,
    }
    for (const cmd of workspace.hooks.post_merge) {
      onProgress?.(`post_merge: ${cmd}`)
      try {
        if (opts.captured) {
          await runHooksCaptured([cmd], hookCwd, mergeBaseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runHooks([cmd], hookCwd, mergeBaseEnv)
        }
      } catch (err) {
        onProgress?.(`post_merge hook error: ${err}`)
      }
    }
  }

  onProgress?.(`Merged and cleaned '${name}'.`)
  return { ok: true }
}

export async function openWorkspace(
  name: string,
  opts: { ide?: boolean; cmux?: boolean; captured?: boolean; reallocate?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(name)) {
    return { ok: false, error: `Workspace '${name}' not found.` }
  }

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const workspace = readWorkspace(name)

  // --- Port allocation (before buildBaseEnv) ---
  const portResult = allocatePorts(workspace, config, { reallocate: opts.reallocate ?? false })
  if (!portResult.ok) return { ok: false, error: portResult.error }

  // Use the potentially-updated workspace (ports resolved)
  const wsWithPorts = portResult.workspace
  if (portResult.changed) {
    writeWorkspace(wsWithPorts)
    onProgress?.(`Ports allocated: ${Object.entries(wsWithPorts.ports ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}`)
  }

  const execHooks = async (commands: string[] | undefined, cwd: string, env: Record<string, string>) => {
    if (opts.captured) {
      await runHooksCaptured(commands, cwd, env, (output) => onProgress?.(output.line))
    } else {
      await runHooks(commands, cwd, env)
    }
  }

  const skip = new Set<string>()
  if (opts.ide === false) {
    skip.add("vscode")
    skip.add("intellij")
  }
  if (opts.cmux === false) {
    skip.add("cmux")
  }

  // Recreate missing worktrees
  const missing = wsWithPorts.repos.filter(
    (r) => r.mode === "worktree" && !existsSync(r.task_path)
  )
  if (missing.length > 0) {
    let recreated = 0
    for (const repo of missing) {
      onProgress?.(`Recreating worktree: ${repo.name}`)
      try {
        await createWorktree(repo.main_path, repo.task_path, wsWithPorts.branch)
        recreated++
      } catch (err) {
        onProgress?.(`\u26A0 Failed to recreate worktree for '${repo.name}': ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (recreated > 0) onProgress?.(`${recreated} worktree(s) recreated`)
  }

  // Ensure upstream tracking for all worktree repos (parallel)
  const worktreeReposForTracking = wsWithPorts.repos.filter(
    (r) => r.mode === "worktree" && existsSync(r.task_path)
  )
  if (worktreeReposForTracking.length > 0) {
    const trackingResults = await Promise.all(
      worktreeReposForTracking.map(repo =>
        ensureUpstreamTracking(repo.main_path, wsWithPorts.branch)
      )
    )
    const tracked = trackingResults.filter(r => r.tracked)
    if (tracked.length > 0) {
      onProgress?.(`Upstream tracking set for ${tracked.length} repo(s)`)
    }
  }

  const baseEnv = buildBaseEnv(wsWithPorts, tasksDir, "open")

  if (wsWithPorts.hooks?.pre_open?.length) {
    for (const cmd of wsWithPorts.hooks.pre_open) {
      onProgress?.(`pre_open: ${cmd}`)
      await execHooks([cmd], join(tasksDir, name), baseEnv)
    }
  }

  const repoHooks = wsWithPorts.repos.filter((r) => r.hooks?.pre_open?.length)
  for (const repo of repoHooks) {
    const repoEnv = buildRepoEnv(baseEnv, repo)
    for (const cmd of repo.hooks!.pre_open!) {
      onProgress?.(`pre_open [${repo.name}]: ${cmd}`)
      await execHooks([cmd], repo.task_path, repoEnv)
    }
  }

  const wsDir = join(tasksDir, name)

  // Per-repo file ops — workspace repos carry their own files config
  for (const wsRepo of wsWithPorts.repos.filter(r => r.mode === "worktree")) {
    if (!wsRepo.files) continue
    // Construct a FileOpsRepoSource-compatible object for applyFileOpsForRepo
    const repoSource = {
      name: wsRepo.name,
      path: wsRepo.main_path,
      files: wsRepo.files,
    }
    const fileResult = applyFileOpsForRepo(repoSource, wsRepo)
    if (!fileResult.ok) {
      onProgress?.(`file-ops warning [${wsRepo.name}]: ${fileResult.error}`)
    } else if (fileResult.warnings) {
      for (const w of fileResult.warnings) onProgress?.(`file-ops: ${w}`)
    }
  }

  // Workspace-instance file ops
  if (wsWithPorts.files) {
    const wsFileResult = applyFileOpsForWorkspace({ files: wsWithPorts.files }, wsWithPorts, wsDir)
    if (!wsFileResult.ok) {
      onProgress?.(`file-ops warning [workspace]: ${wsFileResult.error}`)
    } else if (wsFileResult.warnings) {
      for (const w of wsFileResult.warnings) onProgress?.(`file-ops: ${w}`)
    }
  }

  // Write env files — after file ops, before integrations
  const mergedEnvVars = mergeEnv(wsWithPorts)
  writeEnvFiles(wsWithPorts, mergedEnvVars, msg => onProgress?.(msg))
  const hookEnv = { ...baseEnv, ...mergedEnvVars }

  // TMPL-04: Ensure trunk repos have their expected base branch accessible
  for (const repo of wsWithPorts.repos.filter(r => r.mode === "trunk")) {
    if (!existsSync(repo.task_path)) continue
    const currentBranch = await getCurrentBranch(repo.task_path)
    const expectedBranch = repo.base_branch ?? "main"
    if (currentBranch !== expectedBranch) {
      // Step 1: Try git checkout to the expected branch
      try {
        const checkoutResult = await $`git -C ${repo.task_path} checkout ${expectedBranch}`.quiet().nothrow()
        if (checkoutResult.exitCode === 0) {
          onProgress?.(`trunk repo '${repo.name}': checked out '${expectedBranch}' (was '${currentBranch}')`)
          continue
        }
      } catch { /* checkout failed, try worktree */ }

      // Step 2: If checkout fails (branch doesn't exist locally), create a worktree at that branch
      try {
        const worktreePath = join(tasksDir, wsWithPorts.name, `${repo.name}-${expectedBranch}`)
        await createWorktree(repo.main_path, worktreePath, expectedBranch)
        onProgress?.(`trunk repo '${repo.name}': created worktree at '${expectedBranch}' (checkout failed, branch may not exist locally)`)
      } catch (wtErr) {
        // Step 3: Both failed — warn and continue (graceful degradation)
        onProgress?.(`\u26A0 trunk repo '${repo.name}' is on '${currentBranch}', expected '${expectedBranch}' (checkout and worktree creation both failed: ${wtErr})`)
      }
    }
  }

  const ctx: IntegrationContext = { workspace: wsWithPorts, tasksDir, config, ...(opts.captured && { silent: true }) }
  await runIntegrations(ctx, skip)

  // Workspace-level post_open hooks (includes template hooks if copied at creation)
  if (wsWithPorts.hooks?.post_open?.length) {
    for (const cmd of wsWithPorts.hooks.post_open) {
      onProgress?.(`post_open: ${cmd}`)
      await execHooks([cmd], join(tasksDir, name), hookEnv)
    }
  }

  // Update last_opened timestamp
  const updatedWs = readWorkspace(name)
  updatedWs.last_opened = new Date().toISOString()
  writeWorkspace(updatedWs)

  onProgress?.(`Opened '${name}'.`)
  return { ok: true }
}

export async function renameWorkspace(
  oldName: string,
  newName: string,
  opts: { force?: boolean; dryRun?: boolean } = {},
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(oldName)) {
    return { ok: false, error: `Workspace '${oldName}' not found.` }
  }
  if (workspaceExists(newName)) {
    return { ok: false, error: `Workspace '${newName}' already exists.` }
  }

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const workspace = readWorkspace(oldName)

  // Re-register worktrees at new paths (BUG-03 fix: use git commands, not renameSync)
  const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")

  // Dry-run short-circuit — just describe what would happen
  if (opts.dryRun) {
    for (const repo of worktreeRepos) {
      const oldPath = repo.task_path
      const newPath = oldPath.replace(join(tasksDir, oldName), join(tasksDir, newName))
      if (existsSync(oldPath)) {
        onProgress?.(`[dry-run] would re-register worktree: ${oldPath} -> ${newPath} (${repo.name})`)
      }
    }
    onProgress?.(`[dry-run] would rename config: ${oldName}.yml -> ${newName}.yml`)
    onProgress?.("Dry run complete. No changes made.")
    return { ok: true }
  }

  for (const repo of worktreeRepos) {
    const oldWorktreePath = repo.task_path
    const newWorktreePath = oldWorktreePath.replace(
      join(tasksDir, oldName),
      join(tasksDir, newName)
    )

    if (existsSync(oldWorktreePath)) {
      await removeWorktree(repo.main_path, oldWorktreePath)
      await createWorktree(repo.main_path, newWorktreePath, workspace.branch)
      onProgress?.(`re-registered  ${repo.name}`)
    }
  }

  // Update workspace metadata
  workspace.name = newName
  for (const repo of workspace.repos) {
    if (repo.task_path.includes(join(tasksDir, oldName))) {
      repo.task_path = repo.task_path.replace(
        join(tasksDir, oldName),
        join(tasksDir, newName)
      )
    }
  }

  writeWorkspace(workspace)
  onProgress?.(`wrote  ${newName}.yml`)

  unlinkSync(workspacePath(oldName))
  onProgress?.(`deleted  ${oldName}.yml`)

  if (workspace.cmux_workspace_id) {
    onProgress?.(`⚠ cmux session name is stale — will update on next \`git-stacks open ${newName}\``)
  }

  return { ok: true }
}

export async function renameTemplate(
  oldName: string,
  newName: string,
  opts: { dryRun?: boolean } = {},
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!templateExists(oldName)) {
    return { ok: false, error: `Template '${oldName}' not found.` }
  }
  if (templateExists(newName)) {
    return { ok: false, error: `Template '${newName}' already exists.` }
  }

  const workspaces = listWorkspaces()
  const affectedWorkspaces = workspaces.filter((w) => w.template === oldName)

  if (opts.dryRun) {
    onProgress?.(`[dry-run] would rename template: ${oldName} -> ${newName}`)
    for (const ws of affectedWorkspaces) {
      onProgress?.(`[dry-run] would update workspace: ${ws.name} (template: ${oldName} -> ${newName})`)
    }
    onProgress?.("Dry run complete. No changes made.")
    return { ok: true }
  }

  // Step 1: Write new template file with updated name
  const tpl = readTemplate(oldName)
  tpl.name = newName
  writeTemplate(tpl)
  onProgress?.(`wrote  ${newName}.yml`)

  // Step 2: Cascade — update all workspaces referencing old template name
  // Done BEFORE deleting old file so state is recoverable on failure
  for (const ws of affectedWorkspaces) {
    ws.template = newName
    writeWorkspace(ws)
    onProgress?.(`updated workspace  ${ws.name}`)
  }

  // Step 3: Delete old template file
  if (existsSync(templatePath(oldName))) {
    unlinkSync(templatePath(oldName))
  }
  onProgress?.(`deleted  ${oldName}.yml`)

  return { ok: true }
}

export type SyncResult = {
  ok: boolean
  synced: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  error?: string
}

export type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed"
  detail: string
  conflicts: string[]
}

export async function syncWorkspace(
  name: string,
  opts: {
    strategy?: "rebase" | "merge"
    bestEffort?: boolean
  },
  onProgress?: (update: SyncRow) => void
): Promise<SyncResult> {
  if (!workspaceExists(name)) {
    return { ok: false, synced: [], skipped: [], error: `Workspace '${name}' not found.` }
  }

  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter(r => r.mode === "worktree")

  if (worktreeRepos.length === 0) {
    return { ok: true, synced: [], skipped: [] }
  }

  // Resolve base branches from workspace repo data (registry model)
  const repoInfos = worktreeRepos.map((repo) => {
    const baseBranch = repo.base_branch ?? "main"
    return { repo, baseBranch, strategy: opts.strategy ?? "rebase" }
  })

  // Fetch all repos in parallel — track failures instead of swallowing them
  const fetchFailures = new Map<string, string>()
  await Promise.all(
    repoInfos
      .filter(({ repo }) => existsSync(repo.task_path))
      .map(async ({ repo }) => {
        onProgress?.({ repo: repo.name, status: "fetching", detail: "", conflicts: [] })
        try {
          await fetchOrigin(repo.task_path)
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fetch failed"
          const detail = msg.includes("timeout") ? "fetch failed (timeout)" : "fetch failed"
          fetchFailures.set(repo.name, detail)
          onProgress?.({ repo: repo.name, status: "failed", detail, conflicts: [] })
        }
      })
  )

  // Dry-run conflict check in parallel
  const conflictResults = await Promise.all(
    repoInfos
      .filter(({ repo }) => existsSync(repo.task_path))
      .map(async ({ repo, baseBranch }) => ({
        repo: repo.name,
        files: await getMergeConflicts(repo.task_path, `origin/${baseBranch}`, workspace.branch),
      }))
  )
  const conflicts = conflictResults.filter((r) => r.files.length > 0)

  // In strict mode, abort if any conflicts
  if (!opts.bestEffort && conflicts.length > 0) {
    const detail = conflicts
      .map(c => `  ${c.repo} (${c.files.join(", ")})`)
      .join("\n")
    return {
      ok: false,
      synced: [],
      skipped: conflicts.map(c => ({ repo: c.repo, reason: `conflict in ${c.files.join(", ")}` })),
      error: `Conflicts detected:\n${detail}\n\nUse --best-effort to skip conflicting repos.`,
    }
  }

  const conflictRepos = new Set(conflicts.map(c => c.repo))
  const synced: SyncResult["synced"] = []
  const skipped: SyncResult["skipped"] = []

  for (const { repo, baseBranch, strategy } of repoInfos) {
    if (!existsSync(repo.task_path)) {
      skipped.push({ repo: repo.name, reason: "task_path missing" })
      continue
    }

    if (fetchFailures.has(repo.name)) {
      skipped.push({ repo: repo.name, reason: fetchFailures.get(repo.name)! })
      onProgress?.({ repo: repo.name, status: "failed", detail: fetchFailures.get(repo.name)!, conflicts: [] })
      continue
    }

    if (conflictRepos.has(repo.name)) {
      const c = conflicts.find(c => c.repo === repo.name)!
      skipped.push({ repo: repo.name, reason: `conflict in ${c.files.join(", ")}` })
      onProgress?.({ repo: repo.name, status: "skipped", detail: `conflict: ${c.files[0]}`, conflicts: c.files.slice(1) })
      continue
    }

    const commitsBefore = await getCommitsBehind(repo.task_path, `origin/${baseBranch}`, "HEAD")

    onProgress?.({ repo: repo.name, status: "rebasing", detail: "", conflicts: [] })

    let result: { ok: boolean; error?: string }
    if (strategy === "merge") {
      result = await mergeBranchFF(repo.task_path, `origin/${baseBranch}`)
    } else {
      result = await rebaseBranch(repo.task_path, `origin/${baseBranch}`)
    }

    if (!result.ok) {
      skipped.push({ repo: repo.name, reason: result.error ?? "sync failed" })
      onProgress?.({ repo: repo.name, status: "failed", detail: result.error ?? "sync failed", conflicts: [] })
      continue
    }

    synced.push({ repo: repo.name, commits: commitsBefore })
    onProgress?.({ repo: repo.name, status: "synced", detail: `+${commitsBefore} commits`, conflicts: [] })
  }

  return { ok: skipped.length === 0 || opts.bestEffort === true, synced, skipped }
}

// --- Pull types ---

export type PullRow = {
  repo: string
  status: "pending" | "fetching" | "pulling" | "pulled" | "skipped" | "failed"
  detail: string
}

export type PullResult = {
  ok: boolean
  pulled: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  failed: Array<{ repo: string; reason: string }>
  error?: string
}

export async function pullWorkspace(
  nameOrWorkspace: string | Workspace,
  onProgress?: (update: PullRow) => void
): Promise<PullResult> {
  let workspace: Workspace
  if (typeof nameOrWorkspace === "string") {
    if (!workspaceExists(nameOrWorkspace)) {
      return { ok: false, pulled: [], skipped: [], failed: [], error: `Workspace '${nameOrWorkspace}' not found.` }
    }
    workspace = readWorkspace(nameOrWorkspace)
  } else {
    workspace = nameOrWorkspace
  }

  const repos = workspace.repos

  if (repos.length === 0) {
    return { ok: true, pulled: [], skipped: [], failed: [] }
  }

  // Phase 1: Parallel fetch, deduplicated by main_path
  const fetchGroups = new Map<string, typeof repos>()
  for (const repo of repos) {
    const key = repo.main_path
    if (!fetchGroups.has(key)) fetchGroups.set(key, [])
    fetchGroups.get(key)!.push(repo)
  }

  const fetchFailures = new Map<string, string>()
  await Promise.all(
    Array.from(fetchGroups.entries()).map(async ([mainPath, groupRepos]) => {
      for (const r of groupRepos) {
        onProgress?.({ repo: r.name, status: "fetching", detail: "" })
      }
      try {
        await fetchOrigin(mainPath)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "fetch failed"
        const detail = msg.includes("timeout") ? "fetch failed (timeout)" : "fetch failed"
        for (const r of groupRepos) {
          fetchFailures.set(r.name, detail)
          onProgress?.({ repo: r.name, status: "failed", detail })
        }
      }
    })
  )

  // Phase 2: Sequential pull per repo
  const pulled: PullResult["pulled"] = []
  const skipped: PullResult["skipped"] = []
  const failed: PullResult["failed"] = []

  for (const repo of repos) {
    const repoPath = repo.mode === "worktree" ? repo.task_path : repo.main_path
    const pullBranch = repo.mode === "worktree"
      ? workspace.branch
      : (repo.base_branch ?? "main")

    if (!existsSync(repoPath)) {
      skipped.push({ repo: repo.name, reason: "path missing" })
      onProgress?.({ repo: repo.name, status: "skipped", detail: "path missing" })
      continue
    }

    if (fetchFailures.has(repo.name)) {
      failed.push({ repo: repo.name, reason: fetchFailures.get(repo.name)! })
      onProgress?.({ repo: repo.name, status: "failed", detail: fetchFailures.get(repo.name)! })
      continue
    }

    if (await isRepoDirty(repoPath)) {
      skipped.push({ repo: repo.name, reason: "dirty" })
      onProgress?.({ repo: repo.name, status: "skipped", detail: "dirty" })
      continue
    }

    onProgress?.({ repo: repo.name, status: "pulling", detail: "" })
    const pullResult = await pullFFOnly(repoPath, pullBranch)

    if (!pullResult.ok) {
      failed.push({ repo: repo.name, reason: pullResult.reason })
      onProgress?.({ repo: repo.name, status: "failed", detail: pullResult.reason })
      continue
    }

    const detail = pullResult.commits === 0
      ? "already up to date"
      : `${pullResult.commits} commit${pullResult.commits === 1 ? "" : "s"}`
    pulled.push({ repo: repo.name, commits: pullResult.commits })
    onProgress?.({ repo: repo.name, status: "pulled", detail })
  }

  return {
    ok: skipped.length === 0 && failed.length === 0,
    pulled,
    skipped,
    failed,
  }
}

export function editWorkspaceYaml(name: string): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  const path = workspacePath(name)
  return {
    path,
    validate: () => {
      try {
        const raw = readFileSync(path, "utf-8")
        WorkspaceSchema.parse(parse(raw))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  }
}

export async function openYamlInEditor(
  path: string,
  validate: () => { ok: boolean; error?: string }
): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi"
  const proc = Bun.spawn([editor, path], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  const result = validate()
  if (!result.ok) {
    console.error(`\nWarning: file has validation errors:\n${result.error}`)
  }
}

export function editTemplateYaml(name: string): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  const path = templatePath(name)
  return {
    path,
    validate: () => {
      try {
        const raw = readFileSync(path, "utf-8")
        TemplateSchema.parse(parse(raw))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  }
}

export function editGlobalConfigYaml(): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  const path = GLOBAL_CONFIG_FILE
  return {
    path,
    validate: () => {
      try {
        const raw = readFileSync(path, "utf-8")
        GlobalConfigSchema.parse(parse(raw))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  }
}

export function editRegistryYaml(): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  const path = REGISTRY_FILE
  return {
    path,
    validate: () => {
      try {
        const raw = readFileSync(path, "utf-8")
        RepoRegistrySchema.parse(parse(raw))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  }
}

// --- CWD-based workspace detection ---

export type CwdDetectionResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: "no_match" }

/**
 * Detect the current workspace by matching the working directory against
 * stored worktree task_path values. Only worktree-mode repos are considered
 * (trunk repos share a single clone path across workspaces).
 *
 * @param cwd - Directory to match against (defaults to process.cwd())
 * @returns The workspace whose worktree task_path contains cwd, or no_match
 */
export function detectWorkspaceFromCwd(cwd?: string): CwdDetectionResult {
  const currentDir = cwd ?? process.cwd()
  const workspaces = listWorkspaces()

  let bestMatch: Workspace | null = null
  let bestPathLen = 0

  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      if (repo.mode !== "worktree") continue
      const resolvedTaskPath = resolve(expandHome(repo.task_path))
      // Match CWD exactly OR as a subdirectory (trailing separator prevents prefix collisions)
      if (
        currentDir === resolvedTaskPath ||
        currentDir.startsWith(resolvedTaskPath + "/")
      ) {
        if (resolvedTaskPath.length > bestPathLen) {
          bestMatch = ws
          bestPathLen = resolvedTaskPath.length
        }
      }
    }
  }

  if (!bestMatch) return { ok: false, error: "no_match" }
  return { ok: true, workspace: bestMatch }
}
