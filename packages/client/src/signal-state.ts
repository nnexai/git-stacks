import type { ActivitySignal, Signal, SignalDismissal } from "@git-stacks/protocol"

export type JournaledSignal = Signal & { journal_sequence: string }
export type SignalMutation = { sequence: string; signal: Signal } | { sequence: string; dismissal: SignalDismissal }
export type SignalProjection = { signals: JournaledSignal[]; unread: JournaledSignal[]; dismissed: string[]; overflow: number }

const sequence = (value: string) => BigInt(value)
const activityKey = (signal: ActivitySignal) => `${signal.source}\0${signal.surface_id}`

/** Shared bounded signal reducer used by the service and both clients. */
export class SignalState {
  private readonly activities = new Map<string, JournaledSignal>()
  private readonly notifications = new Map<string, JournaledSignal>()
  private readonly dismissed = new Map<string, string>()
  private overflow = 0

  apply(mutation: SignalMutation): boolean {
    if ("dismissal" in mutation) {
      const current = this.dismissed.get(mutation.dismissal.signal_id)
      const signalExists = this.notifications.has(mutation.dismissal.signal_id)
        || [...this.activities.values()].some((signal) => signal.id === mutation.dismissal.signal_id)
      if (!signalExists || (current && sequence(mutation.sequence) <= sequence(current))) return false
      this.dismissed.set(mutation.dismissal.signal_id, mutation.sequence)
      return true
    }

    const incoming = mutation.signal
    const dismissalSequence = this.dismissed.get(incoming.id)
    if (dismissalSequence && sequence(mutation.sequence) > sequence(dismissalSequence)) this.dismissed.delete(incoming.id)
    const current = incoming.kind === "activity"
      ? this.activities.get(activityKey(incoming))
      : this.notifications.get(incoming.id)
    if (current && sequence(mutation.sequence) <= sequence(current.journal_sequence)) return false
    if (incoming.kind === "activity" && incoming.state === "idle") return this.activities.delete(activityKey(incoming))

    const stored = { ...incoming, journal_sequence: mutation.sequence }
    if (incoming.kind === "activity") this.activities.set(activityKey(incoming), stored)
    else this.notifications.set(incoming.id, stored)
    this.evict()
    return true
  }

  private actionable(signal: JournaledSignal): boolean {
    if (this.dismissed.has(signal.id)) return false
    if (signal.kind === "notification") return true
    return signal.state === "waiting" || signal.state === "failed"
  }

  private evict(): void {
    const all = [...this.activities.values(), ...this.notifications.values()]
    while (all.length > 64) {
      const candidate = all
        .filter((item) => !this.actionable(item))
        .sort((left, right) => Number(sequence(left.journal_sequence) - sequence(right.journal_sequence)))[0]
      if (!candidate) { this.overflow += 1; return }
      if (candidate.kind === "activity") this.activities.delete(activityKey(candidate))
      else this.notifications.delete(candidate.id)
      all.splice(all.indexOf(candidate), 1)
    }
  }

  projection(): SignalProjection {
    const signals = [...this.activities.values(), ...this.notifications.values()]
      .sort((left, right) => Number(sequence(left.journal_sequence) - sequence(right.journal_sequence)))
    return {
      signals,
      unread: signals.filter((signal) => this.actionable(signal)),
      dismissed: [...this.dismissed.keys()],
      overflow: this.overflow,
    }
  }
}
