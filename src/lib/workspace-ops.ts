import { existsSync } from "fs"
import { join } from "path"
import {
  readWorkspace,
  writeWorkspace,
  workspaceExists,
  listWorkspaces,
  readGlobalConfig,
  templatePath,
  templateExists,
  readTemplate,
  writeTemplate,
  deleteWorkspace,
  deleteTemplate,
  getRepoPath,
  isWorktreeRepo,
  type WorkspaceRepo,
} from "./config"
import { getTasksDir } from "./paths"
import {
  getCurrentBranch,
  createWorktree,
  removeWorktree,
  ensureUpstreamTracking,
} from "./git"
import { type IntegrationContext } from "./integrations"
import { runIntegrations } from "./integrations/runner"
import { runHooks, runHooksCaptured } from "./lifecycle"
import { applyFileOpsForRepo, applyFileOpsForWorkspace } from "./files"
import { $ } from "bun"
import { allocatePorts } from "./ports"
import { buildRepoEnv, buildWorkspaceEnv, mergeEnv, writeEnvFiles } from "./workspace-env"

export { buildBaseEnv, buildRepoEnv, buildWorkspaceEnv, mergeEnv, writeEnvFiles } from "./workspace-env"
export type { BuildWorkspaceEnvOptions } from "./workspace-env"
export { cleanWorkspace, closeWorkspace, mergeWorkspace, removeWorkspace } from "./workspace-lifecycle"

export type ProgressCallback = (message: string) => void

export async function openWorkspace(
  name: string,
  opts: { ide?: boolean; cmux?: boolean; captured?: boolean; reallocate?: boolean; skipSecrets?: boolean },
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
    (r): r is WorkspaceRepo & { task_path: string } => isWorktreeRepo(r) && !existsSync(r.task_path)
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
    (r): r is WorkspaceRepo & { task_path: string } => isWorktreeRepo(r) && existsSync(r.task_path)
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

  let baseEnv: Record<string, string>
  let resolvedEnvVars: Record<string, string>
  try {
    baseEnv = await buildWorkspaceEnv(wsWithPorts, {
      config,
      triggeredBy: "open",
      skipSecrets: opts.skipSecrets,
      onWarn: (message) => onProgress?.(`⚠ ${message}`),
    })
    resolvedEnvVars = Object.fromEntries(
      Object.keys(mergeEnv(wsWithPorts)).map((key) => [key, baseEnv[key] ?? ""])
    )
  } catch (err) {
    return { ok: false, error: `Secret resolution failed: ${err instanceof Error ? err.message : String(err)}` }
  }

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
      await execHooks([cmd], getRepoPath(repo), repoEnv)
    }
  }

  const wsDir = join(tasksDir, name)

  // Per-repo file ops — workspace repos carry their own files config
  for (const wsRepo of wsWithPorts.repos.filter(isWorktreeRepo)) {
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
  writeEnvFiles(wsWithPorts, resolvedEnvVars, msg => onProgress?.(msg))
  const hookEnv = { ...baseEnv, ...resolvedEnvVars }

  // TMPL-04: Ensure trunk repos have their expected base branch accessible
  for (const repo of wsWithPorts.repos.filter(r => r.mode === "trunk")) {
    if (!existsSync(repo.main_path)) continue
    const currentBranch = await getCurrentBranch(repo.main_path)
    const expectedBranch = repo.base_branch ?? "main"
    if (currentBranch !== expectedBranch) {
      // Step 1: Try git checkout to the expected branch
      try {
        const checkoutResult = await $`git -C ${repo.main_path} checkout ${expectedBranch}`.quiet().nothrow()
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
  const worktreeRepos = workspace.repos.filter(isWorktreeRepo)

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
    if (!isWorktreeRepo(repo)) continue
    if (repo.task_path.includes(join(tasksDir, oldName))) {
      repo.task_path = repo.task_path.replace(
        join(tasksDir, oldName),
        join(tasksDir, newName)
      )
    }
  }

  writeWorkspace(workspace)
  onProgress?.(`wrote  ${newName}.yml`)

  deleteWorkspace(oldName)
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
    deleteTemplate(oldName)
  }
  onProgress?.(`deleted  ${oldName}.yml`)

  return { ok: true }
}

