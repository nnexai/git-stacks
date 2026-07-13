import { describe, expect, test } from "bun:test"
import { SignalState } from "../../../src/lib/service/signal-state"

const base = { version: 1 as const, id: "sig_0123456789abcdef", source: "codex" as const, workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", surface_id: "018f47f4-5ab1-7c2d-8e90-abcdef012346", session_id: "session-a", occurred_at: "2026-07-13T00:00:00.000Z" }

describe("signal state", () => {
  test("coalesces activity by provider session and exact surface using journal order", () => {
    const state = new SignalState()
    state.apply({ sequence: "2", signal: { ...base, kind: "activity", state: "waiting" } })
    expect(state.apply({ sequence: "1", signal: { ...base, kind: "activity", state: "failed" } })).toBe(false)
    expect(state.projection().signals).toHaveLength(1)
    expect(state.projection().signals[0].state).toBe("waiting")
    state.apply({ sequence: "3", signal: { ...base, id: "sig_1123456789abcdef", session_id: "session-b", kind: "activity", state: "failed" } })
    expect(state.projection().signals).toHaveLength(2)
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
})
