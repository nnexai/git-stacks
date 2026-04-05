import { existsSync, rmSync, unlinkSync } from "fs"
import { join } from "path"
import {
  isWorktreeRepo,
  readGlobalConfig,
  readWorkspace,
  workspaceExists,
  workspacePath,
  type GlobalConfig,
  type Workspace,
} from "./config"
import { removeWorktree, checkBranchExists, getMergeConflicts, mergeNoFF, deleteLocalBranch } from "./git"
import { type IntegrationContext } from "./integrations"
import { runIntegrationCleanup } from "./integrations/runner"
import { runHooks, runHooksCaptured } from "./lifecycle"
import { warnExternalFiles } from "./files"
import { timeOperation } from "./observability"
import { getTasksDir } from "./paths"
import { buildBaseEnv, buildRepoEnv } from "./workspace-env"
import { getDirtyWorktrees } from "./workspace-status"

const OBS_CATEGORY = "workspace-lifecycle"

type ProgressCallback = (message: string) => void

async function _executeClean(
  workspace: Workspace,
  config: GlobalConfig,
  tasksDir: string,
  opts: { captured?: boolean; force?: boolean; deleteFolder?: boolean; triggeredBy: string },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  const closeResult = await _executeClose(workspace, config, tasksDir, {
    captured: opts.captured,
    triggeredBy: opts.triggeredBy,
  }, onProgress)
  if (!closeResult.ok) return closeResult

  const baseEnv = buildBaseEnv(workspace, tasksDir, opts.triggeredBy)
  const wsDir = join(tasksDir, workspace.name)
  const hookCwd = existsSync(wsDir) ? wsDir : tasksDir

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

  const failures: string[] = []
  for (const repo of workspace.repos.filter(isWorktreeRepo)) {
    if (!existsSync(repo.task_path)) {
      onProgress?.(`skip  ${repo.name} (already removed)`)
      continue
    }
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
        return { ok: false, error: `pre_clean[${repo.name}] hook failed (${err})` }
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
  return timeOperation(OBS_CATEGORY, "cleanWorkspace", async () => {
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

    const wsDir = join(tasksDir, workspace.name)
    const externalWarnings = warnExternalFiles(workspace, wsDir, tasksDir)
    for (const w of externalWarnings) {
      onProgress?.(w)
    }

    if (opts.dryRun) {
      onProgress?.("[dry-run] would close workspace (run pre_close, integration cleanup, post_close)")
      for (const repo of workspace.repos.filter(isWorktreeRepo)) {
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
  })
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

  const ctx: IntegrationContext = { workspace, tasksDir, config }
  await runIntegrationCleanup(ctx)

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
  return timeOperation(OBS_CATEGORY, "closeWorkspace", async () => {
    if (!workspaceExists(name)) {
      return { ok: false, error: `Workspace '${name}' not found.` }
    }
    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const workspace = readWorkspace(name)
    return _executeClose(workspace, config, tasksDir, { captured: opts.captured, triggeredBy: "close" }, onProgress)
  })
}

export async function removeWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean; captured?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  return timeOperation(OBS_CATEGORY, "removeWorkspace", async () => {
    if (!workspaceExists(name) && !existsSync(workspacePath(name))) {
      return { ok: false, error: `Workspace '${name}' not found.` }
    }

    let workspace: ReturnType<typeof readWorkspace> | null = null
    try {
      workspace = readWorkspace(name)
    } catch {
      if (!opts.force) {
        return {
          ok: false,
          error: `Cannot parse workspace YAML for '${name}'. Use --force to remove directory and config without worktree cleanup.`,
        }
      }
    }

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

    const wsDir = join(tasksDir, workspace.name)
    const externalWarnings = warnExternalFiles(workspace, wsDir, tasksDir)
    for (const w of externalWarnings) {
      onProgress?.(w)
    }

    if (opts.dryRun) {
      onProgress?.("[dry-run] would close workspace (run pre_close, integration cleanup, post_close)")
      for (const repo of workspace.repos.filter(isWorktreeRepo)) {
        if (!existsSync(repo.task_path)) continue
        onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
      }
      onProgress?.(`[dry-run] would delete config: workspaces/${name}.yml`)
      onProgress?.("Dry run complete. No changes made.")
      return { ok: true }
    }

    const cleanResult = await _executeClean(workspace, config, tasksDir, {
      captured: opts.captured,
      force: opts.force,
      deleteFolder: true,
      triggeredBy: "remove",
    }, onProgress)
    if (!cleanResult.ok) return cleanResult

    const baseEnv = buildBaseEnv(workspace, tasksDir, "remove")
    const hookCwd = existsSync(wsDir) ? wsDir : tasksDir

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

    unlinkSync(workspacePath(name))

    if (workspace.hooks?.post_remove?.length) {
      try {
        if (opts.captured) {
          await runHooksCaptured(workspace.hooks.post_remove, hookCwd, baseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runHooks(workspace.hooks.post_remove, hookCwd, baseEnv)
        }
      } catch (err) {
        onProgress?.(`post_remove hook error: ${err}`)
      }
    }

    onProgress?.(`Workspace '${name}' removed.`)
    return { ok: true }
  })
}

export async function mergeWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean; captured?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  return timeOperation(OBS_CATEGORY, "mergeWorkspace", async () => {
    if (!workspaceExists(name)) {
      return { ok: false, error: `Workspace '${name}' not found.` }
    }

    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const workspace = readWorkspace(name)
    const worktreeRepos = workspace.repos.filter(isWorktreeRepo)

    if (!opts.force) {
      const dirty = await getDirtyWorktrees(workspace)
      if (dirty.length > 0) {
        return { ok: false, error: `Dirty worktrees: ${dirty.join(", ")}` }
      }
    }

    const wsDir = join(tasksDir, workspace.name)
    const externalWarnings = warnExternalFiles(workspace, wsDir, tasksDir)
    for (const w of externalWarnings) {
      onProgress?.(w)
    }

    const repoBases = worktreeRepos.map((repo) => {
      const baseBranch = repo.base_branch ?? "main"
      return { repo, baseBranch }
    })

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

    const cleanResult = await _executeClean(workspace, config, tasksDir, {
      captured: opts.captured,
      force: opts.force,
      deleteFolder: true,
      triggeredBy: "merge",
    }, onProgress)
    if (!cleanResult.ok) return cleanResult

    const baseEnv = buildBaseEnv(workspace, tasksDir, "merge")
    const hookCwd = existsSync(wsDir) ? wsDir : tasksDir

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

    unlinkSync(workspacePath(name))

    if (workspace.hooks?.post_remove?.length) {
      try {
        if (opts.captured) {
          await runHooksCaptured(workspace.hooks.post_remove, hookCwd, baseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runHooks(workspace.hooks.post_remove, hookCwd, baseEnv)
        }
      } catch (err) {
        onProgress?.(`post_remove hook error: ${err}`)
      }
    }

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
  })
}
