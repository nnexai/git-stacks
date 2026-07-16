import { archiveWorkspace as archiveWorkspaceDirect, unarchiveWorkspace as unarchiveWorkspaceDirect } from "@git-stacks/core/workspace-archive"
import {
  commitWorkspaceRemoval as commitWorkspaceRemovalDirect,
  inspectWorkspaceRemoval as inspectWorkspaceRemovalDirect,
  type WorkspaceRemovalInspection,
  type WorkspaceRemovalPlan,
  type WorkspaceRemovalResult,
} from "@git-stacks/core/workspace-lifecycle"
import type { Workspace } from "@git-stacks/core/config"
import type {
  Operation,
  WorkspaceCatalog,
  WorkspaceLifecycleFailureDetails,
  WorkspaceLifecycleMutation,
  WorkspaceLifecyclePhase,
} from "@git-stacks/protocol"
import type { SnapshotAdapter } from "../snapshot-adapter"
import type { OperationExecution, OperationRegistry } from "./operations"
import type { WorkspaceLifecycleAdmission } from "./workspace-lifecycle-admission"
import type { WorkspaceTerminalCloseResult } from "../web/terminal-manager"

export class WorkspaceLifecycleError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "operation_failed",
    message: string,
    readonly details: WorkspaceLifecycleFailureDetails,
  ) {
    super(message)
  }
}

export interface WorkspaceLifecycleCoordinatorOptions {
  admission: WorkspaceLifecycleAdmission
  terminals: { closeWorkspace(workspaceId: string): Promise<WorkspaceTerminalCloseResult> }
  snapshot: SnapshotAdapter & { buildCatalog(signal?: AbortSignal): Promise<WorkspaceCatalog> }
  operations?: Pick<OperationRegistry, "submit">
  archiveWorkspace?(name: string, options?: { clock?: () => Date; expectedId?: string }): Workspace
  unarchiveWorkspace?(name: string, options?: { expectedId?: string }): Workspace
  inspectWorkspaceRemoval?(name: string, options?: { expectedId?: string }): Promise<WorkspaceRemovalInspection>
  commitWorkspaceRemoval?(
    plan: WorkspaceRemovalPlan,
    options: { allow_dirty?: boolean; onPhase?: (phase: "removing_worktrees" | "deleting_workspace_files") => void | Promise<void> },
  ): Promise<WorkspaceRemovalResult>
  clock?: () => Date
}

export function createWorkspaceLifecycleCoordinator(_options: WorkspaceLifecycleCoordinatorOptions) {
  const options = {
    ..._options,
    archiveWorkspace: _options.archiveWorkspace ?? archiveWorkspaceDirect,
    unarchiveWorkspace: _options.unarchiveWorkspace ?? unarchiveWorkspaceDirect,
    inspectWorkspaceRemoval: _options.inspectWorkspaceRemoval ?? inspectWorkspaceRemovalDirect,
    commitWorkspaceRemoval: _options.commitWorkspaceRemoval ?? commitWorkspaceRemovalDirect,
  }

  type Target = { id: string; name: string; archived: boolean }

  const targetFromCatalog = (catalog: WorkspaceCatalog, id: string): Target | undefined => {
    const active = catalog.workspaces.find((entry) => entry.workspace.id === id)
    if (active) return { id, name: active.workspace.name, archived: false }
    const archived = catalog.archived_workspaces.find((entry) => entry.id === id)
    return archived ? { id, name: archived.name, archived: true } : undefined
  }

  const failure = (
    code: WorkspaceLifecycleError["code"],
    message: string,
    kind: string,
    terminalsStopped: boolean,
    blockingRepositories?: string[],
    forceAllowed = false,
  ): WorkspaceLifecycleError => new WorkspaceLifecycleError(code, message, {
    kind,
    ...(blockingRepositories ? { blocking_repositories: [...blockingRepositories] } : {}),
    terminals_stopped: terminalsStopped,
    force_allowed: forceAllowed,
  })

  const progress = async (
    report: Parameters<OperationExecution["steps"][number]["run"]>[0],
    phase: WorkspaceLifecyclePhase,
  ): Promise<void> => {
    const messages: Record<WorkspaceLifecyclePhase, string> = {
      stopping_terminals: "Stopping workspace terminals",
      checking_worktrees: "Checking workspace worktrees",
      removing_worktrees: "Removing managed worktrees",
      deleting_workspace_files: "Deleting workspace files",
      reconciling_state: "Reconciling workspace state",
    }
    await report({ message: messages[phase], data: { lifecycle_phase: phase } })
  }

  return {
    execution(mutation: WorkspaceLifecycleMutation): OperationExecution {
      const result: Record<string, unknown> = {}
      return {
        cancellation: "safe-boundaries",
        steps: [{
          name: "workspace.lifecycle",
          stage: "executing",
          message: "Updating workspace lifecycle",
          run: async (report, cancellation) => {
            const lease = await options.admission.acquire(mutation.workspace_id, cancellation?.signal)
            let terminalsStopped = mutation.kind === "workspace.unarchive"
            try {
              cancellation?.throwIfCancelled()
              const before = await options.snapshot.buildCatalog()
              const target = targetFromCatalog(before, mutation.workspace_id)
              if (!target) throw failure("not_found", "Workspace not found", "not_found", false)

              const desiredAlreadySatisfied = mutation.kind === "workspace.archive"
                ? target.archived
                : mutation.kind === "workspace.unarchive" && !target.archived
              if (before.revision !== mutation.expected_revision) {
                if (!desiredAlreadySatisfied) {
                  throw failure("conflict", "Authoritative workspace revision is stale", "stale_revision", false)
                }
              }

              if (desiredAlreadySatisfied && mutation.kind === "workspace.unarchive") {
                Object.assign(result, {
                  workspace_name: target.name,
                  snapshot_changed: false,
                  revision: before.revision,
                  terminals_stopped: true,
                })
                return
              }

              if (mutation.kind !== "workspace.unarchive") {
                await progress(report, "stopping_terminals")
                cancellation?.commit()
                const closed = await options.terminals.closeWorkspace(target.id)
                if (!closed.ok) {
                  throw failure("operation_failed", "Workspace terminals did not stop", "terminal_cleanup_failed", false)
                }
                terminalsStopped = true
              }

              if (desiredAlreadySatisfied) {
                Object.assign(result, {
                  workspace_name: target.name,
                  snapshot_changed: false,
                  revision: before.revision,
                  terminals_stopped: terminalsStopped,
                })
                return
              }

              if (mutation.kind === "workspace.archive") {
                cancellation?.commit()
                options.archiveWorkspace(target.name, { clock: options.clock, expectedId: target.id })
              } else if (mutation.kind === "workspace.unarchive") {
                cancellation?.commit()
                options.unarchiveWorkspace(target.name, { expectedId: target.id })
              } else {
                await progress(report, "checking_worktrees")
                const inspected = await options.inspectWorkspaceRemoval(target.name, { expectedId: target.id })
                if (mutation.kind === "workspace.remove") {
                  if (!inspected.ok) {
                    throw failure(
                      inspected.code === "not_found" ? "not_found" : inspected.code === "conflict" ? "conflict" : "operation_failed",
                      inspected.error,
                      inspected.code,
                      terminalsStopped,
                      inspected.code === "workspace_dirty" ? inspected.blocking_repositories : undefined,
                      inspected.code === "workspace_dirty",
                    )
                  }
                  cancellation?.commit()
                  const committed = await options.commitWorkspaceRemoval(inspected.plan, {
                    onPhase: (phase) => progress(report, phase),
                  })
                  if (!committed.ok) {
                    throw failure(
                      committed.code === "not_found" ? "not_found" : committed.code === "conflict" ? "conflict" : "operation_failed",
                      committed.error,
                      committed.code,
                      terminalsStopped,
                      committed.blocking_repositories,
                      committed.code === "workspace_dirty",
                    )
                  }
                } else {
                  if (inspected.ok) {
                    throw failure("operation_failed", "Force Remove is available only for dirty workspaces", "force_not_eligible", terminalsStopped)
                  }
                  if (inspected.code !== "workspace_dirty") {
                    throw failure(inspected.code === "not_found" ? "not_found" : inspected.code === "conflict" ? "conflict" : "operation_failed", inspected.error, inspected.code, terminalsStopped)
                  }
                  if (mutation.confirmation_name !== target.name) {
                    throw failure("conflict", "Workspace name confirmation does not match", "confirmation_mismatch", terminalsStopped)
                  }
                  cancellation?.commit()
                  const committed = await options.commitWorkspaceRemoval(inspected.plan, {
                    allow_dirty: true,
                    onPhase: (phase) => progress(report, phase),
                  })
                  if (!committed.ok) {
                    throw failure(committed.code === "not_found" ? "not_found" : committed.code === "conflict" ? "conflict" : "operation_failed", committed.error, committed.code, terminalsStopped, committed.blocking_repositories)
                  }
                }
              }

              await progress(report, "reconciling_state")
              let reconciled: WorkspaceCatalog
              try {
                reconciled = await options.snapshot.buildCatalog()
              } catch (caught) {
                throw failure("operation_failed", caught instanceof Error ? caught.message : String(caught), "reconciliation_failed", terminalsStopped)
              }
              Object.assign(result, {
                workspace_name: target.name,
                snapshot_changed: true,
                revision: reconciled.revision,
                terminals_stopped: terminalsStopped,
              })
            } catch (caught) {
              if (caught instanceof WorkspaceLifecycleError) throw caught
              if ((caught as { code?: unknown })?.code === "workspace_definition_conflict") {
                throw failure("conflict", caught instanceof Error ? caught.message : String(caught), "workspace_definition_conflict", terminalsStopped)
              }
              throw failure("operation_failed", caught instanceof Error ? caught.message : String(caught), "operation_failed", terminalsStopped)
            } finally {
              lease.release()
            }
          },
        }],
        result,
      }
    },
    async submit(input: { clientId: string; idempotencyKey: string; mutation: WorkspaceLifecycleMutation }): Promise<Operation> {
      if (!options.operations) throw new Error("Workspace lifecycle operations are unavailable")
      return options.operations.submit({
        clientId: input.clientId,
        endpoint: "workspace.lifecycle",
        idempotencyKey: input.idempotencyKey,
        request: input.mutation,
        execution: this.execution(input.mutation),
      })
    },
  }
}
