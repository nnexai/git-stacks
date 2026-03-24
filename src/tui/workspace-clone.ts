import { prompts as p, safeText, cancel } from "./utils"
import { mkdirSync, existsSync } from "fs"
import { join } from "path"
import {
  listWorkspaces,
  readWorkspace,
  workspaceExists,
  writeWorkspace,
  readGlobalConfig,
  readTemplate,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { createWorktree, ensureUpstreamTracking } from "../lib/git"
import { integrations, resolveEnabledGlobally, type IntegrationContext } from "../lib/integrations"
import { promptIntegrationOverrides } from "../lib/integrations/wizard-helpers"
import { runIntegrationGenerate } from "../lib/integrations/runner"
import { openWorkspace } from "../lib/workspace-ops"

export async function runWorkspaceClone(sourceArg?: string) {
  p.intro("Clone workspace")
  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)

  const workspaces = listWorkspaces()
  if (workspaces.length === 0) {
    p.cancel("No workspaces to clone. Run `git-stacks new` first.")
    process.exit(1)
  }

  // Source selection
  let sourceName: string
  if (sourceArg) {
    if (!workspaceExists(sourceArg)) {
      p.cancel(`Workspace '${sourceArg}' not found.`)
      process.exit(1)
    }
    sourceName = sourceArg
  } else {
    const sel = await p.select({
      message: "Source workspace",
      options: workspaces.map((ws) => ({ value: ws.name, label: ws.name, hint: ws.branch })),
    })
    if (p.isCancel(sel)) cancel()
    sourceName = sel as string
  }
  const source = readWorkspace(sourceName)

  // New name
  const nameRaw = await safeText({
    message: "New workspace name",
    validate: (v) => {
      if (!v.trim()) return "Required"
      if (workspaceExists(v.trim())) return `Workspace '${v.trim()}' already exists`
    },
  })
  if (p.isCancel(nameRaw)) cancel()
  const newName = (nameRaw as string).trim()

  // New branch
  const branchRaw = await safeText({
    message: "Branch name",
    fallbackValue: `feature/${newName}`,
    validate: (v) => (v.trim() ? undefined : "Required"),
  })
  if (p.isCancel(branchRaw)) cancel()
  const newBranch = (branchRaw as string).trim()

  // Optional: integration overrides (D-05, D-06)
  // Cascade: source workspace integrations -> source template integrations -> global
  const sourceWsIntegrations = (source.settings?.integrations ?? {}) as Record<string, Record<string, unknown>>

  // Build initial enabled IDs walking the full cascade per D-06
  const initialEnabledIds = integrations.filter(i => {
    // Level 1: source workspace override
    const wsOverride = sourceWsIntegrations[i.id]
    if (wsOverride && typeof wsOverride === "object" && "enabled" in wsOverride) {
      return (wsOverride as { enabled: boolean }).enabled
    }
    // Level 2: source workspace's template overrides (if template-based)
    if (source.template) {
      try {
        const tpl = readTemplate(source.template)
        const tplOverride = tpl.integrations?.[i.id]
        if (tplOverride && typeof tplOverride === "object" && "enabled" in (tplOverride as object)) {
          return (tplOverride as { enabled: boolean }).enabled
        }
      } catch {
        // Template file missing — fall through to global
      }
    }
    // Level 3: global config
    return resolveEnabledGlobally(i.id, i.enabledByDefault, config)
  }).map(i => i.id)

  // currentConfigs: merge source ws overrides over template overrides for configurePrompt pre-fill
  const currentConfigs = (() => {
    const base: Record<string, Record<string, unknown>> = {}
    if (source.template) {
      try {
        const tpl = readTemplate(source.template)
        if (tpl.integrations) {
          for (const [k, v] of Object.entries(tpl.integrations)) {
            if (v && typeof v === "object") base[k] = v as Record<string, unknown>
          }
        }
      } catch { /* template missing */ }
    }
    // Workspace overrides take precedence over template
    for (const [k, v] of Object.entries(sourceWsIntegrations)) {
      base[k] = v
    }
    return base
  })()

  const userIntegrationOverrides = await promptIntegrationOverrides(initialEnabledIds, currentConfigs)

  // Recompute task_paths for worktree repos
  const newRepos = source.repos.map((repo) => ({
    ...repo,
    task_path: repo.mode === "worktree" ? join(tasksDir, newName, repo.name) : repo.task_path,
  }))

  // Create worktrees
  const worktreeRepos = newRepos.filter((r) => r.mode === "worktree")
  if (worktreeRepos.length > 0) {
    const spinner = p.spinner()
    spinner.start("Creating worktrees")
    const wsDir = join(tasksDir, newName)
    if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })
    for (const repo of worktreeRepos) {
      spinner.message(`${repo.name}\u2026`)
      try {
        await createWorktree(repo.main_path, repo.task_path, newBranch)
      } catch (err) {
        spinner.stop(`Failed on ${repo.name}`)
        p.log.error(String(err))
        process.exit(1)
      }
    }
    spinner.stop(`${worktreeRepos.length} worktree(s) created`)

    // Set upstream tracking for branches that exist on origin
    const trackingResults = await Promise.all(
      worktreeRepos.map(repo => ensureUpstreamTracking(repo.main_path, newBranch))
    )
    const tracked = trackingResults.filter(r => r.tracked)
    if (tracked.length > 0) {
      p.log.info(`Upstream tracking set for ${tracked.length} repo(s)`)
    }
  }

  // Build and save new workspace (drop cmux_workspace_id, preserve template ref)
  const { cmux_workspace_id: _, settings: _existingSettings, ...restNoSettings } = source
  const mergedSettings = (() => {
    const base = _existingSettings ?? {}
    if (userIntegrationOverrides && Object.keys(userIntegrationOverrides).length > 0) {
      return { ...base, integrations: userIntegrationOverrides }
    }
    return base
  })()

  const newWorkspace = {
    ...restNoSettings,
    name: newName,
    branch: newBranch,
    created: new Date().toISOString().split("T")[0],
    repos: newRepos,
    ...(Object.keys(mergedSettings).length > 0 ? { settings: mergedSettings } : {}),
  }
  writeWorkspace(newWorkspace)

  // Generate integration artifacts
  const ctx: IntegrationContext = { workspace: newWorkspace, tasksDir, config }
  const results = await runIntegrationGenerate(ctx)
  for (const { integration, path } of results) {
    if (path) p.log.success(`${integration.label}: ${path}`)
  }

  const openNow = await p.confirm({ message: "Open workspace now?", initialValue: true })
  if (!p.isCancel(openNow) && openNow) {
    const result = await openWorkspace(newName, {}, (msg) => p.log.info(msg))
    if (!result.ok) {
      p.log.warn(`Open failed: ${result.error}`)
    }
  }

  p.outro(`Workspace '${newName}' ready.  Run \`git-stacks open ${newName}\` to re-open.`)
}
