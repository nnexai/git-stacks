import { Command } from "commander"
import { stringify } from "yaml"
import { integrations } from "../lib/integrations/index"
import { resolveEnabled, resolveEnabledGlobally } from "../lib/integrations/types"
import { readGlobalConfig, readWorkspace, workspaceExists } from "../lib/config"

export const integrationCommand = new Command("integration")
  .description("Integration helper commands")

// Register list command BEFORE the per-integration loop to avoid name collision with integration IDs
integrationCommand
  .command("list [workspace]")
  .description("List all integrations with enabled/disabled status")
  .option("--json", "Output as JSON")
  .action((workspace?: string, opts?: { json?: boolean }) => {
    const globalConfig = readGlobalConfig()
    const ws = workspace && workspaceExists(workspace) ? readWorkspace(workspace) : undefined
    if (workspace && !ws) {
      console.error(`Workspace '${workspace}' not found.`)
      process.exit(1)
    }
    const rows = integrations.map((i) => {
      const enabled = ws
        ? resolveEnabled(i.id, i.enabledByDefault, { workspace: ws, config: globalConfig, tasksDir: "" })
        : resolveEnabledGlobally(i.id, i.enabledByDefault, globalConfig)
      const configured = Object.keys(globalConfig.integrations[i.id] ?? {}).length > 0
      return { id: i.id, label: i.label, enabled, configured }
    })
    if (opts?.json) {
      console.log(JSON.stringify(rows, null, 2))
      return
    }
    console.log(`${"ID".padEnd(14)} ${"Label".padEnd(18)} ${"Enabled".padEnd(9)} Configured`)
    console.log(`${"─".repeat(14)} ${"─".repeat(18)} ${"─".repeat(9)} ${"─".repeat(10)}`)
    for (const row of rows) {
      const enabledStr = row.enabled ? "yes" : "no"
      const configuredStr = row.configured ? "yes" : "no"
      console.log(`${row.id.padEnd(14)} ${row.label.padEnd(18)} ${enabledStr.padEnd(9)} ${configuredStr}`)
    }
  })

for (const integration of integrations) {
  const sub = new Command(integration.id).description(integration.hint)

  // Generic: config introspection
  const configCmd = sub.command("config").description("Inspect integration configuration")

  configCmd
    .command("example")
    .description("Print a YAML configuration example")
    .action(() => {
      if (integration.configExample) {
        console.log(integration.configExample)
      } else {
        // Fallback for integrations without configExample
        console.log(`No configuration example available for ${integration.id}. See: git-stacks integration ${integration.id} config show`)
      }
    })

  configCmd
    .command("show [workspace]")
    .description("Show current configuration for this integration")
    .option("--json", "Output as JSON")
    .action((workspace?: string, opts?: { json?: boolean }) => {
      const globalConfig = readGlobalConfig()
      const globalRaw = globalConfig.integrations[integration.id] ?? {}
      let wsRaw: Record<string, unknown> | undefined
      let ws: ReturnType<typeof readWorkspace> | undefined
      if (workspace) {
        if (!workspaceExists(workspace)) {
          console.error(`Workspace '${workspace}' not found.`)
          process.exit(1)
        }
        ws = readWorkspace(workspace)
        wsRaw = ws.settings?.integrations?.[integration.id] as Record<string, unknown> | undefined
      }
      const enabled = ws
        ? resolveEnabled(integration.id, integration.enabledByDefault, { workspace: ws, config: globalConfig, tasksDir: "" })
        : resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)

      if (opts?.json) {
        console.log(JSON.stringify({ id: integration.id, enabled, global: globalRaw, workspace: wsRaw ?? null }, null, 2))
        return
      }
      console.log(`Integration: ${integration.id}`)
      console.log(`Enabled:     ${enabled}`)
      console.log(`\nGlobal config:`)
      if (Object.keys(globalRaw).length > 0) {
        console.log(stringify(globalRaw).trimEnd())
      } else {
        console.log("  (none)")
      }
      if (workspace) {
        console.log(`\nWorkspace override (${workspace}):`)
        if (wsRaw && Object.keys(wsRaw).length > 0) {
          console.log(stringify(wsRaw).trimEnd())
        } else {
          console.log("  (none)")
        }
      }
    })

  // Per-integration commands (e.g., niri focus-workspace, tmux attach)
  if (integration.commands) {
    integration.commands(sub)
  }

  integrationCommand.addCommand(sub)
}
