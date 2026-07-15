import { prompts as p, safeText, cancel } from "../prompts"

import { existsSync } from "fs"
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
} from "@git-stacks/core/config"
import { getTasksDir, expandHome } from "@git-stacks/core/paths"
import { getCurrentBranch } from "@git-stacks/core/git"
import { detectRepoType } from "@git-stacks/core/detect"
import { integrations, resolveEnabledGlobally } from "@git-stacks/core/integrations"
import { promptIntegrationOverrides } from "./integration-helpers"
import { openWorkspace } from "@git-stacks/core/workspace-ops"
import { createWorkspace } from "@git-stacks/core/workspace-lifecycle"
import { createWorkspaceFromRequest } from "@git-stacks/core/workspace-creation"
import { composeTemplates } from "@git-stacks/core/composition"
import { mergePorts } from "@git-stacks/core/ports"
import { prepareWorkspaceSource, formatWorkspaceSourceError, _source } from "@git-stacks/core/workspace-source"

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
        ...(tplRepo.commands ? { commands: { ...tplRepo.commands } } : {}),
      })
      continue
    }

    const mode = tplRepo.mode ?? "worktree"
    if (mode === "worktree") {
      repos.push({
        name: regEntry.name,
        repo: tplRepo.repo,
        type: regEntry.type,
        mode,
        main_path: regEntry.local_path,
        task_path: join(tasksDir, wsName, regEntry.name),
        base_branch: tplRepo.base_branch ?? regEntry.default_branch,
        ...(tplRepo.commands ? { commands: { ...tplRepo.commands } } : {}),
      })
    } else {
      repos.push({
        name: regEntry.name,
        repo: tplRepo.repo,
        type: regEntry.type,
        mode,
        main_path: regEntry.local_path,
        base_branch: tplRepo.base_branch ?? regEntry.default_branch,
        ...(tplRepo.commands ? { commands: { ...tplRepo.commands } } : {}),
      })
    }
  }

  return repos
}

export async function runWorkspaceNew(
  nameArg?: string,
  fromSource?: string,
  templateNames?: string[],
  cliLabels?: string[],
  opts?: { nonInteractive?: boolean; source?: string; repo?: string; dryRun?: boolean; branch?: string; open?: boolean },
) {
  p.intro("New workspace")

  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)

  if (opts?.nonInteractive) {
    if (opts.source) {
      try {
        // D-03 full URL only.
        // eslint-disable-next-line no-new
        new URL(opts.source)
      } catch {
        console.error("[git-stacks] --source must be a full forge web URL.")
        process.exit(1)
      }
      if (fromSource) {
        console.error("[git-stacks] Error: --from and --source are mutually exclusive")
        process.exit(1)
      }
      if (!templateNames || templateNames.length === 0) {
        console.error("[git-stacks] --source requires --template")
        process.exit(1)
      }
      if (!nameArg?.trim()) {
        console.error("[git-stacks] --non-interactive requires: <name> (positional argument)")
        process.exit(1)
      }
    }
    const missing: string[] = []
    if (!nameArg?.trim()) missing.push("<name> (positional argument)")
    if (!fromSource && (!templateNames || templateNames.length === 0)) {
      missing.push("--from <template> or --template <name>")
    }
    if (missing.length > 0) {
      console.error(`[git-stacks] --non-interactive requires: ${missing.join(", ")}`)
      process.exit(1)
    }

    const wsName = nameArg!.trim()
    if (workspaceExists(wsName)) {
      console.error(`[git-stacks] Workspace '${wsName}' already exists.`)
      process.exit(1)
    }

    const registry = readRegistry()
    let repos: WorkspaceRepo[] = []
    let templateName: string | undefined
    let template: Template | undefined
    let wsHooks: Workspace["hooks"] | undefined
    let wsCommands: Workspace["commands"] | undefined
    let wsEnv: Record<string, string> | undefined
    let wsEnvFile: string | undefined
    let wsFiles: Workspace["files"]
    let wsIntegrationSettings: Record<string, unknown> | undefined
    let wsPorts: Record<string, number | null> | undefined

    if (templateNames && templateNames.length > 0) {
      try {
        template = composeTemplates(templateNames)
      } catch (err) {
        console.error(`[git-stacks] ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
      templateName = templateNames[templateNames.length - 1]
    } else if (fromSource) {
      if (!templateExists(fromSource)) {
        console.error(`[git-stacks] Template '${fromSource}' not found. Note: --non-interactive only supports template names, not local paths.`)
        process.exit(1)
      }
      templateName = fromSource
      const rawTemplate = readTemplate(fromSource)
      if (rawTemplate.includes && rawTemplate.includes.length > 0) {
        try {
          template = composeTemplates([...rawTemplate.includes, templateName])
        } catch (err) {
          console.error(`[git-stacks] ${err instanceof Error ? err.message : String(err)}`)
          process.exit(1)
        }
      } else {
        template = rawTemplate
      }
    }

    if (!template) {
      console.error("[git-stacks] Failed to load template.")
      process.exit(1)
    }

    repos = buildReposFromTemplate(template, registry, wsName, "", tasksDir)
    if (repos.length === 0) {
      console.error("[git-stacks] Template did not resolve any repos.")
      process.exit(1)
    }

    wsHooks = template.hooks ? JSON.parse(JSON.stringify(template.hooks)) : undefined
    wsCommands = template.commands ? { ...template.commands } : undefined
    wsEnv = template.env ? { ...template.env } : undefined
    wsEnvFile = template.env_file
    wsFiles = template.files
    wsIntegrationSettings = template.integrations ? JSON.parse(JSON.stringify(template.integrations)) : undefined
    wsPorts = template.ports ? { ...template.ports } : undefined

    const firstPattern = template.repos.find(r => r.branch_pattern)?.branch_pattern
    let branch = opts.branch?.trim() || (firstPattern ? expandBranchPattern(firstPattern, wsName) : `feature/${wsName}`)
    const labels = normalizeLabels(cliLabels ?? [])
    let sourceMetadata: Workspace["source"] | undefined
    let sourceStartRefs: Record<string, string> | undefined
    let cleanupRef: { repoPath: string; ref: string } | undefined

    if (opts.source) {
      const prepared = await prepareWorkspaceSource({
        sourceUrl: opts.source,
        repoOverride: opts.repo,
        repos,
        registry,
        workspaceName: wsName,
        branch: opts.branch?.trim(),
        dryRun: opts.dryRun,
      })
      if (!prepared.ok) {
        console.error(`[git-stacks] ${formatWorkspaceSourceError(prepared)}`)
        process.exit(1)
      }

      branch = prepared.branch
      sourceMetadata = prepared.sourceMetadata
      if (process.env.GS_TEST_SKIP_SOURCE_FETCH !== "1") {
        sourceStartRefs = { [prepared.matchedRepoName]: prepared.fetchedRef }
        cleanupRef = { repoPath: repos.find(r => r.name === prepared.matchedRepoName)!.main_path, ref: prepared.fetchedRef }
      }

      if (opts.dryRun) {
        console.log(`source: ${prepared.preview.source}`)
        console.log(`forge: ${prepared.preview.forge}`)
        console.log(`change: ${prepared.preview.change}`)
        console.log(`matched repo: ${prepared.preview.matchedRepo}`)
        console.log(`source branch: ${prepared.preview.sourceBranch}`)
        console.log(`source ref: ${prepared.preview.sourceRef}`)
        console.log(`target branch: ${prepared.preview.targetBranch}`)
        console.log(`planned workspace: ${prepared.preview.workspaceName}`)
        return
      }
    }
    const result = await createWorkspace(
      {
        wsName,
        branch,
        ...(templateName ? { templateName } : {}),
        ...(template.labels?.length ? { templateLabels: template.labels } : {}),
        repos,
        ...(wsHooks ? { wsHooks } : {}),
        ...(wsCommands ? { wsCommands } : {}),
        ...(wsEnv ? { wsEnv } : {}),
        ...(wsEnvFile ? { wsEnvFile } : {}),
        ...(wsFiles ? { wsFiles } : {}),
        ...(wsIntegrationSettings ? { wsIntegrationSettings } : {}),
        ...(wsPorts ? { wsPorts } : {}),
        ...(labels.length > 0 ? { labels } : {}),
        ...(sourceMetadata ? { source: sourceMetadata } : {}),
        ...(sourceStartRefs ? { sourceStartRefs } : {}),
      },
      (msg) => p.log.info(msg),
    )

    if (!result.ok) {
      if (cleanupRef) {
        await _source.deleteRef(cleanupRef.repoPath, cleanupRef.ref)
      }
      if (result.rollbackErrors.length > 0) {
        for (const rbErr of result.rollbackErrors) p.log.warn(rbErr)
      }
      console.error(`[git-stacks] Failed to create workspace: ${result.error}`)
      process.exit(1)
    }

    if (opts.open) {
      const openResult = await openWorkspace(wsName, {}, (msg) => p.log.info(msg))
      if (!openResult.ok) {
        p.log.warn(`Open failed: ${openResult.error}`)
      }
    }

    p.outro(`Workspace '${wsName}' ready.  Run \`git-stacks open ${wsName}\` to re-open.`)
    return
  }

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

        if (mode === "worktree") {
          repos.push({
            name: regEntry.name,
            repo: regEntry.name,
            type: regEntry.type,
            mode,
            main_path: regEntry.local_path,
            task_path: join(tasksDir, wsName, regEntry.name),
            base_branch: regEntry.default_branch,
          })
        } else {
          repos.push({
            name: regEntry.name,
            repo: regEntry.name,
            type: regEntry.type,
            mode,
            main_path: regEntry.local_path,
            base_branch: regEntry.default_branch,
          })
        }
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

  // Delegate the entire creation side-effect block to the shared createWorkspace() function.
  // All rollback, hook execution, file ops, env files, post_create, writeWorkspace commit, and
  // runIntegrationGenerate are handled inside that function (D-01, D-02, D-12).
  const result = await createWorkspaceFromRequest(
    {
      name: wsName,
      branch,
      source: templateName
        ? { kind: "template", template: templateName }
        : { kind: "repositories", repositories: repos.map(repo => repo.repo) },
    },
    (msg) => p.log.info(msg),
    {
      // Preserve CLI-only metadata while keeping the creation request boundary
      // limited to name, branch, and source. Repository/template resolution is
      // still owned by the shared planner.
      createWorkspace: (inputs, onProgress) => createWorkspace({
        ...inputs,
        ...(description ? { description } : {}),
        ...(wsIntegrationSettings ? { wsIntegrationSettings } : {}),
        ...(wsPorts ? { wsPorts } : {}),
        ...(labels.length > 0 ? { labels } : {}),
      }, onProgress),
    },
  )

  if (!result.ok) {
    // Surface any rollback errors so the user knows cleanup was partial
    if (result.rollbackErrors.length > 0) {
      for (const rbErr of result.rollbackErrors) {
        p.log.warn(rbErr)
      }
    }
    p.cancel(`Failed to create workspace: ${result.error}`)
    process.exit(1)
  }

  // Offer to open the newly-created workspace
  const openNow = await p.confirm({ message: "Open workspace now?", initialValue: true })
  if (!p.isCancel(openNow) && openNow) {
    const openResult = await openWorkspace(wsName, {}, (msg) => p.log.info(msg))
    if (!openResult.ok) {
      p.log.warn(`Open failed: ${openResult.error}`)
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
