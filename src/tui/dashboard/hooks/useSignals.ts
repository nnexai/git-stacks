import { createEffect, createSignal, onCleanup } from "solid-js"
import type { Signal } from "../../../lib/service/contract"
import { dismissSignal, fetchSignalProjection } from "../../../lib/service/client"
import { SignalState } from "../../../lib/service/signal-state"
import { subscribeCoreEvents, useCoreState } from "../core-store"

export type DashboardSignal = Signal & { unread: boolean }

export function useSignals() {
  const core = useCoreState()
  const [signalMap, setSignalMap] = createSignal<Map<string, DashboardSignal[]>>(new Map())
  const [tick, setTick] = createSignal(0)
  const [sequence, setSequence] = createSignal("0")
  let disposed = false
  let active: AbortController | undefined
  let projected = new SignalState()
  const locallyDismissed = new Set<string>()

  function renderProjection() {
    const names = new Map((core.state()?.workspaces ?? []).map(({ projection: workspace }) => [workspace.id, workspace.name]))
    const projection = projected.projection()
    const dismissed = new Set(projection.dismissed)
    const next = new Map<string, DashboardSignal[]>()
    for (const signal of projection.signals) {
      if (dismissed.has(signal.id) || locallyDismissed.has(signal.id)) continue
      const workspace = names.get(signal.workspace_id)
      if (!workspace) continue
      const unread = signal.kind === "notification" ? !dismissed.has(signal.id) : signal.state === "waiting" || signal.state === "failed"
      const { journal_sequence: _, ...value } = signal
      const items = next.get(workspace) ?? []
      items.push({ ...value, unread })
      next.set(workspace, items)
    }
    for (const items of next.values()) items.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    setSignalMap(next)
    setTick((value) => value + 1)
  }

  async function reloadSignals() {
    active?.abort()
    active = new AbortController()
    try {
      const projection = await fetchSignalProjection(active.signal)
      if (disposed) return
      if (BigInt(projection.sequence) < BigInt(sequence())) return
      projected = new SignalState()
      for (const signal of projection.signals) projected.apply({ sequence: projection.sequence, signal })
      for (const signalId of projection.dismissed) {
        projected.apply({ sequence: projection.sequence, dismissal: { kind: "dismiss_signal", signal_id: signalId } })
        locallyDismissed.delete(signalId)
      }
      renderProjection()
      setSequence(projection.sequence)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setSignalMap(new Map())
    }
  }

  async function dismiss(signalId: string) {
    locallyDismissed.add(signalId)
    renderProjection()
    try {
      await dismissSignal(signalId)
      await reloadSignals()
      renderProjection()
    } catch (error) {
      locallyDismissed.delete(signalId)
      renderProjection()
      throw error
    }
  }

  void reloadSignals()
  createEffect(() => {
    void core.state()?.revision
    renderProjection()
  })
  const unsubscribe = subscribeCoreEvents((event) => {
    if (event.type !== "signal") return
    if (event.signal.kind === "dismiss_signal") {
      projected.apply({ sequence: event.sequence, dismissal: event.signal })
      locallyDismissed.delete(event.signal.signal_id)
    }
    else projected.apply({ sequence: event.sequence, signal: event.signal })
    setSequence(event.sequence)
    renderProjection()
  })
  onCleanup(() => { disposed = true; active?.abort(); unsubscribe() })

  return { signalMap, tick, sequence, dismiss, reloadSignals }
}
