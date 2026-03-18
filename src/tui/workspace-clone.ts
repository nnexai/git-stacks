import * as p from "@clack/prompts"
import { mkdirSync, existsSync } from "fs"
import { join } from "path"
import { safeText, cancel } from "./utils"
import {
  listWorkspaces,
  readWorkspace,
  workspaceExists,
  writeWorkspace,
  readGlobalConfig,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { createWorktree } from "../lib/git"
import { integrations, type IntegrationContext } from "../lib/integrations"

export async function runWorkspaceClone(sourceArg?: string) {
  p.intro("Clone workspace")
  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)

  const workspaces = listWorkspaces()
  if (workspaces.length === 0) {
    p.cancel("No workspaces to clone. Run `ws new` first.")
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
  }

  // Build and save new workspace (drop cmux_workspace_id, preserve template ref)
  const { cmux_workspace_id: _, ...rest } = source
  const newWorkspace = {
    ...rest,
    name: newName,
    branch: newBranch,
    created: new Date().toISOString().split("T")[0],
    repos: newRepos,
  }
  writeWorkspace(newWorkspace)

  // Generate integration artifacts
  const ctx: IntegrationContext = { workspace: newWorkspace, tasksDir, config }
  const artifacts: Array<{ integration: (typeof integrations)[number]; path: string | null }> = []
  for (const integration of integrations) {
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(newWorkspace)) continue
    const path = integration.generate?.(ctx) ?? null
    artifacts.push({ integration, path })
    if (path) p.log.success(`${integration.label}: ${path}`)
  }

  const openNow = await p.confirm({ message: "Open workspace now?", initialValue: true })
  if (!p.isCancel(openNow) && openNow) {
    for (const { integration, path } of artifacts) {
      await integration.open(ctx, path)
    }
  }

  p.outro(`Workspace '${newName}' ready.  Run \`ws open ${newName}\` to re-open.`)
}
