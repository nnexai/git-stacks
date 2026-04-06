import { existsSync, mkdirSync, readdirSync, rmSync } from "fs"
import { join } from "path"
import {
  _cache,
  isWorktreeRepo,
  readGlobalConfig,
  readWorkspace,
  workspaceExists,
  workspacePath,
  writeWorkspace,
  deleteWorkspace,
  type GlobalConfig,
  type Workspace,
  type WorkspaceRepo,
} from "./config"
import {
  createWorktree,
  removeWorktree,
  checkBranchExists,
  ensureUpstreamTracking,
  getMergeConflicts,
  mergeNoFF,
  deleteLocalBranch,
} from "./git"
import { type IntegrationContext } from "./integrations"
import { runIntegrationCleanup, runIntegrationGenerate } from "./integrations/runner"
import { _exec as lifecycleExec, type SpawnHandle } from "./lifecycle"
import { applyFileOpsForRepo, applyFileOpsForWorkspace, warnExternalFiles } from "./files"
import { timeOperation } from "./observability"
import { getTasksDir } from "./paths"
import { buildBaseEnv, buildRepoEnv, writeEnvFiles } from "./workspace-env"
import { getDirtyWorktrees } from "./workspace-status"
import { createRunner, type RunnerResult } from "./operation-runner"
import { composeTemplates } from "./composition"

const OBS_CATEGORY = "workspace-lifecycle"

// ─── Injectable executor ──────────────────────────────────────────────────────
// Reuses the SpawnHandle contract from lifecycle.ts. Tests can replace _exec.spawn
// to intercept hook subprocess launches without starting real processes.
export const _exec: { spawn: typeof lifecycleExec.spawn } = {
  spawn: lifecycleExec.spawn,
}

// ─── Module-local hook runners ────────────────────────────────────────────────
// Mirror the behavior of runHooks/runHooksCaptured from lifecycle.ts but route
// spawn through the module-local _exec seam so tests can intercept at this boundary.

async function runWorkspaceHooks(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  abortOnFailure = true
): Promise<void> {
  if (!commands || commands.length === 0) return

  const mergedEnv = { ...process.env, ...env } as Record<string, string>

  for (const cmd of commands) {
    const handle = _exec.spawn({
      cmd: ["sh", "-c", cmd],
      cwd,
      env: mergedEnv,
      stdout: "inherit",
      stderr: "inherit",
    })
    const exitCode = await handle.exited
    if (abortOnFailure && exitCode !== 0) {
      throw new Error(`Hook failed (exit ${exitCode}): ${cmd}`)
    }
  }
}

async function runWorkspaceHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: { line: string; stream: "stdout" | "stderr" }) => void,
  abortOnFailure = true
): Promise<void> {
  if (!commands || commands.length === 0) return

  const mergedEnv = { ...process.env, ...env } as Record<string, string>

  for (const cmd of commands) {
    const handle: SpawnHandle = _exec.spawn({
      cmd: ["sh", "-c", cmd],
      cwd,
      env: mergedEnv,
      stdout: "pipe",
      stderr: "pipe",
    })

    const readStream = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      stream: "stdout" | "stderr"
    ) => {
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (buf) { onOutput({ line: buf, stream }); buf = "" }
          break
        }
        buf += decoder.decode(value)
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (line) onOutput({ line, stream })
        }
      }
    }

    await Promise.all([
      readStream(handle.stdout!.getReader(), "stdout"),
      readStream(handle.stderr!.getReader(), "stderr"),
    ])

    const exitCode = await handle.exited
    if (abortOnFailure && exitCode !== 0) {
      throw new Error(`Hook failed (exit ${exitCode}): ${cmd}`)
    }
  }
}

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
        await runWorkspaceHooksCaptured(workspace.hooks.pre_clean, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runWorkspaceHooks(workspace.hooks.pre_clean, hookCwd, baseEnv)
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
          await runWorkspaceHooksCaptured(repo.hooks.pre_clean, repo.task_path, repoEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runWorkspaceHooks(repo.hooks.pre_clean, repo.task_path, repoEnv)
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
        await runWorkspaceHooksCaptured(workspace.hooks.post_clean, hookCwd, baseEnv,
          (output) => onProgress?.(output.line))
      } else {
        await runWorkspaceHooks(workspace.hooks.post_clean, hookCwd, baseEnv)
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
        await runWorkspaceHooksCaptured(workspace.hooks.pre_close, hookCwd, env,
          (output) => onProgress?.(output.line))
      } else {
        await runWorkspaceHooks(workspace.hooks.pre_close, hookCwd, env)
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
        await runWorkspaceHooksCaptured(workspace.hooks.post_close, hookCwd, env,
          (output) => onProgress?.(output.line))
      } else {
        await runWorkspaceHooks(workspace.hooks.post_close, hookCwd, env)
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

    // Evict cache before reading so any externally-corrupted YAML is detected here
    // (the remove path is the one place where a stale cache entry must not mask errors).
    _cache.workspaces.delete(name)

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
      deleteWorkspace(name)
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
          await runWorkspaceHooksCaptured(workspace.hooks.pre_remove, hookCwd, baseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runWorkspaceHooks(workspace.hooks.pre_remove, hookCwd, baseEnv)
        }
      } catch (err) {
        return { ok: false, error: `pre_remove hook failed (${err})` }
      }
    }

    deleteWorkspace(name)

    if (workspace.hooks?.post_remove?.length) {
      try {
        if (opts.captured) {
          await runWorkspaceHooksCaptured(workspace.hooks.post_remove, hookCwd, baseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runWorkspaceHooks(workspace.hooks.post_remove, hookCwd, baseEnv)
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
          await runWorkspaceHooksCaptured(workspace.hooks.pre_merge, hookCwd, baseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runWorkspaceHooks(workspace.hooks.pre_merge, hookCwd, baseEnv)
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
          await runWorkspaceHooksCaptured(workspace.hooks.pre_remove, hookCwd, baseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runWorkspaceHooks(workspace.hooks.pre_remove, hookCwd, baseEnv)
        }
      } catch (err) {
        return { ok: false, error: `pre_remove hook failed (${err})` }
      }
    }

    deleteWorkspace(name)

    if (workspace.hooks?.post_remove?.length) {
      try {
        if (opts.captured) {
          await runWorkspaceHooksCaptured(workspace.hooks.post_remove, hookCwd, baseEnv,
            (output) => onProgress?.(output.line))
        } else {
          await runWorkspaceHooks(workspace.hooks.post_remove, hookCwd, baseEnv)
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
            await runWorkspaceHooksCaptured([cmd], hookCwd, mergeBaseEnv,
              (output) => onProgress?.(output.line))
          } else {
            await runWorkspaceHooks([cmd], hookCwd, mergeBaseEnv)
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

// ─── createWorkspace ──────────────────────────────────────────────────────────
// Plan 78-02: wires the operation-runner primitive into workspace creation.
// Implements D-12 ordering with LIFO rollback of tracked side effects, hooks
// running outside the runner's compensation stack (D-09), and writeWorkspace
// as the commit point that is unreachable on any tracked-step failure (D-10).

export type CreateWorkspaceInputs = {
  wsName: string
  branch: string
  description?: string
  templateName?: string
  /** Template labels already resolved by the caller (supports composed templates). */
  templateLabels?: string[]
  /** Already-resolved workspace repos (registry lookup, mode, paths done by caller). */
  repos: WorkspaceRepo[]
  /** Snapshot of merged template+workspace hooks; copied by the caller. */
  wsHooks?: Workspace["hooks"]
  wsEnv?: Record<string, string>
  wsEnvFile?: string
  wsFiles?: Workspace["files"]
  wsIntegrationSettings?: Record<string, unknown>
  wsPorts?: Workspace["ports"]
  labels?: string[]
}

export type CreateWorkspaceResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: string; rollbackErrors: string[] }

export async function createWorkspace(
  inputs: CreateWorkspaceInputs,
  onProgress?: ProgressCallback
): Promise<CreateWorkspaceResult> {
  return timeOperation(OBS_CATEGORY, "createWorkspace", async () => {
    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const wsDir = join(tasksDir, inputs.wsName)
    const worktreeRepos = inputs.repos.filter(isWorktreeRepo)

    // mkdir -p the workspace dir before tracked steps push artifacts into it.
    if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })

    const baseEnv: Record<string, string> = {
      GS_WORKSPACE_NAME: inputs.wsName,
      GS_WORKSPACE_BRANCH: inputs.branch,
      GS_WORKSPACE_PATH: tasksDir,
      GS_TRIGGERED_BY: "create",
      ...(inputs.wsEnv ?? {}),
    }

    const templateLabels = inputs.templateLabels
      ?? (inputs.templateName ? (composeTemplates([inputs.templateName]).labels ?? []) : [])
    const resolvedLabels = [...new Set([...(templateLabels ?? []), ...(inputs.labels ?? [])])]

    // ─── Build the in-memory Workspace object ──────────────────────────────────
    // Held in memory until the commit point (D-10). NEVER written to disk if any
    // tracked step fails — writeWorkspace is reached only after the runner reports ok.
    const settingsIntegrations =
      inputs.wsIntegrationSettings && Object.keys(inputs.wsIntegrationSettings).length > 0
        ? { settings: { integrations: inputs.wsIntegrationSettings } }
        : {}
    const workspaceObj: Workspace = {
      name: inputs.wsName,
      schema_version: "1",
      description: inputs.description || undefined,
      branch: inputs.branch,
      created: new Date().toISOString().split("T")[0]!,
      ...(inputs.templateName ? { template: inputs.templateName } : {}),
      ...(inputs.wsHooks ? { hooks: inputs.wsHooks } : {}),
      repos: inputs.repos,
      ...(inputs.wsEnv ? { env: inputs.wsEnv } : {}),
      ...(inputs.wsEnvFile ? { env_file: inputs.wsEnvFile } : {}),
      ...(inputs.wsFiles ? { files: inputs.wsFiles } : {}),
      ...settingsIntegrations,
      ...(inputs.wsPorts ? { ports: inputs.wsPorts } : {}),
      ...(resolvedLabels.length > 0 ? { labels: resolvedLabels } : {}),
    } as Workspace

    const runner = createRunner(onProgress)

    // Approach A flag (Plan 78-02): hooks run outside runner.do() (D-09), so the
    // runner cannot observe their failures. We mark the hook phases below and use
    // this flag in the catch block to decide whether to force the runner into
    // failure state via a synthetic do() call. A failure inside a tracked
    // runner.do() leaves this flag false, so the runner's own ok:false state is
    // preserved unmodified (D-17: original forward error is not overwritten).
    let inHookPhase = false

    try {
      // ─── D-12 step 1: pre_create hooks (NOT tracked, D-09) ──────────────────
      if (inputs.wsHooks?.pre_create?.length) {
        inHookPhase = true
        await runWorkspaceHooks(inputs.wsHooks.pre_create, tasksDir, baseEnv)
        inHookPhase = false
      }

      // ─── D-12 step 2: worktree creation (TRACKED) ───────────────────────────
      for (const repo of worktreeRepos) {
        await runner.do(
          `create worktree ${repo.name}`,
          async () => {
            onProgress?.(`Creating worktree for ${repo.name}`)
            await createWorktree(repo.main_path, repo.task_path, inputs.branch)
            onProgress?.(`created worktree for ${repo.name}`)
          },
          async () => {
            // The runner's per-undo try/catch converts any throw here into a
            // "Rollback error: create worktree <name> failed (...)" message.
            await removeWorktree(repo.main_path, repo.task_path)
          },
        )
      }

      // ─── D-12 step 3: ensureUpstreamTracking (NOT tracked, best-effort) ─────
      // Wrapped in try/catch so a tracking failure does not abort creation.
      try {
        const trackingResults = await Promise.all(
          worktreeRepos.map(repo => ensureUpstreamTracking(repo.main_path, inputs.branch))
        )
        const tracked = trackingResults.filter(r => r.tracked).length
        if (tracked > 0) onProgress?.(`Upstream tracking set for ${tracked} repo(s)`)
      } catch (err) {
        onProgress?.(`⚠ ensureUpstreamTracking failed: ${err instanceof Error ? err.message : String(err)}`)
      }

      // ─── D-12 step 4: per-repo file ops (TRACKED) ───────────────────────────
      for (const wsRepo of worktreeRepos) {
        if (!wsRepo.files) continue
        await runner.do(
          `apply file ops for ${wsRepo.name}`,
          async () => {
            const repoSource = { name: wsRepo.name, path: wsRepo.main_path, files: wsRepo.files }
            const result = applyFileOpsForRepo(repoSource, wsRepo)
            if (!result.ok) throw new Error(`file ops failed for ${wsRepo.name}: ${result.error}`)
            if (result.warnings) for (const w of result.warnings) onProgress?.(`file-ops: ${w}`)
          },
          async () => {
            // Strategy A (D-08): per-repo files live inside wsRepo.task_path which is
            // removed by an earlier worktree undo. The undo here is a no-op.
          },
        )
      }

      // ─── D-12 step 5: workspace-instance file ops (TRACKED) ─────────────────
      if (inputs.wsFiles) {
        await runner.do(
          `apply workspace file ops`,
          async () => {
            const result = applyFileOpsForWorkspace({ files: inputs.wsFiles }, workspaceObj, wsDir)
            if (!result.ok) throw new Error(`workspace file ops failed: ${result.error}`)
            if (result.warnings) for (const w of result.warnings) onProgress?.(`file-ops: ${w}`)
          },
          async () => {
            // Strategy A (D-08): files land inside wsDir. The wsDir itself stays so
            // the user can inspect the failure — but if it ends up empty after worktree
            // undos, remove it. Best-effort: ignore errors.
            try {
              if (existsSync(wsDir) && readdirSync(wsDir).length === 0) {
                rmSync(wsDir, { recursive: true, force: true })
              }
            } catch { /* best-effort */ }
          },
        )
      }

      // ─── D-12 step 6: env-file writes (TRACKED) ─────────────────────────────
      if (inputs.wsEnvFile) {
        await runner.do(
          `write env files`,
          async () => {
            const envVars: Record<string, string> = inputs.wsEnv ? { ...inputs.wsEnv } : {}
            writeEnvFiles(workspaceObj, envVars, msg => onProgress?.(msg))
          },
          async () => {
            // Strategy A (D-08): env files land inside repo.task_path which the worktree
            // undo removes. No-op here.
          },
        )
      }

      // ─── D-12 step 7: post_create hooks (NOT tracked, D-09) ─────────────────
      // Hook failures throw and are caught below. The catch block forces the
      // runner into failure state via a synthetic do() call (Approach A — see
      // Plan 78-02 "CRITICAL implementation detail" section), which triggers
      // LIFO rollback of every tracked step pushed before the hook failed.
      if (inputs.wsHooks?.post_create?.length) {
        inHookPhase = true
        await runWorkspaceHooks(inputs.wsHooks.post_create, wsDir, baseEnv)
        inHookPhase = false
      }
    } catch (forwardError) {
      // Two cases land here:
      //   (a) A tracked step inside runner.do() failed. The runner has already run
      //       rollback() and re-thrown; the runner has already recorded the error.
      //   (b) A pre_create or post_create hook threw. Hooks are not tracked, so the
      //       runner does not yet know about the failure. We force it into failure
      //       state via a synthetic do() call whose forward immediately re-throws.
      //       The runner pops its existing stack (LIFO rollback of every tracked
      //       step) and records the hook error verbatim.
      //
      // Approach A (Plan 78-02): use the existing runner API rather than adding a
      // new fail() method. Preserves Plan 01's "I only know about my own do() calls"
      // contract at the cost of one synthetic do() call.
      //
      // The inHookPhase flag discriminates the cases without consulting the runner's
      // state — querying the runner here would force a second result query, AND would
      // risk overwriting case (a)'s already-recorded forward error if the synthetic
      // do() ran on top of it.
      if (inHookPhase) {
        const errMsg = forwardError instanceof Error ? forwardError.message : String(forwardError)
        try {
          await runner.do(
            errMsg,
            async () => { throw new Error(errMsg) },
            async () => { /* unreachable — forward throws before push */ },
          )
        } catch { /* expected — runner has now rolled back and recorded the error */ }
      }
      // Case (a): runner already recorded the failure; nothing more to do here.
    }

    const runnerResult: RunnerResult = runner.result()
    if (!runnerResult.ok) {
      // CRITICAL: writeWorkspace is NOT called on failure (D-10 commit point).
      return { ok: false, error: runnerResult.error, rollbackErrors: runnerResult.rollbackErrors }
    }

    // ─── D-12 step 8: COMMIT POINT (D-10) — writeWorkspace OUTSIDE the runner ──
    writeWorkspace(workspaceObj)
    onProgress?.(`wrote ${inputs.wsName}.yml`)

    // ─── D-12 step 9: integration generation POST-COMMIT (D-11) ────────────────
    // Failures here are surfaced through onProgress and do NOT roll back —
    // the workspace is already committed.
    try {
      const ctx: IntegrationContext = { workspace: workspaceObj, tasksDir, config }
      const results = await runIntegrationGenerate(ctx)
      for (const { integration, path } of results) {
        if (path) onProgress?.(`${integration.label}: ${path}`)
      }
    } catch (err) {
      onProgress?.(`⚠ integration generate failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    return { ok: true, workspace: workspaceObj }
  })
}
