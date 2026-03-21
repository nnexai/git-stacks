import * as p from "@clack/prompts"
import { safeText, cancel } from "./utils"
import {
  readRegistry,
  writeTemplate,
  templateExists,
  readTemplate,
  readGlobalConfig,
  type Template,
  type TemplateRepo,
  type RepoRegistryEntry,
} from "../lib/config"
import { integrations, resolveEnabledGlobally } from "../lib/integrations"
import { promptIntegrationOverrides } from "../lib/integrations/wizard-helpers"

async function pickReposFromRegistry(
  registry: RepoRegistryEntry[],
  message: string
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

  // Step-wise: filter text -> filtered multiselect
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

export async function runTemplateNew(nameArg?: string) {
  p.intro("New template")

  const registry = readRegistry()
  if (registry.length === 0) {
    p.cancel("No repos registered. Run `git-stacks repo add <path>` or `git-stacks repo scan <dir>` first.")
    process.exit(1)
  }

  // Name
  const nameRaw = await safeText({
    message: "Template name",
    fallbackValue: nameArg || undefined,
    validate: (v) => {
      if (!v.trim()) return "Required"
      if (templateExists(v.trim())) return `Template '${v.trim()}' already exists`
    },
  })
  if (p.isCancel(nameRaw)) cancel()
  const name = (nameRaw as string).trim()

  // Description
  const descRaw = await safeText({ message: "Description (optional)" })
  if (p.isCancel(descRaw)) cancel()
  const description = (descRaw as string).trim() || undefined

  // Select repos from registry
  const selectedNames = await pickReposFromRegistry(registry, "Select repos for this template")
  if (selectedNames.length === 0) {
    p.cancel("No repos selected.")
    process.exit(0)
  }

  // Configure each selected repo
  const repos: TemplateRepo[] = []
  for (const repoName of selectedNames) {
    const registryEntry = registry.find(r => r.name === repoName)!

    const modeRaw = await p.select({
      message: `  ${repoName} \u2014 mode`,
      options: [
        { value: "worktree" as const, label: "Worktree", hint: "new branch per workspace" },
        { value: "trunk" as const, label: "Trunk", hint: "reference main clone" },
      ],
      initialValue: "worktree" as const,
    })
    if (p.isCancel(modeRaw)) cancel()
    const mode = modeRaw as "trunk" | "worktree"

    const baseBranchRaw = await safeText({
      message: `  ${repoName} \u2014 base branch`,
      fallbackValue: registryEntry.default_branch,
      validate: (v) => (!v.trim() ? "Required" : undefined),
    })
    if (p.isCancel(baseBranchRaw)) cancel()
    const baseBranch = (baseBranchRaw as string).trim()

    let branchPattern: string | undefined
    if (mode === "worktree") {
      const patternRaw = await safeText({
        message: `  ${repoName} \u2014 branch pattern (use <workspace-name> as placeholder)`,
        fallbackValue: "feature/<workspace-name>",
      })
      if (p.isCancel(patternRaw)) cancel()
      branchPattern = (patternRaw as string).trim() || undefined
    }

    repos.push({
      repo: repoName,
      mode,
      base_branch: baseBranch !== registryEntry.default_branch ? baseBranch : undefined,
      branch_pattern: branchPattern,
    })
  }

  // Optional: hooks
  const addHooks = await p.confirm({
    message: "Add post_open hooks?",
    initialValue: false,
  })
  let hooks: Template["hooks"] | undefined
  if (!p.isCancel(addHooks) && addHooks) {
    const hookCmds: string[] = []
    let addMore = true
    while (addMore) {
      const cmdRaw = await safeText({
        message: "Hook command",
        validate: (v) => (!v.trim() ? "Required" : undefined),
      })
      if (p.isCancel(cmdRaw)) cancel()
      hookCmds.push((cmdRaw as string).trim())

      const more = await p.confirm({ message: "Add another hook?", initialValue: false })
      if (p.isCancel(more)) cancel()
      addMore = more as boolean
    }
    if (hookCmds.length > 0) {
      hooks = { post_open: hookCmds }
    }
  }

  // Optional: integration overrides (D-01, D-02, D-03)
  const config = readGlobalConfig()
  const initialEnabledIds = integrations
    .filter(i => resolveEnabledGlobally(i.id, i.enabledByDefault, config))
    .map(i => i.id)
  const currentConfigs = Object.fromEntries(
    integrations.map(i => [i.id, (config.integrations[i.id] ?? {}) as Record<string, unknown>])
  )
  const integrationOverrides = await promptIntegrationOverrides(initialEnabledIds, currentConfigs)

  // Build and save template
  const template: Template = {
    name,
    schema_version: "1",
    description,
    repos,
    ...(hooks ? { hooks } : {}),
    ...(integrationOverrides && Object.keys(integrationOverrides).length > 0
      ? { integrations: integrationOverrides }
      : {}),
  }

  writeTemplate(template)
  p.outro(`Template '${name}' created with ${repos.length} repo(s).`)
}

export async function runTemplateEdit(name: string) {
  p.intro(`Edit template: ${name}`)

  const template = readTemplate(name)
  const registry = readRegistry()

  // Show current repos
  if (template.repos.length > 0) {
    p.log.info(`Current repos: ${template.repos.map(r => r.repo).join(", ")}`)
  }

  // Choose action
  const actionRaw = await p.select({
    message: "What to edit?",
    options: [
      { value: "repos", label: "Repos", hint: "add/remove repos" },
      { value: "description", label: "Description" },
      { value: "integrations", label: "Integrations", hint: "override per-integration settings" },
      { value: "done", label: "Done", hint: "save and exit" },
    ],
  })
  if (p.isCancel(actionRaw)) cancel()
  const action = actionRaw as string

  if (action === "description") {
    const descRaw = await safeText({
      message: "Description",
      fallbackValue: template.description || "",
    })
    if (p.isCancel(descRaw)) cancel()
    template.description = (descRaw as string).trim() || undefined
    writeTemplate(template)
    p.outro(`Template '${name}' updated.`)
    return
  }

  if (action === "repos") {
    // Re-select repos from registry (current selections pre-checked)
    const currentRepoNames = template.repos.map(r => r.repo)

    if (registry.length === 0) {
      p.cancel("No repos in registry.")
      process.exit(1)
    }

    const selectedRaw = await p.multiselect({
      message: "Select repos (current selection pre-checked)",
      options: registry.map(r => ({
        value: r.name,
        label: r.name,
        hint: `${r.type} \u2014 ${r.local_path}`,
      })),
      initialValues: currentRepoNames.filter(n => registry.some(r => r.name === n)),
      required: false,
    })
    if (p.isCancel(selectedRaw)) cancel()
    const selectedNames = selectedRaw as string[]

    // Keep existing config for repos that are still selected
    const updatedRepos: TemplateRepo[] = []
    for (const repoName of selectedNames) {
      const existing = template.repos.find(r => r.repo === repoName)
      if (existing) {
        updatedRepos.push(existing)
      } else {
        // New repo — prompt for config
        const registryEntry = registry.find(r => r.name === repoName)!
        const modeRaw = await p.select({
          message: `  ${repoName} \u2014 mode`,
          options: [
            { value: "worktree" as const, label: "Worktree" },
            { value: "trunk" as const, label: "Trunk" },
          ],
          initialValue: "worktree" as const,
        })
        if (p.isCancel(modeRaw)) cancel()
        const mode = modeRaw as "trunk" | "worktree"

        let branchPattern: string | undefined
        if (mode === "worktree") {
          const patternRaw = await safeText({
            message: `  ${repoName} \u2014 branch pattern`,
            fallbackValue: "feature/<workspace-name>",
          })
          if (p.isCancel(patternRaw)) cancel()
          branchPattern = (patternRaw as string).trim() || undefined
        }

        updatedRepos.push({
          repo: repoName,
          mode,
          base_branch: registryEntry.default_branch !== "main" ? registryEntry.default_branch : undefined,
          branch_pattern: branchPattern,
        })
      }
    }

    template.repos = updatedRepos
    writeTemplate(template)
    p.outro(`Template '${name}' updated with ${updatedRepos.length} repo(s).`)
    return
  }

  if (action === "integrations") {
    const config = readGlobalConfig()
    const currentOverrides = (template.integrations ?? {}) as Record<string, Record<string, unknown>>
    const initialEnabledIds = integrations.filter(i => {
      const override = currentOverrides[i.id]
      if (override && "enabled" in override) return (override as { enabled: boolean }).enabled
      return resolveEnabledGlobally(i.id, i.enabledByDefault, config)
    }).map(i => i.id)
    const result = await promptIntegrationOverrides(initialEnabledIds, currentOverrides)
    if (result !== undefined) {
      if (Object.keys(result).length > 0) {
        template.integrations = result
      } else {
        delete template.integrations
      }
      writeTemplate(template)
      p.outro(`Template '${name}' updated.`)
    }
    return
  }

  // action === "done"
  p.outro("No changes.")
}
