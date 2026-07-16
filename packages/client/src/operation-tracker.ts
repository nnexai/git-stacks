import type {
  OperationCancelResult,
  WebOperationSummary,
} from "@git-stacks/protocol"

export type OperationTrackerState =
  | { phase: "ready" }
  | { phase: "submitting" }
  | { phase: "submit-unknown"; error: unknown }
  | { phase: "observing"; operationId: string }
  | { phase: "reconnecting"; operationId: string }
  | { phase: "refreshing"; operationId: string; outcome: OperationTerminalOutcome }
  | { phase: "refresh-failed"; operationId: string; outcome: OperationTerminalOutcome; error: unknown }

export type OperationTerminalOutcome = "succeeded" | "failed" | "cancelled"

export type OperationTrackerCallbacks<Intent = unknown> = {
  submit(intent: Intent): Promise<WebOperationSummary>
  get(operationId: string): Promise<WebOperationSummary>
  cancel(operationId: string): Promise<OperationCancelResult>
  refresh(): Promise<unknown>
  reconcile?(request: {
    workspaceId: string
    operationId: string
    outcome: OperationTerminalOutcome
  }): void
}

export type OperationSubmitResult =
  | { status: "observing"; operationId: string }
  | { status: "locked"; reason: OperationTrackerState["phase"] }

export type OperationCancelIgnored = {
  status: "ignored"
  reason: "not-observing" | "cancel-unavailable" | "cancel-pending"
}

export type OperationTracker<Intent = unknown> = {
  state(): OperationTrackerState
  submit(intent: Intent): Promise<OperationSubmitResult>
  observe(operation: WebOperationSummary): boolean | Promise<void>
  reconnect(): Promise<void>
  cancel(): Promise<OperationCancelResult | OperationCancelIgnored>
  retryRefresh(): Promise<void>
  track(operation: WebOperationSummary): boolean
  cards(): WebOperationSummary[]
  overflowCount(): number
  isLocked(): boolean
}

function terminalOutcome(operation: WebOperationSummary): OperationTerminalOutcome | undefined {
  return operation.state === "succeeded" || operation.state === "failed" || operation.state === "cancelled"
    ? operation.state
    : undefined
}

/**
 * Coordinates one submitted intent while retaining a small durable card list.
 * The original intent is deliberately discarded after its sole submit call;
 * every subsequent recovery path uses only the accepted operation identity.
 */
export function createOperationTracker<Intent = unknown>(
  callbacks: OperationTrackerCallbacks<Intent>,
  options: { maxCards?: number } = {},
): OperationTracker<Intent> {
  const maxCards = Math.max(1, options.maxCards ?? 3)
  let currentState: OperationTrackerState = { phase: "ready" }
  let currentOperationId: string | undefined
  let cancelPending = false
  const operations = new Map<string, WebOperationSummary>()
  const fingerprints = new Map<string, string>()

  const track = (operation: WebOperationSummary): boolean => {
    const fingerprint = JSON.stringify(operation)
    if (fingerprints.get(operation.operation_id) === fingerprint) return false
    // Reinsert updates so the most recently changed operation remains visible.
    operations.delete(operation.operation_id)
    operations.set(operation.operation_id, operation)
    fingerprints.set(operation.operation_id, fingerprint)
    return true
  }

  const refreshAfter = async (operation: WebOperationSummary, outcome: OperationTerminalOutcome): Promise<void> => {
    const operationId = operation.operation_id
    callbacks.reconcile?.({ workspaceId: operation.workspace_id, operationId, outcome })
    currentState = { phase: "refreshing", operationId, outcome }
    try {
      await callbacks.refresh()
      currentState = { phase: "ready" }
      currentOperationId = undefined
    } catch (error) {
      currentState = { phase: "refresh-failed", operationId, outcome, error }
    }
  }

  const observe = (operation: WebOperationSummary): boolean | Promise<void> => {
    const changed = track(operation)
    currentOperationId = operation.operation_id
    const outcome = terminalOutcome(operation)
    if (!outcome) {
      currentState = { phase: "observing", operationId: operation.operation_id }
      return changed
    }
    if (!changed && (currentState.phase === "refreshing" || currentState.phase === "refresh-failed" || currentState.phase === "ready")) {
      return false
    }
    return refreshAfter(operation, outcome)
  }

  return {
    state: () => currentState,
    async submit(intent) {
      if (currentState.phase !== "ready") return { status: "locked", reason: currentState.phase }
      // State changes synchronously, before transport can observe or yield.
      currentState = { phase: "submitting" }
      try {
        const accepted = await callbacks.submit(intent)
        currentOperationId = accepted.operation_id
        track(accepted)
        const outcome = terminalOutcome(accepted)
        if (outcome) await refreshAfter(accepted, outcome)
        else currentState = { phase: "observing", operationId: accepted.operation_id }
        return { status: "observing", operationId: accepted.operation_id }
      } catch (error) {
        // A response failure is ambiguous. Lock rather than retaining replayable intent.
        currentState = { phase: "submit-unknown", error }
        throw error
      }
    },
    observe,
    async reconnect() {
      if (!currentOperationId) return
      const operationId = currentOperationId
      currentState = { phase: "reconnecting", operationId }
      const operation = await callbacks.get(operationId)
      await observe(operation)
    },
    async cancel() {
      if (cancelPending) return { status: "ignored", reason: "cancel-pending" }
      if (!currentOperationId || (currentState.phase !== "observing" && currentState.phase !== "reconnecting")) {
        return { status: "ignored", reason: "not-observing" }
      }
      const operation = operations.get(currentOperationId)
      if (!operation || (operation.state !== "accepted" && operation.state !== "running") || operation.cancellation?.state !== "available") {
        return { status: "ignored", reason: "cancel-unavailable" }
      }
      cancelPending = true
      try {
        const result = await callbacks.cancel(currentOperationId)
        if (result.outcome === "requested") {
          const latest = operations.get(currentOperationId)
          if (latest && (latest.state === "accepted" || latest.state === "running")) {
            track({ ...latest, cancellation: { state: "requested" } })
          }
        }
        return result
      } finally {
        cancelPending = false
      }
    },
    async retryRefresh() {
      if (currentState.phase !== "refresh-failed") return
      const { operationId, outcome } = currentState
      currentState = { phase: "refreshing", operationId, outcome }
      try {
        await callbacks.refresh()
        currentState = { phase: "ready" }
        currentOperationId = undefined
      } catch (error) {
        currentState = { phase: "refresh-failed", operationId, outcome, error }
      }
    },
    track,
    cards: () => [...operations.values()].slice(-maxCards).reverse(),
    overflowCount: () => Math.max(0, operations.size - maxCards),
    isLocked: () => currentState.phase !== "ready",
  }
}
