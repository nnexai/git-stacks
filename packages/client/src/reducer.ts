import type { ServiceEvent } from "@git-stacks/protocol"

export interface EventCursorState {
  cursor: string
  snapshotRevision?: string
  replayGap?: { requested: string; oldestAvailable: string; newestAvailable: string }
}

export function reduceServiceEvent(state: EventCursorState, event: ServiceEvent): EventCursorState {
  if (BigInt(event.sequence) <= BigInt(state.cursor)) return state
  if (event.type === "control" && event.control.kind === "replay_gap") {
    return {
      ...state,
      cursor: event.sequence,
      replayGap: {
        requested: event.control.gap.requested,
        oldestAvailable: event.control.gap.oldest_available,
        newestAvailable: event.control.gap.newest_available,
      },
    }
  }
  if (event.type === "control" && event.control.kind === "snapshot_invalidated") {
    return { cursor: event.sequence, snapshotRevision: event.control.revision }
  }
  return { ...state, cursor: event.sequence }
}

export function operationIsTerminal(state: string): boolean {
  return state === "succeeded" || state === "failed" || state === "cancelled"
}
