import { Command } from "commander"
import * as p from "@clack/prompts"
import { readGlobalConfig, writeGlobalConfig } from "../lib/config"
import { GLOBAL_CONFIG_FILE, HOME } from "../lib/paths"
import { safeText, cancel } from "../tui/utils"
import { integrations, resolveEnabledGlobally } from "../lib/integrations"

export const configCommand = new Command("config")
  .description("View and edit global git-stacks configuration")
  .action(async () => {
    p.intro("Configure git-stacks")
    const config = readGlobalConfig()

    const wsRootRaw = await safeText({
      message: "Workspace root",
      fallbackValue: config.workspace_root,
    })
    if (p.isCancel(wsRootRaw)) cancel()

    // Multiselect which integrations to enable
    const initialEnabled = integrations
      .filter((i) => resolveEnabledGlobally(i.id, i.enabledByDefault, config))
      .map((i) => i.id)

    const selectedRaw = await p.multiselect({
      message: "Active integrations",
      options: integrations.map((i) => ({ value: i.id, label: i.label, hint: i.hint })),
      initialValues: initialEnabled,
      required: false,
    })
    if (p.isCancel(selectedRaw)) cancel()
    const selected = new Set(selectedRaw as string[])

    // Configure each enabled integration in order
    const newIntegrations: Record<string, unknown> = {}

    for (const integration of integrations) {
      const current = (config.integrations[integration.id] ?? {}) as Record<string, unknown>
      if (selected.has(integration.id)) {
        const updated = await integration.configurePrompt(current)
        if (updated === null) cancel()
        newIntegrations[integration.id] = updated
      } else {
        // Disabled — preserve extra config (e.g. cmd) in case the user re-enables later
        newIntegrations[integration.id] = { ...current, enabled: false }
      }
    }

    writeGlobalConfig({
      workspace_root: (wsRootRaw as string).trim() || config.workspace_root,
      integrations: newIntegrations,
    })

    p.outro("Configuration saved.")
  })

configCommand
  .command("show")
  .description("Print current configuration")
  .action(() => {
    const config = readGlobalConfig()
    console.log(`workspace_root: ${config.workspace_root}`)
    console.log(`\nIntegrations:`)
    for (const integration of integrations) {
      const enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, config)
      const extra = config.integrations[integration.id]
      const extras = extra && typeof extra === "object"
        ? Object.entries(extra as Record<string, unknown>)
            .filter(([k]) => k !== "enabled")
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : ""
      console.log(`  ${enabled ? "✓" : "✗"}  ${integration.id.padEnd(10)} ${extras}`)
    }
    console.log(`\nConfig: ${GLOBAL_CONFIG_FILE.replace(HOME, "~")}`)
    console.log(`Per-workspace overrides: add settings.integrations.<id>.enabled to the workspace YAML.`)
  })
