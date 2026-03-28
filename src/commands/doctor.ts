import { Command } from "commander"
import { existsSync, readdirSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { $ } from "bun"
import { parse } from "yaml"
import { prompts as p } from "../tui/utils"
import {
  listWorkspaces,
  readRegistry,
  readGlobalConfig,
  WorkspaceSchema,
  TemplateSchema,
  type Workspace,
  type RepoRegistryEntry,
} from "../lib/config"
import { getTasksDir, WORKSPACES_DIR, TEMPLATES_DIR } from "../lib/paths"

// --- Fix operation types ---

type FixOperation =
  | { action: "remove-dir"; path: string }
  | { action: "open-workspace"; name: string }
  | { action: "remove-repo"; name: string }
  | { action: "rename-workspace"; name: string }
  | { action: "rename-template"; name: string }
  | { action: "info"; message: string }

interface Issue {
  icon: "pass" | "fail" | "warn"
  entity: string
  message: string
  fix?: FixOperation
}

function formatFix(fix: FixOperation): string {
  switch (fix.action) {
    case "remove-dir": return `rm -rf ${fix.path}`
    case "open-workspace": return `git-stacks open ${fix.name}`
    case "remove-repo": return `git-stacks repo remove ${fix.name}`
    case "rename-workspace": return `git-stacks rename ${fix.name} ${fix.name}`
    case "rename-template": return `git-stacks template rename ${fix.name} ${fix.name}`
    case "info": return fix.message
  }
}

async function executeFix(
  fix: FixOperation,
  opts: { silent?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  // silent=true uses pipe stdio (for JSON mode); default uses inherit (for interactive mode)
  const stdio = opts.silent
    ? (["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"])
    : (["inherit", "inherit", "inherit"] as ["inherit", "inherit", "inherit"])

  switch (fix.action) {
    case "remove-dir":
      try {
        rmSync(fix.path, { recursive: true, force: true })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    case "open-workspace": {
      const result = Bun.spawnSync(
        ["bun", "run", join(import.meta.dir, "../index.ts"), "open", fix.name],
        { stdio }
      )
      return result.exitCode === 0 ? { ok: true } : { ok: false, error: `exit ${result.exitCode}` }
    }
    case "remove-repo": {
      const result = Bun.spawnSync(
        ["bun", "run", join(import.meta.dir, "../index.ts"), "repo", "remove", fix.name, "--force"],
        { stdio }
      )
      return result.exitCode === 0 ? { ok: true } : { ok: false, error: `exit ${result.exitCode}` }
    }
    case "rename-workspace": {
      const result = Bun.spawnSync(
        ["bun", "run", join(import.meta.dir, "../index.ts"), "rename", fix.name, fix.name],
        { stdio }
      )
      return result.exitCode === 0 ? { ok: true } : { ok: false, error: `exit ${result.exitCode}` }
    }
    case "rename-template": {
      const result = Bun.spawnSync(
        ["bun", "run", join(import.meta.dir, "../index.ts"), "template", "rename", fix.name, fix.name],
        { stdio }
      )
      return result.exitCode === 0 ? { ok: true } : { ok: false, error: `exit ${result.exitCode}` }
    }
    case "info":
      // Info-only — not executable, display only
      return { ok: true }
  }
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
      fix: { action: "remove-dir" as const, path: join(tasksDir, name) },
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
          fix: { action: "open-workspace", name: ws.name },
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
          fix: { action: "info", message: `Run: git-stacks repo show ${repo.repo}` },
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
        fix: { action: "remove-repo", name: entry.name },
      })
    }
  }
  return issues
}

/** Workspaces where YAML name field does not match filename stem. */
function findWorkspaceNameDrift(): Issue[] {
  if (!existsSync(WORKSPACES_DIR)) return []
  const issues: Issue[] = []
  for (const f of readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".yml"))) {
    const stem = f.replace(".yml", "")
    try {
      const raw = readFileSync(join(WORKSPACES_DIR, f), "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success && parsed.data.name !== stem) {
        issues.push({
          icon: "warn",
          entity: parsed.data.name,
          message: `name field '${parsed.data.name}' does not match filename '${f}'`,
          fix: { action: "rename-workspace", name: parsed.data.name },
        })
      }
    } catch { /* skip unreadable */ }
  }
  return issues
}

/** Templates where YAML name field does not match filename stem. */
function findTemplateNameDrift(): Issue[] {
  if (!existsSync(TEMPLATES_DIR)) return []
  const issues: Issue[] = []
  for (const f of readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".yml"))) {
    const stem = f.replace(".yml", "")
    try {
      const raw = readFileSync(join(TEMPLATES_DIR, f), "utf-8")
      const parsed = TemplateSchema.safeParse(parse(raw))
      if (parsed.success && parsed.data.name !== stem) {
        issues.push({
          icon: "warn",
          entity: parsed.data.name,
          message: `name field '${parsed.data.name}' does not match filename '${f}'`,
          fix: { action: "rename-template", name: parsed.data.name },
        })
      }
    } catch { /* skip unreadable */ }
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

    // --- Name/filename drift checks ---
    const workspaceNameDrift = findWorkspaceNameDrift()
    const templateNameDrift = findTemplateNameDrift()

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
          fix: { action: "info", message: `Install: ${install}` },
        })
      }
    }

    // Forge CLI availability (warn level — optional, not required for git-stacks core)
    const ghAvailable = await checkBinary("gh")
    binaryIssues.push({
      icon: ghAvailable ? "pass" : "warn",
      entity: "gh (GitHub CLI)",
      message: ghAvailable ? "installed" : "not installed — GitHub PR commands unavailable",
      fix: ghAvailable ? undefined : { action: "info", message: "Install: https://cli.github.com/" },
    })

    const glabAvailable = await checkBinary("glab")
    binaryIssues.push({
      icon: glabAvailable ? "pass" : "warn",
      entity: "glab (GitLab CLI)",
      message: glabAvailable ? "installed" : "not installed — GitLab MR commands unavailable",
      fix: glabAvailable ? undefined : { action: "info", message: "Install: https://gitlab.com/gitlab-org/cli" },
    })

    const teaAvailable = await checkBinary("tea")
    binaryIssues.push({
      icon: teaAvailable ? "pass" : "warn",
      entity: "tea (Gitea CLI)",
      message: teaAvailable ? "installed" : "not installed — Gitea PR commands unavailable",
      fix: teaAvailable ? undefined : { action: "info", message: "Install: https://gitea.com/gitea/tea" },
    })

    const jiraAvailable = await checkBinary("jira")
    binaryIssues.push({
      icon: jiraAvailable ? "pass" : "warn",
      entity: "jira (Jira CLI)",
      message: jiraAvailable ? "installed" : "not installed — Jira issue commands will use configurable template fallback",
      fix: jiraAvailable ? undefined : { action: "info", message: "Install: https://github.com/ankitpokhrel/jira-cli" },
    })

    // AeroSpace binary check (macOS only — D-07)
    if (process.platform === "darwin") {
      const aerospaceAvailable = await checkBinary("aerospace")
      binaryIssues.push({
        icon: aerospaceAvailable ? "pass" : "warn",
        entity: "aerospace",
        message: aerospaceAvailable ? "installed" : "not installed \u2014 AeroSpace window management unavailable",
        fix: aerospaceAvailable ? undefined : { action: "info", message: "Install: https://github.com/nikitabobko/AeroSpace" },
      })
    }

    // Collect ALL issues into one flat array
    const allIssues: Issue[] = [
      ...orphaned,
      ...missingWorktrees,
      ...missingMains,
      ...staleCmux,
      ...deadRepoRefs,
      ...deadRegistryPaths,
      ...workspaceNameDrift,
      ...templateNameDrift,
      ...binaryIssues,
    ]

    // --- JSON output (UX-02) ---
    if (opts.json) {
      if (opts.fix) {
        const fixableIssues = allIssues.filter(i => i.fix && i.fix.action !== "info")
        const fixResults = []
        for (const issue of fixableIssues) {
          const result = await executeFix(issue.fix!, { silent: true })
          fixResults.push({
            entity: issue.entity,
            fix: issue.fix,
            success: result.ok,
            ...(result.error && { error: result.error }),
          })
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
    for (const issue of [...missingWorktrees, ...missingMains, ...staleCmux, ...deadRepoRefs, ...workspaceNameDrift, ...templateNameDrift]) {
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
            console.log(`       \u2192 run: ${formatFix(issue.fix)}`)
          }
        }
      }

      // Print orphaned task dirs
      for (const issue of orphaned) {
        console.log(`  ${icon(issue.icon)}  ${issue.entity}  (${issue.message})`)
        if (issue.fix) {
          console.log(`       \u2192 run: ${formatFix(issue.fix)}`)
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
          console.log(`       \u2192 run: ${formatFix(issue.fix)}`)
        }
      }
    }

    if (binaryIssues.length > 0) {
      console.log(`\n  Runtime dependencies:`)
      for (const issue of binaryIssues) {
        console.log(`  ${icon(issue.icon)}  ${issue.entity}  (${issue.message})`)
        if (issue.fix) {
          console.log(`       \u2192 ${formatFix(issue.fix)}`)
        }
      }
    }

    if (wsIssueCount === 0 && deadRegistryPaths.length === 0 && binaryIssues.length === 0) {
      console.log("\n  Everything looks good!")
    }

    // --- Fix execution (UX-03) ---
    if (opts.fix) {
      const fixableIssues = allIssues.filter(i => i.fix && i.fix.action !== "info")
      // Unfixable: no fix at all, or only an info hint (display-only) — exclude pass icons
      const unfixableIssues = allIssues.filter(
        i => (!i.fix || i.fix.action === "info") && i.icon !== "pass"
      )

      if (fixableIssues.length === 0) {
        console.log("\n  No auto-fixable issues found.")
        if (unfixableIssues.length > 0) {
          console.log(`  ${unfixableIssues.length} issue(s) require manual action.`)
          for (const issue of unfixableIssues) {
            const hint = issue.fix ? ` (hint: ${formatFix(issue.fix)})` : ""
            console.log(`    ${issue.entity}: ${issue.message} (no auto-fix — manual action needed)${hint}`)
          }
        }
        return
      }

      // Show fixable issues with their commands
      console.log(`\n  Fixes to execute:`)
      for (const issue of fixableIssues) {
        console.log(`    ${issue.entity}: ${formatFix(issue.fix!)}`)
      }

      // Annotate unfixable issues
      if (unfixableIssues.length > 0) {
        console.log("")
        for (const issue of unfixableIssues) {
          const hint = issue.fix ? ` (hint: ${formatFix(issue.fix)})` : ""
          console.log(`    ${issue.entity}: ${issue.message} (no auto-fix — manual action needed)${hint}`)
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
        const result = await executeFix(issue.fix!)
        if (result.ok) {
          fixed++
          console.log(`  \u2713 fixed: ${issue.entity}`)
        } else {
          failed++
          console.error(`  \u2717 failed: ${issue.entity} (${result.error ?? "unknown error"})`)
        }
      }

      console.log(`\n  ${fixed} fixed, ${failed} failed.`)
      return
    }

    console.log("")
  })
