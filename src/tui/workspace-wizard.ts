import { prompts as p, safeText, cancel } from "./utils"
import { mkdirSync, existsSync } from "fs"
import { join, resolve, basename } from "path"
import {
  readRegistry,
  writeRegistry,
  readTemplate,
  listTemplates,
  templateExists,
  readWorkspace,
  writeWorkspace,
  workspaceExists,
  readGlobalConfig,
  expandBranchPattern,
  type WorkspaceRepo,
  type Workspace,
  type Template,
  type RepoRegistryEntry,
} from "../lib/config"
import { getTasksDir, expandHome } from "../lib/paths"
import { createWorktree, getCurrentBranch, ensureUpstreamTracking } from "../lib/git"
import { detectRepoType } from "../lib/detect"
import { integrations, resolveEnabledGlobally, type IntegrationContext } from "../lib/integrations"
import { promptIntegrationOverrides } from "../lib/integrations/wizard-helpers"
import { runIntegrationGenerate } from "../lib/integrations/runner"
import { runHooks } from "../lib/lifecycle"
import { applyFileOpsForRepo, applyFileOpsForWorkspace } from "../lib/files"
import { openWorkspace } from "../lib/workspace-ops"
import { composeTemplates } from "../lib/composition"
import { mergePorts } from "../lib/ports"

const LABEL_REGEX = /^[A-Za-z0-9._:-]+$/

function normalizeLabels(labels: string[]): string[] {
  const trimmed = labels.map(label => label.trim()).filter(Boolean)
  const invalid = trimmed.find(label => !LABEL_REGEX.test(label))
  if (invalid) {
    p.cancel(`Invalid label "${invalid}". Labels may only contain letters, digits, dots, colons, hyphens, underscores.`)
    process.exit(1)
  }
  return [...new Set(trimmed)]
}

async function pickReposFromRegistry(
  registry: RepoRegistryEntry[],
  message: string,
): Promise<string[]> {
  if (registry.length <= 20) {
    const selectedRaw = await p.multiselect({
      message,
      options: registry.map(r => ({ value: r.name, label: r.name, hint: `${r.type} \u2014 ${r.local_path}` })),
      required: true,
    })
    if (p.isCancel(selectedRaw)) cancel()
    return selectedRaw as string[]
  }
  const filterRaw = await safeText({
    message: `${message} (type to filter, empty = show all)`,
  })
  if (p.isCancel(filterRaw)) cancel()
  const filter = (filterRaw as string).trim().toLowerCase()
  const filtered = filter
    ? registry.filter(r => r.name.toLowerCase().includes(filter))
    : registry
  if (filtered.length === 0) {
    p.log.warn(`No repos match '${filter}'.`)
    return []
  }
  const selectedRaw = await p.multiselect({
    message: `Select repos (${filtered.length} shown)`,
    options: filtered.map(r => ({ value: r.name, label: r.name, hint: `${r.type} \u2014 ${r.local_path}` })),
    required: true,
  })
  if (p.isCancel(selectedRaw)) cancel()
  return selectedRaw as string[]
}

function buildReposFromTemplate(
  template: Template,
  registry: RepoRegistryEntry[],
  wsName: string,
  _branch: string,
  tasksDir: string,
): WorkspaceRepo[] {
  const registryMap = new Map(registry.map(r => [r.name, r]))
  const repos: WorkspaceRepo[] = []

  for (const tplRepo of template.repos) {
    const regEntry = registryMap.get(tplRepo.repo)
    if (!regEntry) {
      p.log.warn(`Registry entry '${tplRepo.repo}' not found \u2014 skipping`)
      continue
    }

    // Dir repos: reference main_path only, no worktree, no branch
    if (regEntry.is_dir) {
      repos.push({
        name: regEntry.name,
        repo: tplRepo.repo,
        type: regEntry.type,
        mode: "dir" as const,
        main_path: regEntry.local_path,
      })
      continue
    }

    const mode = tplRepo.mode ?? "worktree"
    const taskPath = mode === "worktree"
      ? join(tasksDir, wsName, regEntry.name)
      : regEntry.local_path

    repos.push({
      name: regEntry.name,
      repo: tplRepo.repo,
      type: regEntry.type,
      mode,
      main_path: regEntry.local_path,
      task_path: taskPath,
      base_branch: tplRepo.base_branch ?? regEntry.default_branch,
    })
  }

  return repos
}

export async function runWorkspaceNew(
  nameArg?: string,
  fromSource?: string,
  templateNames?: string[],
  cliLabels?: string[],
) {
  p.intro("New workspace")

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)

  // Name
  const nameRaw = await safeText({
    message: "Workspace name (ticket or purpose)",
    fallbackValue: nameArg || undefined,
    validate: (v) => {
      if (!v?.trim()) return "Required"
      if (workspaceExists(v.trim())) return `Workspace '${v.trim()}' already exists`
    },
  })
  if (p.isCancel(nameRaw)) cancel()
  const wsName = (nameRaw as string).trim()

  let repos: WorkspaceRepo[] = []
  let templateName: string | undefined
  let wsHooks: Workspace["hooks"] | undefined
  let wsEnv: Record<string, string> | undefined
  let wsEnvFile: string | undefined
  let wsFiles: Workspace["files"]
  let wsIntegrationSettings: Record<string, unknown> | undefined
  let wsPorts: Record<string, number | null> | undefined
  let template: Template | undefined

  // Determine creation mode
  if (templateNames && templateNames.length > 0) {
    // CLI --template flag: compose from multiple templates
    const registry = readRegistry()
    try {
      template = composeTemplates(templateNames)
    } catch (err) {
      p.cancel(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }

    if (!template) {
      p.cancel("Failed to compose template.")
      process.exit(1)
    }
    templateName = templateNames[templateNames.length - 1] // top-level template name for metadata
    repos = buildReposFromTemplate(template, registry, wsName, "", tasksDir)
    wsHooks = template.hooks ? JSON.parse(JSON.stringify(template.hooks)) : undefined
    wsEnv = template.env ? { ...template.env } : undefined
    wsEnvFile = template.env_file
    wsFiles = template.files
    wsIntegrationSettings = template.integrations ? JSON.parse(JSON.stringify(template.integrations)) : undefined
    wsPorts = template.ports ? { ...template.ports } : undefined
  } else if (fromSource) {
    // --from was specified: resolve as local path or template name
    const expanded = expandHome(fromSource)
    const resolved = resolve(expanded)

    if (existsSync(resolved) && existsSync(join(resolved, ".git"))) {
      // --from <local-path>: auto-register + create 1-repo workspace
      const registry = readRegistry()
      const autoName = basename(resolved)
      const regName = autoName
      if (registry.some(r => r.name === regName)) {
        // Already registered — just use it
        p.log.info(`Repo '${regName}' already registered.`)
      } else {
        const type = detectRepoType(resolved)
        const branch = await getCurrentBranch(resolved)
        registry.push({
          name: regName,
          schema_version: "1",
          local_path: resolved,
          default_branch: branch,
          type,
          is_dir: false,
        })
        writeRegistry(registry)
        p.log.success(`Auto-registered '${regName}' at ${resolved}`)
      }

      const regEntry = registry.find(r => r.name === regName)!
      repos = [{
        name: regEntry.name,
        repo: regEntry.name,
        type: regEntry.type,
        mode: "worktree" as const,
        main_path: regEntry.local_path,
        task_path: join(tasksDir, wsName, regEntry.name),
        base_branch: regEntry.default_branch,
      }]
    } else if (templateExists(fromSource)) {
      // --from <template-name>: create from template (resolve includes if present)
      templateName = fromSource
      const rawTemplate = readTemplate(fromSource)
      const registry = readRegistry()

      if (rawTemplate.includes && rawTemplate.includes.length > 0) {
        try {
          template = composeTemplates([...rawTemplate.includes, templateName])
        } catch (err) {
          p.cancel(err instanceof Error ? err.message : String(err))
          process.exit(1)
        }
      } else {
        template = rawTemplate
      }

      if (!template) {
        p.cancel("Failed to load template.")
        process.exit(1)
      }
      repos = buildReposFromTemplate(template, registry, wsName, "", tasksDir)

      // Snapshot template config into workspace
      wsHooks = template.hooks ? JSON.parse(JSON.stringify(template.hooks)) : undefined
      wsEnv = template.env ? { ...template.env } : undefined
      wsEnvFile = template.env_file
      wsFiles = template.files
      wsIntegrationSettings = template.integrations ? JSON.parse(JSON.stringify(template.integrations)) : undefined
      wsPorts = template.ports ? { ...template.ports } : undefined
    } else {
      p.cancel(`'${fromSource}' is not a local path or known template name.`)
      process.exit(1)
    }
  } else {
    // No --from: offer template-or-adhoc choice
    const templates = listTemplates()
    const registry = readRegistry()

    if (registry.length === 0 && templates.length === 0) {
      p.cancel("No repos registered and no templates. Run `git-stacks repo add <path>` first.")
      process.exit(1)
    }

    let creationMode: string = "adhoc"
    if (templates.length > 0) {
      const modeRaw = await p.select({
        message: "Create from",
        options: [
          ...(templates.length > 0 ? [{ value: "template", label: "Template", hint: `${templates.length} available` }] : []),
          { value: "adhoc", label: "Pick repos", hint: "select from registry" },
        ],
      })
      if (p.isCancel(modeRaw)) cancel()
      creationMode = modeRaw as string
    }

    if (creationMode === "template") {
      const tplRaw = await p.select({
        message: "Template",
        options: templates.map(t => ({
          value: t.name,
          label: t.name,
          hint: t.description ?? `${t.repos.length} repos`,
        })),
      })
      if (p.isCancel(tplRaw)) cancel()
      templateName = tplRaw as string
      const rawTemplate = readTemplate(templateName)

      // Resolve includes if present
      if (rawTemplate.includes && rawTemplate.includes.length > 0) {
        try {
          template = composeTemplates([...rawTemplate.includes, templateName])
        } catch (err) {
          p.cancel(err instanceof Error ? err.message : String(err))
          process.exit(1)
        }
      } else {
        template = rawTemplate
      }

      if (!template) {
        p.cancel("Failed to load template.")
        process.exit(1)
      }
      repos = buildReposFromTemplate(template, registry, wsName, "", tasksDir)

      // Snapshot template config
      wsHooks = template.hooks ? JSON.parse(JSON.stringify(template.hooks)) : undefined
      wsEnv = template.env ? { ...template.env } : undefined
      wsEnvFile = template.env_file
      wsFiles = template.files
      wsIntegrationSettings = template.integrations ? JSON.parse(JSON.stringify(template.integrations)) : undefined
      wsPorts = template.ports ? { ...template.ports } : undefined
    } else {
      // Ad-hoc: pick repos from registry
      if (registry.length === 0) {
        p.cancel("No repos registered. Run `git-stacks repo add <path>` first.")
        process.exit(1)
      }
      const selectedNames = await pickReposFromRegistry(registry, "Select repos")
      if (selectedNames.length === 0) {
        p.cancel("No repos selected.")
        process.exit(0)
      }

      for (const repoName of selectedNames) {
        const regEntry = registry.find(r => r.name === repoName)!
        const modeRaw = await p.select({
          message: `  ${repoName} \u2014 mode`,
          options: [
            { value: "worktree" as const, label: "Worktree", hint: "new branch" },
            { value: "trunk" as const, label: "Trunk", hint: "reference main clone" },
          ],
          initialValue: "worktree" as const,
        })
        if (p.isCancel(modeRaw)) cancel()
        const mode = modeRaw as "trunk" | "worktree"

        repos.push({
          name: regEntry.name,
          repo: regEntry.name,
          type: regEntry.type,
          mode,
          main_path: regEntry.local_path,
          task_path: mode === "worktree" ? join(tasksDir, wsName, regEntry.name) : regEntry.local_path,
          base_branch: regEntry.default_branch,
        })
      }
    }
  }

  if (repos.length === 0) {
    p.cancel("No repos selected.")
    process.exit(0)
  }

  // Labels
  let labels = normalizeLabels(cliLabels ?? [])
  if (labels.length === 0) {
    const labelsRaw = await safeText({
      message: "Labels (optional, comma-separated):",
      placeholder: "e.g. backend, sprint:14",
    })
    if (p.isCancel(labelsRaw)) cancel()
    const labelsStr = (labelsRaw as string).trim()
    if (labelsStr) {
      labels = normalizeLabels(labelsStr.split(","))
    }
  }
  if (template?.labels?.length) {
    labels = [...new Set([...template.labels, ...labels])]
  }

  // Branch — expand patterns if template had branch_pattern
  const defaultBranch = templateName
    ? (() => {
        const tpl = readTemplate(templateName!)
        const firstPattern = tpl.repos.find(r => r.branch_pattern)?.branch_pattern
        return firstPattern ? expandBranchPattern(firstPattern, wsName) : `feature/${wsName}`
      })()
    : `feature/${wsName}`

  const branchRaw = await safeText({
    message: "Branch name",
    fallbackValue: defaultBranch,
    validate: (v) => (v?.trim() ? undefined : "Required"),
  })
  if (p.isCancel(branchRaw)) cancel()
  const branch = (branchRaw as string).trim()

  // Description
  const descRaw = await safeText({ message: "Description (optional)" })
  if (p.isCancel(descRaw)) cancel()
  const description = (descRaw as string).trim()

  // Port names (optional) — per D-01
  const portsRaw = await safeText({
    message: "Port names (comma-separated, leave empty to skip):",
  })
  if (p.isCancel(portsRaw)) cancel()
  const portNamesInput = (portsRaw as string).trim()
  const portNames = portNamesInput
    ? portNamesInput.split(",").map(s => s.trim()).filter(Boolean)
    : []

  // Build user-declared ports (all null = unresolved)
  const userDeclaredPorts: Record<string, number | null> | undefined =
    portNames.length > 0
      ? Object.fromEntries(portNames.map(n => [n, null]))
      : undefined

  // Merge template ports + user-declared ports (workspace/user wins per D-04)
  wsPorts = mergePorts(wsPorts, userDeclaredPorts)

  // Optional: integration overrides (D-05, D-06, D-07)
  let userIntegrationOverrides: Record<string, unknown> | undefined
  if (templateName) {
    // Template-based: pre-select from template's integrations (D-06)
    const tplIntegrations = (wsIntegrationSettings ?? {}) as Record<string, Record<string, unknown>>
    const initialEnabledIds = integrations.filter(i => {
      const override = tplIntegrations[i.id]
      if (override && typeof override === "object" && "enabled" in override) {
        return (override as { enabled: boolean }).enabled
      }
      return resolveEnabledGlobally(i.id, i.enabledByDefault, config)
    }).map(i => i.id)
    userIntegrationOverrides = await promptIntegrationOverrides(initialEnabledIds, tplIntegrations)
  } else {
    // Ad-hoc: pre-select from global config (D-06)
    const initialEnabledIds = integrations
      .filter(i => resolveEnabledGlobally(i.id, i.enabledByDefault, config))
      .map(i => i.id)
    const currentConfigs = Object.fromEntries(
      integrations.map(i => [i.id, (config.integrations[i.id] ?? {}) as Record<string, unknown>])
    )
    userIntegrationOverrides = await promptIntegrationOverrides(initialEnabledIds, currentConfigs)
  }

  // Merge: user overrides take precedence over template snapshot
  if (userIntegrationOverrides && Object.keys(userIntegrationOverrides).length > 0) {
    wsIntegrationSettings = userIntegrationOverrides
  }

  const baseEnv: Record<string, string> = {
    GS_WORKSPACE_NAME: wsName,
    GS_WORKSPACE_BRANCH: branch,
    GS_WORKSPACE_PATH: tasksDir,
    GS_TRIGGERED_BY: "create",
  }

  // Run pre_create hooks (from snapshot or workspace config)
  if (wsHooks?.pre_create?.length) {
    try {
      await runHooks(wsHooks.pre_create, tasksDir, baseEnv)
    } catch (err) {
      p.cancel(`pre_create hook failed: ${err}`)
      process.exit(1)
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
      spinner.message(`${repo.name}\u2026`)
      try {
        await createWorktree(repo.main_path, repo.task_path, branch)
      } catch (err) {
        spinner.stop(`Failed on ${repo.name}`)
        p.log.error(String(err))
        process.exit(1)
      }
    }
    spinner.stop(`${worktreeRepos.length} worktree(s) created`)

    // Set upstream tracking for branches that exist on origin
    const trackingResults = await Promise.all(
      worktreeRepos.map(repo => ensureUpstreamTracking(repo.main_path, branch))
    )
    const tracked = trackingResults.filter(r => r.tracked)
    if (tracked.length > 0) {
      p.log.info(`Upstream tracking set for ${tracked.length} repo(s)`)
    }
  }

  // Merge env (workspace-level)
  const envVars: Record<string, string> = wsEnv ? { ...wsEnv } : {}
  const enrichedBaseEnv = { ...baseEnv, ...envVars }

  const wsDir = join(tasksDir, wsName)

  // Build integration settings from template snapshot
  const settingsIntegrations = wsIntegrationSettings && Object.keys(wsIntegrationSettings).length > 0
    ? { settings: { integrations: wsIntegrationSettings } }
    : {}

  // Build workspace object before file ops so we can pass a real Workspace to applyFileOpsForWorkspace
  const workspaceObj: Workspace = {
    name: wsName,
    schema_version: "1",
    description: description || undefined,
    branch,
    created: new Date().toISOString().split("T")[0],
    ...(templateName ? { template: templateName } : {}),
    ...(wsHooks ? { hooks: wsHooks } : {}),
    repos,
    ...(wsEnv ? { env: wsEnv } : {}),
    ...(wsEnvFile ? { env_file: wsEnvFile } : {}),
    ...(wsFiles ? { files: wsFiles } : {}),
    ...settingsIntegrations,
    ...(wsPorts ? { ports: wsPorts } : {}),
    ...(labels.length > 0 ? { labels } : {}),
  } as Workspace

  // File ops
  const opsSpinner = p.spinner()
  opsSpinner.start("Applying file ops")

  // Per-repo file ops
  for (const wsRepo of repos.filter(r => r.mode === "worktree")) {
    if (!wsRepo.files) continue
    opsSpinner.message(`files: ${wsRepo.name}`)
    const repoLike = {
      name: wsRepo.name,
      path: wsRepo.main_path,
      files: wsRepo.files,
    }
    const fileResult = applyFileOpsForRepo(repoLike, wsRepo)
    if (!fileResult.ok) {
      opsSpinner.stop(`File operation failed for ${wsRepo.name}`)
      p.log.error(fileResult.error)
      process.exit(1)
    }
    if (fileResult.warnings) {
      for (const w of fileResult.warnings) p.log.warn(w)
    }
  }

  // Workspace-instance file ops
  if (wsFiles) {
    const sourceLike = { files: wsFiles }
    const wsFileResult = applyFileOpsForWorkspace(sourceLike, workspaceObj, wsDir)
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

  // Env files
  if (wsEnvFile && Object.keys(envVars).length > 0) {
    const { writeFileSync, lstatSync } = await import("fs")
    const content = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
    for (const repo of worktreeRepos) {
      if (!existsSync(repo.task_path)) continue
      const targetPath = join(repo.task_path, wsEnvFile)
      try {
        if (lstatSync(targetPath).isSymbolicLink()) {
          p.log.warn(`skipping env file write: ${targetPath} is a symlink`)
          continue
        }
      } catch { /* file doesn't exist yet */ }
      writeFileSync(targetPath, content, "utf-8")
    }
  }

  // post_create hooks
  if (wsHooks?.post_create?.length) {
    const hooksSpinner = p.spinner()
    hooksSpinner.start("Running post_create hooks")
    try {
      await runHooks(wsHooks.post_create, wsDir, enrichedBaseEnv)
      hooksSpinner.stop("post_create hooks done")
    } catch (err) {
      hooksSpinner.stop("Hook failed")
      p.log.error(String(err))
      process.exit(1)
    }
  }

  // Save workspace config
  writeWorkspace(workspaceObj)

  // Generate integration artifacts
  const ctx: IntegrationContext = { workspace: workspaceObj, tasksDir, config }
  const results = await runIntegrationGenerate(ctx)
  for (const { integration, path } of results) {
    if (path) p.log.success(`${integration.label}: ${path}`)
  }

  // Offer to open
  const openNow = await p.confirm({ message: "Open workspace now?", initialValue: true })
  if (!p.isCancel(openNow) && openNow) {
    const result = await openWorkspace(wsName, {}, (msg) => p.log.info(msg))
    if (!result.ok) {
      p.log.warn(`Open failed: ${result.error}`)
    }
  }

  p.outro(`Workspace '${wsName}' ready.  Run \`git-stacks open ${wsName}\` to re-open.`)
}

export async function runWorkspaceEdit(name: string) {
  p.intro(`Edit workspace: ${name}`)

  const ws = readWorkspace(name)
  const config = readGlobalConfig()

  const actionRaw = await p.select({
    message: "What to edit?",
    options: [
      { value: "integrations", label: "Integrations", hint: "override per-integration settings" },
      { value: "description", label: "Description" },
      { value: "done", label: "Done", hint: "exit without changes" },
    ],
  })
  if (p.isCancel(actionRaw)) cancel()
  const action = actionRaw as string

  if (action === "integrations") {
    const currentOverrides = (ws.settings?.integrations ?? {}) as Record<string, Record<string, unknown>>
    const initialEnabledIds = integrations.filter(i => {
      const override = currentOverrides[i.id]
      if (override && typeof override === "object" && "enabled" in override) {
        return (override as { enabled: boolean }).enabled
      }
      return resolveEnabledGlobally(i.id, i.enabledByDefault, config)
    }).map(i => i.id)
    const result = await promptIntegrationOverrides(initialEnabledIds, currentOverrides)
    if (result !== undefined) {
      const updatedWs = { ...ws }
      if (Object.keys(result).length > 0) {
        updatedWs.settings = { ...(ws.settings ?? {}), integrations: result }
      } else {
        // User selected nothing — remove integrations override
        if (updatedWs.settings) {
          const { integrations: _, ...rest } = updatedWs.settings as Record<string, unknown>
          updatedWs.settings = Object.keys(rest).length > 0 ? rest as Workspace["settings"] : undefined
        }
      }
      writeWorkspace(updatedWs)
      p.outro(`Workspace '${name}' updated.`)
    } else {
      p.outro("No changes.")
    }
    return
  }

  if (action === "description") {
    const descRaw = await safeText({
      message: "Description",
      fallbackValue: ws.description || "",
    })
    if (p.isCancel(descRaw)) cancel()
    const updatedWs = { ...ws, description: (descRaw as string).trim() || undefined }
    writeWorkspace(updatedWs)
    p.outro(`Workspace '${name}' updated.`)
    return
  }

  // action === "done"
  p.outro("No changes.")
}
