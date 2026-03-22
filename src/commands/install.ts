import { Command } from "commander"
import { prompts as p } from "@/tui/utils"
import type { Workspace } from "../lib/config"
import { listWorkspaces, readWorkspace, readGlobalConfig } from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { agentHookPlugins } from "../lib/agent-hooks"
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

export const installCommand = new Command("install")
  .description("Install agent framework hooks into workspace repos")
  .option("--hooks", "Install agent notification hooks")
  .option("--remove", "Remove installed hooks instead of installing")
  .action(async (opts: { hooks?: boolean; remove?: boolean }) => {
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
      for (const plugin of agentHookPlugins) {
        plugin.remove(targetDir)
      }
      p.log.success(`Removed hooks from ${targetDir}`)
    } else {
      // Multi-select plugins to install
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
      const selectedPlugins = agentHookPlugins.filter((p) => selectedIds.includes(p.id))

      for (const plugin of selectedPlugins) {
        plugin.install(targetDir, workspace.name)
      }

      p.log.success(
        `Installed ${selectedPlugins.map((p) => p.label).join(", ")} hooks into ${targetDir} (workspace: ${workspace.name})`
      )
    }

    p.outro("Done.")
  })
