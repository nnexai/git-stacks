import type { Operation, Signal, SignalDismissal, WorkspaceCreationCatalog, WorkspaceSnapshotResponse } from "../../lib/service/contract"
import { WebOperationSchema, WebSnapshotSchema, type WebOperation, type WebSnapshot } from "./contract"

export function projectWebSnapshot(snapshots: WorkspaceSnapshotResponse[]): WebSnapshot {
  const revision = snapshots[0]?.revision ?? "0"
  const generatedAt = snapshots[0]?.generated_at ?? new Date().toISOString()
  return WebSnapshotSchema.parse({
    protocol: "web-v1",
    revision,
    generated_at: generatedAt,
    workspaces: snapshots.map(({ workspace }) => {
      const status = new Map((workspace.status ?? []).map((entry) => [entry.repository_id, entry]))
      return {
        id: workspace.id,
        name: workspace.name,
        branch: workspace.branch,
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
    return WebOperationSchema.parse({ ...common, progress: {
      ...(operation.progress.message ? { message: operation.progress.message } : {}),
      ...(operation.progress.completed === undefined ? {} : { completed: operation.progress.completed, total: operation.progress.total }),
    } })
  }
  if (operation.state === "succeeded") {
    const result = operation.result ?? {}
    return WebOperationSchema.parse({ ...common, result: {
      ...(typeof result.workspace_name === "string" ? { workspace_name: result.workspace_name } : {}),
      ...(typeof result.snapshot_changed === "boolean" ? { snapshot_changed: result.snapshot_changed } : {}),
    } })
  }
  if (operation.state === "failed" || operation.state === "cancelled") {
    return WebOperationSchema.parse({ ...common, error: { code: operation.error.code, message: operation.error.message } })
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
