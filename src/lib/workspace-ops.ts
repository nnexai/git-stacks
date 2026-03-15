import { existsSync, unlinkSync, readFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"
import {
  readWorkspace,
  readStack,
  workspaceExists,
  workspacePath,
  readGlobalConfig,
  WorkspaceSchema,
  type Workspace,
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
} from "./git"
import { integrations, type IntegrationContext } from "./integrations"
import { runHooks } from "./lifecycle"

export type ProgressCallback = (message: string) => void

export type RepoStatus = {
  name: string
  exists: boolean
  dirty: boolean
  branch: string
  mode: "trunk" | "worktree"
}

export async function getDirtyWorktrees(workspace: Workspace): Promise<string[]> {
  const dirty: string[] = []
  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) continue
    if (await isRepoDirty(repo.task_path)) dirty.push(repo.name)
  }
  return dirty
}

export async function runPreRemoveHooks(workspace: Workspace, tasksDir: string): Promise<void> {
  const baseEnv = {
    WS_WORKSPACE: workspace.name,
    WS_BRANCH: workspace.branch,
    WS_TASKS_DIR: tasksDir,
  }

  const stackNames = [...new Set(workspace.repos.map((r) => r.stack))]
  const stacksByName = new Map<string, ReturnType<typeof readStack>>()
  for (const name of stackNames) {
    try {
      stacksByName.set(name, readStack(name))
    } catch {
      // stack deleted or missing, skip its hooks
    }
  }

  for (const [stackName, stack] of stacksByName) {
    if (!stack.hooks?.pre_remove?.length) continue
    const wsDir = join(tasksDir, workspace.name)
    await runHooks(stack.hooks.pre_remove, wsDir, { ...baseEnv, WS_STACK: stackName })
  }

  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    const stack = stacksByName.get(repo.stack)
    if (!stack) continue
    const stackRepo = stack.repos.find((r) => r.name === repo.name)
    if (!stackRepo?.hooks?.pre_remove?.length) continue
    const cwd = existsSync(repo.task_path) ? repo.task_path : repo.main_path
    await runHooks(stackRepo.hooks.pre_remove, cwd, {
      ...baseEnv,
      WS_STACK: repo.stack,
      WS_REPO_NAME: repo.name,
      WS_REPO_PATH: repo.task_path,
      WS_MAIN_PATH: repo.main_path,
    })
  }
}

export async function getWorkspaceStatus(workspace: Workspace): Promise<RepoStatus[]> {
  const results: RepoStatus[] = []
  for (const repo of workspace.repos) {
    const exists = existsSync(repo.task_path)
    const dirty = exists && repo.mode === "worktree" ? await isRepoDirty(repo.task_path) : false
    const branch = exists && repo.mode === "worktree" ? await getCurrentBranch(repo.task_path) : "—"
    results.push({ name: repo.name, exists, dirty, branch, mode: repo.mode })
  }
  return results
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

  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) {
      onProgress?.(`skip  ${repo.name} (already removed)`)
      continue
    }
    await removeWorktree(repo.main_path, repo.task_path)
    onProgress?.(`removed  ${repo.name}`)
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

  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) continue
    await removeWorktree(repo.main_path, repo.task_path)
    onProgress?.(`removed  ${repo.name}`)
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
  const repoBases: { repo: (typeof worktreeRepos)[number]; baseBranch: string }[] = []
  for (const repo of worktreeRepos) {
    let baseBranch = "main"
    try {
      const stack = readStack(repo.stack)
      baseBranch = stack.repos.find((r) => r.name === repo.name)?.default_branch ?? "main"
    } catch {
      // stack missing
    }
    repoBases.push({ repo, baseBranch })
  }

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

  // Merge
  for (const { repo, baseBranch } of repoBases) {
    const branchExists = await checkBranchExists(repo.main_path, workspace.branch)
    if (!branchExists) {
      onProgress?.(`skip  ${repo.name} (branch '${workspace.branch}' not found)`)
      continue
    }
    await mergeNoFF(repo.main_path, baseBranch, workspace.branch)
    onProgress?.(`merged  ${repo.name}  →  ${baseBranch}`)
  }

  try {
    await runPreRemoveHooks(workspace, tasksDir)
  } catch (err) {
    return { ok: false, error: `pre_remove hook failed: ${err}` }
  }

  for (const repo of worktreeRepos) {
    if (!existsSync(repo.task_path)) continue
    await removeWorktree(repo.main_path, repo.task_path)
  }

  for (const { repo } of repoBases) {
    await deleteLocalBranch(repo.main_path, workspace.branch)
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

  const ctx: IntegrationContext = { workspace, tasksDir, config }

  for (const integration of integrations) {
    if (skip.has(integration.id)) continue
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(workspace)) continue
    const artifactPath = integration.generate?.(ctx) ?? null
    await integration.open(ctx, artifactPath)
  }

  onProgress?.(`Opened '${name}'.`)
  return { ok: true }
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
