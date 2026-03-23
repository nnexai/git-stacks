import { Command } from "commander"
import { existsSync, readdirSync } from "fs"
import { join } from "path"
import { $ } from "bun"
import { prompts as p } from "../tui/utils"
import {
  listWorkspaces,
  readRegistry,
  readGlobalConfig,
  type Workspace,
  type RepoRegistryEntry,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { formatError } from "../lib/errors"

interface Issue {
  icon: "pass" | "fail" | "warn"
  entity: string
  message: string
  fix?: string
}

function icon(type: Issue["icon"]): string {
  switch (type) {
    case "pass": return "\u2713"
    case "fail": return "\u2717"
    case "warn": return "\u26A0"
  }
}

async function checkBinary(cmd: string): Promise<boolean> {
  const result = await $`which ${cmd}`.quiet().nothrow()
  return result.exitCode === 0
}

/** Dirs under tasks/ that have no matching workspace YAML. */
function findOrphanedTaskDirs(tasksDir: string, workspaces: Workspace[]): Issue[] {
  if (!existsSync(tasksDir)) return []
  const trackedNames = new Set(workspaces.map((w) => w.name))
  const entries = readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  return entries
    .filter((name) => !trackedNames.has(name))
    .map((name) => ({
      icon: "fail" as const,
      entity: `tasks/${name}`,
      message: "not tracked by any workspace",
      fix: `rm -rf ${join(tasksDir, name)}`,
    }))
}

/** Workspace repos with mode=worktree whose task_path doesn't exist. */
function findMissingWorktrees(workspaces: Workspace[]): Issue[] {
  const issues: Issue[] = []
  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      if (repo.mode === "worktree" && !existsSync(repo.task_path)) {
        issues.push({
          icon: "fail",
          entity: ws.name,
          message: `task_path missing: ${repo.task_path}`,
          fix: `git-stacks open ${ws.name}`,
        })
      }
    }
  }
  return issues
}

/** Workspace repos whose main_path doesn't exist. */
function findMissingMainClones(workspaces: Workspace[]): Issue[] {
  const issues: Issue[] = []
  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      if (!existsSync(repo.main_path)) {
        issues.push({
          icon: "fail",
          entity: ws.name,
          message: `main_path missing: ${repo.main_path}`,
          fix: `git-stacks repo show ${repo.repo}`,
        })
      }
    }
  }
  return issues
}

/** Workspaces with cmux_workspace_id whose cmux session no longer exists. */
async function findStaleCmuxRefs(workspaces: Workspace[]): Promise<Issue[]> {
  const issues: Issue[] = []
  for (const ws of workspaces) {
    if (!ws.cmux_workspace_id) continue
    try {
      const result = await $`cmux select-workspace --workspace ${ws.cmux_workspace_id}`.quiet().nothrow()
      if (result.exitCode !== 0) {
        issues.push({
          icon: "warn",
          entity: ws.name,
          message: `cmux_workspace_id stale (session not found) \u2014 will reset on next git-stacks open`,
        })
      }
    } catch {
      // cmux not installed or not available — skip all remaining checks
      break
    }
  }
  return issues
}

/** Workspace repos referencing registry entries that don't exist. */
function findDeadRepoRefs(workspaces: Workspace[]): Issue[] {
  const issues: Issue[] = []
  const registry = readRegistry()
  const registryNames = new Set(registry.map(r => r.name))
  const checked = new Set<string>()
  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      const key = `${ws.name}:${repo.repo}`
      if (checked.has(key)) continue
      checked.add(key)
      if (!registryNames.has(repo.repo)) {
        issues.push({
          icon: "fail",
          entity: ws.name,
          message: `references non-registered repo '${repo.repo}'`,
        })
      }
    }
  }
  return issues
}

/** Registry entries whose local_path doesn't exist on disk. */
function findDeadRegistryPaths(registry: RepoRegistryEntry[]): Issue[] {
  const issues: Issue[] = []
  for (const entry of registry) {
    if (!existsSync(entry.local_path)) {
      issues.push({
        icon: "fail",
        entity: entry.name,
        message: `local_path not found: ${entry.local_path}`,
        fix: `git-stacks repo remove ${entry.name}`,
      })
    }
  }
  return issues
}

export const doctorCommand = new Command("doctor")
  .description("Check workspace health — detect drift between config and filesystem")
  .option("--json", "Output as JSON")
  .option("--fix", "Auto-execute suggested fixes")
  .option("--force", "Skip confirmation when used with --fix")
  .action(async (opts: { json?: boolean; fix?: boolean; force?: boolean }) => {
    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const workspaces = listWorkspaces()
    const registry = readRegistry()

    // --- Workspace checks ---
    const orphaned = findOrphanedTaskDirs(tasksDir, workspaces)
    const missingWorktrees = findMissingWorktrees(workspaces)
    const missingMains = findMissingMainClones(workspaces)
    const staleCmux = await findStaleCmuxRefs(workspaces)
    const deadRepoRefs = findDeadRepoRefs(workspaces)

    // --- Registry checks ---
    const deadRegistryPaths = findDeadRegistryPaths(registry)

    // --- Runtime dependency checks ---
    const binaries = [
      { name: "git", required: true, install: "https://git-scm.com" },
      { name: "code", required: false, install: "https://code.visualstudio.com" },
      { name: "code-insiders", required: false, install: "https://code.visualstudio.com/insiders" },
      { name: "idea", required: false, install: "https://www.jetbrains.com/idea" },
      { name: "tmux", required: false, install: "https://github.com/tmux/tmux" },
      { name: "cmux", required: false, install: "https://github.com/nicholasgasior/cmux" },
    ]

    const binaryIssues: Issue[] = []
    for (const { name, required, install } of binaries) {
      const found = await checkBinary(name)
      if (!found) {
        binaryIssues.push({
          icon: required ? "fail" : "warn",
          entity: name,
          message: "not found",
          fix: `Install: ${install}`,
        })
      }
    }

    // Forge CLI availability (warn level — optional, not required for git-stacks core)
    const ghAvailable = await checkBinary("gh")
    binaryIssues.push({
      icon: ghAvailable ? "pass" : "warn",
      entity: "gh (GitHub CLI)",
      message: ghAvailable ? "installed" : "not installed — GitHub PR commands unavailable",
      fix: ghAvailable ? undefined : "Install: https://cli.github.com/",
    })

    const glabAvailable = await checkBinary("glab")
    binaryIssues.push({
      icon: glabAvailable ? "pass" : "warn",
      entity: "glab (GitLab CLI)",
      message: glabAvailable ? "installed" : "not installed — GitLab MR commands unavailable",
      fix: glabAvailable ? undefined : "Install: https://gitlab.com/gitlab-org/cli",
    })

    const teaAvailable = await checkBinary("tea")
    binaryIssues.push({
      icon: teaAvailable ? "pass" : "warn",
      entity: "tea (Gitea CLI)",
      message: teaAvailable ? "installed" : "not installed — Gitea PR commands unavailable",
      fix: teaAvailable ? undefined : "Install: https://gitea.com/gitea/tea",
    })

    const jiraAvailable = await checkBinary("jira")
    binaryIssues.push({
      icon: jiraAvailable ? "pass" : "warn",
      entity: "jira (Jira CLI)",
      message: jiraAvailable ? "installed" : "not installed — Jira issue commands will use configurable template fallback",
      fix: jiraAvailable ? undefined : "Install: https://github.com/ankitpokhrel/jira-cli",
    })

    // Collect ALL issues into one flat array
    const allIssues: Issue[] = [
      ...orphaned,
      ...missingWorktrees,
      ...missingMains,
      ...staleCmux,
      ...deadRepoRefs,
      ...deadRegistryPaths,
      ...binaryIssues,
    ]

    // --- JSON output (UX-02) ---
    if (opts.json) {
      if (opts.fix) {
        const fixableIssues = allIssues.filter(i => i.fix)
        const fixResults = []
        for (const issue of fixableIssues) {
          try {
            const proc = Bun.spawn(["sh", "-c", issue.fix!], { stdio: ["pipe", "pipe", "pipe"] })
            const exitCode = await proc.exited
            fixResults.push({ entity: issue.entity, fix: issue.fix, success: exitCode === 0, exit_code: exitCode })
          } catch (err) {
            fixResults.push({ entity: issue.entity, fix: issue.fix, success: false, error: String(err) })
          }
        }
        const healthy = allIssues.length === 0
        const output = { healthy, issues: allIssues, fixes: fixResults }
        console.log(JSON.stringify(output, null, 2))
        return
      }

      const healthy = allIssues.length === 0
      const output = { healthy, issues: allIssues }
      console.log(JSON.stringify(output, null, 2))
      return
    }

    // --- Human-readable output ---
    // Group workspace issues by entity
    const wsIssuesByEntity = new Map<string, Issue[]>()
    for (const issue of [...missingWorktrees, ...missingMains, ...staleCmux, ...deadRepoRefs]) {
      const existing = wsIssuesByEntity.get(issue.entity) ?? []
      existing.push(issue)
      wsIssuesByEntity.set(issue.entity, existing)
    }

    const healthyCount = workspaces.filter((w) => !wsIssuesByEntity.has(w.name)).length
    const wsIssueCount = wsIssuesByEntity.size + orphaned.length

    console.log("")

    if (healthyCount > 0) {
      console.log(`  ${icon("pass")}  ${healthyCount} workspace${healthyCount === 1 ? "" : "s"} healthy`)
    }

    if (wsIssueCount > 0) {
      console.log("")
      // Print workspace issues grouped by entity
      for (const [entity, issues] of wsIssuesByEntity) {
        const worstIcon = issues.some((i) => i.icon === "fail") ? "fail" : "warn"
        console.log(`  ${icon(worstIcon as Issue["icon"])}  ${entity}`)
        for (const issue of issues) {
          console.log(`       ${issue.message}`)
          if (issue.fix) {
            console.log(`       \u2192 run: ${issue.fix}`)
          }
        }
      }

      // Print orphaned task dirs
      for (const issue of orphaned) {
        console.log(`  ${icon(issue.icon)}  ${issue.entity}  (${issue.message})`)
        if (issue.fix) {
          console.log(`       \u2192 run: ${issue.fix}`)
        }
      }
    }

    if (deadRegistryPaths.length > 0) {
      console.log(
        `\n  ${deadRegistryPaths.length} registry issue${deadRegistryPaths.length === 1 ? "" : "s"}:`
      )
      for (const issue of deadRegistryPaths) {
        console.log(`  ${icon(issue.icon)}  ${issue.entity}: ${issue.message}`)
        if (issue.fix) {
          console.log(`       \u2192 run: ${issue.fix}`)
        }
      }
    }

    if (binaryIssues.length > 0) {
      console.log(`\n  Runtime dependencies:`)
      for (const issue of binaryIssues) {
        console.log(`  ${icon(issue.icon)}  ${issue.entity}  (${issue.message})`)
        if (issue.fix) {
          console.log(`       \u2192 ${issue.fix}`)
        }
      }
    }

    if (wsIssueCount === 0 && deadRegistryPaths.length === 0 && binaryIssues.length === 0) {
      console.log("\n  Everything looks good!")
    }

    // --- Fix execution (UX-03) ---
    if (opts.fix) {
      const fixableIssues = allIssues.filter(i => i.fix)
      const unfixableIssues = allIssues.filter(i => !i.fix && i.icon !== "pass")

      if (fixableIssues.length === 0) {
        console.log("\n  No auto-fixable issues found.")
        if (unfixableIssues.length > 0) {
          console.log(`  ${unfixableIssues.length} issue(s) require manual action.`)
        }
        return
      }

      // Show fixable issues with their commands
      console.log(`\n  Fixes to execute:`)
      for (const issue of fixableIssues) {
        console.log(`    ${issue.entity}: ${issue.fix}`)
      }

      // Annotate unfixable issues
      if (unfixableIssues.length > 0) {
        console.log("")
        for (const issue of unfixableIssues) {
          console.log(`    ${issue.entity}: ${issue.message} (no auto-fix — manual action needed)`)
        }
      }

      // Confirmation (unless --force)
      if (!opts.force) {
        const ok = await p.confirm({
          message: `${fixableIssues.length} fix${fixableIssues.length === 1 ? "" : "es"} available. Execute all?`,
          initialValue: false,
        })
        if (p.isCancel(ok) || !ok) {
          console.log("Cancelled.")
          return
        }
      }

      // Execute fixes — continue past failures
      let fixed = 0
      let failed = 0
      for (const issue of fixableIssues) {
        try {
          const proc = Bun.spawn(["sh", "-c", issue.fix!], {
            stdio: ["inherit", "inherit", "inherit"],
          })
          const exitCode = await proc.exited
          if (exitCode === 0) {
            fixed++
            console.log(`  \u2713 fixed: ${issue.entity}`)
          } else {
            failed++
            console.error(`  \u2717 failed: ${issue.entity} (exit ${exitCode})`)
          }
        } catch (err) {
          failed++
          console.error(`  \u2717 failed: ${issue.entity} (${formatError(String(err))})`)
        }
      }

      console.log(`\n  ${fixed} fixed, ${failed} failed.`)
      return
    }

    console.log("")
  })
