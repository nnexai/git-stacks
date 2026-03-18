import { Command } from "commander"
import * as p from "@clack/prompts"
import { existsSync, unlinkSync } from "fs"
import { join } from "path"
import { formatError } from "../lib/errors"
import {
  listWorkspaces,
  readWorkspace,
  workspaceExists,
  workspacePath,
  readGlobalConfig,
  readTemplate,
  readRegistry,
  templateExists,
  writeWorkspace,
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
    .option("--from <source>", "Create from template name or local repo path")
    .action(async (name: string | undefined, opts: { from?: string }) => {
      await runWorkspaceNew(name, opts.from)
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
    .option("--recreate", "Re-sync workspace from template")
    .option("--force", "Skip confirmation in --recreate")
    .action(async (name: string, opts: { ide: boolean; cmux: boolean; recreate?: boolean; force?: boolean }) => {
      if (opts.recreate) {
        if (!workspaceExists(name)) {
          console.error(formatError(`Workspace '${name}' not found`, "run: ws list"))
          process.exit(1)
        }

        const ws = readWorkspace(name)
        if (!ws.template) {
          console.error(formatError(`Workspace '${name}' has no template field`, "only workspaces created from templates support --recreate"))
          process.exit(1)
        }

        if (!templateExists(ws.template)) {
          console.error(formatError(`Template '${ws.template}' not found`, "run: ws template list"))
          process.exit(1)
        }

        const template = readTemplate(ws.template)
        const registry = readRegistry()

        // Compute diff — compare template repos vs workspace repos
        const tplRepoNames = new Set(template.repos.map(r => r.repo))
        const wsRepoNames = new Set(ws.repos.map(r => r.repo))
        const added = [...tplRepoNames].filter(n => !wsRepoNames.has(n))
        const removed = [...wsRepoNames].filter(n => !tplRepoNames.has(n))

        // Check for hook/env changes
        const hooksChanged = JSON.stringify(template.hooks ?? {}) !== JSON.stringify(ws.hooks ?? {})
        const envChanged = JSON.stringify(template.env ?? {}) !== JSON.stringify(ws.env ?? {})

        if (added.length === 0 && removed.length === 0 && !hooksChanged && !envChanged) {
          console.log("No changes detected between workspace and template.")
        } else {
          console.log("\nTemplate changes detected:")
          if (added.length > 0) console.log(`  Added repos:   ${added.join(", ")}`)
          if (removed.length > 0) console.log(`  Removed repos: ${removed.join(", ")}`)
          if (hooksChanged) console.log("  Hooks changed")
          if (envChanged) console.log("  Environment changed")
          console.log("")

          if (!opts.force) {
            const ok = await p.confirm({
              message: "Apply these changes from template?",
              initialValue: false,
            })
            if (p.isCancel(ok) || !ok) {
              console.log("Cancelled.")
              return
            }
          }

          // Apply: update workspace hooks, env, env_file, files, integrations from template
          ws.hooks = template.hooks ? JSON.parse(JSON.stringify(template.hooks)) : undefined
          ws.env = template.env ? { ...template.env } : undefined
          ws.env_file = template.env_file
          ws.files = template.files
          if (template.integrations) {
            ws.settings = { ...ws.settings, integrations: JSON.parse(JSON.stringify(template.integrations)) }
          }

          // Update repo list from template
          const registryMap = new Map(registry.map(r => [r.name, r]))
          const { getTasksDir: getTD } = await import("../lib/paths")
          const config = readGlobalConfig()
          const td = getTD(config.workspace_root)

          ws.repos = template.repos.map(tplRepo => {
            const existing = ws.repos.find(r => r.repo === tplRepo.repo)
            if (existing) return { ...existing, base_branch: tplRepo.base_branch ?? existing.base_branch }
            const regEntry = registryMap.get(tplRepo.repo)
            if (!regEntry) return null
            return {
              name: regEntry.name,
              repo: tplRepo.repo,
              type: regEntry.type,
              mode: tplRepo.mode ?? "worktree",
              main_path: regEntry.local_path,
              task_path: tplRepo.mode === "trunk" ? regEntry.local_path : join(td, name, regEntry.name),
              base_branch: tplRepo.base_branch ?? regEntry.default_branch,
            }
          }).filter(Boolean) as typeof ws.repos

          writeWorkspace(ws)
          console.log("Workspace updated from template.")
        }
      }

      const result = await openWorkspace(name, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(formatError(result.error!))
        process.exit(1)
      }
    })

  program
    .command("list")
    .description("List all workspaces")
    .option("--sort <key>", "Sort by: date, name, status", "date")
    .option("--json", "Output as JSON")
    .option("--status", "Check dirty status (kept for backward compat — dirty checks always run)")
    .action(async (opts: { sort: string; json?: boolean; status?: boolean }) => {
      const workspaces = listWorkspaces()
      if (workspaces.length === 0) {
        console.log("No workspaces. Run `ws new` to create one.")
        return
      }

      // Always check dirty status (UX-04); --status flag retained for backward compat
      const infos = await Promise.all(
        workspaces.map((ws) => getWorkspaceListInfo(ws))
      )

      // Sort
      if (opts.sort === "name") {
        infos.sort((a, b) => a.name.localeCompare(b.name))
      } else if (opts.sort === "status") {
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
        const dirtyMark = info.dirty ? "~" : " "
        const repoStr = `${info.repoCount} repos`
        console.log(
          `  ${dirtyMark} ${info.name.padEnd(20)} ${info.branch.padEnd(30)} ${repoStr.padEnd(10)} ${info.lastOpened.padEnd(6)}`
        )
      }
    })

  program
    .command("status [name]")
    .description("Show workspace status — dirty state, worktree health")
    .option("--json", "Output as JSON")
    .action(async (name?: string, opts: { json?: boolean } = {}) => {
      const workspaces = name ? [readWorkspace(name)] : listWorkspaces()
      if (workspaces.length === 0) {
        console.log("No workspaces.")
        return
      }

      if (opts.json) {
        const output = await Promise.all(workspaces.map(async (ws) => {
          const repos = await getWorkspaceStatus(ws)
          return {
            name: ws.name,
            branch: ws.branch,
            template: ws.template ?? null,
            repos: repos.map(r => {
              const wsRepo = ws.repos.find(wr => wr.name === r.name)
              return {
                name: r.name,
                mode: r.mode,
                branch: r.branch,
                exists: r.exists,
                dirty: r.dirty,
                task_path: wsRepo?.task_path ?? null,
              }
            }),
          }
        }))
        console.log(JSON.stringify(output, null, 2))
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
            console.error(formatError("Dirty worktrees found:\n" + dirtyEntries.join("\n"), "use --force to skip this check"))
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
            console.error(formatError(`pre_remove hook failed for '${ws.name}': ${err}`))
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
        console.error(formatError("Missing workspace name", "usage: ws clean <name> [--gone]"))
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
        console.error(formatError(result.error!))
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
        console.error(formatError(`Workspace '${name}' not found`, "run: ws list"))
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
        console.error(formatError(result.error!))
        process.exit(1)
      }
    })

  program
    .command("cd <name> [repo]")
    .description("Print path to a workspace (or repo within it) — use via shell function")
    .action((name: string, repo?: string) => {
      if (!workspaceExists(name)) {
        console.error(formatError(`Workspace '${name}' not found`, "run: ws list"))
        process.exit(1)
      }
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const workspace = readWorkspace(name)

      if (repo) {
        const found = workspace.repos.find((r) => r.name === repo)
        if (!found) {
          console.error(formatError(`Repo '${repo}' not found in workspace '${name}'`, `available repos: ${workspace.repos.map(r => r.name).join(", ")}`))
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
        console.error(formatError(`Workspace '${name}' not found`, "run: ws list"))
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
        console.error(formatError(result.error!))
        process.exit(1)
      }
    })

  program
    .command("run <name> [repo]")
    .description("Run a command or shell inside a workspace")
    .option("--all-repos", "Run command in every worktree repo sequentially")
    .option("--parallel", "Run command in every worktree repo simultaneously")
    .option("--json", "Output results as JSON (requires --parallel)")
    .passThroughOptions()
    .action(async (name: string, repo: string | undefined, opts: { allRepos?: boolean; parallel?: boolean; json?: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(formatError(`Workspace '${name}' not found`, "run: ws list"))
        process.exit(1)
      }

      const workspace = readWorkspace(name)
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)

      // Parse extra args after "--"
      const dashDashIdx = process.argv.indexOf("--")
      const extraArgs = dashDashIdx >= 0 ? process.argv.slice(dashDashIdx + 1) : []
      const shellCmd = extraArgs.join(" ")

      if (opts.parallel) {
        if (!shellCmd) {
          console.error(formatError("Cannot open interactive shell with --parallel", "provide a command after --"))
          process.exit(1)
        }

        const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
        if (worktreeRepos.length === 0) {
          console.error(formatError(`No worktree repos in workspace '${name}'`))
          process.exit(1)
        }

        // --json mode: suppress all spinners, run silently, emit JSON at end
        if (opts.json) {
          const results = await Promise.all(worktreeRepos.map(async (r) => {
            const proc = Bun.spawn(["sh", "-c", shellCmd], {
              cwd: r.task_path,
              stdio: ["inherit", "pipe", "pipe"],
            })
            const [exitCode, stdout, stderr] = await Promise.all([
              proc.exited,
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
            ])
            return { repo: r.name, exit_code: exitCode, stdout, stderr }
          }))
          console.log(JSON.stringify(results, null, 2))
          process.exit(results.some(r => r.exit_code !== 0) ? 1 : 0)
        }

        // Human output mode: use a single overall spinner, then show per-repo results
        const spinner = p.spinner()
        spinner.start(`Running in ${worktreeRepos.length} repos...`)

        const results = await Promise.all(worktreeRepos.map(async (r) => {
          const proc = Bun.spawn(["sh", "-c", shellCmd], {
            cwd: r.task_path,
            stdio: ["inherit", "pipe", "pipe"],
          })
          const [exitCode, stdout, stderr] = await Promise.all([
            proc.exited,
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
          ])
          return { repo: r.name, exitCode, stdout, stderr }
        }))

        const failed = results.filter(r => r.exitCode !== 0)
        const passed = results.filter(r => r.exitCode === 0)
        spinner.stop(`${passed.length} passed, ${failed.length} failed`)

        // Print per-repo summary lines
        for (const r of results) {
          const icon = r.exitCode === 0 ? "\u2713" : `\u2717 (exit ${r.exitCode})`
          console.log(`  ${icon}  ${r.repo}`)
        }

        // Flush failed output grouped by repo
        if (failed.length > 0) {
          console.log("")
          for (const r of failed) {
            console.log(`\u2014\u2014\u2014 ${r.repo} \u2014\u2014\u2014`)
            if (r.stdout.trim()) process.stdout.write(r.stdout)
            if (r.stderr.trim()) process.stderr.write(r.stderr)
          }
        }

        process.exit(failed.length > 0 ? 1 : 0)
      }

      if (opts.allRepos) {
        if (!shellCmd) {
          console.error(formatError("Cannot open interactive shell with --all-repos", "provide a command after --"))
          process.exit(1)
        }

        const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
        if (worktreeRepos.length === 0) {
          console.error(formatError(`No worktree repos in workspace '${name}'`))
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
          console.error(formatError(`Repo '${repo}' not found in workspace '${name}'`, `available repos: ${workspace.repos.map(r => r.name).join(", ")}`))
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
        console.error(formatError(result.error!))
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
            if (result.error) console.error(`    ${formatError(result.error)}`)
          }
        }
        if (hasFailures) process.exit(1)
        return
      }

      if (!name) {
        console.error(formatError("Missing workspace name", "usage: ws sync <name> [--all]"))
        process.exit(1)
      }

      const result = await syncWorkspace(name, { strategy, bestEffort: opts.bestEffort }, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        if (result.error) console.error(formatError(result.error))
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
