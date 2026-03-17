import * as p from "@clack/prompts"
import { mkdirSync, existsSync, writeFileSync } from "fs"
import { safeText, cancel } from "./utils"
import { join } from "path"
import {
  listStacks,
  writeWorkspace,
  workspaceExists,
  readGlobalConfig,
  type WorkspaceRepo,
  type Workspace,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { createWorktree } from "../lib/git"
import { integrations, type IntegrationContext } from "../lib/integrations"
import { runHooks } from "../lib/lifecycle"
import { applyFileOpsForRepo, applyFileOpsForWorkspace } from "../lib/files"

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
    fallbackValue: nameArg || undefined,
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
    fallbackValue: `feature/${wsName}`,
    validate: (v) => (v.trim() ? undefined : "Required"),
  })
  if (p.isCancel(branchRaw)) cancel()
  const branch = (branchRaw as string).trim()

  // Description
  const descRaw = await safeText({ message: "Description (optional)" })
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

  const baseEnv = {
    WS_WORKSPACE: wsName,
    WS_BRANCH: branch,
    WS_TASKS_DIR: tasksDir,
  }

  // Run pre_create hooks before creating worktrees
  for (const stack of selectedStacks) {
    // Stack-level pre_create
    if (stack.hooks?.pre_create?.length) {
      const stackEnv = { ...baseEnv, WS_STACK: stack.name }
      try {
        await runHooks(stack.hooks.pre_create, tasksDir, stackEnv)
      } catch (err) {
        p.cancel(`pre_create hook failed: ${err}`)
        process.exit(1)
      }
    }

    // Repo-level pre_create
    for (const wsRepo of repos.filter(r => r.mode === "worktree" && r.stack === stack.name)) {
      const stackRepo = stack.repos.find(r => r.name === wsRepo.name)
      if (!stackRepo?.hooks?.pre_create?.length) continue
      const repoEnv = {
        ...baseEnv,
        WS_STACK: stack.name,
        WS_REPO_NAME: wsRepo.name,
        WS_WORKTREE_PATH: wsRepo.task_path,
        WS_MAIN_PATH: wsRepo.main_path,
      }
      try {
        await runHooks(stackRepo.hooks.pre_create, wsRepo.main_path, repoEnv)
      } catch (err) {
        p.cancel(`pre_create hook failed for ${wsRepo.name}: ${err}`)
        process.exit(1)
      }
    }
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

  // Merge stack env vars (used for env files and hook environment)
  const stackEnv: Record<string, string> = {}
  for (const stack of selectedStacks) {
    if (stack.env) Object.assign(stackEnv, stack.env)
  }
  const enrichedBaseEnv = { ...baseEnv, ...stackEnv }

  const wsDir = join(tasksDir, wsName)

  const opsSpinner = p.spinner()
  opsSpinner.start("Applying file ops")

  // STEP 1: Per-repo file ops (Level 2) — all repos first
  for (const stack of selectedStacks) {
    for (const wsRepo of repos.filter((r) => r.mode === "worktree" && r.stack === stack.name)) {
      const stackRepo = stack.repos.find((r) => r.name === wsRepo.name)
      if (!stackRepo) continue
      opsSpinner.message(`files: ${wsRepo.name}`)
      const fileResult = applyFileOpsForRepo(stackRepo, wsRepo)
      if (!fileResult.ok) {
        opsSpinner.stop(`File operation failed for ${wsRepo.name}`)
        p.log.error(fileResult.error)
        process.exit(1)
      }
      if (fileResult.warnings) {
        for (const w of fileResult.warnings) p.log.warn(w)
      }
    }
  }

  // STEP 2: Workspace-instance file ops (Level 1) — once per stack, targets wsDir
  // workspace.files is not available yet (YAML not written), so only stack.files applies here.
  for (const stack of selectedStacks) {
    const wsFileResult = applyFileOpsForWorkspace(stack, {} as Workspace, wsDir)
    if (!wsFileResult.ok) {
      opsSpinner.stop("Workspace file operation failed")
      p.log.error(wsFileResult.error)
      process.exit(1)
    }
    if (wsFileResult.warnings) {
      for (const w of wsFileResult.warnings) p.log.warn(w)
    }
  }

  opsSpinner.stop("File ops done")

  // STEP 3: Write env files — after file ops, before hooks
  const envFileName = selectedStacks.find((s) => s.env_file)?.env_file
  if (envFileName) {
    const content = Object.entries(stackEnv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
    for (const repo of worktreeRepos) {
      if (existsSync(repo.task_path)) {
        writeFileSync(join(repo.task_path, envFileName), content, "utf-8")
      }
    }
  }

  // STEP 4: post_create hooks — after file ops and env files
  const hooksSpinner = p.spinner()
  hooksSpinner.start("Running post_create hooks")
  try {
    for (const stack of selectedStacks) {
      for (const wsRepo of repos.filter((r) => r.mode === "worktree" && r.stack === stack.name)) {
        const stackRepo = stack.repos.find((r) => r.name === wsRepo.name)
        if (!stackRepo) continue

        const repoEnv = {
          ...enrichedBaseEnv,
          WS_STACK: stack.name,
          WS_REPO_NAME: wsRepo.name,
          WS_REPO_PATH: wsRepo.task_path,
          WS_MAIN_PATH: wsRepo.main_path,
        }

        if (stackRepo.hooks?.post_create?.length) {
          hooksSpinner.message(`hooks: ${wsRepo.name}`)
          await runHooks(stackRepo.hooks.post_create, wsRepo.task_path, repoEnv)
        }
      }

      if (stack.hooks?.post_create?.length) {
        hooksSpinner.message(`hooks: ${stack.name} (stack)`)
        await runHooks(stack.hooks.post_create, wsDir, { ...enrichedBaseEnv, WS_STACK: stack.name })
      }
    }
    hooksSpinner.stop("post_create hooks done")
  } catch (err) {
    hooksSpinner.stop("Hook failed")
    p.log.error(String(err))
    process.exit(1)
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
    schema_version: "1",
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
