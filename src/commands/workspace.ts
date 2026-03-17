import { Command } from "commander"
import * as p from "@clack/prompts"
import { existsSync, unlinkSync } from "fs"
import { join } from "path"
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
  getWorkspaceListInfo,
  renameWorkspace,
  syncWorkspace,
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
    .option("--sort <key>", "Sort by: date, name, status", "date")
    .option("--json", "Output as JSON")
    .option("--status", "Check dirty status (slower)")
    .action(async (opts: { sort: string; json?: boolean; status?: boolean }) => {
      const workspaces = listWorkspaces()
      if (workspaces.length === 0) {
        console.log("No workspaces. Run `ws new` to create one.")
        return
      }

      const infos = await Promise.all(
        workspaces.map((ws) => getWorkspaceListInfo(ws, !!opts.status))
      )

      // Sort
      if (opts.sort === "name") {
        infos.sort((a, b) => a.name.localeCompare(b.name))
      } else if (opts.sort === "status" && opts.status) {
        infos.sort((a, b) => {
          if (a.dirty === b.dirty) return new Date(b.created).getTime() - new Date(a.created).getTime()
          if (a.dirty && !b.dirty) return -1
          if (!a.dirty && b.dirty) return 1
          return new Date(b.created).getTime() - new Date(a.created).getTime()
        })
      } else {
        // default: date descending (newest first)
        infos.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
      }

      if (opts.json) {
        console.log(JSON.stringify(infos, null, 2))
        return
      }

      console.log("")
      for (const info of infos) {
        let dirtyIndicator: string
        if (info.dirty === null) {
          dirtyIndicator = "?"
        } else if (info.dirty) {
          dirtyIndicator = `~ ${info.dirtyRepos.join(" ")}`
        } else {
          // Check if any worktree task_paths were missing
          const ws = workspaces.find((w) => w.name === info.name)!
          const missingPaths = ws.repos.some(
            (r) => r.mode === "worktree" && !existsSync(r.task_path)
          )
          dirtyIndicator = missingPaths ? "\u2717" : "\u2713"
        }

        const desc = info.description.length > 40
          ? info.description.slice(0, 40)
          : info.description

        console.log(
          `  ${info.name.padEnd(20)} ${info.branch.padEnd(32)} ${dirtyIndicator.padEnd(16)} ${info.age.padEnd(6)} ${desc}`
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
    .option("--force", "Skip dirty worktree check and confirmation")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (name: string | undefined, opts: { gone?: boolean; force?: boolean; dryRun?: boolean }) => {
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

        if (!opts.force) {
          const ok = await p.confirm({
            message: `Remove ${goneWorkspaces.length} gone workspace(s)? (worktrees + config)`,
            initialValue: false,
          })
          if (p.isCancel(ok) || !ok) {
            console.log("Cancelled.")
            return
          }
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

      if (!opts.force && !opts.dryRun) {
        const ok = await p.confirm({
          message: `Remove all worktrees for '${name}'? Config is kept.`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
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
    .option("--force", "Skip dirty worktree check and confirmation")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (name: string, opts: { force?: boolean; dryRun?: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)
        process.exit(1)
      }

      if (!opts.force && !opts.dryRun) {
        const ok = await p.confirm({
          message: `Permanently remove workspace '${name}' (worktrees + config)?`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
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
    .option("--force", "Skip dirty worktree check and confirmation")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (name: string, opts: { force?: boolean; dryRun?: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)
        process.exit(1)
      }

      if (!opts.force && !opts.dryRun) {
        const ok = await p.confirm({
          message: `Merge and clean workspace '${name}'?`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
      }

      const result = await mergeWorkspace(name, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(result.error)
        process.exit(1)
      }
    })

  program
    .command("run <name> [repo]")
    .description("Run a command or shell inside a workspace")
    .option("--all-repos", "Run command in every worktree repo sequentially")
    .passThroughOptions()
    .action(async (name: string, repo: string | undefined, opts: { allRepos?: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)
        process.exit(1)
      }

      const workspace = readWorkspace(name)
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)

      // Parse extra args after "--"
      const dashDashIdx = process.argv.indexOf("--")
      const extraArgs = dashDashIdx >= 0 ? process.argv.slice(dashDashIdx + 1) : []
      const shellCmd = extraArgs.join(" ")

      if (opts.allRepos) {
        if (!shellCmd) {
          console.error("Cannot open interactive shell with --all-repos. Provide a command after --.")
          process.exit(1)
        }

        const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
        if (worktreeRepos.length === 0) {
          console.error(`No worktree repos in workspace '${name}'.`)
          process.exit(1)
        }

        for (const r of worktreeRepos) {
          console.log(`\n==> ${r.name}`)
          const proc = Bun.spawn(["sh", "-c", shellCmd], {
            cwd: r.task_path,
            stdio: ["inherit", "inherit", "inherit"],
          })
          const exitCode = await proc.exited
          if (exitCode !== 0) {
            process.exit(exitCode)
          }
        }
        return
      }

      // Determine cwd
      let cwd: string
      if (repo) {
        const found = workspace.repos.find((r) => r.name === repo)
        if (!found) {
          console.error(`Repo '${repo}' not found in workspace '${name}'.`)
          process.exit(1)
        }
        cwd = found.task_path
      } else {
        cwd = join(tasksDir, name)
      }

      if (!shellCmd) {
        // Open interactive shell
        const shell = process.env.SHELL || "sh"
        const proc = Bun.spawn([shell], {
          cwd,
          stdio: ["inherit", "inherit", "inherit"],
        })
        const exitCode = await proc.exited
        process.exit(exitCode)
      } else {
        const proc = Bun.spawn(["sh", "-c", shellCmd], {
          cwd,
          stdio: ["inherit", "inherit", "inherit"],
        })
        const exitCode = await proc.exited
        process.exit(exitCode)
      }
    })

  program
    .command("rename <old> <new>")
    .description("Rename a workspace")
    .option("--force", "Skip confirmation prompt")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (oldName: string, newName: string, opts: { force?: boolean; dryRun?: boolean }) => {
      if (!opts.force && !opts.dryRun) {
        const ok = await p.confirm({
          message: `Rename '${oldName}' \u2192 '${newName}'?`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
      }

      const result = await renameWorkspace(oldName, newName, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(result.error)
        process.exit(1)
      }
      if (!opts.dryRun) {
        console.log(`\nRenamed '${oldName}' \u2192 '${newName}'.`)
      }
    })

  program
    .command("sync [name]")
    .description("Sync workspace branches with upstream base branches")
    .option("--all", "Sync all workspaces")
    .option("--strategy <strategy>", "Sync strategy: rebase or merge")
    .option("--best-effort", "Skip conflicting repos instead of aborting")
    .action(async (name: string | undefined, opts: { all?: boolean; strategy?: string; bestEffort?: boolean }) => {
      const strategy = opts.strategy as "rebase" | "merge" | undefined

      if (opts.all) {
        const workspaces = listWorkspaces()
        if (workspaces.length === 0) {
          console.log("No workspaces.")
          return
        }
        let hasFailures = false
        for (const ws of workspaces) {
          console.log(`\n  ${ws.name}  [${ws.branch}]`)
          const result = await syncWorkspace(ws.name, { strategy, bestEffort: opts.bestEffort }, (msg) => console.log(`    ${msg}`))
          if (!result.ok) {
            hasFailures = true
            if (result.error) console.error(`    ${result.error}`)
          }
        }
        if (hasFailures) process.exit(1)
        return
      }

      if (!name) {
        console.error("Usage: ws sync <name> [--all]")
        process.exit(1)
      }

      const result = await syncWorkspace(name, { strategy, bestEffort: opts.bestEffort }, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        if (result.error) console.error(result.error)
        if (result.skipped.length > 0) {
          console.log(`\nTip: use \`ws run ${name} <repo> -- lazygit\` to resolve conflicts`)
        }
        process.exit(1)
      }

      if (result.synced.length === 0 && result.skipped.length === 0) {
        console.log("Nothing to sync.")
      }
    })
}
