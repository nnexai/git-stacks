import * as p from "@clack/prompts"
import { mkdirSync, existsSync } from "fs"
import { safeText } from "./utils"
import { join } from "path"
import {
  listStacks,
  writeWorkspace,
  workspaceExists,
  readGlobalConfig,
  type WorkspaceRepo,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { createWorktree } from "../lib/git"
import { integrations, type IntegrationContext } from "../lib/integrations"

function cancel(): never {
  p.cancel("Cancelled.")
  process.exit(0)
}

export async function runWorkspaceNew(nameArg?: string) {
  p.intro("New workspace")

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)

  const stacks = listStacks()
  if (stacks.length === 0) {
    p.cancel("No stacks defined. Run `ws stack new` first.")
    process.exit(1)
  }

  // Name
  const nameRaw = await safeText({
    message: "Workspace name (ticket or purpose)",
    initialValue: nameArg ?? "",
    validate: (v) => {
      if (!v.trim()) return "Required"
      if (workspaceExists(v.trim())) return `Workspace '${v.trim()}' already exists`
    },
  })
  if (p.isCancel(nameRaw)) cancel()
  const wsName = (nameRaw as string).trim()

  // Branch
  const branchRaw = await safeText({
    message: "Branch name",
    initialValue: `feature/${wsName}`,
    validate: (v) => (v.trim() ? undefined : "Required"),
  })
  if (p.isCancel(branchRaw)) cancel()
  const branch = (branchRaw as string).trim()

  // Description
  const descRaw = await safeText({ message: "Description (optional)", initialValue: "" })
  if (p.isCancel(descRaw)) cancel()
  const description = (descRaw as string).trim()

  // Select stacks
  const selectedStackNamesRaw = await p.multiselect({
    message: "Stack(s)",
    options: stacks.map((s) => ({
      value: s.name,
      label: s.name,
      hint: s.description,
    })),
    required: true,
  })
  if (p.isCancel(selectedStackNamesRaw)) cancel()
  const selectedStackNames = selectedStackNamesRaw as string[]

  const selectedStacks = stacks.filter((s) => selectedStackNames.includes(s.name))

  // Per-stack repo selection
  const repos: WorkspaceRepo[] = []

  for (const stack of selectedStacks) {
    if (stack.repos.length === 0) continue

    const includedNamesRaw = await p.multiselect({
      message: `Repos from '${stack.name}'`,
      options: stack.repos.map((r) => ({
        value: r.name,
        label: r.name,
        hint: `${r.type} · default: ${r.default_mode}`,
      })),
      initialValues: stack.repos.map((r) => r.name),
      required: false,
    })
    if (p.isCancel(includedNamesRaw)) cancel()
    const includedNames = includedNamesRaw as string[]

    for (const repoName of includedNames) {
      const stackRepo = stack.repos.find((r) => r.name === repoName)!

      const modeRaw = await p.select({
        message: `  ${repoName} — mode`,
        options: [
          { value: "worktree" as const, label: "Worktree", hint: `branch: ${branch as string}` },
          { value: "trunk" as const, label: "Trunk", hint: "reference main clone" },
        ],
        initialValue: stackRepo.default_mode,
      })
      if (p.isCancel(modeRaw)) cancel()
      const mode = modeRaw as "trunk" | "worktree"

      const taskPath =
        mode === "worktree" ? join(tasksDir, wsName, repoName) : stackRepo.path

      repos.push({
        name: repoName,
        stack: stack.name,
        type: stackRepo.type,
        mode,
        main_path: stackRepo.path,
        task_path: taskPath,
      })
    }
  }

  if (repos.length === 0) {
    p.cancel("No repos selected.")
    process.exit(0)
  }

  // Create worktrees
  const worktreeRepos = repos.filter((r) => r.mode === "worktree")
  if (worktreeRepos.length > 0) {
    const spinner = p.spinner()
    spinner.start("Creating worktrees")

    const wsDir = join(tasksDir, wsName)
    if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })

    for (const repo of worktreeRepos) {
      spinner.message(`${repo.name}…`)
      try {
        await createWorktree(repo.main_path, repo.task_path, branch)
      } catch (err) {
        spinner.stop(`Failed on ${repo.name}`)
        p.log.error(String(err))
        process.exit(1)
      }
    }

    spinner.stop(`${worktreeRepos.length} worktree(s) created`)
  }

  // Collect integration settings from selected stacks
  const wsIntegrationSettings: Record<string, unknown> = {}
  for (const stack of selectedStacks) {
    if (!stack.integrations) continue
    for (const [id, cfg] of Object.entries(stack.integrations)) {
      if (!wsIntegrationSettings[id]) {
        wsIntegrationSettings[id] = cfg
      } else {
        const existing = wsIntegrationSettings[id] as Record<string, unknown>
        const incoming = cfg as Record<string, unknown>
        const merged = { ...existing, ...incoming }
        if (Array.isArray(existing.panes) && Array.isArray(incoming.panes)) {
          merged.panes = [...existing.panes, ...incoming.panes]
        }
        wsIntegrationSettings[id] = merged
      }
    }
  }

  // Save config
  const workspace = {
    name: wsName,
    description: description || undefined,
    branch,
    created: new Date().toISOString().split("T")[0],
    repos,
    ...(Object.keys(wsIntegrationSettings).length > 0
      ? { settings: { integrations: wsIntegrationSettings } }
      : {}),
  }
  writeWorkspace(workspace)

  // Generate artifacts for each enabled integration
  const ctx: IntegrationContext = { workspace, tasksDir, config }
  const artifacts: Array<{ integration: (typeof integrations)[number]; path: string | null }> = []

  for (const integration of integrations) {
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(workspace)) continue
    const path = integration.generate?.(ctx) ?? null
    artifacts.push({ integration, path })
    if (path) p.log.success(`${integration.label}: ${path}`)
  }

  // Offer to open
  const openNow = await p.confirm({
    message: "Open workspace now?",
    initialValue: true,
  })
  if (!p.isCancel(openNow) && openNow) {
    for (const { integration, path } of artifacts) {
      await integration.open(ctx, path)
    }
  }

  p.outro(`Workspace '${wsName}' ready.  Run \`ws open ${wsName}\` to re-open.`)
}
