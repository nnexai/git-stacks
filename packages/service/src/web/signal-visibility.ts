import type { Signal } from "@git-stacks/protocol"

/** Helper-owned, in-memory acknowledgement state for ephemeral client surfaces. */
export class SignalVisibilityTracker {
  private readonly seenActivity = new Map<string, Map<string, string>>()

  acknowledgeSurface(principalId: string, surfaceId: string, signals: Signal[]): number {
    const seen = this.seenActivity.get(principalId) ?? new Map<string, string>()
    let acknowledged = 0
    for (const signal of signals) {
      if (signal.kind !== "activity" || signal.surface_id !== surfaceId) continue
      seen.set(this.activityLane(signal), this.activityVersion(signal))
      acknowledged += 1
    }
    if (acknowledged) this.seenActivity.set(principalId, seen)
    return acknowledged
  }

  visibleSignals(principalId: string, signals: Signal[]): Signal[] {
    const seen = this.seenActivity.get(principalId)
    if (!seen) return signals
    return signals.filter((signal) => signal.kind !== "activity" || seen.get(this.activityLane(signal)) !== this.activityVersion(signal))
  }

  clear(principalId: string): void { this.seenActivity.delete(principalId) }

  private activityLane(signal: Extract<Signal, { kind: "activity" }>): string { return `${signal.source}\0${signal.surface_id}` }
  private activityVersion(signal: Extract<Signal, { kind: "activity" }>): string { return `${signal.id}\0${signal.state}\0${signal.occurred_at}` }
}
