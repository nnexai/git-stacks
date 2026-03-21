import { Command } from "commander"
import * as p from "@clack/prompts"
import { listWorkspaces, readWorkspace, readGlobalConfig } from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { agentHookPlugins } from "../lib/agent-hooks"
import { sep } from "path"

function detectWorkspaceFromCwd(): string | null {
  // Check environment variable first
  if (process.env.WS_WORKSPACE) return process.env.WS_WORKSPACE

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

    // Detect workspace from cwd or env
    let workspaceName = detectWorkspaceFromCwd()

    if (!workspaceName) {
      const workspaces = listWorkspaces()
      if (workspaces.length === 0) {
        p.log.error("No workspaces found. Create one first with: git-stacks new")
        process.exit(1)
      }

      const selected = await p.select({
        message: "Select a workspace to install hooks into",
        options: workspaces.map((ws) => ({ value: ws.name, label: ws.name })),
      })

      if (p.isCancel(selected)) {
        p.cancel("Cancelled.")
        process.exit(0)
      }

      workspaceName = selected as string
    }

    const workspace = readWorkspace(workspaceName)
    const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")

    if (worktreeRepos.length === 0) {
      p.log.warn(`No worktree repos found in workspace '${workspaceName}'.`)
      p.outro("Nothing to do.")
      return
    }

    if (opts.remove) {
      // Remove all agent hook plugins from all worktree repos
      for (const plugin of agentHookPlugins) {
        for (const repo of worktreeRepos) {
          plugin.remove(repo.task_path)
        }
      }
      p.log.success(
        `Removed hooks from ${worktreeRepos.length} repo(s) in workspace '${workspaceName}'.`
      )
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
        for (const repo of worktreeRepos) {
          plugin.install(repo.task_path, workspace.name)
        }
      }

      p.log.success(
        `Installed hooks for ${selectedPlugins.length} framework(s) into ${worktreeRepos.length} repo(s) in workspace '${workspaceName}'.`
      )
    }

    p.outro("Done.")
  })
