import { Command } from "commander"
import { existsSync, readdirSync } from "fs"
import { join } from "path"
import { $ } from "bun"
import {
  listWorkspaces,
  listStacks,
  stackExists,
  readGlobalConfig,
  type Workspace,
  type Stack,
} from "../lib/config"
import { getTasksDir } from "../lib/paths"

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
          fix: `ws open ${ws.name}`,
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
          fix: `ws stack edit ${repo.stack}`,
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
          message: `cmux_workspace_id stale (session not found) \u2014 will reset on next ws open`,
        })
      }
    } catch {
      // cmux not installed or not available — skip all remaining checks
      break
    }
  }
  return issues
}

/** Workspace repos referencing stacks that don't exist. */
function findDeadStackRefs(workspaces: Workspace[]): Issue[] {
  const issues: Issue[] = []
  const checked = new Set<string>()
  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      const key = `${ws.name}:${repo.stack}`
      if (checked.has(key)) continue
      checked.add(key)
      if (!stackExists(repo.stack)) {
        issues.push({
          icon: "fail",
          entity: ws.name,
          message: `references non-existent stack '${repo.stack}'`,
        })
      }
    }
  }
  return issues
}

/** Stack repos whose path doesn't exist on disk. */
function findDeadRepoPaths(stacks: Stack[]): Issue[] {
  const issues: Issue[] = []
  for (const stack of stacks) {
    for (const repo of stack.repos) {
      if (!existsSync(repo.path)) {
        issues.push({
          icon: "fail",
          entity: stack.name,
          message: `repo '${repo.name}' path not found: ${repo.path}`,
          fix: `ws stack edit ${stack.name}`,
        })
      }
    }
  }
  return issues
}

export const doctorCommand = new Command("doctor")
  .description("Check workspace health — detect drift between config and filesystem")
  .action(async () => {
    const config = readGlobalConfig()
    const tasksDir = getTasksDir(config.workspace_root)
    const workspaces = listWorkspaces()
    const stacks = listStacks()

    // --- Workspace checks ---
    const orphaned = findOrphanedTaskDirs(tasksDir, workspaces)
    const missingWorktrees = findMissingWorktrees(workspaces)
    const missingMains = findMissingMainClones(workspaces)
    const staleCmux = await findStaleCmuxRefs(workspaces)
    const deadStacks = findDeadStackRefs(workspaces)

    // Group workspace issues by entity
    const wsIssuesByEntity = new Map<string, Issue[]>()
    for (const issue of [...missingWorktrees, ...missingMains, ...staleCmux, ...deadStacks]) {
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

    // --- Stack checks ---
    const deadRepoPaths = findDeadRepoPaths(stacks)

    if (deadRepoPaths.length > 0) {
      console.log(
        `\n  ${deadRepoPaths.length} stack issue${deadRepoPaths.length === 1 ? "" : "s"}:`
      )
      for (const issue of deadRepoPaths) {
        console.log(`  ${icon(issue.icon)}  ${issue.entity}: ${issue.message}`)
        if (issue.fix) {
          console.log(`       \u2192 run: ${issue.fix}`)
        }
      }
    }

    if (wsIssueCount === 0 && deadRepoPaths.length === 0) {
      console.log("\n  Everything looks good!")
    }

    console.log("")
  })
