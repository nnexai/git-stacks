import type { ActivitySignal, Signal, SignalDismissal } from "./contract"

export type JournaledSignal = Signal & { journal_sequence: string }
export type SignalMutation = { sequence: string; signal: Signal } | { sequence: string; dismissal: SignalDismissal }
export type SignalProjection = { signals: JournaledSignal[]; unread: JournaledSignal[]; dismissed: string[]; overflow: number }

const seq = (value: string) => BigInt(value)
const activityKey = (signal: ActivitySignal) => `${signal.source}\0${signal.session_id}\0${signal.surface_id}`

export class SignalState {
  private readonly activities = new Map<string, JournaledSignal>()
  private readonly notifications = new Map<string, JournaledSignal>()
  private readonly dismissed = new Map<string, string>()
  private overflow = 0

  apply(mutation: SignalMutation): boolean {
    if ("dismissal" in mutation) {
      const current = this.dismissed.get(mutation.dismissal.signal_id)
      if (!this.notifications.has(mutation.dismissal.signal_id) || (current && seq(mutation.sequence) <= seq(current))) return false
      this.dismissed.set(mutation.dismissal.signal_id, mutation.sequence)
      return true
    }
    const incoming = mutation.signal
    const current = incoming.kind === "activity" ? this.activities.get(activityKey(incoming)) : this.notifications.get(incoming.id)
    if (current && seq(mutation.sequence) <= seq(current.journal_sequence)) return false
    const stored = { ...incoming, journal_sequence: mutation.sequence }
    if (incoming.kind === "activity") this.activities.set(activityKey(incoming), stored)
    else this.notifications.set(incoming.id, stored)
    this.evict()
    return true
  }

  private actionable(signal: JournaledSignal) {
    if (signal.kind === "notification") return !this.dismissed.has(signal.id)
    return signal.state === "waiting" || signal.state === "failed"
  }

  private evict() {
    const all = [...this.activities.values(), ...this.notifications.values()]
    while (all.length > 64) {
      const candidate = all.filter((item) => !this.actionable(item)).sort((a, b) => Number(seq(a.journal_sequence) - seq(b.journal_sequence)))[0]
      if (!candidate) { this.overflow += 1; return }
      if (candidate.kind === "activity") this.activities.delete(activityKey(candidate))
      else this.notifications.delete(candidate.id)
      all.splice(all.indexOf(candidate), 1)
    }
  }

  projection(): SignalProjection {
    const signals = [...this.activities.values(), ...this.notifications.values()].sort((a, b) => Number(seq(a.journal_sequence) - seq(b.journal_sequence)))
    return { signals, unread: signals.filter((signal) => this.actionable(signal)), dismissed: [...this.dismissed.keys()], overflow: this.overflow }
  }
}
