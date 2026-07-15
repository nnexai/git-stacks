import { Command } from "commander"

import { join } from "path"
import { formatError } from "@git-stacks/core/errors"
import { readGlobalConfig, type Workspace } from "@git-stacks/core/config"
import { getTasksDir } from "@git-stacks/core/paths"
import { resolveOptionalWorkspace } from "@git-stacks/core/workspace-resolution"
import {
  applySyncOperation,
  DEFAULT_VERBOSE_PATH_LIMIT,
  getFileEntryStatuses,
  type FileEntryStatus,
  type SyncOperationResult,
  type SyncOperationPlan,
  type VerbosePathBucket,
} from "@git-stacks/core/files"

function resolveWorkspace(workspaceName: string | undefined): Workspace {
  const resolution = resolveOptionalWorkspace(workspaceName)
  if (resolution.ok) return resolution.workspace

  if (resolution.error === "workspace_not_found") {
    console.error(formatError(`Workspace '${resolution.name}' not found`, "run: git-stacks list"))
  } else {
    console.error(formatError(
      "Missing workspace name",
      "usage: git-stacks files <verb> <workspace>, or run from a workspace root/worktree"
    ))
  }
  process.exit(1)
}

function workspaceRoot(workspace: Workspace): string {
  const config = readGlobalConfig()
  return join(getTasksDir(config.workspace_root), workspace.name)
}

function counts(row: Extract<FileEntryStatus, { kind: "sync" }>): string {
  return `source-only=${row.counts.sourceOnly} target-only=${row.counts.targetOnly} differing=${row.counts.differing} equal=${row.counts.equal} errors=${row.counts.errors}`
}

function formatStatusRow(row: FileEntryStatus): string {
  if (row.kind === "sync") {
    return `${row.scope}  ${row.name}  ${row.target}  ${row.state}  ${counts(row)}  ${row.hint}`
  }
  return `${row.scope}  ${row.name}  ${row.target}  ${row.state}  ${row.hint}`
}

function printVerbosePaths(row: FileEntryStatus): void {
  if (row.kind !== "sync" || !row.verbosePaths) return
  for (const [label, bucket] of Object.entries(row.verbosePaths)) {
    for (const path of bucket.paths) {
      console.log(`  ${label}: ${path || "."}`)
    }
    if (bucket.omitted > 0) {
      console.log(`  ${label}: ... ${bucket.omitted} omitted`)
    }
  }
}

function printOperationResult(result: SyncOperationResult): void {
  console.log(`${result.direction}${result.dryRun ? " dry-run" : ""}${result.force ? " force" : ""}`)
  for (const entry of result.entries) {
    const label = `${entry.scope} ${entry.name} ${entry.target}`
    if (entry.error) {
      console.log(`refused  ${label}  ${entry.error}`)
      continue
    }
    for (const path of entry.plan.writes) console.log(`${result.dryRun ? "would write" : "wrote"}  ${label}  ${path || "."}`)
    for (const path of entry.plan.overwrites) console.log(`${result.dryRun ? "would overwrite" : "overwrote"}  ${label}  ${path || "."}`)
    for (const path of entry.plan.deletes) console.log(`${result.dryRun ? "would delete" : "deleted"}  ${label}  ${path || "."}`)
    for (const refusal of entry.plan.refusals) console.log(`refused  ${label}  ${refusal.path || "."}  ${refusal.reason}`)
    if (
      !entry.error &&
      entry.plan.writes.length === 0 &&
      entry.plan.overwrites.length === 0 &&
      entry.plan.deletes.length === 0 &&
      entry.plan.refusals.length === 0
    ) {
      console.log(`unchanged  ${label}`)
    }
  }
}

function jsonDetails(bucket: VerbosePathBucket) {
  return {
    paths: bucket.paths,
    omitted: bucket.omitted,
    truncated: bucket.omitted > 0,
  }
}

function statusSummary(rows: FileEntryStatus[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      summary[row.state] = (summary[row.state] ?? 0) + 1
      return summary
    },
    { total: 0 } as Record<string, number>
  )
}

function statusJson(workspace: Workspace, rows: FileEntryStatus[], verbose: boolean) {
  const entries = rows.map((row) => {
    const base = {
      scope: row.scope,
      repo: row.scope === "repo" ? row.name : null,
      name: row.name,
      type: row.kind,
      target: row.target,
      state: row.state,
      warnings: [] as string[],
      errors: row.error ? [row.error] : [] as string[],
    }
    if (row.kind !== "sync") return base
    return {
      ...base,
      counts: row.counts,
      details: verbose && row.verbosePaths ? {
        sourceOnly: jsonDetails(row.verbosePaths.sourceOnly),
        targetOnly: jsonDetails(row.verbosePaths.targetOnly),
        differing: jsonDetails(row.verbosePaths.differing),
        errors: jsonDetails(row.verbosePaths.errors),
      } : undefined,
    }
  })

  return {
    workspace: workspace.name,
    entries,
    summary: statusSummary(rows),
    warnings: [] as string[],
  }
}

function countPlan(plan: SyncOperationPlan) {
  return {
    writes: plan.writes.length + plan.overwrites.length,
    deletes: plan.deletes.length,
    refusals: plan.refusals.length,
  }
}

function operationJson(workspace: Workspace, result: SyncOperationResult) {
  let writes = 0
  let deletes = 0
  let refusals = 0
  const errors: string[] = []

  const results = result.entries.map((entry) => {
    const counts = countPlan(entry.plan)
    writes += counts.writes
    deletes += counts.deletes
    refusals += counts.refusals
    if (entry.error) errors.push(entry.error)
    return {
      scope: entry.scope,
      repo: entry.scope === "repo" ? entry.name : null,
      name: entry.name,
      target: entry.target,
      ok: !entry.error && entry.plan.refusals.length === 0,
      writes: counts.writes,
      deletes: counts.deletes,
      refusals: counts.refusals,
      plan: {
        writes: entry.plan.writes,
        overwrites: entry.plan.overwrites,
        deletes: entry.plan.deletes,
        skipped: entry.plan.skipped,
        refusals: entry.plan.refusals,
      },
      error: entry.error,
    }
  })

  return {
    ok: result.ok,
    workspace: workspace.name,
    operation: result.direction,
    mode: result.direction,
    dryRun: result.dryRun,
    force: result.force,
    results,
    summary: {
      entries: result.entries.length,
      writes,
      deletes,
      refusals,
      errors: errors.length,
    },
    warnings: [] as string[],
    errors,
  }
}

export const filesCommand = new Command("files")
  .description("Inspect and explicitly sync workspace files")

filesCommand
  .command("status [workspace]")
  .description("Show configured file entry status")
  .option("--verbose", "Show capped representative paths for sync entries")
  .option("--json", "Emit machine-readable JSON")
  .action((workspaceName: string | undefined, opts: { verbose?: boolean; json?: boolean }) => {
    const workspace = resolveWorkspace(workspaceName)
    const rows = getFileEntryStatuses(workspace, workspaceRoot(workspace), {
      verbose: opts.verbose,
      pathLimit: DEFAULT_VERBOSE_PATH_LIMIT,
    })
    if (opts.json) {
      console.log(JSON.stringify(statusJson(workspace, rows, opts.verbose === true), null, 2))
      return
    }
    console.log(`Workspace: ${workspace.name}`)
    if (rows.length === 0) {
      console.log("No file entries configured.")
      return
    }
    for (const row of rows) {
      console.log(formatStatusRow(row))
      if (opts.verbose) printVerbosePaths(row)
    }
  })

filesCommand
  .command("pull [workspace]")
  .description("Copy sync source changes into workspace targets")
  .option("--force", "Mirror source to target, including overwrites and destination deletes")
  .option("--dry-run", "Show planned writes, deletes, and refusals without changing files")
  .option("--json", "Emit machine-readable JSON")
  .action((workspaceName: string | undefined, opts: { force?: boolean; dryRun?: boolean; json?: boolean }) => {
    const workspace = resolveWorkspace(workspaceName)
    const result = applySyncOperation(workspace, workspaceRoot(workspace), {
      direction: "pull",
      force: opts.force,
      dryRun: opts.dryRun,
    })
    if (opts.json) {
      console.log(JSON.stringify(operationJson(workspace, result), null, 2))
      if (!result.ok && !result.dryRun) process.exit(1)
      return
    }
    printOperationResult(result)
    if (!result.ok) process.exit(1)
  })

filesCommand
  .command("push [workspace]")
  .description("Explicitly copy workspace target changes back to sync sources")
  .option("--force", "Mirror target to source, including overwrites and destination deletes")
  .option("--dry-run", "Show planned writes, deletes, and refusals without changing files")
  .option("--json", "Emit machine-readable JSON")
  .action((workspaceName: string | undefined, opts: { force?: boolean; dryRun?: boolean; json?: boolean }) => {
    const workspace = resolveWorkspace(workspaceName)
    const result = applySyncOperation(workspace, workspaceRoot(workspace), {
      direction: "push",
      force: opts.force,
      dryRun: opts.dryRun,
    })
    if (opts.json) {
      console.log(JSON.stringify(operationJson(workspace, result), null, 2))
      if (!result.ok && !result.dryRun) process.exit(1)
      return
    }
    printOperationResult(result)
    if (!result.ok) process.exit(1)
  })
