import { Command } from "commander"
import { join } from "path"
import { formatError } from "../lib/errors"
import { readGlobalConfig, readWorkspace, workspaceExists, type Workspace } from "../lib/config"
import { getTasksDir } from "../lib/paths"
import { detectWorkspaceFromCwd } from "../lib/workspace-status"
import {
  applySyncOperation,
  getFileEntryStatuses,
  type FileEntryStatus,
  type SyncOperationResult,
} from "../lib/files"

function resolveWorkspace(workspaceName: string | undefined): Workspace {
  if (workspaceName) {
    if (!workspaceExists(workspaceName)) {
      console.error(formatError(`Workspace '${workspaceName}' not found`, "run: git-stacks list"))
      process.exit(1)
    }
    return readWorkspace(workspaceName)
  }

  const detected = detectWorkspaceFromCwd()
  if (detected.ok) return detected.workspace

  console.error(formatError("Missing workspace name", "usage: git-stacks files <verb> <workspace>"))
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

export const filesCommand = new Command("files")
  .description("Inspect and sync workspace files")

filesCommand
  .command("status [workspace]")
  .description("Show configured file entry status")
  .option("--verbose", "Show capped representative paths for sync entries")
  .action((workspaceName: string | undefined, opts: { verbose?: boolean }) => {
    const workspace = resolveWorkspace(workspaceName)
    console.log(`Workspace: ${workspace.name}`)
    const rows = getFileEntryStatuses(workspace, workspaceRoot(workspace), { verbose: opts.verbose })
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
  .option("--force", "Mirror source to target, including overwrites and deletes")
  .option("--dry-run", "Show planned writes, deletes, and refusals without changing files")
  .action((workspaceName: string | undefined, opts: { force?: boolean; dryRun?: boolean }) => {
    const workspace = resolveWorkspace(workspaceName)
    const result = applySyncOperation(workspace, workspaceRoot(workspace), {
      direction: "pull",
      force: opts.force,
      dryRun: opts.dryRun,
    })
    printOperationResult(result)
    if (!result.ok) process.exit(1)
  })

filesCommand
  .command("push [workspace]")
  .description("Copy workspace target changes back to sync sources")
  .option("--force", "Mirror target to source, including overwrites and deletes")
  .option("--dry-run", "Show planned writes, deletes, and refusals without changing files")
  .action((workspaceName: string | undefined, opts: { force?: boolean; dryRun?: boolean }) => {
    const workspace = resolveWorkspace(workspaceName)
    const result = applySyncOperation(workspace, workspaceRoot(workspace), {
      direction: "push",
      force: opts.force,
      dryRun: opts.dryRun,
    })
    printOperationResult(result)
    if (!result.ok) process.exit(1)
  })
