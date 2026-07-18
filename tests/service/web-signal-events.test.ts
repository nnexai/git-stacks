import { describe, expect, test } from "@test/api"
import { readFileSync } from "node:fs"

import { SignalState } from "../../packages/client/src/signal-state"
import type { Signal, SignalDismissal } from "../../packages/protocol/src/service"

const appSource = readFileSync(new URL("../../packages/web/src/app.ts", import.meta.url), "utf8")
const base = {
  version: 1 as const,
  id: "sig_0123456789abcdef",
  source: "codex" as const,
  workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc",
  repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345",
  surface_id: "018f47f4-5ab1-7c2d-8e90-abcdef012346",
  session_id: "session-a",
  occurred_at: "2026-07-18T00:00:00.000Z",
}

function visibleSignals(state: SignalState, dismissed: ReadonlySet<string>): Signal[] {
  const projection = state.projection()
  const hidden = new Set([...dismissed, ...projection.dismissed])
  return projection.signals
    .filter((signal) => !hidden.has(signal.id))
    .map(({ journal_sequence: _, ...signal }) => signal)
}

describe("web signal events", () => {
  test("wires snapshots and live mutations through the shared sequenced reducer without refetching", () => {
    expect(appSource).toContain("SignalState")
    expect(appSource).toContain("signal?: Signal | SignalDismissal")
    expect(appSource).toMatch(/function replaceSignalProjection[\s\S]*signalState = new SignalState\(\)[\s\S]*signalState\.apply\(\{ sequence: projection\.sequence, signal \}\)/)
    expect(appSource).toMatch(/function applySignalEvent[\s\S]*if \(!eventSequenceIsNewer\(sequence\)\) return[\s\S]*signalState\.apply\(\{ sequence, dismissal: signal \}\)[\s\S]*signalState\.apply\(\{ sequence, signal \}\)/)
    const connectEvents = appSource.slice(
      appSource.indexOf("function connectEvents(): void"),
      appSource.indexOf("async function reconnectKnownOperation(): Promise<void>"),
    )
    expect(connectEvents).not.toContain("refreshSignals()")
  })

  test("acknowledges only explicit exact-terminal activation and renders synchronized tab providers", () => {
    const selectPair = appSource.slice(appSource.indexOf("function selectPair"), appSource.indexOf("const confirmedForceNames"))
    const refresh = appSource.slice(appSource.indexOf("async function refreshSignals"), appSource.indexOf("async function loadTerminals"))
    const tabs = appSource.slice(appSource.indexOf("function renderTabs"), appSource.indexOf("function selectTerminal"))
    expect(selectPair).toContain("refreshSignals()")
    expect(selectPair).not.toContain("acknowledgeTerminalSignals")
    expect(refresh).toMatch(/refreshSignals[\s\S]*"signals\.list"/)
    expect(refresh).toMatch(/acknowledgeTerminalSignals[\s\S]*"signals\.acknowledge"/)
    expect(appSource).toMatch(/function selectTerminal[\s\S]*acknowledgeTerminalSignals\(terminal\.meta\.surface_id\)/)
    expect(tabs).toMatch(/deduplicateProviderSessions\(signals\.filter[\s\S]*meta\.surface_id[\s\S]*providerStack\(tabSessions\)/)
    expect(tabs).not.toContain("attentionCount(")
    expect(tabs).not.toMatch(/element\("span", "badge"/)
    expect(appSource.match(/providerStack\(/g)?.length).toBeGreaterThanOrEqual(3)
  })

  test("keeps live replacements, dismissals, idle tombstones, and stale replays coherent", () => {
    const state = new SignalState()
    const dismissed = new Set<string>()
    let cursor = "10"
    const apply = (signal: Signal | SignalDismissal, sequence: string) => {
      if (BigInt(sequence) <= BigInt(cursor)) return
      if (signal.kind === "dismiss_signal") {
        dismissed.add(signal.signal_id)
        state.apply({ sequence, dismissal: signal })
      } else {
        dismissed.delete(signal.id)
        state.apply({ sequence, signal })
      }
      cursor = sequence
    }

    state.apply({ sequence: cursor, signal: { ...base, kind: "activity", state: "working" } })
    state.apply({ sequence: cursor, signal: { ...base, id: "sig_1123456789abcdef", kind: "notification", title: "Old notification", session_id: undefined, surface_id: undefined } })
    apply({ ...base, id: "sig_1123456789abcdef", kind: "notification", title: "Replacement notification", session_id: undefined, surface_id: undefined }, "11")
    apply({ ...base, id: "sig_2123456789abcdef", kind: "activity", state: "waiting", session_id: "session-b" }, "12")
    apply({ kind: "dismiss_signal", signal_id: "sig_1123456789abcdef" }, "13")
    apply({ ...base, id: "sig_3123456789abcdef", kind: "activity", state: "idle", session_id: "session-b" }, "14")
    apply({ ...base, kind: "activity", state: "working" }, "12")

    expect(cursor).toBe("14")
    expect(visibleSignals(state, dismissed)).toEqual([])
  })

  test("retains visibility state when an older refresh snapshot returns after a live event", () => {
    const state = new SignalState()
    const dismissed = new Set<string>(["sig_1123456789abcdef"])
    let cursor = "12"
    state.apply({ sequence: cursor, signal: { ...base, kind: "activity", state: "waiting" } })

    const staleSnapshot = { sequence: "11", signals: [{ ...base, kind: "activity" as const, state: "working" }], dismissed: [] }
    if (BigInt(staleSnapshot.sequence) > BigInt(cursor) || staleSnapshot.sequence === cursor) {
      state.apply({ sequence: staleSnapshot.sequence, signal: staleSnapshot.signals[0] })
      cursor = staleSnapshot.sequence
      dismissed.clear()
    }

    expect(cursor).toBe("12")
    expect(visibleSignals(state, dismissed)).toMatchObject([{ state: "waiting" }])
  })
})
