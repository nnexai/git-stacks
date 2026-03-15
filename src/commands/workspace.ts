import { Command } from "commander"
import * as p from "@clack/prompts"
import { existsSync, unlinkSync } from "fs"
import {
  listWorkspaces,
  readWorkspace,
  workspaceExists,
  workspacePath,
  readGlobalConfig,
  type Workspace,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { isBranchGoneOnRemote, removeWorktree } from "../lib/git"
import { runWorkspaceNew } from "../tui/workspace-wizard"
import { runWorkspaceClone } from "../tui/workspace-clone"
import {
  getDirtyWorktrees,
  runPreRemoveHooks,
  getWorkspaceStatus,
  cleanWorkspace,
  removeWorkspace,
  mergeWorkspace,
  openWorkspace,
} from "../lib/workspace-ops"

export function registerWorkspaceCommands(program: Command) {
  program
    .command("new [name]")
    .description("Create a new workspace interactively")
    .action(async (name?: string) => {
      await runWorkspaceNew(name)
    })

  program
    .command("clone [source]")
    .description("Clone a workspace with a new name and branch")
    .action(async (source?: string) => {
      await runWorkspaceClone(source)
    })

  program
    .command("open <name>")
    .description("Open a workspace (VSCode, IntelliJ, cmux, tmux)")
    .option("--no-ide", "Skip opening IDEs")
    .option("--no-cmux", "Skip cmux session")
    .action(async (name: string, opts: { ide: boolean; cmux: boolean }) => {
      const result = await openWorkspace(name, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(result.error)
        process.exit(1)
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
        const repos = await getWorkspaceStatus(ws)
        console.log(`\n  ${ws.name}  [${ws.branch}]  ${ws.created}`)
        for (const repo of repos) {
          const icon = !repo.exists ? "✗" : repo.dirty ? "~" : "✓"
          const modeLabel = repo.mode === "worktree" ? `[${repo.branch}]` : "[trunk]"
          console.log(`    ${icon}  ${repo.name.padEnd(28)} ${modeLabel}`)
        }
      }
    })

  program
    .command("clean [name]")
    .description("Remove worktrees for a workspace (config is kept), or --gone to remove all with deleted remote branches")
    .option("--gone", "Remove workspaces whose upstream branches are deleted")
    .option("--force", "Skip dirty worktree check")
    .action(async (name: string | undefined, opts: { gone?: boolean; force?: boolean }) => {
      if (opts.gone) {
        // --- ws clean --gone ---
        const config = readGlobalConfig()
        const tasksDir = getTasksDir(config.workspace_root)
        const allWorkspaces = listWorkspaces()
        if (allWorkspaces.length === 0) {
          console.log("No workspaces found.")
          return
        }

        const spinner = p.spinner()
        spinner.start("Checking remote branches")
        const goneWorkspaces: Workspace[] = []
        for (const ws of allWorkspaces) {
          const rep = ws.repos.find((r) => r.mode === "worktree")
          if (!rep) continue
          if (await isBranchGoneOnRemote(rep.main_path, ws.branch)) {
            goneWorkspaces.push(ws)
          }
        }
        spinner.stop(`Checked ${allWorkspaces.length} workspace(s)`)

        if (goneWorkspaces.length === 0) {
          console.log("No gone workspaces found.")
          return
        }

        if (!opts.force) {
          const dirtyEntries: string[] = []
          for (const ws of goneWorkspaces) {
            const dirty = await getDirtyWorktrees(ws)
            if (dirty.length > 0) dirtyEntries.push(`  ${ws.name}: ${dirty.join(", ")}`)
          }
          if (dirtyEntries.length > 0) {
            console.error("Aborting: dirty worktrees found:\n" + dirtyEntries.join("\n"))
            console.error("Use --force to skip this check.")
            process.exit(1)
          }
        }

        console.log("\nGone workspaces:")
        for (const ws of goneWorkspaces) {
          console.log(`  ${ws.name.padEnd(24)} ${ws.branch}`)
        }

        const ok = await p.confirm({
          message: `Remove ${goneWorkspaces.length} gone workspace(s)? (worktrees + config)`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }

        for (const ws of goneWorkspaces) {
          try {
            await runPreRemoveHooks(ws, tasksDir)
          } catch (err) {
            console.error(`pre_remove hook failed for '${ws.name}': ${err}`)
            process.exit(1)
          }
          for (const repo of ws.repos.filter((r) => r.mode === "worktree")) {
            if (!existsSync(repo.task_path)) continue
            await removeWorktree(repo.main_path, repo.task_path)
          }
          unlinkSync(workspacePath(ws.name))
          console.log(`  removed  ${ws.name}`)
        }
        return
      }

      // --- ws clean <name> ---
      if (!name) {
        console.error("Usage: ws clean <name> [--gone]")
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

      const result = await cleanWorkspace(name, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(result.error)
        process.exit(1)
      }

      console.log(`\nDone. Run \`ws open ${name}\` to recreate worktrees.`)
    })

  program
    .command("remove <name>")
    .description("Permanently remove a workspace (worktrees + config YAML)")
    .option("--force", "Skip dirty worktree check")
    .action(async (name: string, opts: { force?: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)
        process.exit(1)
      }

      const ok = await p.confirm({
        message: `Permanently remove workspace '${name}' (worktrees + config)?`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }

      const result = await removeWorkspace(name, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(result.error)
        process.exit(1)
      }
    })

  program
    .command("cd <name> [repo]")
    .description("Print path to a workspace (or repo within it) — use via shell function")
    .action((name: string, repo?: string) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found.`)
        process.exit(1)
      }
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const workspace = readWorkspace(name)

      if (repo) {
        const found = workspace.repos.find((r) => r.name === repo)
        if (!found) {
          console.error(`Repo '${repo}' not found in workspace '${name}'.`)
          process.exit(1)
        }
        process.stdout.write(found.task_path + "\n")
      } else {
        process.stdout.write(join(tasksDir, name) + "\n")
      }
    })

  program
    .command("merge <name>")
    .description("Merge all worktree branches into their base branches, then clean workspace")
    .option("--force", "Skip dirty worktree check")
    .action(async (name: string, opts: { force?: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)
        process.exit(1)
      }

      const ok = await p.confirm({
        message: `Merge and clean workspace '${name}'?`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }

      const result = await mergeWorkspace(name, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(result.error)
        process.exit(1)
      }
    })
}
