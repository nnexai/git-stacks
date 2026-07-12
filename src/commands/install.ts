import { Command } from "commander"
import { prompts as p } from "../tui/utils"
import type { Workspace } from "../lib/config"
import { listWorkspaces, readWorkspace, readGlobalConfig } from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { agentHookPlugins } from "../lib/agent-hooks"
import type { AgentHookPlugin } from "../lib/agent-hooks"
import { sep } from "path"

function detectWorkspaceFromCwd(): string | null {
  // Check environment variable first
  if (process.env.GS_WORKSPACE_NAME) return process.env.GS_WORKSPACE_NAME

  const globalConfig = readGlobalConfig()
  const workspaceRoot = globalConfig.workspace_root
  const tasksDir = getTasksDir(workspaceRoot)
  const cwd = process.cwd()

  // cwd must start with tasksDir + sep
  const prefix = tasksDir + sep
  if (!cwd.startsWith(prefix)) return null

  // Extract the next path segment after tasksDir
  const rest = cwd.slice(prefix.length)
  const segments = rest.split(sep)
  if (segments.length === 0 || !segments[0]) return null
  return segments[0]
}

function resolvePlugins(
  opts: { copilot?: boolean; claude?: boolean; codex?: boolean },
  allPlugins: AgentHookPlugin[]
): AgentHookPlugin[] {
  const hasCopilot = opts.copilot === true
  const hasClaude = opts.claude === true
  const hasCodex = opts.codex === true

  if (!hasCopilot && !hasClaude && !hasCodex) {
    // No flags — return empty to signal "use interactive prompt"
    return []
  }

  const selected: AgentHookPlugin[] = []
  if (hasClaude) {
    const claude = allPlugins.find(p => p.id === "claude-code")
    if (claude) selected.push(claude)
  }
  if (hasCopilot) {
    const copilot = allPlugins.find(p => p.id === "copilot")
    if (copilot) selected.push(copilot)
  }
  if (hasCodex) {
    const codex = allPlugins.find(p => p.id === "codex")
    if (codex) selected.push(codex)
  }
  return selected
}

export const installCommand = new Command("install")
  .description("Install agent framework hooks into workspace repos")
  .option("--hooks", "Install agent notification hooks")
  .option("--remove", "Remove installed hooks instead of installing")
  .option("--copilot", "Install GitHub Copilot hooks")
  .option("--claude", "Install Claude Code hooks")
  .option("--codex", "Install Codex hooks")
  .action(async (opts: { hooks?: boolean; remove?: boolean; copilot?: boolean; claude?: boolean; codex?: boolean }) => {
    if (!opts.hooks) {
      installCommand.help()
      return
    }

    p.intro("git-stacks install")

    let workspace: Workspace

    // Detect workspace from cwd or env
    const detectedName = detectWorkspaceFromCwd()

    if (detectedName) {
      try {
        workspace = readWorkspace(detectedName)
      } catch {
        p.log.error(`Detected workspace '${detectedName}' but could not read its config.`)
        process.exit(1)
      }
    } else {
      const workspaces = listWorkspaces()
      if (workspaces.length === 0) {
        p.log.error("No workspaces found. Create one first with: git-stacks new")
        process.exit(1)
      }

      const selected = await p.select({
        message: "Select a workspace to install hooks into",
        options: workspaces.map((ws) => ({ value: ws, label: ws.name })),
      })

      if (p.isCancel(selected)) {
        p.cancel("Cancelled.")
        process.exit(0)
      }

      workspace = selected as Workspace
    }

    const targetDir = process.cwd()

    if (opts.remove) {
      const pluginsToRemove = resolvePlugins(opts, agentHookPlugins)
      const targets = pluginsToRemove.length > 0 ? pluginsToRemove : agentHookPlugins
      for (const plugin of targets) {
        plugin.remove(targetDir)
      }
      p.log.success(`Removed ${targets.map(pl => pl.label).join(", ")} hooks from ${targetDir}`)
    } else {
      // Resolve plugins from flags or interactive prompt
      let selectedPlugins: AgentHookPlugin[]
      const fromFlags = resolvePlugins(opts, agentHookPlugins)

      if (fromFlags.length > 0) {
        // Flags provided — skip interactive prompt (HOOK-01, HOOK-02, HOOK-04)
        selectedPlugins = fromFlags
      } else {
        // No flags — interactive multi-select (HOOK-03)
        const pluginChoices = await p.multiselect({
          message: "Select agent frameworks to install hooks for",
          options: agentHookPlugins.map((plugin) => ({
            value: plugin.id,
            label: plugin.label,
          })),
          required: true,
        })

        if (p.isCancel(pluginChoices)) {
          p.cancel("Cancelled.")
          process.exit(0)
        }

        const selectedIds = pluginChoices as string[]
        selectedPlugins = agentHookPlugins.filter((p) => selectedIds.includes(p.id))
      }

      for (const plugin of selectedPlugins) {
        plugin.install(targetDir, workspace.name)
      }

      p.log.success(
        `Installed ${selectedPlugins.map((p) => p.label).join(", ")} hooks into ${targetDir} (workspace: ${workspace.name})`
      )
      if (selectedPlugins.some((plugin) => plugin.id === "codex")) {
        p.log.info("Review and trust the project hooks in Codex before relying on attention updates.")
      }
    }

    p.outro("Done.")
  })
