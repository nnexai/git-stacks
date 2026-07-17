import {
  WEB_WORKSPACE_ACTION_IDS,
  type WebWorkspaceAction,
  type WebWorkspaceActionId,
} from "@git-stacks/protocol"

export type WorkspaceActionInvoker = "pointer" | "menu" | "keyboard"

export type WorkspaceActionCallbackResult =
  | { kind: "operation"; operationId: string }
  | { kind: "terminal" }

export type WorkspaceActionCallback = (
  descriptor: WebWorkspaceAction,
  source: WorkspaceActionInvoker,
) => Promise<WorkspaceActionCallbackResult> | WorkspaceActionCallbackResult

export type WorkspaceActionLocalAvailability =
  | { available: true }
  | { available: false; reason: string }

export type WorkspaceActionInvocationResult =
  | { status: "submitted"; operationId?: string }
  | { status: "unavailable"; reason: string }
  | { status: "cancelled" }
  | { status: "pending" }

export type WorkspaceActionPlacement = {
  disabledReason?: string
  callback(): Promise<WorkspaceActionInvocationResult>
}

export type WorkspaceActionRegistryEntry = {
  actionId: WebWorkspaceActionId
  label: string
  descriptor: WebWorkspaceAction
  availability: WorkspaceActionLocalAvailability
  disabledReason?: string
  confirmation: WebWorkspaceAction["confirmation"]
  pendingOperationId?: string
  pointer: WorkspaceActionPlacement
  menu: WorkspaceActionPlacement
  keyboard: WorkspaceActionPlacement
}

export type WorkspaceActionRegistry = {
  entries(): WorkspaceActionRegistryEntry[]
  entry(actionId: WebWorkspaceActionId): WorkspaceActionRegistryEntry | undefined
  invoke(actionId: WebWorkspaceActionId, source: WorkspaceActionInvoker): Promise<WorkspaceActionInvocationResult>
}

export type WorkspaceActionRegistryOptions = {
  localAvailability?(descriptor: WebWorkspaceAction): WorkspaceActionLocalAvailability
  confirm?(descriptor: WebWorkspaceAction): Promise<boolean> | boolean
}

const labels: Record<WebWorkspaceActionId, string> = {
  "workspace.archive": "Archive workspace",
  "workspace.unarchive": "Unarchive workspace",
  "workspace.remove": "Remove workspace",
  "workspace.force-remove": "Force Remove",
  "workspace.rename": "Rename workspace",
  "workspace.open": "Open workspace",
  "workspace.close": "Close workspace",
  "workspace.pin": "Pin workspace",
  "workspace.unpin": "Unpin workspace",
  "workspace.sync": "Sync workspace",
  "workspace.pull": "Pull workspace",
  "workspace.push": "Push workspace",
  "workspace.merge": "Merge workspace",
  "workspace.notes.list": "View notes",
  "workspace.notes.add": "Add note",
  "workspace.notes.clear": "Clear notes",
  "workspace.files.inspect": "View file status",
  "operation.cancel": "Cancel operation",
}

export function workspaceActionLabel(actionId: WebWorkspaceActionId): string {
  return labels[actionId]
}

function subjectKey(descriptor: WebWorkspaceAction): string {
  const subject = descriptor.subject
  return subject.kind === "workspace"
    ? `${subject.workspace_id}:${subject.repository_id ?? ""}:${descriptor.action_id}`
    : `${subject.workspace_id}:${subject.operation_id}:${descriptor.action_id}`
}

/**
 * Builds a renderer-independent view over authoritative action descriptors.
 * Local state may only make an action less available; it can never weaken a
 * service-owned guard or replace the callback selected for an action ID.
 */
export function createWorkspaceActionRegistry(
  descriptors: readonly WebWorkspaceAction[],
  callbacks: Readonly<Record<WebWorkspaceActionId, WorkspaceActionCallback>>,
  options: WorkspaceActionRegistryOptions = {},
): WorkspaceActionRegistry {
  const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor.action_id, descriptor]))
  const latches = new Set<string>()

  const availability = (descriptor: WebWorkspaceAction): WorkspaceActionLocalAvailability => {
    if (!descriptor.availability.available) {
      return { available: false, reason: descriptor.availability.message }
    }
    return options.localAvailability?.(descriptor) ?? { available: true }
  }

  const invoke = async (
    actionId: WebWorkspaceActionId,
    source: WorkspaceActionInvoker,
  ): Promise<WorkspaceActionInvocationResult> => {
    const descriptor = descriptorsById.get(actionId)
    if (!descriptor) return { status: "unavailable", reason: "Action is unavailable." }
    const currentAvailability = availability(descriptor)
    if (!currentAvailability.available) return { status: "unavailable", reason: currentAvailability.reason }

    const key = subjectKey(descriptor)
    if (latches.has(key)) return { status: "pending" }
    // The latch is intentionally acquired before confirmation or transport can yield.
    latches.add(key)
    try {
      if (descriptor.confirmation !== "none") {
        const confirmed = await (options.confirm?.(descriptor) ?? false)
        if (!confirmed) return { status: "cancelled" }
      }
      const result = await callbacks[actionId](descriptor, source)
      return result.kind === "operation"
        ? { status: "submitted", operationId: result.operationId }
        : { status: "submitted" }
    } finally {
      // The callback must settle with an operation identity or terminal handling
      // before another invocation is allowed to acquire this subject/action key.
      latches.delete(key)
    }
  }

  const invocationCallbacks = new Map<WebWorkspaceActionId, () => Promise<WorkspaceActionInvocationResult>>()
  const callbackFor = (actionId: WebWorkspaceActionId) => {
    const found = invocationCallbacks.get(actionId)
    if (found) return found
    const callback = () => invoke(actionId, "pointer")
    invocationCallbacks.set(actionId, callback)
    return callback
  }

  const entry = (actionId: WebWorkspaceActionId): WorkspaceActionRegistryEntry | undefined => {
    const descriptor = descriptorsById.get(actionId)
    if (!descriptor) return undefined
    const currentAvailability = availability(descriptor)
    const disabledReason = currentAvailability.available ? undefined : currentAvailability.reason
    const callback = callbackFor(actionId)
    return {
      actionId,
      label: workspaceActionLabel(actionId),
      descriptor,
      availability: currentAvailability,
      disabledReason,
      confirmation: descriptor.confirmation,
      pendingOperationId: descriptor.pending_operation_id,
      pointer: { disabledReason, callback },
      menu: { disabledReason, callback },
      keyboard: { disabledReason, callback },
    }
  }

  return {
    entries: () => WEB_WORKSPACE_ACTION_IDS.flatMap((actionId) => {
      const candidate = entry(actionId)
      return candidate ? [candidate] : []
    }),
    entry,
    invoke,
  }
}
