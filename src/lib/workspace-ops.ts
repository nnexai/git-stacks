import { existsSync, unlinkSync, readFileSync, writeFileSync, lstatSync } from "fs"
import { join } from "path"
import { parse } from "yaml"
import {
  readWorkspace,
  writeWorkspace,
  readStack,
  workspaceExists,
  workspacePath,
  readGlobalConfig,
  WorkspaceSchema,
  type Workspace,
  type Stack,
} from "./config"
import { getTasksDir } from "./paths"
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
  rebaseBranch,
  mergeBranchFF,
  getCommitsBehind,
} from "./git"
import { integrations, type IntegrationContext } from "./integrations"
import { runHooks } from "./lifecycle"
import { applyFileOpsForRepo, applyFileOpsForWorkspace } from "./files"

export type ProgressCallback = (message: string) => void

export type WorkspaceListInfo = {
  name: string
  branch: string
  description: string
  created: string
  age: string // human-readable: "2h", "3d", "1w", "2mo", "1y"
  dirty: boolean | null // null = not checked
  dirtyRepos: string[] // names of dirty repos (empty if not checked)
  worktreeCount: number
  trunkCount: number
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
  checkStatus: boolean
): Promise<WorkspaceListInfo> {
  const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
  const trunkRepos = workspace.repos.filter((r) => r.mode === "trunk")

  let dirty: boolean | null = null
  const dirtyRepos: string[] = []

  if (checkStatus) {
    const results = await Promise.all(
      worktreeRepos
        .filter((repo) => existsSync(repo.task_path))
        .map(async (repo) => ({ name: repo.name, dirty: await isRepoDirty(repo.task_path) }))
    )
    dirtyRepos.push(...results.filter((r) => r.dirty).map((r) => r.name))
    dirty = dirtyRepos.length > 0
  }

  return {
    name: workspace.name,
    branch: workspace.branch,
    description: workspace.description ?? "",
    created: workspace.created,
    age: formatAge(workspace.created),
    dirty,
    dirtyRepos,
    worktreeCount: worktreeRepos.length,
    trunkCount: trunkRepos.length,
  }
}

function loadWorkspaceStacks(workspace: Workspace): Map<string, Stack> {
  const stackNames = [...new Set(workspace.repos.map(r => r.stack))]
  const stacks = new Map<string, Stack>()
  for (const name of stackNames) {
    try { stacks.set(name, readStack(name)) } catch { /* stack deleted */ }
  }
  return stacks
}

export function mergeEnv(
  workspace: Workspace,
  stacks: Map<string, Stack>
): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const repo of workspace.repos) {
    const stack = stacks.get(repo.stack)
    if (stack?.env) Object.assign(merged, stack.env)
  }
  if (workspace.env) Object.assign(merged, workspace.env)
  return merged
}

export function writeEnvFiles(
  workspace: Workspace,
  stacks: Map<string, Stack>,
  mergedEnv: Record<string, string>,
  onWarn?: (msg: string) => void
): void {
  const envFileName = workspace.env_file
    ?? [...stacks.values()].find(s => s.env_file)?.env_file
  if (!envFileName) return

  for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) continue
    const targetPath = join(repo.task_path, envFileName)

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

export async function runPreRemoveHooks(workspace: Workspace, tasksDir: string): Promise<void> {
  const baseEnv = {
    WS_WORKSPACE: workspace.name,
    WS_BRANCH: workspace.branch,
    WS_TASKS_DIR: tasksDir,
  }

  const stacksByName = loadWorkspaceStacks(workspace)

  // Compute merged env for hook enrichment
  const mergedEnvVars = mergeEnv(workspace, stacksByName)
  const enrichedBaseEnv = { ...baseEnv, ...mergedEnvVars }

  for (const [stackName, stack] of stacksByName) {
    if (!stack.hooks?.pre_remove?.length) continue
    const wsDir = join(tasksDir, workspace.name)
    await runHooks(stack.hooks.pre_remove, wsDir, { ...enrichedBaseEnv, WS_STACK: stackName })
  }

  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    const stack = stacksByName.get(repo.stack)
    if (!stack) continue
    const stackRepo = stack.repos.find((r) => r.name === repo.name)
    if (!stackRepo?.hooks?.pre_remove?.length) continue
    const cwd = existsSync(repo.task_path) ? repo.task_path : repo.main_path
    await runHooks(stackRepo.hooks.pre_remove, cwd, {
      ...enrichedBaseEnv,
      WS_STACK: repo.stack,
      WS_REPO_NAME: repo.name,
      WS_REPO_PATH: repo.task_path,
      WS_MAIN_PATH: repo.main_path,
    })
  }
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

export async function cleanWorkspace(
  name: string,
  opts: { force?: boolean },
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

  try {
    await runPreRemoveHooks(workspace, tasksDir)
  } catch (err) {
    return { ok: false, error: `pre_remove hook failed: ${err}` }
  }

  // Stage: attempt all worktree removals, collect failures (BUG-02 fix)
  const failures: string[] = []
  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) {
      onProgress?.(`skip  ${repo.name} (already removed)`)
      continue
    }
    try {
      await removeWorktree(repo.main_path, repo.task_path)
      onProgress?.(`removed  ${repo.name}`)
    } catch (err) {
      failures.push(`${repo.name}: ${err}`)
    }
  }

  if (failures.length > 0) {
    return { ok: false, error: `Failed to clean worktrees:\n  ${failures.join("\n  ")}` }
  }

  return { ok: true }
}

export async function removeWorkspace(
  name: string,
  opts: { force?: boolean },
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

  try {
    await runPreRemoveHooks(workspace, tasksDir)
  } catch (err) {
    return { ok: false, error: `pre_remove hook failed: ${err}` }
  }

  // Stage: attempt all worktree removals, collect failures (BUG-02 fix)
  const failures: string[] = []
  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) continue
    try {
      await removeWorktree(repo.main_path, repo.task_path)
      onProgress?.(`removed  ${repo.name}`)
    } catch (err) {
      failures.push(`${repo.name}: ${err}`)
    }
  }

  // Commit: only delete YAML if all removals succeeded
  if (failures.length > 0) {
    return { ok: false, error: `Failed to remove worktrees:\n  ${failures.join("\n  ")}` }
  }

  unlinkSync(workspacePath(name))
  onProgress?.(`Workspace '${name}' removed.`)

  return { ok: true }
}

export async function mergeWorkspace(
  name: string,
  opts: { force?: boolean },
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

  // Resolve base branches
  const stacks = loadWorkspaceStacks(workspace)
  const repoBases = worktreeRepos.map((repo) => {
    const stack = stacks.get(repo.stack)
    const baseBranch = stack?.repos.find((r) => r.name === repo.name)?.default_branch ?? "main"
    return { repo, baseBranch }
  })

  // Conflict pre-check
  const conflicting: string[] = []
  for (const { repo, baseBranch } of repoBases) {
    const branchExists = await checkBranchExists(repo.main_path, workspace.branch)
    if (!branchExists) continue
    const conflicts = await getMergeConflicts(repo.main_path, baseBranch, workspace.branch)
    if (conflicts.length > 0) {
      conflicting.push(`${repo.name}: ${conflicts.join(", ")}`)
    }
  }
  if (conflicting.length > 0) {
    return { ok: false, error: `Merge conflicts:\n  ${conflicting.join("\n  ")}` }
  }

  try {
    await runPreRemoveHooks(workspace, tasksDir)
  } catch (err) {
    return { ok: false, error: `pre_remove hook failed: ${err}` }
  }

  // Merge (BUG-01 fix: check result and return early on failure -- YAML preserved)
  for (const { repo, baseBranch } of repoBases) {
    const branchExists = await checkBranchExists(repo.main_path, workspace.branch)
    if (!branchExists) {
      onProgress?.(`skip  ${repo.name} (branch '${workspace.branch}' not found)`)
      continue
    }
    const result = await mergeNoFF(repo.main_path, baseBranch, workspace.branch)
    if (!result.ok) {
      return { ok: false, error: `Merge failed for ${repo.name}: ${result.error}` }
    }
    onProgress?.(`merged  ${repo.name}  →  ${baseBranch}`)
  }

  for (const repo of worktreeRepos) {
    if (!existsSync(repo.task_path)) continue
    await removeWorktree(repo.main_path, repo.task_path)
  }

  for (const { repo } of repoBases) {
    await deleteLocalBranch(repo.main_path, workspace.branch)
  }

  const mergedMergeEnv = mergeEnv(workspace, stacks)

  unlinkSync(workspacePath(name))

  // Run post_merge hooks
  if (workspace.hooks?.post_merge?.length) {
    const mergeBaseEnv = {
      WS_WORKSPACE: workspace.name,
      WS_BRANCH: workspace.branch,
      WS_TASKS_DIR: tasksDir,
      WS_MERGED_BRANCH: workspace.branch,
      ...mergedMergeEnv,
    }
    const wsDir = join(tasksDir, name)
    for (const cmd of workspace.hooks.post_merge) {
      onProgress?.(`post_merge: ${cmd}`)
      await runHooks([cmd], existsSync(wsDir) ? wsDir : tasksDir, mergeBaseEnv)
    }
  }

  onProgress?.(`Merged and cleaned '${name}'.`)
  return { ok: true }
}

export async function openWorkspace(
  name: string,
  opts: { ide?: boolean; cmux?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(name)) {
    return { ok: false, error: `Workspace '${name}' not found.` }
  }

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const workspace = readWorkspace(name)

  const skip = new Set<string>()
  if (opts.ide === false) {
    skip.add("vscode")
    skip.add("intellij")
  }
  if (opts.cmux === false) {
    skip.add("cmux")
  }

  // Recreate missing worktrees
  const missing = workspace.repos.filter(
    (r) => r.mode === "worktree" && !existsSync(r.task_path)
  )
  if (missing.length > 0) {
    for (const repo of missing) {
      onProgress?.(`Recreating worktree: ${repo.name}`)
      await createWorktree(repo.main_path, repo.task_path, workspace.branch)
    }
    onProgress?.(`${missing.length} worktree(s) recreated`)
  }

  const baseEnv = {
    WS_WORKSPACE: workspace.name,
    WS_BRANCH: workspace.branch,
    WS_TASKS_DIR: tasksDir,
  }

  if (workspace.hooks?.pre_open?.length) {
    for (const cmd of workspace.hooks.pre_open) {
      onProgress?.(`pre_open: ${cmd}`)
      await runHooks([cmd], join(tasksDir, name), baseEnv)
    }
  }

  const repoHooks = workspace.repos.filter((r) => r.hooks?.pre_open?.length)
  for (const repo of repoHooks) {
    const repoEnv = {
      ...baseEnv,
      WS_REPO_NAME: repo.name,
      WS_REPO_PATH: repo.task_path,
      WS_MAIN_PATH: repo.main_path,
    }
    for (const cmd of repo.hooks!.pre_open!) {
      onProgress?.(`pre_open [${repo.name}]: ${cmd}`)
      await runHooks([cmd], repo.task_path, repoEnv)
    }
  }

  const wsDir = join(tasksDir, name)
  const stacks = loadWorkspaceStacks(workspace)

  // Per-repo file ops (Level 2) — idempotent: dst exists → skip
  for (const wsRepo of workspace.repos.filter(r => r.mode === "worktree")) {
    const stack = stacks.get(wsRepo.stack)
    if (!stack) continue
    const stackRepo = stack.repos.find(r => r.name === wsRepo.name)
    if (!stackRepo) continue
    const fileResult = applyFileOpsForRepo(stackRepo, wsRepo)
    if (!fileResult.ok) {
      onProgress?.(`file-ops warning [${wsRepo.name}]: ${fileResult.error}`)
    } else if (fileResult.warnings) {
      for (const w of fileResult.warnings) onProgress?.(`file-ops: ${w}`)
    }
  }

  // Workspace-instance file ops (Level 1) — idempotent: dst exists → skip
  for (const [, stack] of stacks) {
    const wsFileResult = applyFileOpsForWorkspace(stack, workspace, wsDir)
    if (!wsFileResult.ok) {
      onProgress?.(`file-ops warning [workspace]: ${wsFileResult.error}`)
    } else if (wsFileResult.warnings) {
      for (const w of wsFileResult.warnings) onProgress?.(`file-ops: ${w}`)
    }
  }

  // Write env files — after file ops, before integrations
  const mergedEnvVars = mergeEnv(workspace, stacks)
  writeEnvFiles(workspace, stacks, mergedEnvVars, msg => onProgress?.(msg))
  const hookEnv = { ...baseEnv, ...mergedEnvVars }

  const ctx: IntegrationContext = { workspace, tasksDir, config }

  for (const integration of integrations) {
    if (skip.has(integration.id)) continue
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(workspace)) continue
    const artifactPath = integration.generate?.(ctx) ?? null
    await integration.open(ctx, artifactPath)
  }

  // Workspace-level post_open
  if (workspace.hooks?.post_open?.length) {
    for (const cmd of workspace.hooks.post_open) {
      onProgress?.(`post_open: ${cmd}`)
      await runHooks([cmd], join(tasksDir, name), hookEnv)
    }
  }

  // Stack-level post_open
  for (const [stackName, stack] of stacks) {
    if (!stack.hooks?.post_open?.length) continue
    await runHooks(stack.hooks.post_open, join(tasksDir, name), { ...hookEnv, WS_STACK: stackName })
  }

  onProgress?.(`Opened '${name}'.`)
  return { ok: true }
}

export async function renameWorkspace(
  oldName: string,
  newName: string,
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
    onProgress?.(`⚠ cmux session name is stale — will update on next \`ws open ${newName}\``)
  }

  return { ok: true }
}

export type SyncResult = {
  ok: boolean
  synced: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  error?: string
}

export async function syncWorkspace(
  name: string,
  opts: {
    strategy?: "rebase" | "merge"
    bestEffort?: boolean
  },
  onProgress?: ProgressCallback
): Promise<SyncResult> {
  if (!workspaceExists(name)) {
    return { ok: false, synced: [], skipped: [], error: `Workspace '${name}' not found.` }
  }

  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter(r => r.mode === "worktree")

  if (worktreeRepos.length === 0) {
    return { ok: true, synced: [], skipped: [] }
  }

  // Resolve base branches and strategies from stacks (single read per stack)
  const stacks = loadWorkspaceStacks(workspace)
  const repoInfos = worktreeRepos.map((repo) => {
    const stackRepo = stacks.get(repo.stack)?.repos.find((r) => r.name === repo.name)
    const baseBranch = stackRepo?.default_branch ?? "main"
    const stackStrategy = stackRepo?.sync_strategy as "rebase" | "merge" | undefined
    return { repo, baseBranch, strategy: opts.strategy ?? stackStrategy ?? "rebase" }
  })

  // Fetch all repos in parallel
  onProgress?.("Fetching from origin...")
  await Promise.all(
    repoInfos
      .filter(({ repo }) => existsSync(repo.task_path))
      .map(({ repo }) => fetchOrigin(repo.task_path).catch(() => {}))
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
      .map(c => `  ${c.repo}: ${c.files.join(", ")}`)
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

    if (conflictRepos.has(repo.name)) {
      const c = conflicts.find(c => c.repo === repo.name)!
      skipped.push({ repo: repo.name, reason: `conflict in ${c.files.join(", ")}` })
      onProgress?.(`skipped  ${repo.name}  conflict in ${c.files.join(", ")}`)
      continue
    }

    const commitsBefore = await getCommitsBehind(repo.task_path, `origin/${baseBranch}`, "HEAD")

    let result: { ok: boolean; error?: string }
    if (strategy === "merge") {
      result = await mergeBranchFF(repo.task_path, `origin/${baseBranch}`)
    } else {
      result = await rebaseBranch(repo.task_path, `origin/${baseBranch}`)
    }

    if (!result.ok) {
      skipped.push({ repo: repo.name, reason: result.error ?? "sync failed" })
      onProgress?.(`failed  ${repo.name}  ${result.error}`)
      continue
    }

    synced.push({ repo: repo.name, commits: commitsBefore })
    onProgress?.(`synced  ${repo.name}  ${baseBranch} → ${workspace.branch}  (+${commitsBefore} commits)`)
  }

  return { ok: skipped.length === 0 || opts.bestEffort === true, synced, skipped }
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
