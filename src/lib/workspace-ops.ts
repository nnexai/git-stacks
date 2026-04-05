import { existsSync, readFileSync, unlinkSync } from "fs"
import { join } from "path"
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
  getRepoPath,
  isGitRepo,
  isWorktreeRepo,
  type Workspace,
  type WorkspaceRepo,
} from "./config"
import { getTasksDir, GLOBAL_CONFIG_FILE, REGISTRY_FILE } from "./paths"
import {
  isRepoDirty,
  getCurrentBranch,
  createWorktree,
  removeWorktree,
  getMergeConflicts,
  fetchOrigin,
  pullFFOnly,
  pushBranch,
  rebaseBranch,
  mergeBranchFF,
  getCommitsBehind,
  getCommitsAhead,
  ensureUpstreamTracking,
  stashPush,
  stashPop,
  hasAutoStash,
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
export { getWorkspaceListInfo, getWorkspaceStatus, getDirtyWorktrees, detectWorkspaceFromCwd } from "./workspace-status"
export type { WorkspaceListInfo, RepoStatus, CwdDetectionResult } from "./workspace-status"

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
  stashPopFailures?: Array<{ repo: string; error: string; repoPath: string }>
  error?: string
}

export type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed" | "stashing" | "popping"
  detail: string
  conflicts: string[]
}

export type PushResult = {
  ok: boolean
  pushed: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  failed: Array<{ repo: string; reason: string }>
  error?: string
}

export type PushRow = {
  repo: string
  status: "pending" | "pushing" | "pushed" | "skipped" | "failed"
  detail: string
}

export async function pushWorkspace(
  name: string,
  opts: {
    force?: boolean
    forceWithLease?: boolean
    dryRun?: boolean
    setUpstream?: boolean
  },
  onProgress?: (row: PushRow) => void
): Promise<PushResult> {
  if (!workspaceExists(name)) {
    return { ok: false, pushed: [], skipped: [], failed: [], error: `Workspace '${name}' not found.` }
  }

  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter(isWorktreeRepo)
  const trunkRepos = workspace.repos.filter(r => r.mode === "trunk")
  const dirRepos = workspace.repos.filter(r => r.mode === "dir")

  const pushed: PushResult["pushed"] = []
  const skipped: PushResult["skipped"] = [
    ...trunkRepos.map(r => ({ repo: r.name, reason: "trunk" })),
    ...dirRepos.map(r => ({ repo: r.name, reason: "dir" })),
  ]
  const failed: PushResult["failed"] = []

  for (const repo of trunkRepos) {
    onProgress?.({ repo: repo.name, status: "skipped", detail: "trunk" })
  }
  for (const repo of dirRepos) {
    onProgress?.({ repo: repo.name, status: "skipped", detail: "dir" })
  }

  if (worktreeRepos.length === 0) {
    return { ok: true, pushed, skipped, failed }
  }

  if (opts.dryRun) {
    await Promise.all(
      worktreeRepos.map(async (repo) => {
        if (!existsSync(repo.task_path)) {
          skipped.push({ repo: repo.name, reason: "task_path missing" })
          onProgress?.({ repo: repo.name, status: "skipped", detail: "task_path missing" })
          return
        }

        const commits = await getCommitsAhead(repo.task_path, `origin/${workspace.branch}`, "HEAD")
        pushed.push({ repo: repo.name, commits })
        onProgress?.({
          repo: repo.name,
          status: "pushed",
          detail: commits > 0 ? `would push ${commits} commit${commits === 1 ? "" : "s"}` : "would push 0 commits",
        })
      })
    )
    return { ok: true, pushed, skipped, failed }
  }

  await Promise.all(
    worktreeRepos.map(async (repo) => {
      if (!existsSync(repo.task_path)) {
        skipped.push({ repo: repo.name, reason: "task_path missing" })
        onProgress?.({ repo: repo.name, status: "skipped", detail: "task_path missing" })
        return
      }

      onProgress?.({ repo: repo.name, status: "pushing", detail: "" })

      const result = await pushBranch(repo.task_path, workspace.branch, {
        force: opts.force,
        forceWithLease: opts.forceWithLease,
        setUpstream: opts.setUpstream,
      })

      if (result.ok) {
        const detail = result.commits > 0 ? `${result.commits} commit${result.commits === 1 ? "" : "s"}` : "up to date"
        pushed.push({ repo: repo.name, commits: result.commits })
        onProgress?.({ repo: repo.name, status: "pushed", detail })
        return
      }

      failed.push({ repo: repo.name, reason: result.reason })
      onProgress?.({ repo: repo.name, status: "failed", detail: result.reason })
    })
  )

  return {
    ok: failed.length === 0,
    pushed,
    skipped,
    failed,
    ...(failed.length > 0 ? { error: "One or more repos failed to push." } : {}),
  }
}

export async function syncWorkspace(
  name: string,
  opts: {
    strategy?: "rebase" | "merge"
    bestEffort?: boolean
    stash?: boolean
  },
  onProgress?: (update: SyncRow) => void
): Promise<SyncResult> {
  if (!workspaceExists(name)) {
    return { ok: false, synced: [], skipped: [], error: `Workspace '${name}' not found.` }
  }

  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter(isWorktreeRepo)

  if (worktreeRepos.length === 0) {
    return { ok: true, synced: [], skipped: [] }
  }

  const settledRows = new Map<string, SyncRow>()
  const emitSettled = (row: SyncRow) => {
    settledRows.set(row.repo, row)
    onProgress?.(row)
  }
  const stashedRepos: Array<{ name: string; taskPath: string }> = []
  let baseResult: SyncResult = { ok: true, synced: [], skipped: [] }
  let stashPopFailures: SyncResult["stashPopFailures"]

  // Resolve base branches from workspace repo data (registry model)
  const repoInfos = worktreeRepos.map((repo) => {
    const baseBranch = repo.base_branch ?? "main"
    return { repo, baseBranch, strategy: opts.strategy ?? "rebase" }
  })

  const restoreStashes = async (): Promise<SyncResult["stashPopFailures"]> => {
    if (!opts.stash || stashedRepos.length === 0) return undefined

    const failures: NonNullable<SyncResult["stashPopFailures"]> = []
    for (const repo of [...stashedRepos].reverse()) {
      onProgress?.({ repo: repo.name, status: "popping", detail: "", conflicts: [] })
      const popResult = await stashPop(repo.taskPath)
      if (!popResult.ok) {
        failures.push({ repo: repo.name, error: popResult.error, repoPath: repo.taskPath })
        const prior = settledRows.get(repo.name)
        emitSettled({
          repo: repo.name,
          status: "failed",
          detail: prior?.detail ? `${prior.detail}; stash pop failed` : "stash pop failed",
          conflicts: prior?.conflicts ?? [],
        })
        continue
      }

      const prior = settledRows.get(repo.name)
      emitSettled(
        prior
          ? {
              ...prior,
              detail: prior.detail ? `${prior.detail}; stash restored` : "stash restored",
            }
          : { repo: repo.name, status: "synced", detail: "stash restored", conflicts: [] }
      )
    }

    return failures.length > 0 ? failures : undefined
  }

  try {
    let shouldContinue = true

    if (opts.stash) {
      for (const repo of worktreeRepos) {
        if (!existsSync(repo.task_path)) continue
        if (await hasAutoStash(repo.task_path)) {
          baseResult = {
            ok: false,
            synced: [],
            skipped: [],
            error: `Repo '${repo.name}' already has a git-stacks auto-stash entry. Resolve it first: git -C ${repo.task_path} stash pop`,
          }
          shouldContinue = false
          break
        }
      }

      if (shouldContinue) {
        for (const repo of worktreeRepos) {
          if (!existsSync(repo.task_path)) continue
          if (!(await isRepoDirty(repo.task_path))) continue
          onProgress?.({ repo: repo.name, status: "stashing", detail: "", conflicts: [] })
          const stashResult = await stashPush(repo.task_path, "git-stacks auto-stash (sync)")
          if (!stashResult.ok) {
            baseResult = {
              ok: false,
              synced: [],
              skipped: [],
              error: `Stash failed for ${repo.name}: ${stashResult.error}`,
            }
            shouldContinue = false
            break
          }
          stashedRepos.push({ name: repo.name, taskPath: repo.task_path })
        }
      }
    }

    if (shouldContinue) {
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
              emitSettled({ repo: repo.name, status: "failed", detail, conflicts: [] })
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
        baseResult = {
          ok: false,
          synced: [],
          skipped: conflicts.map(c => ({ repo: c.repo, reason: `conflict in ${c.files.join(", ")}` })),
          error: `Conflicts detected:\n${detail}\n\nUse --best-effort to skip conflicting repos.`,
        }
      } else {
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
            continue
          }

          if (conflictRepos.has(repo.name)) {
            const c = conflicts.find(c => c.repo === repo.name)!
            skipped.push({ repo: repo.name, reason: `conflict in ${c.files.join(", ")}` })
            emitSettled({ repo: repo.name, status: "skipped", detail: `conflict: ${c.files[0]}`, conflicts: c.files.slice(1) })
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
            emitSettled({ repo: repo.name, status: "failed", detail: result.error ?? "sync failed", conflicts: [] })
            continue
          }

          synced.push({ repo: repo.name, commits: commitsBefore })
          emitSettled({ repo: repo.name, status: "synced", detail: `+${commitsBefore} commits`, conflicts: [] })
        }

        baseResult = { ok: skipped.length === 0 || opts.bestEffort === true, synced, skipped }
      }
    }
  } finally {
    stashPopFailures = await restoreStashes()
  }

  if ((stashPopFailures?.length ?? 0) > 0) {
    return {
      ...baseResult,
      ok: false,
      stashPopFailures,
    }
  }

  return baseResult
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

  const repos = workspace.repos.filter(isGitRepo)

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
    const repoPath = getRepoPath(repo)
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

