import type { Operation, Signal, SignalDismissal, WorkspaceCatalog, WorkspaceCreationCatalog, WorkspaceSnapshotResponse } from "@git-stacks/protocol"

import { WebOperationSchema, WebSnapshotSchema, WorkspaceLifecyclePhaseSchema, type WebOperation, type WebSnapshot } from "@git-stacks/protocol"

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
      ...(operation.progress.message ? { message: operation.progress.message } : {}),
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
    return WebOperationSchema.parse({ ...common, error: {
      code: operation.error.code,
      message: operation.error.message,
      ...(lifecycle ? { lifecycle } : {}),
    } })
  }
  return WebOperationSchema.parse(common)
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
