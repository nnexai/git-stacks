import { describe, expect, test } from "@test/api"
import { SignalState } from "../../../packages/client/src/signal-state"

const base = { version: 1 as const, id: "sig_0123456789abcdef", source: "codex" as const, workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", surface_id: "018f47f4-5ab1-7c2d-8e90-abcdef012346", session_id: "session-a", occurred_at: "2026-07-13T00:00:00.000Z" }

describe("signal state", () => {
  test("coalesces activity by provider and exact surface across session restarts using journal order", () => {
    const state = new SignalState()
    state.apply({ sequence: "2", signal: { ...base, kind: "activity", state: "waiting" } })
    expect(state.apply({ sequence: "1", signal: { ...base, kind: "activity", state: "failed" } })).toBe(false)
    expect(state.projection().signals).toHaveLength(1)
    expect(state.projection().signals[0].state).toBe("waiting")
    state.apply({ sequence: "3", signal: { ...base, id: "sig_1123456789abcdef", session_id: "session-b", kind: "activity", state: "failed" } })
    expect(state.projection().signals).toHaveLength(1)
    expect(state.projection().signals[0]).toMatchObject({ session_id: "session-b", state: "failed", journal_sequence: "3" })
  })

  test("keeps provider and surface activity lanes independent", () => {
    const state = new SignalState()
    state.apply({ sequence: "1", signal: { ...base, kind: "activity", state: "working" } })
    state.apply({ sequence: "2", signal: { ...base, id: "sig_1123456789abcdef", source: "copilot", kind: "activity", state: "working" } })
    state.apply({ sequence: "3", signal: { ...base, id: "sig_2123456789abcdef", surface_id: "018f47f4-5ab1-7c2d-8e90-abcdef012347", kind: "activity", state: "working" } })
    expect(state.projection().signals).toHaveLength(3)
  })

  test("uses idle as a durable tombstone for a closed terminal activity lane", () => {
    const state = new SignalState()
    state.apply({ sequence: "1", signal: { ...base, kind: "activity", state: "working" } })
    expect(state.apply({ sequence: "2", signal: { ...base, kind: "activity", state: "idle" } })).toBe(true)
    expect(state.projection().signals).toEqual([])

    state.apply({ sequence: "3", signal: { ...base, kind: "activity", state: "working", occurred_at: "2026-07-13T00:01:00.000Z" } })
    expect(state.projection().signals).toMatchObject([{ state: "working", journal_sequence: "3" }])
  })

  test("notifications are independent of completed activity and dismissal", () => {
    const state = new SignalState()
    state.apply({ sequence: "1", signal: { ...base, kind: "activity", state: "completed" } })
    state.apply({ sequence: "2", signal: { ...base, id: "sig_2123456789abcdef", kind: "notification", title: "Approval required", session_id: undefined, surface_id: undefined } })
    expect(state.projection().unread.map((item) => item.id)).toEqual(["sig_2123456789abcdef"])
    state.apply({ sequence: "3", dismissal: { kind: "dismiss_signal", signal_id: "sig_2123456789abcdef" } })
    expect(state.projection().unread).toHaveLength(0)
    expect(state.projection().dismissed).toEqual(["sig_2123456789abcdef"])
    expect(state.projection().signals).toHaveLength(2)
  })

  test("dismisses activity and allows a newer lifecycle event to reappear", () => {
    const state = new SignalState()
    state.apply({ sequence: "1", signal: { ...base, kind: "activity", state: "completed" } })
    expect(state.apply({ sequence: "2", dismissal: { kind: "dismiss_signal", signal_id: base.id } })).toBe(true)
    expect(state.projection().unread).toHaveLength(0)
    expect(state.projection().dismissed).toEqual([base.id])

    state.apply({ sequence: "3", signal: { ...base, kind: "activity", state: "waiting" } })
    expect(state.projection().dismissed).toEqual([])
    expect(state.projection().unread).toMatchObject([{ id: base.id, state: "waiting" }])
  })
})
