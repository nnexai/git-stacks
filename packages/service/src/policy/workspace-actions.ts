import type {
  OperationCancellationView,
  WorkspaceLifecycleFailureDetails,
} from "@git-stacks/protocol"

import type { CoreState } from "./core-contract"

export const CANONICAL_WORKSPACE_ACTION_IDS = [
  "workspace.archive",
  "workspace.unarchive",
  "workspace.remove",
  "workspace.force-remove",
  "workspace.rename",
  "workspace.open",
  "workspace.close",
  "workspace.pin",
  "workspace.unpin",
  "workspace.sync",
  "workspace.pull",
  "workspace.push",
  "workspace.merge",
  "workspace.notes.list",
  "workspace.notes.add",
  "workspace.notes.clear",
  "workspace.files.inspect",
  "operation.cancel",
] as const

export type CanonicalWorkspaceActionId = (typeof CANONICAL_WORKSPACE_ACTION_IDS)[number]

export type CanonicalWorkspaceActionDisabledReason =
  | "workspace_unavailable"
  | "workspace_archived"
  | "workspace_active"
  | "workspace_closed"
  | "operation_in_progress"
  | "dirty_worktree"
  | "remote_unavailable"
  | "nothing_to_pull"
  | "nothing_to_push"
  | "merge_unavailable"
  | "stale_revision"
  | "capability_unavailable"
  | "not_cancellable"
  | "operation_finished"

export type CanonicalWorkspaceActionAvailability =
  | Readonly<{ available: true }>
  | Readonly<{
      available: false
      reason: CanonicalWorkspaceActionDisabledReason
      /** Safe fixed copy. Never derived from a Git, filesystem, or lifecycle error. */
      message: string
    }>

export type CanonicalWorkspaceAction = Readonly<{
  action_id: CanonicalWorkspaceActionId
  workspace_id: string
  availability: CanonicalWorkspaceActionAvailability
  confirmation: "none" | "confirm" | "exact-name"
  pending_operation_id?: string
}>

export type WorkspaceActionOperation = Readonly<{
  operation_id: string
  workspace_id: string
  action_id: Exclude<CanonicalWorkspaceActionId, "operation.cancel">
  state: "accepted" | "running" | "succeeded" | "failed" | "cancelled"
  cancellation?: OperationCancellationView
}>

export interface WorkspaceActionAuthorityInput {
  state: CoreState
  workspaceId: string
  operations?: readonly WorkspaceActionOperation[]
  capabilities?: Partial<Record<CanonicalWorkspaceActionId, boolean>>
  /** Current client revision failed an authoritative revision check. */
  staleRevision?: boolean
  /** Service-owned open state. Omitted means the action remains available. */
  openState?: "open" | "closed"
  /** Fresh typed result from Phase 123 removal inspection/failure state. */
  removal?: WorkspaceLifecycleFailureDetails
}

const AVAILABLE = Object.freeze({ available: true as const })

const messages: Record<CanonicalWorkspaceActionDisabledReason, string> = {
  workspace_unavailable: "Workspace is no longer available.",
  workspace_archived: "Archived workspaces can only be unarchived.",
  workspace_active: "This action does not apply to the active workspace state.",
  workspace_closed: "Open the workspace before using this action.",
  operation_in_progress: "Another workspace action is still in progress.",
  dirty_worktree: "Force Remove requires a fresh dirty-worktree check.",
  remote_unavailable: "No repository remote is available for this action.",
  nothing_to_pull: "All repositories are up to date with their remotes.",
  nothing_to_push: "No repository commits are waiting to be pushed.",
  merge_unavailable: "No eligible clean worktree is available to merge.",
  stale_revision: "Workspace state changed. Refresh before trying again.",
  capability_unavailable: "This service capability is unavailable.",
  not_cancellable: "This operation cannot be cancelled safely.",
  operation_finished: "This operation has already finished.",
}

function unavailable(reason: CanonicalWorkspaceActionDisabledReason): CanonicalWorkspaceActionAvailability {
  return Object.freeze({ available: false as const, reason, message: messages[reason] })
}

const confirmation = (actionId: CanonicalWorkspaceActionId): CanonicalWorkspaceAction["confirmation"] =>
  actionId === "workspace.force-remove"
    ? "exact-name"
    : actionId === "workspace.remove" || actionId === "workspace.merge" || actionId === "workspace.notes.clear"
      ? "confirm"
      : "none"

const readActions = new Set<CanonicalWorkspaceActionId>([
  "workspace.notes.list",
  "workspace.files.inspect",
])

function activeOperation(input: WorkspaceActionAuthorityInput): WorkspaceActionOperation | undefined {
  return input.operations?.find((operation) =>
    operation.workspace_id === input.workspaceId
    && (operation.state === "accepted" || operation.state === "running"))
}

/**
 * Derive the sole protocol-neutral action policy from trusted service state.
 * Callers may project these records into browser or TUI DTOs, but clients do
 * not participate in availability, confirmation, or Force Remove decisions.
 */
export function deriveWorkspaceActionInventory(input: WorkspaceActionAuthorityInput): readonly CanonicalWorkspaceAction[] {
  const active = input.state.workspaces.find(({ definition, projection }) =>
    definition.id === input.workspaceId || projection.id === input.workspaceId)
  const archived = input.state.archived_workspaces.find(({ id }) => id === input.workspaceId)
  const operation = activeOperation(input)
  const statuses = active?.projection.status ?? []
  const gitStatuses = statuses.filter(({ mode }) => mode !== "dir")
  const hasRemote = gitStatuses.some(({ remote }) => remote === "available")
  const hasWorktree = statuses.some(({ mode, exists }) => mode === "worktree" && exists)
  const hasDirtyWorktree = statuses.some(({ mode, dirty }) => mode === "worktree" && dirty)
  const pinned = active?.definition.pinned === true

  const availabilityFor = (actionId: CanonicalWorkspaceActionId): CanonicalWorkspaceActionAvailability => {
    if (!active && !archived) return unavailable("workspace_unavailable")
    if (archived) return actionId === "workspace.unarchive" ? AVAILABLE : unavailable("workspace_archived")
    if (actionId === "workspace.unarchive") return unavailable("workspace_active")

    if (input.capabilities?.[actionId] === false) return unavailable("capability_unavailable")

    if (actionId === "operation.cancel") {
      if (!operation) return unavailable("operation_finished")
      return operation.cancellation?.state === "available" ? AVAILABLE : unavailable("not_cancellable")
    }

    if (operation && !readActions.has(actionId)) return unavailable("operation_in_progress")
    if (input.staleRevision && !readActions.has(actionId)) return unavailable("stale_revision")

    if (actionId === "workspace.force-remove") {
      return input.removal?.kind === "workspace_dirty"
        && input.removal.terminals_stopped === true
        && input.removal.force_allowed === true
        ? AVAILABLE
        : unavailable("dirty_worktree")
    }
    if (actionId === "workspace.pin") return pinned ? unavailable("workspace_active") : AVAILABLE
    if (actionId === "workspace.unpin") return pinned ? AVAILABLE : unavailable("workspace_active")
    if (actionId === "workspace.open") return input.openState === "open" ? unavailable("workspace_active") : AVAILABLE
    if (actionId === "workspace.close") return input.openState === "closed" ? unavailable("workspace_closed") : AVAILABLE

    if (actionId === "workspace.pull") {
      if (!hasRemote) return unavailable("remote_unavailable")
      if (!gitStatuses.some(({ behind }) => behind > 0)) return unavailable("nothing_to_pull")
    }
    if (actionId === "workspace.push") {
      if (!hasRemote) return unavailable("remote_unavailable")
      if (!gitStatuses.some(({ ahead }) => ahead > 0)) return unavailable("nothing_to_push")
    }
    if (actionId === "workspace.sync" && (!hasWorktree || !hasRemote)) {
      return unavailable(hasRemote ? "capability_unavailable" : "remote_unavailable")
    }
    if (actionId === "workspace.merge" && (!hasWorktree || hasDirtyWorktree)) {
      return unavailable("merge_unavailable")
    }
    return AVAILABLE
  }

  const inventory = CANONICAL_WORKSPACE_ACTION_IDS.map((actionId): CanonicalWorkspaceAction => {
    const descriptor: CanonicalWorkspaceAction = {
      action_id: actionId,
      workspace_id: input.workspaceId,
      availability: availabilityFor(actionId),
      confirmation: confirmation(actionId),
      ...(operation ? { pending_operation_id: operation.operation_id } : {}),
    }
    return Object.freeze(descriptor)
  })
  return Object.freeze(inventory)
}
