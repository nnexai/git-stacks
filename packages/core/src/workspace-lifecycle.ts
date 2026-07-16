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
  acquireWorkspaceDefinitionGuard,
  inspectWorkspaceDefinition,
  WorkspaceDefinitionConflictError,
  deleteWorkspace,
  type GlobalConfig,
  type Workspace,
  type WorkspaceDefinitionGuard,
  type WorkspaceDefinitionLease,
  type WorkspaceRepo,
} from "./config"
import {
  createWorktree,
  createWorktreeFromRef,
  removeWorktree,
  getMergeConflicts,
  deleteLocalBranch,
  prepareMergeCommit,
  compareAndSwapBranch,
  type PreparedMerge,
} from "./git"
import { type IntegrationContext } from "./integrations"
import { runIntegrationCleanup, runIntegrationGenerate } from "./integrations/runner"
import {
  _exec as lifecycleExec,
  runHooksCapturedWithExecutor,
  runHooksWithExecutor,
  type ShellExecutor,
} from "./lifecycle"
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
export const _exec: ShellExecutor = {
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
  return runHooksWithExecutor(_exec, commands, cwd, env, abortOnFailure)
}

async function runWorkspaceHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: { line: string; stream: "stdout" | "stderr" }) => void,
  abortOnFailure = true
): Promise<void> {
  const results = await runHooksCapturedWithExecutor(_exec, commands, cwd, env, onOutput, abortOnFailure)
  const failed = results.find((result) => result.failed)
  if (abortOnFailure && failed) {
    throw new Error(`Hook failed (exit ${failed.exitCode}): ${failed.command}`)
  }
}

type ProgressCallback = (message: string) => void
const activeWorkspaceCreations = new Set<string>()

export type CoreWorkspaceRemovalPhase = "removing_worktrees" | "deleting_workspace_files"

type WorkspaceRemovalPlanData = {
  workspace: Workspace
  config: GlobalConfig
  tasksDir: string
  definitionPath: string
  definitionGuard: WorkspaceDefinitionGuard
  blockingRepositories: string[]
}

const workspaceRemovalPlanBrand: unique symbol = Symbol("WorkspaceRemovalPlan")

export type WorkspaceRemovalPlan = {
  readonly [workspaceRemovalPlanBrand]: WorkspaceRemovalPlanData
}

export type WorkspaceRemovalInspection =
  | { ok: true; plan: WorkspaceRemovalPlan }
  | {
      ok: false
      code: "workspace_dirty"
      error: string
      blocking_repositories: string[]
      plan: WorkspaceRemovalPlan
    }
  | { ok: false; code: "not_found" | "workspace_invalid" | "inspection_failed" | "conflict"; error: string }

export type WorkspaceRemovalResult =
  | { ok: true }
  | {
      ok: false
      code: "not_found" | "workspace_invalid" | "inspection_failed" | "workspace_dirty" | "removal_failed" | "conflict"
      error: string
      blocking_repositories?: string[]
    }

type LifecycleOptions = { captured?: boolean; triggeredBy: string }

function workspaceHookCwd(workspace: Workspace, tasksDir: string): string {
  const workspaceDir = join(tasksDir, workspace.name)
  return existsSync(workspaceDir) ? workspaceDir : tasksDir
}

async function runHookPhase(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  opts: LifecycleOptions,
  onProgress?: ProgressCallback,
  abortOnFailure = true
): Promise<void> {
  if (opts.captured) {
    await runWorkspaceHooksCaptured(commands, cwd, env, (output) => onProgress?.(output.line), abortOnFailure)
  } else {
    await runWorkspaceHooks(commands, cwd, env, abortOnFailure)
  }
}

async function prepareLifecycle(
  workspace: Workspace,
  tasksDir: string,
  opts: LifecycleOptions & { clean?: boolean; merge?: boolean; remove?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  const baseEnv = buildBaseEnv(workspace, tasksDir, opts.triggeredBy)
  const hookCwd = workspaceHookCwd(workspace, tasksDir)
  try {
    await runHookPhase(workspace.hooks?.pre_close, hookCwd, baseEnv, opts, onProgress)
  } catch (err) {
    return { ok: false, error: `pre_close hook failed (${err})` }
  }
  if (opts.clean) {
    try {
      await runHookPhase(workspace.hooks?.pre_clean, hookCwd, baseEnv, opts, onProgress)
    } catch (err) {
      return { ok: false, error: `pre_clean hook failed (${err})` }
    }
  }
  for (const repo of opts.clean ? workspace.repos.filter(isWorktreeRepo) : []) {
    try {
      // Validation is intentionally part of the prepare barrier: every abort-capable
      // hook still runs while all original worktrees exist.
      if (!existsSync(repo.task_path)) continue
      if (repo.hooks?.pre_clean?.length) {
        await runHookPhase(repo.hooks.pre_clean, repo.task_path, buildRepoEnv(baseEnv, repo), opts, onProgress)
      }
    } catch (err) {
      return { ok: false, error: `pre_clean[${repo.name}] hook failed (${err})` }
    }
  }
  if (opts.merge) {
    try {
      await runHookPhase(workspace.hooks?.pre_merge, hookCwd, baseEnv, opts, onProgress)
    } catch (err) {
      return { ok: false, error: `pre_merge hook failed (${err})` }
    }
  }
  if (opts.remove) {
    try {
      await runHookPhase(workspace.hooks?.pre_remove, hookCwd, baseEnv, opts, onProgress)
    } catch (err) {
      return { ok: false, error: `pre_remove hook failed (${err})` }
    }
  }
  return { ok: true }
}

async function runPostHookWarning(
  name: string,
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  opts: LifecycleOptions,
  onProgress?: ProgressCallback
): Promise<void> {
  try {
    await runHookPhase(commands, cwd, env, opts, onProgress)
  } catch (err) {
    onProgress?.(`warning: ${name} hook failed (cwd: ${cwd}): ${err}`)
  }
}

async function commitClose(
  workspace: Workspace,
  config: GlobalConfig,
  tasksDir: string,
  opts: LifecycleOptions,
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  try {
    await runIntegrationCleanup({ workspace, tasksDir, config })
  } catch (err) {
    return { ok: false, error: `integration cleanup failed (${err})` }
  }
  const env = buildBaseEnv(workspace, tasksDir, opts.triggeredBy)
  // Workspace post hooks fall back to tasksDir once workspace cleanup has removed its folder.
  await runPostHookWarning("post_close", workspace.hooks?.post_close, workspaceHookCwd(workspace, tasksDir), env, opts, onProgress)
  onProgress?.(`Closed '${workspace.name}'.`)
  return { ok: true }
}

async function commitCleanup(
  workspace: Workspace,
  config: GlobalConfig,
  tasksDir: string,
  opts: LifecycleOptions & {
    deleteFolder?: boolean
    deleteConfig?: boolean
    onRemovalPhase?: (phase: CoreWorkspaceRemovalPhase) => void | Promise<void>
    acquireDestructiveLease?: () => Promise<WorkspaceDefinitionLease>
    forceWorktreeRemoval?: boolean
  },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  const closeResult = await commitClose(workspace, config, tasksDir, opts, onProgress)
  if (!closeResult.ok) return closeResult

  let definitionLease: WorkspaceDefinitionLease | undefined
  try {
    definitionLease = await opts.acquireDestructiveLease?.()

    const failures: string[] = []
    if (opts.onRemovalPhase) {
      try {
        await opts.onRemovalPhase("removing_worktrees")
      } catch (err) {
        return { ok: false, error: `removal phase callback failed (${err})` }
      }
    }
    for (const repo of workspace.repos.filter(isWorktreeRepo)) {
      if (!existsSync(repo.task_path)) continue
      try {
        await removeWorktree(repo.main_path, repo.task_path, { force: opts.forceWorktreeRemoval })
        onProgress?.(`removed  ${repo.name}`)
      } catch (err) {
        failures.push(`${repo.name} (${err})`)
      }
    }
    if (failures.length > 0) {
      return { ok: false, error: `Could not clean worktrees:\n  ${failures.join("\n  ")}` }
    }

    const env = buildBaseEnv(workspace, tasksDir, opts.triggeredBy)
    await runPostHookWarning("post_clean", workspace.hooks?.post_clean, tasksDir, env, opts, onProgress)

    if ((opts.deleteFolder || opts.deleteConfig) && opts.onRemovalPhase) {
      try {
        await opts.onRemovalPhase("deleting_workspace_files")
      } catch (err) {
        return { ok: false, error: `removal phase callback failed (${err})` }
      }
    }

    if (opts.deleteFolder) {
      try {
        const wsDir = join(tasksDir, workspace.name)
        if (existsSync(wsDir)) {
          rmSync(wsDir, { recursive: true, force: true })
          onProgress?.(`deleted  tasks/${workspace.name}/`)
        }
      } catch (err) {
        return { ok: false, error: `workspace folder cleanup failed (${err})` }
      }
    }

    if (opts.deleteConfig) {
      try {
        if (definitionLease) definitionLease.deleteDefinition()
        else deleteWorkspace(workspace.name)
      } catch (err) {
        return { ok: false, error: `workspace config deletion failed (${err})` }
      }
    }
    return { ok: true }
  } finally {
    definitionLease?.release()
  }
}

export async function cleanWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean; captured?: boolean; deleteFolder?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  return timeOperation(OBS_CATEGORY, "cleanWorkspace", async () => {
    if (!workspaceExists(name)) return { ok: false, error: `Workspace '${name}' not found.` }
    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const workspace = readWorkspace(name)
    if (!opts.force) {
      const dirty = await getDirtyWorktrees(workspace)
      if (dirty.length > 0) return { ok: false, error: `Dirty worktrees: ${dirty.join(", ")}` }
    }
    for (const warning of warnExternalFiles(workspace, join(tasksDir, workspace.name), tasksDir)) onProgress?.(warning)
    if (opts.dryRun) {
      onProgress?.("[dry-run] would run the complete prepare barrier")
      for (const repo of workspace.repos.filter(isWorktreeRepo)) {
        if (existsSync(repo.task_path)) onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
      }
      if (opts.deleteFolder) onProgress?.(`[dry-run] would delete folder: tasks/${workspace.name}/`)
      onProgress?.("Dry run complete. No changes made.")
      return { ok: true }
    }
    const lifecycleOpts = { captured: opts.captured, triggeredBy: "clean" }
    const prepared = await prepareLifecycle(workspace, tasksDir, { ...lifecycleOpts, clean: true }, onProgress)
    if (!prepared.ok) return prepared
    return commitCleanup(workspace, config, tasksDir, { ...lifecycleOpts, deleteFolder: opts.deleteFolder }, onProgress)
  })
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
    const lifecycleOpts = { captured: opts.captured, triggeredBy: "close" }
    const prepared = await prepareLifecycle(workspace, tasksDir, lifecycleOpts, onProgress)
    if (!prepared.ok) return prepared
    return commitClose(workspace, config, tasksDir, lifecycleOpts, onProgress)
  })
}

function removalPlan(data: WorkspaceRemovalPlanData): WorkspaceRemovalPlan {
  return { [workspaceRemovalPlanBrand]: data }
}

function removalPlanData(plan: WorkspaceRemovalPlan): WorkspaceRemovalPlanData {
  const data = plan?.[workspaceRemovalPlanBrand]
  if (!data) throw new Error("Invalid workspace removal plan")
  return data
}

class WorkspaceRemovalDirtyBoundaryError extends Error {
  constructor(readonly blockingRepositories: string[]) {
    super(`Dirty worktrees: ${blockingRepositories.join(", ")}`)
    this.name = "WorkspaceRemovalDirtyBoundaryError"
  }
}

export async function inspectWorkspaceRemoval(
  name: string,
  options: { expectedId?: string } = {},
): Promise<WorkspaceRemovalInspection> {
  if (!workspaceExists(name) && !existsSync(workspacePath(name))) {
    if (options.expectedId !== undefined) {
      return { ok: false, code: "conflict", error: `Workspace definition changed or disappeared before removal: ${name}` }
    }
    return { ok: false, code: "not_found", error: `Workspace '${name}' not found.` }
  }

  // A removal inspection must observe disk, never a stale in-memory definition.
  _cache.workspaces.delete(name)
  let workspace: Workspace
  let definitionPath: string
  let definitionGuard: WorkspaceDefinitionGuard
  try {
    definitionGuard = inspectWorkspaceDefinition(name, options.expectedId)
    workspace = definitionGuard.workspace
    definitionPath = definitionGuard.path
  } catch (error) {
    if (error instanceof WorkspaceDefinitionConflictError) {
      return { ok: false, code: "conflict", error: error.message }
    }
    return { ok: false, code: "workspace_invalid", error: `Cannot parse workspace YAML for '${name}'.` }
  }

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  let blockingRepositories: string[]
  try {
    blockingRepositories = await getDirtyWorktrees(workspace)
  } catch (err) {
    return {
      ok: false,
      code: "inspection_failed",
      error: `Could not inspect workspace worktrees (${err}).`,
    }
  }
  const plan = removalPlan({ workspace, config, tasksDir, definitionPath, definitionGuard, blockingRepositories })
  if (blockingRepositories.length > 0) {
    return {
      ok: false,
      code: "workspace_dirty",
      error: `Dirty worktrees: ${blockingRepositories.join(", ")}`,
      blocking_repositories: [...blockingRepositories],
      plan,
    }
  }
  return { ok: true, plan }
}

async function commitWorkspaceRemovalInternal(
  plan: WorkspaceRemovalPlan,
  options: {
    allow_dirty?: boolean
    onPhase?: (phase: CoreWorkspaceRemovalPhase) => void | Promise<void>
    captured?: boolean
  },
  onProgress?: ProgressCallback,
): Promise<WorkspaceRemovalResult> {
  const { workspace, config, tasksDir, definitionGuard, blockingRepositories } = removalPlanData(plan)
  if (blockingRepositories.length > 0 && options.allow_dirty !== true) {
    return {
      ok: false,
      code: "workspace_dirty",
      error: `Dirty worktrees: ${blockingRepositories.join(", ")}`,
      blocking_repositories: [...blockingRepositories],
    }
  }

  const wsDir = join(tasksDir, workspace.name)
  for (const warning of warnExternalFiles(workspace, wsDir, tasksDir)) onProgress?.(warning)

  const lifecycleOpts = { captured: options.captured, triggeredBy: "remove" }
  const prepared = await prepareLifecycle(workspace, tasksDir, {
    ...lifecycleOpts,
    clean: true,
    remove: true,
  }, onProgress)
  if (!prepared.ok) return { ok: false, code: "removal_failed", error: prepared.error ?? "Removal preparation failed." }

  let committed: Awaited<ReturnType<typeof commitCleanup>>
  try {
    committed = await commitCleanup(workspace, config, tasksDir, {
      ...lifecycleOpts,
      deleteFolder: true,
      deleteConfig: true,
      onRemovalPhase: options.onPhase,
      forceWorktreeRemoval: options.allow_dirty === true,
      acquireDestructiveLease: async () => {
        const lease = acquireWorkspaceDefinitionGuard(definitionGuard)
        try {
          if (options.allow_dirty !== true) {
            const freshBlockingRepositories = await getDirtyWorktrees(workspace)
            if (freshBlockingRepositories.length > 0) {
              throw new WorkspaceRemovalDirtyBoundaryError(freshBlockingRepositories)
            }
          }
          return lease
        } catch (error) {
          lease.release()
          throw error
        }
      },
    }, onProgress)
  } catch (error) {
    if (error instanceof WorkspaceRemovalDirtyBoundaryError) {
      return {
        ok: false,
        code: "workspace_dirty",
        error: `Dirty worktrees: ${error.blockingRepositories.join(", ")}`,
        blocking_repositories: [...error.blockingRepositories],
      }
    }
    if (error instanceof WorkspaceDefinitionConflictError) {
      return { ok: false, code: "conflict", error: error.message }
    }
    return { ok: false, code: "removal_failed", error: `Removal boundary failed (${error}).` }
  }
  if (!committed.ok) return { ok: false, code: "removal_failed", error: committed.error ?? "Removal failed." }

  await runPostHookWarning("post_remove", workspace.hooks?.post_remove, tasksDir,
    buildBaseEnv(workspace, tasksDir, "remove"), lifecycleOpts, onProgress)
  onProgress?.(`Workspace '${workspace.name}' removed.`)
  return { ok: true }
}

export async function commitWorkspaceRemoval(
  plan: WorkspaceRemovalPlan,
  options: {
    allow_dirty?: boolean
    onPhase?: (phase: CoreWorkspaceRemovalPhase) => void | Promise<void>
  } = {},
): Promise<WorkspaceRemovalResult> {
  return commitWorkspaceRemovalInternal(plan, options)
}

export async function removeWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean; captured?: boolean },
  onProgress?: ProgressCallback
): Promise<WorkspaceRemovalResult> {
  return timeOperation(OBS_CATEGORY, "removeWorkspace", async () => {
    const inspected = await inspectWorkspaceRemoval(name)
    if (!inspected.ok && inspected.code !== "workspace_dirty") return inspected
    if (!inspected.ok && opts.force !== true) {
      return {
        ok: false,
        code: "workspace_dirty",
        error: inspected.error,
        blocking_repositories: inspected.blocking_repositories,
      }
    }

    const plan = inspected.plan
    const data = removalPlanData(plan)
    if (opts.dryRun) {
      const wsDir = join(data.tasksDir, data.workspace.name)
      for (const warning of warnExternalFiles(data.workspace, wsDir, data.tasksDir)) onProgress?.(warning)
      onProgress?.("[dry-run] would close workspace (run pre_close, integration cleanup, post_close)")
      for (const repo of data.workspace.repos.filter(isWorktreeRepo)) {
        if (existsSync(repo.task_path)) onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
      }
      onProgress?.(`[dry-run] would delete config: ${data.definitionPath}`)
      onProgress?.("Dry run complete. No changes made.")
      return { ok: true }
    }

    return commitWorkspaceRemovalInternal(plan, {
      allow_dirty: opts.force === true,
      captured: opts.captured,
    }, onProgress)
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
    const preflightErrors: string[] = []
    for (const { repo, baseBranch } of repoBases) {
      const result = await getMergeConflicts(repo.main_path, baseBranch, workspace.branch)
      if (result.status === "conflicted") {
        conflicting.push(`${repo.name} (${result.files.join(", ")})`)
      } else if (result.status === "error") {
        preflightErrors.push(`${repo.name} (${result.error})`)
      }
    }
    if (conflicting.length > 0 || preflightErrors.length > 0) {
      const sections = [
        conflicting.length > 0 ? `Merge conflicts detected:\n  ${conflicting.join("\n  ")}` : "",
        preflightErrors.length > 0 ? `Merge preflight failed:\n  ${preflightErrors.join("\n  ")}` : "",
      ].filter(Boolean)
      return { ok: false, error: sections.join("\n\n") }
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

    const lifecycleOpts = { captured: opts.captured, triggeredBy: "merge" }
    const prepared = await prepareLifecycle(workspace, tasksDir, {
      ...lifecycleOpts,
      clean: true,
      merge: true,
      remove: true,
    }, onProgress)
    if (!prepared.ok) return prepared

    const preparedMerges: Array<{ repo: WorkspaceRepo; prepared: PreparedMerge }> = []
    for (const { repo, baseBranch } of repoBases) {
      const result = await prepareMergeCommit(repo.main_path, baseBranch, workspace.branch)
      if (!result.ok) return { ok: false, error: `Merge preparation failed for '${repo.name}' (${result.error})` }
      preparedMerges.push({ repo, prepared: result.prepared })
    }

    const updated: Array<{ repo: WorkspaceRepo; prepared: PreparedMerge }> = []
    for (const entry of preparedMerges) {
      const result = await compareAndSwapBranch(
        entry.prepared.repoPath,
        entry.prepared.baseBranch,
        entry.prepared.oldSha,
        entry.prepared.preparedSha
      )
      if (!result.ok) {
        for (const prior of [...updated].reverse()) {
          await compareAndSwapBranch(
            prior.prepared.repoPath,
            prior.prepared.baseBranch,
            prior.prepared.preparedSha,
            prior.prepared.oldSha
          )
        }
        return { ok: false, error: `Merge ref update failed for '${entry.repo.name}' (${result.error}); earlier refs were restored when unchanged.` }
      }
      updated.push(entry)
      onProgress?.(`merged  ${entry.repo.name}  ->  ${entry.prepared.baseBranch}`)
    }

    const cleaned = await commitCleanup(workspace, config, tasksDir, {
      ...lifecycleOpts,
      deleteFolder: true,
      deleteConfig: true,
    }, onProgress)
    if (!cleaned.ok) {
      return {
        ok: false,
        error: `bases merged; cleanup incomplete: ${cleaned.error}. Workspace YAML and feature refs were retained. Recover by completing cleanup manually, then rerun remove if needed.`,
      }
    }

    for (const { repo } of repoBases) {
      const deleted = await deleteLocalBranch(repo.main_path, workspace.branch)
      if (!deleted.ok) onProgress?.(`warning: feature branch cleanup failed for ${repo.name}: ${deleted.error}`)
    }
    const baseEnv = buildBaseEnv(workspace, tasksDir, "merge")
    await runPostHookWarning("post_remove", workspace.hooks?.post_remove, tasksDir, baseEnv, lifecycleOpts, onProgress)
    await runPostHookWarning("post_merge", workspace.hooks?.post_merge, tasksDir,
      { ...baseEnv, GS_MERGED_BRANCH: workspace.branch }, lifecycleOpts, onProgress)

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
  wsCommands?: Workspace["commands"]
  wsEnv?: Record<string, string>
  wsEnvFile?: string
  wsFiles?: Workspace["files"]
  wsIntegrationSettings?: Record<string, unknown>
  wsPorts?: Workspace["ports"]
  labels?: string[]
  source?: Workspace["source"]
  sourceStartRefs?: Record<string, string>
}

export type CreateWorkspaceResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: string; rollbackErrors: string[] }

export async function createWorkspace(
  inputs: CreateWorkspaceInputs,
  onProgress?: ProgressCallback
): Promise<CreateWorkspaceResult> {
  if (activeWorkspaceCreations.has(inputs.wsName)) {
    return { ok: false, error: `Workspace '${inputs.wsName}' creation is already in progress.`, rollbackErrors: [] }
  }
  activeWorkspaceCreations.add(inputs.wsName)
  try {
    return await timeOperation(OBS_CATEGORY, "createWorkspace", async () => {
    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const wsDir = join(tasksDir, inputs.wsName)
    const worktreeRepos = inputs.repos.filter(isWorktreeRepo)

    // The final existence check is intentionally inside the same-name lease and
    // immediately precedes the first filesystem mutation.
    if (workspaceExists(inputs.wsName) || existsSync(workspacePath(inputs.wsName))) {
      return { ok: false, error: `Workspace '${inputs.wsName}' already exists.`, rollbackErrors: [] }
    }

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
      ...(inputs.wsCommands ? { commands: inputs.wsCommands } : {}),
      ...(inputs.source ? { source: inputs.source } : {}),
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
        const sourceStartRef = inputs.sourceStartRefs?.[repo.name]
        let creation: Awaited<ReturnType<typeof createWorktree>> | undefined
        await runner.do(
          `create worktree ${repo.name}`,
          async () => {
            onProgress?.(`Creating worktree for ${repo.name}`)
            if (sourceStartRef) {
              creation = await createWorktreeFromRef(repo.main_path, repo.task_path, inputs.branch, sourceStartRef)
            } else {
              creation = await createWorktree(repo.main_path, repo.task_path, inputs.branch)
            }
            onProgress?.(`created worktree for ${repo.name}`)
          },
          async () => {
            if (!creation?.createdWorktree) return
            await removeWorktree(repo.main_path, repo.task_path)
            if (creation.createdBranch) {
              const deleted = await deleteLocalBranch(repo.main_path, inputs.branch)
              if (!deleted.ok) throw new Error(deleted.error)
            } else if (creation.movedBranch) {
              const restored = await compareAndSwapBranch(
                repo.main_path,
                inputs.branch,
                creation.movedBranch.createdSha,
                creation.movedBranch.previousSha
              )
              if (!restored.ok) throw new Error(restored.error)
            }
          },
        )
      }

      // ─── D-12 step 3: per-repo file ops (TRACKED) ───────────────────────────
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

      // ─── D-12 step 4: workspace-instance file ops (TRACKED) ─────────────────
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

      // ─── D-12 step 5: env-file writes (TRACKED) ─────────────────────────────
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

      // ─── D-12 step 6: post_create hooks (NOT tracked, D-09) ─────────────────
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

    // ─── D-12 step 7: COMMIT POINT (D-10) — writeWorkspace OUTSIDE the runner ──
    writeWorkspace(workspaceObj)
    onProgress?.(`wrote ${inputs.wsName}.yml`)

    // ─── D-12 step 8: integration generation POST-COMMIT (D-11) ────────────────
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
  } finally {
    activeWorkspaceCreations.delete(inputs.wsName)
  }
}
