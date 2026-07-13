import { createSignal, onCleanup } from "solid-js"
import type { Signal } from "../../../lib/service/contract"
import { dismissSignal, fetchSignalProjection, fetchWorkspaceSignalNames } from "../../../lib/service/signal-client"

export type DashboardSignal = Signal & { unread: boolean }

export function useSignals() {
  const [signalMap, setSignalMap] = createSignal<Map<string, DashboardSignal[]>>(new Map())
  const [tick, setTick] = createSignal(0)
  const [sequence, setSequence] = createSignal("0")
  let disposed = false
  let active: AbortController | undefined

  async function reloadSignals() {
    active?.abort()
    active = new AbortController()
    try {
      const [projection, names] = await Promise.all([
        fetchSignalProjection(active.signal), fetchWorkspaceSignalNames(active.signal),
      ])
      if (disposed) return
      const dismissed = new Set(projection.dismissed)
      const next = new Map<string, DashboardSignal[]>()
      for (const signal of projection.signals) {
        const workspace = names.get(signal.workspace_id)
        if (!workspace) continue
        const unread = signal.kind === "notification" ? !dismissed.has(signal.id) : signal.state === "waiting" || signal.state === "failed"
        const items = next.get(workspace) ?? []
        items.push({ ...signal, unread })
        next.set(workspace, items)
      }
      for (const items of next.values()) items.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      setSignalMap(next)
      setSequence(projection.sequence)
      setTick((value) => value + 1)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setSignalMap(new Map())
    }
  }

  async function dismiss(signalId: string) {
    await dismissSignal(signalId)
    await reloadSignals()
  }

  void reloadSignals()
  const timer = setInterval(() => void reloadSignals(), 1_000)
  onCleanup(() => { disposed = true; active?.abort(); clearInterval(timer) })

  return { signalMap, tick, sequence, dismiss, reloadSignals }
}
