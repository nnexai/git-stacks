import { Command } from "commander"
import * as p from "@clack/prompts"
import { existsSync } from "fs"
import { listWorkspaces, readWorkspace, workspaceExists, readGlobalConfig } from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { isRepoDirty, getCurrentBranch, createWorktree, removeWorktree } from "../lib/git"
import { integrations, type IntegrationContext } from "../lib/integrations"
import { runWorkspaceNew } from "../tui/workspace-wizard"

export function registerWorkspaceCommands(program: Command) {
  program
    .command("new [name]")
    .description("Create a new workspace interactively")
    .action(async (name?: string) => {
      await runWorkspaceNew(name)
    })

  program
    .command("open <name>")
    .description("Open a workspace (VSCode, IntelliJ, cmux)")
    .option("--no-ide", "Skip opening IDEs")
    .option("--no-cmux", "Skip cmux session")
    .action(async (name: string, opts: { ide: boolean; cmux: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)
        process.exit(1)
      }

      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const workspace = readWorkspace(name)

      // Build the set of integrations to skip based on CLI flags
      const skip = new Set<string>()
      if (!opts.ide)  { skip.add("vscode"); skip.add("intellij") }
      if (!opts.cmux) { skip.add("cmux") }

      // Ensure worktrees exist (recreate if missing)
      const missing = workspace.repos.filter(
        (r) => r.mode === "worktree" && !existsSync(r.task_path)
      )
      if (missing.length > 0) {
        const spinner = p.spinner()
        spinner.start("Recreating missing worktrees")
        for (const repo of missing) {
          spinner.message(`${repo.name}…`)
          await createWorktree(repo.main_path, repo.task_path, workspace.branch)
        }
        spinner.stop(`${missing.length} worktree(s) recreated`)
      }

      const ctx: IntegrationContext = { workspace, tasksDir, config }

      for (const integration of integrations) {
        if (skip.has(integration.id)) continue
        if (!integration.isEnabled(ctx)) continue
        if (integration.applies && !integration.applies(workspace)) continue
        const artifactPath = integration.generate?.(ctx) ?? null
        await integration.open(ctx, artifactPath)
      }
    })

  program
    .command("list")
    .description("List all workspaces")
    .action(() => {
      const workspaces = listWorkspaces()
      if (workspaces.length === 0) {
        console.log("No workspaces. Run `ws new` to create one.")
        return
      }
      console.log("")
      for (const ws of workspaces) {
        const wt = ws.repos.filter((r) => r.mode === "worktree").length
        const tr = ws.repos.filter((r) => r.mode === "trunk").length
        console.log(
          `  ${ws.name.padEnd(24)} ${ws.branch.padEnd(40)} ${wt}wt ${tr}tr  ${ws.created}`
        )
      }
    })

  program
    .command("status [name]")
    .description("Show workspace status — dirty state, worktree health")
    .action(async (name?: string) => {
      const workspaces = name ? [readWorkspace(name)] : listWorkspaces()
      if (workspaces.length === 0) {
        console.log("No workspaces.")
        return
      }

      for (const ws of workspaces) {
        console.log(`\n  ${ws.name}  [${ws.branch}]  ${ws.created}`)
        for (const repo of ws.repos) {
          const exists = existsSync(repo.task_path)
          const dirty = exists ? await isRepoDirty(repo.task_path) : false
          const branch = exists ? await getCurrentBranch(repo.task_path) : "—"
          const icon = !exists ? "✗" : dirty ? "~" : "✓"
          const modeLabel = repo.mode === "worktree" ? `[${branch}]` : "[trunk]"
          console.log(`    ${icon}  ${repo.name.padEnd(28)} ${modeLabel}`)
        }
      }
    })

  program
    .command("clean <name>")
    .description("Remove worktrees for a workspace (config is kept)")
    .action(async (name: string) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found.`)
        process.exit(1)
      }

      const ok = await p.confirm({
        message: `Remove all worktrees for '${name}'? Config is kept.`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }

      const workspace = readWorkspace(name)
      for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
        if (!existsSync(repo.task_path)) {
          console.log(`  skip  ${repo.name} (already removed)`)
          continue
        }
        await removeWorktree(repo.main_path, repo.task_path)
        console.log(`  removed  ${repo.name}`)
      }

      console.log(`\nDone. Config kept at ~/.config/ws/workspaces/${name}.yml`)
      console.log(`Run \`ws open ${name}\` to recreate worktrees.`)
    })
}
