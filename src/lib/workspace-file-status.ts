import { existsSync } from "fs"
import {
  getFileEntryStatuses,
  resolveSourcePath,
  type FileEntryStatus,
  type FileEntryStatusOptions,
  type FileEntryKind,
  type SimpleFileEntryState,
  type SyncEntryState,
  type SyncComparisonCounts,
  type SyncVerbosePaths,
} from "./files"
import type { FileSyncEntry, Workspace, WorkspaceRepo } from "./config"

export type WorkspaceFileStatusSeverity = "ok" | "warning" | "error"
export type WorkspaceFileStatusState = SimpleFileEntryState | SyncEntryState

export type WorkspaceFileStatusEntryDetails = {
  warnings: string[]
  errors: string[]
  sync?: {
    counts: SyncComparisonCounts
    sourceOnly?: SyncVerbosePaths["sourceOnly"]
    targetOnly?: SyncVerbosePaths["targetOnly"]
    differing?: SyncVerbosePaths["differing"]
    errors?: SyncVerbosePaths["errors"]
  }
}

export type WorkspaceFileStatusEntry = {
  scope: "workspace" | "repo"
  repo: string | null
  type: FileEntryKind
  target: string
  state: WorkspaceFileStatusState
  severity: WorkspaceFileStatusSeverity
  needsAttention: boolean
  hint: string
  details: WorkspaceFileStatusEntryDetails
}

export type WorkspaceFileStatusSummary = {
  total: number
  ok: number
  warnings: number
  errors: number
  attention: number
  sections: number
  byState: Partial<Record<WorkspaceFileStatusState, number>>
  byType: Partial<Record<FileEntryKind, number>>
}

export type WorkspaceFileStatusWorkspaceSection = {
  scope: "workspace"
  name: string
  root: string
  entries: WorkspaceFileStatusEntry[]
  summary: WorkspaceFileStatusSummary
  warnings: string[]
  errors: string[]
}

export type WorkspaceFileStatusRepoSection = {
  scope: "repo"
  name: string
  repo: string
  mode: WorkspaceRepo["mode"]
  mainPath: string
  root: string
  entries: WorkspaceFileStatusEntry[]
  summary: WorkspaceFileStatusSummary
  warnings: string[]
  errors: string[]
}

export type WorkspaceFileStatusView = {
  workspace: WorkspaceFileStatusWorkspaceSection
  repos: WorkspaceFileStatusRepoSection[]
  summary: WorkspaceFileStatusSummary
  warnings: string[]
  errors: string[]
}

function severityFor(state: WorkspaceFileStatusState): WorkspaceFileStatusSeverity {
  if (state === "error" || state === "diverged") return "error"
  if (state === "missing" || state === "pullable" || state === "pushable") return "warning"
  return "ok"
}

function emptySummary(sections = 1): WorkspaceFileStatusSummary {
  return {
    total: 0,
    ok: 0,
    warnings: 0,
    errors: 0,
    attention: 0,
    sections,
    byState: {},
    byType: {},
  }
}

function summarize(entries: WorkspaceFileStatusEntry[], sections = 1): WorkspaceFileStatusSummary {
  const summary = emptySummary(sections)
  for (const entry of entries) {
    summary.total += 1
    summary.byState[entry.state] = (summary.byState[entry.state] ?? 0) + 1
    summary.byType[entry.type] = (summary.byType[entry.type] ?? 0) + 1
    if (entry.needsAttention) summary.attention += 1
    if (entry.severity === "error") summary.errors += 1
    else if (entry.severity === "warning") summary.warnings += 1
    else summary.ok += 1
  }
  return summary
}

function combineSummaries(sections: Array<{ summary: WorkspaceFileStatusSummary }>): WorkspaceFileStatusSummary {
  const summary = emptySummary(sections.length)
  for (const section of sections) {
    summary.total += section.summary.total
    summary.ok += section.summary.ok
    summary.warnings += section.summary.warnings
    summary.errors += section.summary.errors
    summary.attention += section.summary.attention
    for (const [state, count] of Object.entries(section.summary.byState)) {
      const key = state as WorkspaceFileStatusState
      summary.byState[key] = (summary.byState[key] ?? 0) + (count ?? 0)
    }
    for (const [type, count] of Object.entries(section.summary.byType)) {
      const key = type as FileEntryKind
      summary.byType[key] = (summary.byType[key] ?? 0) + (count ?? 0)
    }
  }
  return summary
}

function syncDetails(row: Extract<FileEntryStatus, { kind: "sync" }>): WorkspaceFileStatusEntryDetails["sync"] {
  return {
    counts: row.counts,
    sourceOnly: row.verbosePaths?.sourceOnly,
    targetOnly: row.verbosePaths?.targetOnly,
    differing: row.verbosePaths?.differing,
    errors: row.verbosePaths?.errors,
  }
}

function detailsFor(
  row: FileEntryStatus,
  sourceBase: string,
  syncEntry?: FileSyncEntry
): WorkspaceFileStatusEntryDetails {
  const warnings: string[] = []
  const errors: string[] = row.error ? [row.error] : []

  if (row.state === "missing") {
    warnings.push(`${row.kind} target not materialized: ${row.target}`)
  }

  if (syncEntry) {
    const sourcePath = resolveSourcePath(syncEntry.source, sourceBase)
    if (!existsSync(sourcePath)) {
      warnings.push(`Sync source not found: ${sourcePath}`)
    }
  }

  return {
    warnings,
    errors,
    sync: row.kind === "sync" ? syncDetails(row) : undefined,
  }
}

function entryFromRow(row: FileEntryStatus, sourceBase: string, syncEntry?: FileSyncEntry): WorkspaceFileStatusEntry {
  const severity = severityFor(row.state)
  return {
    scope: row.scope,
    repo: row.scope === "repo" ? row.name : null,
    type: row.kind,
    target: row.target,
    state: row.state,
    severity,
    needsAttention: severity !== "ok",
    hint: row.hint,
    details: detailsFor(row, sourceBase, syncEntry),
  }
}

function collectSectionMessages(entries: WorkspaceFileStatusEntry[], extraWarnings: string[] = []): { warnings: string[]; errors: string[] } {
  return {
    warnings: [...extraWarnings, ...entries.flatMap((entry) => entry.details.warnings)],
    errors: entries.flatMap((entry) => entry.details.errors),
  }
}

function workspaceSyncEntries(workspace: Workspace): FileSyncEntry[] {
  return workspace.files?.sync ?? []
}

function repoRoot(repo: WorkspaceRepo): string {
  return repo.task_path ?? repo.main_path
}

function buildWorkspaceSection(workspace: Workspace, root: string, rows: FileEntryStatus[]): WorkspaceFileStatusWorkspaceSection {
  const syncEntries = workspaceSyncEntries(workspace)
  let syncIndex = 0
  const entries = rows.map((row) => {
    const syncEntry = row.kind === "sync" ? syncEntries[syncIndex++] : undefined
    return entryFromRow(row, root, syncEntry)
  })
  const messages = collectSectionMessages(entries)
  return {
    scope: "workspace",
    name: workspace.name,
    root,
    entries,
    summary: summarize(entries),
    warnings: messages.warnings,
    errors: messages.errors,
  }
}

function buildRepoSection(repo: WorkspaceRepo, rows: FileEntryStatus[]): WorkspaceFileStatusRepoSection {
  const syncEntries = repo.files?.sync ?? []
  let syncIndex = 0
  const root = repoRoot(repo)
  const entries = rows.map((row) => {
    const syncEntry = row.kind === "sync" ? syncEntries[syncIndex++] : undefined
    return entryFromRow(row, repo.main_path, syncEntry)
  })
  const rootWarnings = existsSync(root) ? [] : [`Repo root not found: ${root}`]
  const messages = collectSectionMessages(entries, rootWarnings)
  return {
    scope: "repo",
    name: repo.name,
    repo: repo.repo,
    mode: repo.mode,
    mainPath: repo.main_path,
    root,
    entries,
    summary: summarize(entries),
    warnings: messages.warnings,
    errors: messages.errors,
  }
}

export function getWorkspaceFileStatusView(
  workspace: Workspace,
  wsInstanceRoot: string,
  options: FileEntryStatusOptions = {}
): WorkspaceFileStatusView {
  const rows = getFileEntryStatuses(workspace, wsInstanceRoot, options)
  const workspaceRows = rows.filter((row) => row.scope === "workspace" && row.name === workspace.name)
  const workspaceSection = buildWorkspaceSection(workspace, wsInstanceRoot, workspaceRows)
  const repoSections = workspace.repos.map((repo) => {
    const repoRows = rows.filter((row) => row.scope === "repo" && row.name === repo.name)
    return buildRepoSection(repo, repoRows)
  })
  const sections = [workspaceSection, ...repoSections]
  return {
    workspace: workspaceSection,
    repos: repoSections,
    summary: combineSummaries(sections),
    warnings: sections.flatMap((section) => section.warnings),
    errors: sections.flatMap((section) => section.errors),
  }
}
