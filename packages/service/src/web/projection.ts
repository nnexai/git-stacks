import { createHash } from "node:crypto"

import type { WorkspaceFileStatusView } from "@git-stacks/core/workspace-file-status"
import type { WorkspaceNotesSnapshot } from "@git-stacks/core/notes"
import type { Operation, OperationCancellationView, Signal, SignalDismissal, WorkspaceCatalog, WorkspaceCreationCatalog, WorkspaceSnapshotResponse } from "@git-stacks/protocol"
import type { OperationWebContext } from "../policy/operations.js"
import type { CanonicalWorkspaceAction } from "../policy/workspace-actions.js"

import {
  WebFileStatusResponseSchema,
  WebNotesResponseSchema,
  WebOperationSchema,
  WebOperationSummarySchema,
  WebForgeErrorDetailsSchema,
  WebSnapshotSchema,
  WebStaleWorkspaceResponseSchema,
  WebWorkspaceActionInventorySchema,
  WorkspaceLifecyclePhaseSchema,
  type WebFileEntry,
  type WebFileStatusResponse,
  type WebNotesResponse,
  type WebOperation,
  type WebOperationSummary,
  type WebSnapshot,
  type WebStaleWorkspaceCaution,
  type WebStaleWorkspaceConfirmedReason,
  type WebStaleWorkspaceResponse,
  type WebStaleWorkspaceUnknownEvidence,
  type WebWorkspaceActionInventory,
} from "@git-stacks/protocol"

export function projectWebSnapshot(input: WorkspaceCatalog | WorkspaceSnapshotResponse[]): WebSnapshot {
  const catalog = Array.isArray(input)
    ? {
        revision: input[0]?.revision ?? "0",
        generated_at: input[0]?.generated_at ?? new Date().toISOString(),
        workspaces: input,
        archived_workspaces: [],
      }
    : input
  const snapshots = catalog.workspaces
  return WebSnapshotSchema.parse({
    protocol: "web-v1",
    revision: catalog.revision,
    generated_at: catalog.generated_at,
    pinned_workspace_ids: snapshots
      .filter(({ workspace }) => workspace.pinned === true)
      .sort((left, right) => left.workspace.name.localeCompare(right.workspace.name))
      .map(({ workspace }) => workspace.id),
    archived_workspaces: catalog.archived_workspaces.map(({ id, name, activity_at }) => ({ id, name, activity_at })),
    workspaces: snapshots.map(({ workspace }) => {
      const status = new Map((workspace.status ?? []).map((entry) => [entry.repository_id, entry]))
      return {
        id: workspace.id,
        name: workspace.name,
        activity_at: workspace.activity_at,
        branch: workspace.branch,
        priority: workspace.priority ?? 0,
        labels: workspace.labels ?? [],
        repositories: workspace.repositories.map((repository) => {
          const item = status.get(repository.id)
          return {
            id: repository.id,
            name: repository.name,
            mode: repository.mode,
            exists: item?.exists ?? false,
            dirty: item?.dirty ?? false,
            branch: item?.branch ?? "",
            ahead: item?.ahead ?? 0,
            behind: item?.behind ?? 0,
            additions: item?.additions ?? 0,
            removals: item?.removals ?? 0,
            degraded: item?.degraded ?? true,
            remote: item?.remote ?? "missing",
          }
        }),
        commands: (workspace.launch.named ?? []).map(({ id, name, scope, repository_id }) => ({ id, name, scope, ...(repository_id ? { repository_id } : {}) })),
        file_status: workspace.file_status ?? { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0 },
      }
    }),
  })
}

export function projectWebOperation(operation: Operation): WebOperation {
  const common = {
    operation_id: operation.operation_id,
    state: operation.state,
    accepted_at: operation.accepted_at,
    ...("started_at" in operation ? { started_at: operation.started_at } : {}),
    ...("finished_at" in operation ? { finished_at: operation.finished_at } : {}),
  }
  if (operation.state === "running") {
    const lifecyclePhase = WorkspaceLifecyclePhaseSchema.safeParse(operation.progress.data?.lifecycle_phase)
    return WebOperationSchema.parse({ ...common, progress: {
      message: lifecyclePhase.success
        ? lifecycleProgressMessage(lifecyclePhase.data)
        : operationProgressMessage(operation.progress.stage),
      ...(operation.progress.completed === undefined ? {} : { completed: operation.progress.completed, total: operation.progress.total }),
      ...(lifecyclePhase.success ? { lifecycle_phase: lifecyclePhase.data } : {}),
    } })
  }
  if (operation.state === "succeeded") {
    const result = operation.result ?? {}
    return WebOperationSchema.parse({ ...common, result: {
      ...(typeof result.workspace_name === "string" ? { workspace_name: result.workspace_name } : {}),
      ...(typeof result.snapshot_changed === "boolean" ? { snapshot_changed: result.snapshot_changed } : {}),
      ...(typeof result.revision === "string" ? { revision: result.revision } : {}),
      ...(typeof result.terminals_stopped === "boolean" ? { terminals_stopped: result.terminals_stopped } : {}),
    } })
  }
  if (operation.state === "failed" || operation.state === "cancelled") {
    const lifecycle = operation.lifecycle
      ? {
          kind: operation.lifecycle.kind,
          ...(operation.lifecycle.blocking_repositories ? { blocking_repositories: [...operation.lifecycle.blocking_repositories] } : {}),
          terminals_stopped: operation.lifecycle.terminals_stopped,
          force_allowed: operation.lifecycle.force_allowed,
        }
      : undefined
    const forge = WebForgeErrorDetailsSchema.safeParse(operation.error.details)
    return WebOperationSchema.parse({ ...common, error: {
      code: operation.error.code,
      message: operationFailureMessage(operation.error.code, lifecycle?.kind),
      ...(lifecycle ? { lifecycle } : {}),
      ...(forge.success ? { forge: forge.data } : {}),
    } })
  }
  return WebOperationSchema.parse(common)
}

export function projectWebOperationSummary(
  operation: Operation,
  context: OperationWebContext,
  cancellation?: OperationCancellationView,
): WebOperationSummary {
  const common = {
    operation_id: operation.operation_id,
    action_id: context.actionId,
    ...(context.workspaceId ? { workspace_id: context.workspaceId } : {}),
    workspace_name: context.workspaceName,
    accepted_at: operation.accepted_at,
  }
  if (operation.state === "accepted") {
    return WebOperationSummarySchema.parse({ ...common, state: "accepted", ...(cancellation ? { cancellation } : {}) })
  }
  if (operation.state === "running") {
    const lifecyclePhase = WorkspaceLifecyclePhaseSchema.safeParse(operation.progress.data?.lifecycle_phase)
    const stage = operation.progress.stage === "rolling_back"
      ? "rolling_back"
      : operation.progress.stage === "preparing"
        ? "preparing"
        : "executing"
    return WebOperationSummarySchema.parse({
      ...common,
      state: "running",
      started_at: operation.started_at,
      progress: {
        stage,
        message: lifecyclePhase.success ? lifecycleProgressMessage(lifecyclePhase.data) : operationProgressMessage(operation.progress.stage),
        ...(operation.progress.completed === undefined ? {} : { completed: operation.progress.completed, total: operation.progress.total }),
        ...(lifecyclePhase.success ? { lifecycle_phase: lifecyclePhase.data } : {}),
      },
      cancellation: cancellation ?? { state: "unavailable", reason: "not-cancellable" },
    })
  }
  if (operation.state === "succeeded") {
    const result = operation.result ?? {}
    return WebOperationSummarySchema.parse({
      ...common,
      state: "succeeded",
      started_at: operation.started_at,
      finished_at: operation.finished_at,
      cancellation: { state: "unavailable", reason: "finished" },
      result: {
        ...(typeof result.workspace_name === "string" ? { workspace_name: result.workspace_name } : {}),
        ...(typeof result.snapshot_changed === "boolean" ? { snapshot_changed: result.snapshot_changed } : {}),
        ...(typeof result.revision === "string" ? { revision: result.revision } : {}),
        ...(typeof result.terminals_stopped === "boolean" ? { terminals_stopped: result.terminals_stopped } : {}),
      },
    })
  }
  const lifecycle = operation.lifecycle
    ? {
        kind: operation.lifecycle.kind,
        ...(operation.lifecycle.blocking_repositories ? { blocking_repositories: [...operation.lifecycle.blocking_repositories] } : {}),
        terminals_stopped: operation.lifecycle.terminals_stopped,
        force_allowed: operation.lifecycle.force_allowed,
      }
    : undefined
  const forge = WebForgeErrorDetailsSchema.safeParse(operation.error.details)
  return WebOperationSummarySchema.parse({
    ...common,
    state: operation.state,
    ...(operation.started_at ? { started_at: operation.started_at } : {}),
    finished_at: operation.finished_at,
    cancellation: { state: "unavailable", reason: "finished" },
    error: {
      code: operation.error.code,
      message: operationFailureMessage(operation.error.code, lifecycle?.kind),
      retryable: operation.error.code === "conflict",
      ...(lifecycle ? { lifecycle } : {}),
      ...(forge.success ? { forge: forge.data } : {}),
    },
  })
}

function lifecycleProgressMessage(phase: ReturnType<typeof WorkspaceLifecyclePhaseSchema.parse>): string {
  return {
    stopping_terminals: "Stopping workspace terminals",
    checking_worktrees: "Checking worktrees",
    removing_worktrees: "Removing managed worktrees",
    deleting_workspace_files: "Deleting workspace files",
    reconciling_state: "Reconciling workspace state",
  }[phase]
}

function operationProgressMessage(stage: string): string {
  return {
    accepted: "Operation accepted.",
    preparing: "Preparing operation.",
    executing: "Operation in progress.",
    rolling_back: "Rolling back completed work.",
    completed: "Operation completed.",
  }[stage] ?? "Operation in progress."
}

function operationFailureMessage(code: string, lifecycleKind?: string): string {
  if (lifecycleKind === "workspace_dirty" || code === "workspace_dirty") return "Dirty worktrees block removal"
  return {
    invalid_request: "The operation request is invalid.",
    unauthorized: "The operation is not authorized.",
    not_found: "The requested workspace resource was not found.",
    conflict: "Workspace state changed. Refresh before trying again.",
    rate_limited: "The operation is temporarily rate limited.",
    capability_unavailable: "This service capability is unavailable.",
    replay_gap: "Operation history is no longer available.",
    snapshot_busy: "Workspace state is changing. Try again.",
    internal_error: "The operation could not be completed.",
    operation_failed: "The operation failed.",
    idempotency_conflict: "This request key was already used for different input.",
    request_timeout: "The operation timed out.",
    capacity_exceeded: "The service capacity limit was reached.",
  }[code] ?? "The operation failed."
}

function projectStaleConfirmedReason(reason: WebStaleWorkspaceConfirmedReason): WebStaleWorkspaceConfirmedReason {
  switch (reason.code) {
    case "merged":
    case "closed":
      return {
        code: reason.code,
        occurred_at: reason.occurred_at,
        repository_id: reason.repository_id,
        repository_name: reason.repository_name,
        provider: reason.provider,
      }
    case "remote_branch_deleted":
    case "managed_worktree_missing":
      return {
        code: reason.code,
        occurred_at: reason.occurred_at,
        repository_id: reason.repository_id,
        repository_name: reason.repository_name,
      }
    case "inactive":
      return { code: reason.code, occurred_at: reason.occurred_at }
  }
}

function projectStaleUnknownEvidence(evidence: WebStaleWorkspaceUnknownEvidence): WebStaleWorkspaceUnknownEvidence {
  switch (evidence.code) {
    case "unsupported_host":
    case "tool_unavailable":
    case "authentication_required":
    case "rate_limited":
    case "request_timeout":
    case "request_aborted":
    case "provider_unavailable":
    case "malformed_response":
    case "output_limit_exceeded":
      return {
        code: evidence.code,
        observed_at: evidence.observed_at,
        repository_id: evidence.repository_id,
        repository_name: evidence.repository_name,
        provider: evidence.provider,
      }
    case "remote_check_failed":
    case "worktree_inaccessible":
    case "probe_superseded":
      return {
        code: evidence.code,
        observed_at: evidence.observed_at,
        repository_id: evidence.repository_id,
        repository_name: evidence.repository_name,
      }
    case "invalid_provenance":
    case "unsupported_provider":
    case "activity_unavailable":
      return { code: evidence.code, observed_at: evidence.observed_at }
  }
}

function projectStaleCaution(caution: WebStaleWorkspaceCaution): WebStaleWorkspaceCaution {
  switch (caution.code) {
    case "dirty_worktree":
    case "workspace_drift":
      return {
        code: caution.code,
        repository_id: caution.repository_id,
        repository_name: caution.repository_name,
      }
    case "ahead_of_remote":
      return {
        code: caution.code,
        repository_id: caution.repository_id,
        repository_name: caution.repository_name,
        count: caution.count,
      }
    case "notes_present":
      return { code: caution.code, count: caution.count }
  }
}

export function projectWebStaleWorkspaceEvaluation(input: WebStaleWorkspaceResponse): WebStaleWorkspaceResponse {
  return WebStaleWorkspaceResponseSchema.parse({
    revision: input.revision,
    checked_at: input.checked_at,
    threshold_days: input.threshold_days,
    candidates: input.candidates.map((candidate) => ({
      workspace_id: candidate.workspace_id,
      workspace_name: candidate.workspace_name,
      activity_at: candidate.activity_at,
      confirmed_reasons: candidate.confirmed_reasons.map(projectStaleConfirmedReason),
      unknown_evidence: candidate.unknown_evidence.map(projectStaleUnknownEvidence),
      cautions: candidate.cautions.map(projectStaleCaution),
    })),
    incomplete: input.incomplete.map((row) => ({
      workspace_id: row.workspace_id,
      workspace_name: row.workspace_name,
      activity_at: row.activity_at,
      unknown_evidence: row.unknown_evidence.map(projectStaleUnknownEvidence),
      cautions: row.cautions.map(projectStaleCaution),
    })),
  })
}

export function projectWebActionInventory(actions: readonly CanonicalWorkspaceAction[]): WebWorkspaceActionInventory {
  const projected: unknown[] = []
  for (const action of actions) {
    if (action.action_id === "operation.cancel") {
      if (action.availability.available && action.pending_operation_id) {
        projected.push({
          action_id: action.action_id,
          subject: { kind: "operation", operation_id: action.pending_operation_id, workspace_id: action.workspace_id },
          availability: action.availability,
          confirmation: action.confirmation,
        })
      }
      continue
    }
    const pending = !action.availability.available && action.availability.reason === "operation_in_progress"
    projected.push({
      action_id: action.action_id,
      subject: { kind: "workspace", workspace_id: action.workspace_id },
      availability: action.availability,
      confirmation: action.confirmation,
      ...(pending && action.pending_operation_id ? { pending_operation_id: action.pending_operation_id } : {}),
    })
  }
  return WebWorkspaceActionInventorySchema.parse(projected)
}

export function projectWebNotes(input: {
  workspaceId: string
  revision: string
  notes: WorkspaceNotesSnapshot
}): WebNotesResponse {
  return WebNotesResponseSchema.parse({
    workspace_id: input.workspaceId,
    revision: input.revision,
    notes_revision: input.notes.revision,
    count: input.notes.count,
    records: input.notes.records.slice(0, 50).map(({ text, created }) => ({ text, created_at: created })),
  })
}

type FileProjectionContext = {
  workspaceId: string
  revision: string
  generatedAt: string
  repositoryIds: ReadonlyMap<string, string>
}

const fileMessages: Record<WebFileEntry["reason"], string> = {
  none: "The configured target is up to date.",
  target_missing: "The configured target has not been materialized.",
  source_missing: "The configured source is unavailable.",
  content_differs: "The configured source has changes to pull.",
  diverged: "The configured source and target have both changed.",
  comparison_failed: "The configured target could not be compared.",
  repo_root_missing: "The repository workspace is unavailable.",
}

function safeLogicalTarget(target: string): string {
  if (!target || target.startsWith("/") || target.includes("\\") || /^[A-Za-z]:/u.test(target)) return "Configured target"
  if (target.split("/").some((part) => !part || part === "..")) return "Configured target"
  return target.slice(0, 256)
}

function fileReason(entry: WorkspaceFileStatusView["workspace"]["entries"][number]): WebFileEntry["reason"] {
  if (entry.state === "materialized" || entry.state === "ok") return "none"
  if (entry.state === "missing") return entry.details.warnings.some((warning) => warning.startsWith("Sync source not found:"))
    ? "source_missing" : "target_missing"
  if (entry.state === "pullable") return entry.details.sync?.counts.differing || entry.details.sync?.counts.targetOnly
    ? "content_differs" : "source_missing"
  if (entry.state === "pushable") return entry.details.sync?.counts.differing || entry.details.sync?.counts.sourceOnly
    ? "content_differs" : "target_missing"
  if (entry.state === "diverged") return "diverged"
  return "comparison_failed"
}

function projectFileEntry(
  entry: WorkspaceFileStatusView["workspace"]["entries"][number],
  identity: string,
): WebFileEntry {
  const reason = fileReason(entry)
  const counts = entry.details.sync?.counts
  return {
    id: `file_${createHash("sha256").update(identity).digest("base64url").slice(0, 22)}`,
    target: safeLogicalTarget(entry.target),
    type: entry.type,
    state: entry.state,
    severity: entry.severity,
    needs_attention: entry.needsAttention,
    reason,
    message: fileMessages[reason],
    ...(counts ? { counts: {
      equal: counts.equal,
      source_only: counts.sourceOnly,
      target_only: counts.targetOnly,
      differing: counts.differing,
      errors: counts.errors,
    } } : {}),
  }
}

function summarizeWebEntries(entries: readonly WebFileEntry[]) {
  return entries.reduce((summary, entry) => {
    summary.total += 1
    if (entry.severity === "ok") summary.ok += 1
    else if (entry.severity === "warning") summary.warnings += 1
    else summary.errors += 1
    if (entry.needs_attention) summary.attention += 1
    return summary
  }, { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0 })
}

export function projectWebFileStatus(view: WorkspaceFileStatusView, context: FileProjectionContext): WebFileStatusResponse {
  const workspaceEntries = view.workspace.entries.map((entry, index) =>
    projectFileEntry(entry, `${context.workspaceId}\0workspace\0${index}\0${entry.type}\0${entry.target}`))
  const groups: WebFileStatusResponse["groups"] = [{
    scope: "workspace",
    name: view.workspace.name,
    summary: summarizeWebEntries(workspaceEntries),
    entries: workspaceEntries,
  }]
  for (const section of view.repos) {
    const repositoryId = context.repositoryIds.get(section.name) ?? context.repositoryIds.get(section.repo)
    if (!repositoryId) continue
    const entries = section.entries.map((entry, index) =>
      projectFileEntry(entry, `${context.workspaceId}\0${repositoryId}\0${index}\0${entry.type}\0${entry.target}`))
    groups.push({
      scope: "repository",
      repository_id: repositoryId,
      name: section.name,
      summary: summarizeWebEntries(entries),
      entries,
    })
  }
  const summary = groups.reduce((total, group) => ({
    total: total.total + group.summary.total,
    ok: total.ok + group.summary.ok,
    warnings: total.warnings + group.summary.warnings,
    errors: total.errors + group.summary.errors,
    attention: total.attention + group.summary.attention,
  }), { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0 })
  return WebFileStatusResponseSchema.parse({
    workspace_id: context.workspaceId,
    revision: context.revision,
    generated_at: context.generatedAt,
    summary,
    groups,
  })
}

export function projectWebCatalog(catalog: WorkspaceCreationCatalog): WorkspaceCreationCatalog {
  return structuredClone(catalog)
}

export function projectWebSignal(signal: Signal | SignalDismissal): Signal | SignalDismissal {
  if (signal.kind === "dismiss_signal") return { ...signal }
  return {
    ...signal,
    ...(signal.detail ? { detail: signal.detail.slice(0, 500) } : {}),
  }
}

export function projectWebTerminalSignals(
  signals: Signal[],
  terminalSurfaceIds: ReadonlySet<string>,
  activeWorkspaceIds?: ReadonlySet<string>,
): Signal[] {
  return signals.filter((signal) =>
    (activeWorkspaceIds === undefined || activeWorkspaceIds.has(signal.workspace_id))
    && (signal.kind === "notification" || (signal.surface_id !== undefined && terminalSurfaceIds.has(signal.surface_id))))
}
