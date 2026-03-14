import { Command } from "commander"
import * as p from "@clack/prompts"
import { existsSync, unlinkSync } from "fs"
import { join } from "path"
import {
  listWorkspaces,
  readWorkspace,
  readStack,
  workspaceExists,
  workspacePath,
  readGlobalConfig,
  type Workspace,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"
import {
  isRepoDirty,
  getCurrentBranch,
  createWorktree,
  removeWorktree,
  isBranchGoneOnRemote,
  checkBranchExists,
  getMergeConflicts,
  mergeNoFF,
  deleteLocalBranch,
} from "../lib/git"
import { integrations, type IntegrationContext } from "../lib/integrations"
import { runWorkspaceNew } from "../tui/workspace-wizard"
import { runWorkspaceClone } from "../tui/workspace-clone"
import { runHooks } from "../lib/lifecycle"

async function getDirtyWorktrees(workspace: Workspace): Promise<string[]> {
  const dirty: string[] = []
  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) continue
    if (await isRepoDirty(repo.task_path)) dirty.push(repo.name)
  }
  return dirty
}

async function runPreRemoveHooks(workspace: Workspace, tasksDir: string): Promise<void> {
  const baseEnv = {
    WS_WORKSPACE: workspace.name,
    WS_BRANCH: workspace.branch,
    WS_TASKS_DIR: tasksDir,
  }

  // Deduplicate stack names and load them
  const stackNames = [...new Set(workspace.repos.map((r) => r.stack))]
  const stacksByName = new Map<string, Awaited<ReturnType<typeof readStack>>>()
  for (const name of stackNames) {
    try {
      stacksByName.set(name, readStack(name))
    } catch {
      // stack deleted or missing, skip its hooks
    }
  }

  // Stack-level pre_remove hooks (once per stack)
  for (const [stackName, stack] of stacksByName) {
    if (!stack.hooks?.pre_remove?.length) continue
    const wsDir = join(tasksDir, workspace.name)
    await runHooks(stack.hooks.pre_remove, wsDir, { ...baseEnv, WS_STACK: stackName })
  }

  // Per-repo pre_remove hooks
  for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
    const stack = stacksByName.get(repo.stack)
    if (!stack) continue
    const stackRepo = stack.repos.find((r) => r.name === repo.name)
    if (!stackRepo?.hooks?.pre_remove?.length) continue
    const cwd = existsSync(repo.task_path) ? repo.task_path : repo.main_path
    await runHooks(stackRepo.hooks.pre_remove, cwd, {
      ...baseEnv,
      WS_STACK: repo.stack,
      WS_REPO_NAME: repo.name,
      WS_REPO_PATH: repo.task_path,
      WS_MAIN_PATH: repo.main_path,
    })
  }
}

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

      const baseEnv = {
        WS_WORKSPACE: workspace.name,
        WS_BRANCH: workspace.branch,
        WS_TASKS_DIR: tasksDir,
      }

      if (workspace.hooks?.pre_open?.length) {
        const spinner = p.spinner()
        for (const cmd of workspace.hooks.pre_open) {
          spinner.start(`pre_open: ${cmd}`)
          await runHooks([cmd], join(tasksDir, name), baseEnv)
        }
        spinner.stop("pre_open hooks done")
      }

      const repoHooks = workspace.repos.filter((r) => r.hooks?.pre_open?.length)
      if (repoHooks.length > 0) {
        const spinner = p.spinner()
        for (const repo of repoHooks) {
          const repoEnv = {
            ...baseEnv,
            WS_REPO_NAME: repo.name,
            WS_REPO_PATH: repo.task_path,
            WS_MAIN_PATH: repo.main_path,
          }
          for (const cmd of repo.hooks!.pre_open!) {
            spinner.start(`pre_open [${repo.name}]: ${cmd}`)
            await runHooks([cmd], repo.task_path, repoEnv)
          }
        }
        spinner.stop("pre_open hooks done")
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
    .command("clean [name]")
    .description("Remove worktrees for a workspace (config is kept), or --gone to remove all with deleted remote branches")
    .option("--gone", "Remove workspaces whose upstream branches are deleted")
    .option("--force", "Skip dirty worktree check")
    .action(async (name: string | undefined, opts: { gone?: boolean; force?: boolean }) => {
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)

      if (opts.gone) {
        // --- ws clean --gone ---
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
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found.`)
        process.exit(1)
      }

      const workspace = readWorkspace(name)

      if (!opts.force) {
        const dirty = await getDirtyWorktrees(workspace)
        if (dirty.length > 0) {
          console.error(`Aborting: dirty worktrees: ${dirty.join(", ")}`)
          console.error("Use --force to skip this check.")
          process.exit(1)
        }
      }

      const ok = await p.confirm({
        message: `Remove all worktrees for '${name}'? Config is kept.`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }

      try {
        await runPreRemoveHooks(workspace, tasksDir)
      } catch (err) {
        console.error(`pre_remove hook failed: ${err}`)
        process.exit(1)
      }

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

  program
    .command("remove <name>")
    .description("Permanently remove a workspace (worktrees + config YAML)")
    .option("--force", "Skip dirty worktree check")
    .action(async (name: string, opts: { force?: boolean }) => {
      if (!workspaceExists(name)) {
        console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)
        process.exit(1)
      }

      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const workspace = readWorkspace(name)

      if (!opts.force) {
        const dirty = await getDirtyWorktrees(workspace)
        if (dirty.length > 0) {
          console.error(`Aborting: dirty worktrees: ${dirty.join(", ")}`)
          console.error("Use --force to skip this check.")
          process.exit(1)
        }
      }

      const ok = await p.confirm({
        message: `Permanently remove workspace '${name}' (worktrees + config)?`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }

      try {
        await runPreRemoveHooks(workspace, tasksDir)
      } catch (err) {
        console.error(`pre_remove hook failed: ${err}`)
        process.exit(1)
      }

      for (const repo of workspace.repos.filter((r) => r.mode === "worktree")) {
        if (!existsSync(repo.task_path)) continue
        await removeWorktree(repo.main_path, repo.task_path)
        console.log(`  removed  ${repo.name}`)
      }

      unlinkSync(workspacePath(name))
      console.log(`Workspace '${name}' removed.`)
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

      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const workspace = readWorkspace(name)
      const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")

      if (!opts.force) {
        const dirty = await getDirtyWorktrees(workspace)
        if (dirty.length > 0) {
          console.error(`Aborting: dirty worktrees: ${dirty.join(", ")}`)
          console.error("Use --force to skip this check.")
          process.exit(1)
        }
      }

      // Resolve base branch for each worktree repo
      const repoBases: { repo: (typeof worktreeRepos)[number]; baseBranch: string }[] = []
      for (const repo of worktreeRepos) {
        let baseBranch = "main"
        try {
          const stack = readStack(repo.stack)
          baseBranch = stack.repos.find((r) => r.name === repo.name)?.default_branch ?? "main"
        } catch {
          // stack missing, fall back to "main"
        }
        repoBases.push({ repo, baseBranch })
      }

      // Conflict pre-check
      const conflicting: string[] = []
      for (const { repo, baseBranch } of repoBases) {
        const branchExists = await checkBranchExists(repo.main_path, workspace.branch)
        if (!branchExists) continue
        const conflicts = await getMergeConflicts(repo.main_path, baseBranch, workspace.branch)
        if (conflicts.length > 0) {
          conflicting.push(`  ${repo.name}: ${conflicts.join(", ")}`)
        }
      }
      if (conflicting.length > 0) {
        console.error("Aborting: merge conflicts detected:")
        for (const line of conflicting) console.error(line)
        process.exit(1)
      }

      // Show plan
      console.log(`\nMerge plan for '${name}' [${workspace.branch}]:`)
      for (const { repo, baseBranch } of repoBases) {
        console.log(`  ${repo.name}  →  ${baseBranch}`)
      }

      const ok = await p.confirm({
        message: `Merge and clean workspace '${name}'?`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }

      // Merge
      for (const { repo, baseBranch } of repoBases) {
        const branchExists = await checkBranchExists(repo.main_path, workspace.branch)
        if (!branchExists) {
          console.log(`  skip  ${repo.name} (branch '${workspace.branch}' not found)`)
          continue
        }
        await mergeNoFF(repo.main_path, baseBranch, workspace.branch)
        console.log(`  merged  ${repo.name}  →  ${baseBranch}`)
      }

      // pre_remove hooks
      try {
        await runPreRemoveHooks(workspace, tasksDir)
      } catch (err) {
        console.error(`pre_remove hook failed: ${err}`)
        process.exit(1)
      }

      // Remove worktrees
      for (const repo of worktreeRepos) {
        if (!existsSync(repo.task_path)) continue
        await removeWorktree(repo.main_path, repo.task_path)
      }

      // Delete local branches
      for (const { repo } of repoBases) {
        await deleteLocalBranch(repo.main_path, workspace.branch)
      }

      const wsPath = workspacePath(name)
      console.log(`\nDone. Config kept at ${wsPath}`)
      console.log(`Run \`ws open ${name}\` to recreate worktrees.`)
    })
}
