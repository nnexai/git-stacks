import { createSignal } from "solid-js"

import { fetchCoreState, fetchEventCursor, subscribeServiceEvents } from "@git-stacks/service/client"
import type { CoreState } from "@git-stacks/service/client"
import type { ServiceEvent } from "@git-stacks/protocol"

const [state, setState] = createSignal<CoreState>()
const [loading, setLoading] = createSignal(true)
const [error, setError] = createSignal<string>()
let generation = 0
let active: Promise<void> | undefined
let testFactory: (() => CoreState) | undefined
let eventsStarted = false
let eventController: AbortController | undefined
let eventCursor = "0"
const eventListeners = new Set<(event: ServiceEvent) => void>()

function startEventRefresh(): void {
  if (eventsStarted || testFactory) return
  eventsStarted = true
  const controller = new AbortController()
  eventController = controller
  void (async () => {
    while (eventsStarted && !controller.signal.aborted) {
      try {
        if (eventCursor === "0") eventCursor = await fetchEventCursor()
        eventCursor = await subscribeServiceEvents(eventCursor, (event) => {
          for (const listener of eventListeners) listener(event)
          // Snapshot-changing operations are followed by one authoritative
          // invalidation from the service monitor. Reload from that event only
          // so a completed mutation cannot trigger duplicate full projections.
          if (event.type === "control" && event.control.kind === "snapshot_invalidated") {
            const revision = event.control.revision
            const refreshIfNeeded = () => {
              if (state()?.revision !== revision) void reloadCoreState()
            }
            // A foreground action may already be refreshing the same revision.
            // Let it settle before deciding whether another projection is needed.
            if (active) void active.then(refreshIfNeeded, refreshIfNeeded)
            else refreshIfNeeded()
          } else if (event.type === "control" && event.control.kind === "replay_gap") {
            void reloadCoreState()
          }
        }, controller.signal)
      } catch {
        if (controller.signal.aborted) break
        eventCursor = "0"
        if (eventsStarted) await Bun.sleep(250)
      }
    }
  })()
}

export function reloadCoreState(): Promise<void> {
  const requestGeneration = ++generation
  setLoading(true)
  const request = fetchCoreState().then((next) => {
    if (requestGeneration !== generation) return
    setState(next)
    setError(undefined)
  }).catch((caught) => {
    if (requestGeneration !== generation) return
    setError(caught instanceof Error ? caught.message : String(caught))
  }).finally(() => {
    if (requestGeneration === generation) setLoading(false)
    if (active === request) active = undefined
  })
  active = request
  return request
}

export function useCoreState() {
  if (testFactory) {
    setState(testFactory())
    setLoading(false)
  }
  if (!state() && !active) void reloadCoreState()
  startEventRefresh()
  return { state, loading, error, reload: reloadCoreState }
}

export function resetCoreStateForTests(): void {
  generation += 1
  active = undefined
  setState(undefined)
  setLoading(true)
  setError(undefined)
}

export function setCoreStateForTests(next: CoreState): void {
  generation += 1
  active = undefined
  setState(next)
  setLoading(false)
  setError(undefined)
}

export function setCoreStateFactoryForTests(factory: (() => CoreState) | undefined): void {
  eventController?.abort()
  eventController = undefined
  testFactory = factory
  eventsStarted = false
  if (factory) setCoreStateForTests(factory())
}

export function stopCoreState(): void {
  eventsStarted = false
  eventController?.abort()
  eventController = undefined
  eventCursor = "0"
  eventListeners.clear()
}

export function subscribeCoreEvents(listener: (event: ServiceEvent) => void): () => void {
  eventListeners.add(listener)
  startEventRefresh()
  return () => eventListeners.delete(listener)
}
