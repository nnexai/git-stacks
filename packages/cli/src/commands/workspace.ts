import { Command, Option } from "commander"

import { spawn } from "@git-stacks/core/node-runtime"
import {
  UserShellError,
  buildUserShellBootstrap,
  discoverUserShell,
  executeUserShellCommand,
} from "@git-stacks/core/user-shell"
import { existsSync } from "fs"
import { prompts as p } from "../prompts"
import { join } from "path"
import { formatError } from "@git-stacks/core/errors"
import {
  listWorkspaces,
  readWorkspace,
  workspaceExists,
  readGlobalConfig,
  templateExists,
  NameSchema,
  getRepoPath,
  isGitRepo,
  type Workspace,
} from "@git-stacks/core/config"
import { getTasksDir } from "@git-stacks/core/paths"
import { composeTemplates } from "@git-stacks/core/composition"
import { applyWorkspaceRecreate, planWorkspaceRecreate } from "@git-stacks/core/workspace-recreate"
import {
  isBranchGoneOnRemote,
  fetchOrigin,
  resolveCommonGitDirSync,
  type RemoteBranchStatus,
} from "@git-stacks/core/git"
import { runWorkspaceNew, runWorkspaceEdit } from "../wizards/workspace-wizard"
import { runWorkspaceClone } from "../wizards/workspace-clone"
import {
  cleanWorkspace,
  closeWorkspace,
  removeWorkspace,
  mergeWorkspace,
  openWorkspace,
  renameWorkspace,
  buildWorkspaceEnv,
  buildRepoEnv,
} from "@git-stacks/core/workspace-ops"
import { syncWorkspace, pushWorkspace, pullWorkspace } from "@git-stacks/core/workspace-git"
import type { SyncRow, PushRow, PullRow } from "@git-stacks/core/workspace-git"
import { editWorkspaceYaml, openYamlInEditor } from "@git-stacks/core/workspace-yaml"
import { getDirtyWorktrees, getWorkspaceStatus, getWorkspaceListInfo, detectWorkspaceFromCwd } from "@git-stacks/core/workspace-status"
import { resolveOptionalWorkspace } from "@git-stacks/core/workspace-resolution"
import { formatEnv, detectRepoFromCwd, type EnvFormat } from "@git-stacks/core/env"
import { matchesLabels } from "@git-stacks/core/labels"

function formatSyncRow(row: SyncRow): string {
  const label = row.status
  return `${label}  ${row.repo}  ${row.detail}`
}

function reportStashPopFailures(
  failures: Array<{ repo: string; error: string; repoPath: string }> | undefined,
  prefix = ""
): void {
  if (!failures) return
  for (const failure of failures) {
    console.error(`${prefix}⚠ stash pop conflict in ${failure.repo} — stash preserved. Run: git -C ${failure.repoPath} stash pop`)
  }
}

function formatUserShellError(error: unknown): string {
  if (!(error instanceof UserShellError)) {
    return error instanceof Error ? error.message : String(error)
  }
  const { diagnostic } = error
  return [
    diagnostic.message,
    `shell: ${diagnostic.shell}`,
    `mode: ${diagnostic.mode}`,
    `stage: ${diagnostic.stage}`,
    `recovery: ${diagnostic.recovery}`,
  ].join("\n")
}

async function executeCliUserCommand(
  command: string,
  cwd: string,
  overlay: Record<string, string>,
  capture: boolean,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await executeUserShellCommand({
      command,
      cwd,
      inheritedEnvironment: process.env,
      overlay,
      onOutput: capture ? undefined : ({ stream, chunk }) => {
        if (stream === "stdout") process.stdout.write(chunk)
        else process.stderr.write(chunk)
      },
    })
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString("utf8"),
      stderr: result.stderr.toString("utf8"),
    }
  } catch (error) {
    const stderr = `${formatUserShellError(error)}\n`
    if (!capture) process.stderr.write(stderr)
    return { exitCode: 1, stdout: "", stderr }
  }
}

function formatPullRow(row: PullRow): string {
  const label = row.status === "pulled" ? "pulled" : row.status === "skipped" ? "skipped" : "failed"
  return `${label}  ${row.repo}  (${row.detail})`
}

function formatPushRow(row: PushRow): string {
  return `${row.status}  ${row.repo}  (${row.detail})`
}

// --- Name validation ---

function validateName(name: string, entity = "workspace"): void {
  const result = NameSchema.safeParse(name)
  if (!result.success) {
    console.error(`Invalid ${entity} name '${name}': ${result.error.issues[0].message}`)
    process.exit(1)
  }
}

// --- Path discovery ---

export type PathsResult =
  | { ok: true; paths: string[]; skipped: string[] }
  | { ok: false; error: string }

export function getWorkspacePaths(
  workspaceName: string,
  opts: { prefix?: string; filter?: "worktree" | "trunk" }
): PathsResult {
  if (!workspaceExists(workspaceName)) {
    return { ok: false, error: `Workspace '${workspaceName}' not found` }
  }

  const workspace = readWorkspace(workspaceName)
  const paths: string[] = []
  const skipped: string[] = []

  for (const repo of workspace.repos) {
    // Apply filter
    if (opts.filter && repo.mode !== opts.filter) continue

    // Resolve path based on mode
    const resolvedPath = getRepoPath(repo)

    // Check if path exists on disk
    if (!existsSync(resolvedPath)) {
      skipped.push(`${repo.name}: ${resolvedPath}`)
      continue
    }

    // Format with optional prefix
    const line = opts.prefix ? `${opts.prefix} ${resolvedPath}` : resolvedPath
    paths.push(line)
  }

  return { ok: true, paths, skipped }
}

export function registerWorkspaceCommands(program: Command) {
  program
    .command("new [name]")
    .description("Create a new workspace interactively")
    .option("--from <source>", "Create from template name or local repo path")
    .option("--template <name>", "Compose from template(s) — repeatable", (val: string, arr: string[]) => { arr.push(val); return arr }, [] as string[])
    .option("--label <tag>", "Set label on workspace (repeatable)", (val: string, arr: string[]) => { arr.push(val); return arr }, [] as string[])
    .option("--source <forge-url>", "Create workspace from full forge change URL (requires --template)")
    .option("--repo <name>", "Resolve --source ambiguity by selecting a template repo name")
    .option("--dry-run", "Preview source resolution and planned workspace creation without writing config/worktrees")
    .option("--branch <branch>", "Branch name (defaults to feature/<name> or template pattern)")
    .option("--non-interactive", "Skip all prompts; fail if required inputs are missing")
    .option("--open", "Open workspace after creation (non-interactive only)")
    .action(async (name: string | undefined, opts: { from?: string; template?: string[]; label?: string[]; source?: string; repo?: string; dryRun?: boolean; branch?: string; nonInteractive?: boolean; open?: boolean }) => {
      if (name !== undefined) validateName(name)
      if (opts.from && opts.template && opts.template.length > 0) {
        console.error("[git-stacks] Error: --from and --template are mutually exclusive")
        process.exit(1)
      }
      const templateNames = opts.template && opts.template.length > 0 ? opts.template : undefined
      await runWorkspaceNew(name, opts.from, templateNames, opts.label, {
        nonInteractive: opts.nonInteractive,
        source: opts.source,
        repo: opts.repo,
        dryRun: opts.dryRun,
        branch: opts.branch,
        open: opts.open,
      })
    })

  program
    .command("clone [workspace]")
    .description("Clone a workspace with a new name and branch")
    .option("--name <new-name>", "New workspace name (required in --non-interactive)")
    .option("--branch <branch>", "Branch name (defaults to feature/<new-name>)")
    .option("--non-interactive", "Skip all prompts; fail if required inputs are missing")
    .option("--open", "Open workspace after cloning (non-interactive only)")
    .action(async (workspace: string | undefined, opts: { name?: string; nonInteractive?: boolean; branch?: string; open?: boolean }) => {
      if (opts.name) validateName(opts.name)
      await runWorkspaceClone(workspace, opts)
    })

  program
    .command("edit <workspace>")
    .description("Edit a workspace interactively")
    .option("--yaml", "Open workspace YAML in $EDITOR")
    .action(async (workspace: string, opts: { yaml?: boolean }) => {
      if (!workspaceExists(workspace)) {
        console.error(formatError(`Workspace '${workspace}' not found`, "run: git-stacks list"))
        process.exit(1)
      }
      if (opts.yaml) {
        const { path, validate } = editWorkspaceYaml(workspace)
        await openYamlInEditor(path, validate)
        return
      }
      await runWorkspaceEdit(workspace)
    })

  program
    .command("open <workspace>")
    .description("Open a workspace (VSCode, IntelliJ, cmux, tmux)")
    .option("--no-ide", "Skip opening IDEs")
    .option("--no-cmux", "Skip cmux session")
    .option("--recreate", "Re-sync workspace from template")
    .option("--force", "Skip confirmation in --recreate")
    .option("--reallocate", "Reallocate conflicting ports")
    .option("--skip-secrets", "Skip secret resolution (substitute empty strings)")
    .action(async (workspace: string, opts: { ide: boolean; cmux: boolean; recreate?: boolean; force?: boolean; reallocate?: boolean; skipSecrets?: boolean }) => {
      validateName(workspace)
      if (opts.recreate) {
        if (!workspaceExists(workspace)) {
          console.error(formatError(`Workspace '${workspace}' not found`, "run: git-stacks list"))
          process.exit(1)
        }

        const ws = readWorkspace(workspace)
        if (!ws.template) {
          console.error(formatError(`Workspace '${workspace}' has no template field`, "only workspaces created from templates support --recreate"))
          process.exit(1)
        }

        if (!templateExists(ws.template)) {
          console.error(formatError(`Template '${ws.template}' not found`, "run: git-stacks template list"))
          process.exit(1)
        }

        let recreatePlan
        try {
          const config = readGlobalConfig()
          recreatePlan = planWorkspaceRecreate(
            ws,
            composeTemplates([ws.template]),
            (await import("@git-stacks/core/config")).readRegistry(),
            getTasksDir(config.workspace_root),
          )
        } catch (error) {
          console.error(formatError(error instanceof Error ? error.message : String(error)))
          process.exit(1)
        }

        if (recreatePlan.changes.length === 0) {
          console.log("No changes detected between workspace and template.")
        } else {
          console.log("\nTemplate changes detected:")
          for (const change of recreatePlan.changes) console.log(`  ${change} changed`)
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

          const applied = await applyWorkspaceRecreate(recreatePlan)
          if (!applied.ok) {
            console.error(formatError(applied.error))
            process.exit(1)
          }
          console.log("Workspace updated from template.")
        }
      }

      const result = await openWorkspace(
        workspace,
        { ide: opts.ide, cmux: opts.cmux, reallocate: opts.reallocate, skipSecrets: opts.skipSecrets },
        (msg) => console.log(`  ${msg}`)
      )
      if (!result.ok) {
        console.error(formatError(result.error!))
        process.exit(1)
      }
    })

  program
    .command("close <workspace>")
    .description("Close integration sessions (tmux, niri) without removing worktrees")
    .action(async (workspace: string) => {
      if (!workspaceExists(workspace)) {
        console.error(formatError(`Workspace '${workspace}' not found`, "run: git-stacks list"))
        process.exit(1)
      }

      const result = await closeWorkspace(workspace, {}, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(formatError(result.error!))
        process.exit(1)
      }
    })

  program
    .command("list")
    .description("List all workspaces")
    .addOption(new Option("--sort <key>", "Sort by: date, name, status").choices(["date", "name", "status"]).default("date"))
    .option("--json", "Output as JSON")
    .option("--status", "Check dirty status (kept for backward compat — dirty checks always run)")
    .option("--label <tag>", "Filter by label (repeatable, AND logic)", (val: string, arr: string[]) => { arr.push(val); return arr }, [] as string[])
    .action(async (opts: { sort: string; json?: boolean; status?: boolean; label: string[] }) => {
      const workspaces = listWorkspaces()
      const filtered = opts.label.length > 0
        ? workspaces.filter(ws => matchesLabels(ws, opts.label))
        : workspaces

      if (filtered.length === 0) {
        if (opts.label.length > 0) {
          console.log(`No workspaces match labels: ${opts.label.join(", ")}`)
          return
        }
        console.log("No workspaces. Run `git-stacks new` to create one.")
        return
      }

      // Always check dirty status (UX-04); --status flag retained for backward compat
      const infos = await Promise.all(
        filtered.map((ws) => getWorkspaceListInfo(ws))
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
        const staleFlag = info.aheadBehindStale ? "?" : ""
        const aheadStr = info.ahead > 0 ? `↑${info.ahead}${staleFlag}` : ""
        const behindStr = info.behind > 0 ? `↓${info.behind}${staleFlag}` : ""
        const abStr = [aheadStr, behindStr].filter(Boolean).join(" ")
        console.log(
          `  ${dirtyMark} ${info.name.padEnd(20)} ${info.branch.padEnd(30)} ${abStr.padEnd(10)} ${repoStr.padEnd(10)} ${info.lastOpened.padEnd(6)}`
        )
      }
    })

  program
    .command("status [workspace]")
    .description("Show workspace status — dirty state, worktree health")
    .option("--json", "Output as JSON")
    .option("--fetch", "Fetch origin before computing ahead/behind counts")
    .action(async (workspace?: string, opts: { json?: boolean; fetch?: boolean } = {}) => {
      const name = workspace
      if (name !== undefined) validateName(name)
      const workspaces = name ? [readWorkspace(name)] : listWorkspaces()
      if (workspaces.length === 0) {
        console.log("No workspaces.")
        return
      }

      // Fetch origin if --fetch flag (D-03, D-06)
      if (opts.fetch) {
        const { mapLimited } = await import("@git-stacks/core/concurrency")
        const allRepos = workspaces.flatMap(ws =>
          ws.repos.filter(r => isGitRepo(r) && existsSync(getRepoPath(r)))
        )
        // Deduplicate by main_path
        const seen = new Set<string>()
        const unique = allRepos.filter(r => {
          if (seen.has(r.main_path)) return false
          seen.add(r.main_path)
          return true
        })
        if (unique.length > 0) {
          console.log("  Fetching origin...")
          await mapLimited(unique, (r) => fetchOrigin(r.main_path), 3)
        }
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
                ahead: r.ahead,
                behind: r.behind,
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
          const abParts: string[] = []
          if (repo.ahead > 0) abParts.push(`↑${repo.ahead}`)
          if (repo.behind > 0) abParts.push(`↓${repo.behind}`)
          const abStr = abParts.length > 0 ? `  ${abParts.join("  ")}` : ""
          console.log(`    ${icon}  ${repo.name.padEnd(28)} ${modeLabel}${abStr}`)
        }
      }
    })

  program
    .command("clean [workspace]")
    .description("Remove worktrees for a workspace (config is kept), or --gone to remove all with deleted remote branches")
    .option("--gone", "Remove workspaces whose upstream branches are deleted")
    .option("--force", "Skip dirty worktree check and confirmation")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (workspace: string | undefined, opts: { gone?: boolean; force?: boolean; dryRun?: boolean }) => {
      const name = workspace
      if (opts.gone) {
        // --- git-stacks clean --gone ---
        const allWorkspaces = listWorkspaces()
        if (allWorkspaces.length === 0) {
          console.log("No workspaces found.")
          return
        }

        const spinner = p.spinner()
        spinner.start("Checking remote branches")
        const goneWorkspaces: Workspace[] = []
        const indeterminate: Array<{ workspace: string; repo: string; error: string }> = []
        const remoteStatusCache = new Map<string, RemoteBranchStatus>()

        for (const ws of allWorkspaces) {
          const worktreeRepos = ws.repos.filter((repo) => repo.mode === "worktree")
          if (worktreeRepos.length === 0) continue

          const seenGitDirs = new Set<string>()
          let allMissing = true
          let hasError = false

          for (const repo of worktreeRepos) {
            let commonGitDir: string
            try {
              commonGitDir = resolveCommonGitDirSync(repo.main_path)
            } catch (error) {
              hasError = true
              allMissing = false
              indeterminate.push({
                workspace: ws.name,
                repo: repo.name,
                error: error instanceof Error ? error.message : String(error),
              })
              continue
            }

            if (seenGitDirs.has(commonGitDir)) continue
            seenGitDirs.add(commonGitDir)

            const cacheKey = `${commonGitDir}\0${ws.branch}`
            let status = remoteStatusCache.get(cacheKey)
            if (!status) {
              status = await isBranchGoneOnRemote(repo.main_path, ws.branch)
              remoteStatusCache.set(cacheKey, status)
            }

            if (status.status === "present") {
              allMissing = false
            } else if (status.status === "error") {
              hasError = true
              allMissing = false
              indeterminate.push({
                workspace: ws.name,
                repo: repo.name,
                error: status.error,
              })
            }
          }

          if (!hasError && seenGitDirs.size > 0 && allMissing) {
            goneWorkspaces.push(ws)
          }
        }
        spinner.stop(`Checked ${allWorkspaces.length} workspace(s)`)

        if (indeterminate.length > 0) {
          const details = indeterminate
            .map((entry) => `  ${entry.workspace} / ${entry.repo}: ${entry.error}`)
            .join("\n")
          console.error(formatError(
            `Cannot determine remote branch status:\n${details}`,
            "no workspaces were removed; fix repository paths or remote access and retry"
          ))
          process.exit(1)
        }

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

        if (opts.dryRun) {
          for (const ws of goneWorkspaces) {
            console.log(`  [dry-run] would remove ${ws.name}`)
          }
          return
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
          const result = await removeWorkspace(ws.name, { force: true }, (msg) => console.log(`  ${msg}`))
          if (!result.ok) {
            console.error(formatError(`Failed to remove '${ws.name}': ${result.error}`))
            process.exit(1)
          }
          console.log(`  removed  ${ws.name}`)
        }
        return
      }

      // --- git-stacks clean <name> ---
      if (!name) {
        console.error(formatError("Missing workspace name", "usage: git-stacks clean <name> [--gone]"))
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

      // First pass: clean worktrees without folder deletion
      const result = await cleanWorkspace(name, {
        force: opts.force,
        dryRun: opts.dryRun,
      }, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(formatError(result.error!))
        process.exit(1)
      }

      // Dry-run: show folder deletion info and exit (no actual deletion)
      if (opts.dryRun) {
        const config = readGlobalConfig()
        const tasksDir = getTasksDir(config.workspace_root)
        const { existsSync: fsExistsSync } = await import("fs")
        if (fsExistsSync(join(tasksDir, name))) {
          console.log(`  [dry-run] would delete folder: tasks/${name}/`)
        }
        return
      }

      // Second pass: folder deletion (D-08, D-09, D-10)
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const { existsSync: fsExistsSync, rmSync: fsRmSync } = await import("fs")
      const wsDir = join(tasksDir, name)

      if (fsExistsSync(wsDir)) {
        let shouldDelete = opts.force ?? false
        if (!shouldDelete) {
          const ok = await p.confirm({
            message: `Delete workspace folder tasks/${name}/`,
            initialValue: false,
          })
          if (!p.isCancel(ok) && ok) {
            shouldDelete = true
          }
        }
        if (shouldDelete) {
          fsRmSync(wsDir, { recursive: true, force: true })
          console.log(`  deleted  tasks/${name}/`)
        }
      }

      console.log(`\nDone. Run \`git-stacks open ${name}\` to recreate worktrees.`)
    })

  program
    .command("remove <workspace>")
    .description("Permanently remove a workspace (worktrees + config YAML)")
    .option("--force", "Skip dirty worktree check and confirmation")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (workspace: string, opts: { force?: boolean; dryRun?: boolean }) => {
      validateName(workspace)
      if (!workspaceExists(workspace)) {
        console.error(formatError(`Workspace '${workspace}' not found`, "run: git-stacks list"))
        process.exit(1)
      }

      if (!opts.force && !opts.dryRun) {
        const ok = await p.confirm({
          message: `Permanently remove workspace '${workspace}' (worktrees + config)?`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
      }

      const result = await removeWorkspace(workspace, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(formatError(result.error!))
        process.exit(1)
      }
    })

  program
    .command("cd <workspace> [repo]")
    .description("Print path to a workspace (or repo within it) — use via shell function")
    .action((workspace: string, repo?: string) => {
      if (!workspaceExists(workspace)) {
        console.error(formatError(`Workspace '${workspace}' not found`, "run: git-stacks list"))
        process.exit(1)
      }
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const ws = readWorkspace(workspace)

      if (repo) {
        const found = ws.repos.find((r) => r.name === repo)
        if (!found) {
          console.error(formatError(`Repo '${repo}' not found in workspace '${workspace}'`, `available repos: ${ws.repos.map(r => r.name).join(", ")}`))
          process.exit(1)
        }
        process.stdout.write(getRepoPath(found) + "\n")
      } else {
        process.stdout.write(join(tasksDir, workspace) + "\n")
      }
    })

  program
    .command("merge <workspace>")
    .description("Merge all worktree branches into their base branches, then clean workspace")
    .option("--force", "Skip dirty worktree check and confirmation")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (workspace: string, opts: { force?: boolean; dryRun?: boolean }) => {
      validateName(workspace)
      if (!workspaceExists(workspace)) {
        console.error(formatError(`Workspace '${workspace}' not found`, "run: git-stacks list"))
        process.exit(1)
      }

      if (!opts.force && !opts.dryRun) {
        const ok = await p.confirm({
          message: `Merge and clean workspace '${workspace}'?`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
      }

      const result = await mergeWorkspace(workspace, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(formatError(result.error!))
        process.exit(1)
      }
    })

  program
    .command("run <workspace> [repo]")
    .description("Run a command or shell inside a workspace")
    .option("--all-repos", "Run command in every worktree repo sequentially")
    .option("--parallel", "Run command in every worktree repo simultaneously")
    .option("--json", "Output results as JSON (requires --parallel)")
    .passThroughOptions()
    .allowExcessArguments(true)
    .action(async (workspace: string, repo: string | undefined, opts: { allRepos?: boolean; parallel?: boolean; json?: boolean }) => {
      if (!workspaceExists(workspace)) {
        console.error(formatError(`Workspace '${workspace}' not found`, "run: git-stacks list"))
        process.exit(1)
      }

      const ws = readWorkspace(workspace)
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)

      // Parse extra args after "--"
      const dashDashIdx = process.argv.indexOf("--")
      const extraArgs = dashDashIdx >= 0 ? process.argv.slice(dashDashIdx + 1) : []
      const shellCmd = extraArgs.join(" ")

      if (opts.json && !opts.parallel) {
        console.error(formatError("Cannot use --json without --parallel", "usage: git-stacks run --parallel --json <workspace> -- <command>"))
        process.exit(1)
      }

      let baseEnv: Record<string, string>
      try {
        baseEnv = await buildWorkspaceEnv(ws, { triggeredBy: "run" })
      } catch (error) {
        console.error(formatError(
          `Launch environment resolution failed: ${error instanceof Error ? error.message : String(error)}`,
          "fix the workspace environment or secret source and retry",
        ))
        process.exit(1)
      }

      if (opts.parallel) {
        if (!shellCmd) {
          console.error(formatError("Cannot open interactive shell with --parallel", "provide a command after --"))
          process.exit(1)
        }

        const worktreeRepos = ws.repos.filter((r) => r.mode === "worktree")
        if (worktreeRepos.length === 0) {
          console.error(formatError(`No worktree repos in workspace '${workspace}'`))
          process.exit(1)
        }

        // --json mode: suppress all spinners, run silently, emit JSON at end
        if (opts.json) {
          const results = await Promise.all(worktreeRepos.map(async (r) => {
            const result = await executeCliUserCommand(
              shellCmd,
              r.task_path,
              buildRepoEnv(baseEnv, r),
              true,
            )
            return { repo: r.name, exit_code: result.exitCode, stdout: result.stdout, stderr: result.stderr }
          }))
          console.log(JSON.stringify(results, null, 2))
          process.exit(results.some(r => r.exit_code !== 0) ? 1 : 0)
        }

        // Human output mode: use a single overall spinner, then show per-repo results
        const spinner = p.spinner()
        spinner.start(`Running in ${worktreeRepos.length} repos...`)

        const results = await Promise.all(worktreeRepos.map(async (r) => {
          const result = await executeCliUserCommand(
            shellCmd,
            r.task_path,
            buildRepoEnv(baseEnv, r),
            true,
          )
          return { repo: r.name, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
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

        const worktreeRepos = ws.repos.filter((r) => r.mode === "worktree")
        if (worktreeRepos.length === 0) {
          console.error(formatError(`No worktree repos in workspace '${workspace}'`))
          process.exit(1)
        }

        for (const r of worktreeRepos) {
          console.log(`\n==> ${r.name}`)
          const result = await executeCliUserCommand(
            shellCmd,
            r.task_path,
            buildRepoEnv(baseEnv, r),
            false,
          )
          if (result.exitCode !== 0) {
            process.exit(result.exitCode)
          }
        }
        return
      }

      // Determine cwd
      let cwd: string
      if (repo) {
        const found = ws.repos.find((r) => r.name === repo)
        if (!found) {
          console.error(formatError(`Repo '${repo}' not found in workspace '${workspace}'`, `available repos: ${ws.repos.map(r => r.name).join(", ")}`))
          process.exit(1)
        }
        cwd = getRepoPath(found)
      } else {
        cwd = join(tasksDir, workspace)
      }

      if (!shellCmd) {
        try {
          const shell = discoverUserShell(process.env, "pty")
          const launch = buildUserShellBootstrap(shell, { mode: "pty" })
          const proc = spawn(launch.argv, {
            cwd,
            env: { ...process.env, ...baseEnv },
            stdio: ["inherit", "inherit", "inherit"],
          })
          process.exit(await proc.exited)
        } catch (error) {
          console.error(formatError(formatUserShellError(error)))
          process.exit(1)
        }
      } else {
        const targetRepo = repo ? ws.repos.find((candidate) => candidate.name === repo) : undefined
        const result = await executeCliUserCommand(
          shellCmd,
          cwd,
          targetRepo ? buildRepoEnv(baseEnv, targetRepo) : baseEnv,
          false,
        )
        process.exit(result.exitCode)
      }
    })

  program
    .command("rename <workspace> <new-name>")
    .description("Rename a workspace")
    .option("--force", "Skip confirmation prompt")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (workspace: string, newName: string, opts: { force?: boolean; dryRun?: boolean }) => {
      validateName(workspace)
      validateName(newName)
      if (!opts.force && !opts.dryRun) {
        const ok = await p.confirm({
          message: `Rename '${workspace}' \u2192 '${newName}'?`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
      }

      const result = await renameWorkspace(workspace, newName, opts, (msg) => console.log(`  ${msg}`))
      if (!result.ok) {
        console.error(formatError(result.error!))
        process.exit(1)
      }
      if (!opts.dryRun) {
        console.log(`\nRenamed '${workspace}' \u2192 '${newName}'.`)
      }
    })

  program
    .command("sync [workspace]")
    .description("Sync workspace branches with upstream base branches")
    .option("--all", "Sync all workspaces")
    .addOption(new Option("--strategy <strategy>", "Sync strategy: rebase or merge").choices(["rebase", "merge"]))
    .option("--best-effort", "Skip conflicting repos instead of aborting")
    .option("--stash", "Auto-stash dirty repos before sync, pop after")
    .option("--json", "Output results as JSON")
    .action(async (workspace: string | undefined, opts: { all?: boolean; strategy?: string; bestEffort?: boolean; json?: boolean; stash?: boolean }) => {
      const name = workspace
      const strategy = opts.strategy as "rebase" | "merge" | undefined

      // --json mode: suppress all progress output, emit pure JSON at end
      if (opts.json) {
        if (opts.all) {
          const workspaces = listWorkspaces()
          const allResults = []
          for (const ws of workspaces) {
            const result = await syncWorkspace(ws.name, { strategy, bestEffort: opts.bestEffort, stash: opts.stash })
            allResults.push({
              workspace: ws.name,
              repos: [
                ...result.synced.map(s => ({
                  name: s.repo,
                  strategy: strategy ?? "rebase",
                  result: s.commits === 0 ? "up-to-date" as const : (strategy === "merge" ? "merged" as const : "rebased" as const),
                  commits_behind_before: s.commits,
                  error: null,
                })),
                ...result.skipped.map(s => ({
                  name: s.repo,
                  strategy: strategy ?? "rebase",
                  result: "failed" as const,
                  commits_behind_before: 0,
                  error: s.reason,
                })),
              ],
              stashPopFailures: result.stashPopFailures ?? [],
              ok: result.ok,
            })
          }
          console.log(JSON.stringify(allResults, null, 2))
          process.exit(allResults.some(r => r.ok === false) ? 1 : 0)
        }

        if (!name) {
          console.error(formatError("Missing workspace name", "usage: git-stacks sync <name> [--all] [--json]"))
          process.exit(1)
        }

        const result = await syncWorkspace(name, { strategy, bestEffort: opts.bestEffort, stash: opts.stash })

        const output = {
          workspace: name,
          repos: [
            ...result.synced.map(s => ({
              name: s.repo,
              strategy: strategy ?? "rebase",
              result: s.commits === 0 ? "up-to-date" as const : (strategy === "merge" ? "merged" as const : "rebased" as const),
              commits_behind_before: s.commits,
              error: null,
            })),
            ...result.skipped.map(s => ({
              name: s.repo,
              strategy: strategy ?? "rebase",
              result: "failed" as const,
              commits_behind_before: 0,
              error: s.reason,
            })),
          ],
          stashPopFailures: result.stashPopFailures ?? [],
          ok: result.ok,
        }

        console.log(JSON.stringify(output, null, 2))
        if (!result.ok) process.exit(1)
        return
      }

      if (opts.all) {
        const workspaces = listWorkspaces()
        if (workspaces.length === 0) {
          console.log("No workspaces.")
          return
        }
        let hasFailures = false
        for (const ws of workspaces) {
          console.log(`\n  ${ws.name}  [${ws.branch}]`)
          const result = await syncWorkspace(ws.name, { strategy, bestEffort: opts.bestEffort, stash: opts.stash }, (row) => console.log(`    ${formatSyncRow(row)}`))
          reportStashPopFailures(result.stashPopFailures, "    ")
          if (!result.ok) {
            hasFailures = true
            if (result.error) console.error(`    ${formatError(result.error)}`)
          }
        }
        if (hasFailures) process.exit(1)
        return
      }

      if (!name) {
        console.error(formatError("Missing workspace name", "usage: git-stacks sync <name> [--all]"))
        process.exit(1)
      }

      const result = await syncWorkspace(name, { strategy, bestEffort: opts.bestEffort, stash: opts.stash }, (row) => console.log(`  ${formatSyncRow(row)}`))
      reportStashPopFailures(result.stashPopFailures, "  ")
      if (!result.ok) {
        if (result.error) console.error(formatError(result.error))
        if (result.skipped.length > 0) {
          console.log(`\nTip: use \`git-stacks run ${name} <repo> -- lazygit\` to resolve conflicts`)
        }
        process.exit(1)
      }

      if (result.synced.length === 0 && result.skipped.length === 0) {
        console.log("Nothing to sync.")
      }
    })

  program
    .command("push [workspace]")
    .description("Push workspace branches to remote")
    .option("--force-with-lease", "Safe force-push (fails if remote has unseen commits)")
    .option("--force", "Hard force-push (prefer --force-with-lease)")
    .option("--dry-run", "Show what would be pushed without executing")
    .option("--set-upstream", "Set upstream tracking on push (-u)")
    .option("--json", "Output results as JSON")
    .action(async (workspace: string | undefined, opts: {
      forceWithLease?: boolean
      force?: boolean
      dryRun?: boolean
      setUpstream?: boolean
      json?: boolean
    }) => {
      let workspaceName = workspace
      if (!workspaceName) {
        const detection = detectWorkspaceFromCwd()
        if (detection.ok) {
          workspaceName = detection.workspace.name
        }
      }

      if (opts.json) {
        if (!workspaceName) {
          console.log(JSON.stringify({ ok: false, error: "No workspace specified and could not detect from CWD" }))
          process.exit(1)
        }
        if (!workspaceExists(workspaceName)) {
          console.log(JSON.stringify({ ok: false, error: `Workspace '${workspaceName}' not found` }))
          process.exit(1)
        }

        const result = await pushWorkspace(workspaceName, {
          force: opts.force,
          forceWithLease: opts.forceWithLease,
          dryRun: opts.dryRun,
          setUpstream: opts.setUpstream,
        })

        console.log(JSON.stringify({
          workspace: workspaceName,
          repos: [
            ...result.pushed.map((repo) => ({ name: repo.repo, status: "pushed", commits: repo.commits })),
            ...result.skipped.map((repo) => ({ name: repo.repo, status: "skipped", reason: repo.reason })),
            ...result.failed.map((repo) => ({ name: repo.repo, status: "failed", reason: repo.reason })),
          ],
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
        }))
        if (!result.ok) process.exit(1)
        return
      }

      if (!workspaceName) {
        console.error(formatError(
          "Missing workspace name",
          "usage: git-stacks push <name> [--force-with-lease] [--force] [--dry-run] [--set-upstream] [--json]"
        ))
        process.exit(1)
      }

      if (!workspaceExists(workspaceName)) {
        console.error(formatError(`Workspace '${workspaceName}' not found`, "run: git-stacks list"))
        process.exit(1)
      }

      const result = await pushWorkspace(
        workspaceName,
        {
          force: opts.force,
          forceWithLease: opts.forceWithLease,
          dryRun: opts.dryRun,
          setUpstream: opts.setUpstream,
        },
        (row) => {
          if (row.status === "pushing" || row.status === "pending") return
          console.log(`  ${formatPushRow(row)}`)
        }
      )

      if (!result.ok) {
        if (result.error) console.error(formatError(result.error))
        process.exit(1)
      }

      if (result.pushed.length === 0 && result.skipped.length === 0 && result.failed.length === 0) {
        console.log("Nothing to push.")
      }
    })

  program
    .command("paths [workspace]")
    .description("Output repo paths for a workspace (one per line) -- for agent CLI injection")
    .option("--prefix <str>", "Prepend each path with a flag string (e.g., --prefix '--add-dir')")
    .addOption(new Option("--filter <mode>", "Filter repos by mode: worktree or trunk").choices(["worktree", "trunk"]))
    .action(async (name: string | undefined, opts: { prefix?: string; filter?: string }) => {
      const resolution = resolveOptionalWorkspace(name)
      if (!resolution.ok) {
        if (resolution.error === "workspace_not_found") {
          console.error(formatError(`Workspace '${resolution.name}' not found`, "run: git-stacks list"))
        } else {
          console.error(formatError(
            "Could not detect workspace from current directory",
            "run from a workspace root or worktree, or specify: git-stacks paths <workspace>"
          ))
        }
        process.exit(1)
      }

      const filter = opts.filter as "worktree" | "trunk" | undefined
      const result = getWorkspacePaths(resolution.workspace.name, { prefix: opts.prefix, filter })
      if (!result.ok) {
        console.error(formatError(result.error))
        process.exit(1)
      }

      // Warn about skipped repos on stderr
      for (const warning of result.skipped) {
        console.error(`warning: skipping ${warning}`)
      }

      if (result.paths.length === 0) {
        console.error(formatError("No paths to output -- all repos were skipped or filtered out"))
        process.exit(1)
      }

      // Output paths to stdout, one per line
      for (const p of result.paths) {
        console.log(p)
      }
    })

  program
    .command("env [workspace]")
    .description("Show environment variables for a workspace")
    .addOption(new Option("--format <format>", "Output format").choices(["table", "shell", "dotenv", "json"]).default("table"))
    .option("--repo <name>", "Include repo-specific variables")
    .action(async (workspace: string | undefined, opts: { format: string; repo?: string }) => {
      const validFormats = ["table", "shell", "dotenv", "json"]
      if (!validFormats.includes(opts.format)) {
        console.error(formatError(`Invalid format '${opts.format}'`, "use: --format table|shell|dotenv|json"))
        process.exit(1)
      }

      const resolution = resolveOptionalWorkspace(workspace)
      if (!resolution.ok) {
        if (resolution.error === "workspace_not_found") {
          console.error(formatError(`Workspace '${resolution.name}' not found`, "run: git-stacks list"))
        } else {
          console.error(formatError(
            "Could not detect workspace from current directory",
            "run from a workspace root or worktree, or specify: git-stacks env <workspace>"
          ))
        }
        process.exit(1)
      }
      const ws = resolution.workspace

      let env: Record<string, string>
      try {
        env = await buildWorkspaceEnv(ws, { triggeredBy: "env" })
      } catch (err) {
        console.error(formatError(
          `Secret resolution failed: ${err instanceof Error ? err.message : String(err)}`,
          "fix the secret source or config.yml secrets.resolvers"
        ))
        process.exit(1)
      }

      if (opts.repo) {
        const repo = ws.repos.find(r => r.name === opts.repo)
        if (!repo) {
          console.error(formatError(
            `Repo '${opts.repo}' not found in workspace '${ws.name}'`,
            "available repos: " + ws.repos.map(r => r.name).join(", ")
          ))
          process.exit(1)
        }
        env = buildRepoEnv(env, repo)
      } else if (resolution.source === "cwd") {
        // CWD detection was used — auto-detect repo too
        const repoName = detectRepoFromCwd(ws)
        if (repoName) {
          const repo = ws.repos.find(r => r.name === repoName)
          if (repo) env = buildRepoEnv(env, repo)
        }
      }

      console.log(formatEnv(env, opts.format as EnvFormat))
    })

  program
    .command("pull [workspace]")
    .description("Pull latest commits for all repos in a workspace (--ff-only)")
    .action(async (workspace: string | undefined) => {
      const resolution = resolveOptionalWorkspace(workspace)
      if (!resolution.ok) {
        if (resolution.error === "workspace_not_found") {
          console.error(formatError(`Workspace '${resolution.name}' not found`, "run: git-stacks list"))
        } else {
          console.error(formatError(
            "Could not detect workspace from current directory",
            "run from a workspace root or worktree, or specify: git-stacks pull <workspace>"
          ))
        }
        process.exit(1)
      }

      const result = await pullWorkspace(resolution.workspace.name, (row) => {
        if (row.status === "skipped" || row.status === "failed") {
          console.error(`  ${formatPullRow(row)}`)
        } else if (row.status === "pulled") {
          console.log(`  ${formatPullRow(row)}`)
        }
      })

      if (!result.ok) {
        if (result.error) console.error(formatError(result.error))
        process.exit(1)
      }

      if (result.pulled.length === 0 && result.skipped.length === 0 && result.failed.length === 0) {
        console.log("Nothing to pull.")
      }
    })
}
