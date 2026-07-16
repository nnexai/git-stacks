import { describe, expect, test, vi } from "vitest"

import { createOperationTracker } from "@git-stacks/client"
import type { OperationCancelResult, WebOperationSummary } from "@git-stacks/protocol"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const operationId = "op_1234567890abcdef"
const accepted = (id = operationId): WebOperationSummary => ({
  operation_id: id,
  action_id: "workspace.pull",
  workspace_id: workspaceId,
  workspace_name: "task-one",
  accepted_at: "2026-07-16T12:00:00.000Z",
  state: "accepted",
  cancellation: { state: "available" },
})
const running = (cancellation: "available" | "requested" = "available", id = operationId): WebOperationSummary => ({
  ...accepted(id),
  state: "running",
  started_at: "2026-07-16T12:00:01.000Z",
  progress: { stage: "executing", message: "Pulling" },
  cancellation: { state: cancellation },
})
const terminal = (state: "succeeded" | "failed" | "cancelled", id = operationId): WebOperationSummary => state === "succeeded" ? {
  ...accepted(id), state, started_at: "2026-07-16T12:00:01.000Z", finished_at: "2026-07-16T12:00:02.000Z",
  cancellation: { state: "unavailable", reason: "finished" }, result: { snapshot_changed: true },
} : {
  ...accepted(id), state, started_at: "2026-07-16T12:00:01.000Z", finished_at: "2026-07-16T12:00:02.000Z",
  cancellation: { state: "unavailable", reason: "finished" }, error: { code: "operation_failed", message: "Safe failure", retryable: false },
}

describe("durable operation tracker", () => {
  test("submits intent once and never turns an ambiguous response into replay", async () => {
    const submit = vi.fn(async () => { throw new Error("response dropped") })
    const tracker = createOperationTracker({ submit, get: vi.fn(), cancel: vi.fn(), refresh: vi.fn() })

    await expect(tracker.submit({ kind: "pull" })).rejects.toThrow("response dropped")
    await expect(tracker.submit({ kind: "pull" })).resolves.toEqual({ status: "locked", reason: "submit-unknown" })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(tracker.state()).toMatchObject({ phase: "submit-unknown" })
  })

  test("reconnects a known operation by ID only and coalesces repeated delivery", async () => {
    const submit = vi.fn(async () => accepted())
    const get = vi.fn(async () => running())
    const tracker = createOperationTracker({ submit, get, cancel: vi.fn(), refresh: vi.fn() })

    await tracker.submit({ kind: "pull" })
    const first = tracker.observe(running())
    const duplicate = tracker.observe(running())
    await tracker.reconnect()
    expect(first).toBe(true)
    expect(duplicate).toBe(false)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(operationId)
    expect(tracker.state()).toMatchObject({ phase: "observing", operationId })
  })

  test("hydrates a known operation after reload and reconnects by ID without submitting intent", async () => {
    const get = vi.fn(async () => running())
    const submit = vi.fn()
    const tracker = createOperationTracker({ submit, get, cancel: vi.fn(), refresh: vi.fn() })

    await tracker.hydrate(operationId)
    expect(get).toHaveBeenCalledWith(operationId)
    expect(submit).not.toHaveBeenCalled()
    expect(tracker.state()).toEqual({ phase: "observing", operationId })

    await tracker.reconnect()
    expect(get).toHaveBeenCalledTimes(2)
    expect(submit).not.toHaveBeenCalled()
  })

  test.each([
    ["requested", "running"],
    ["too-late", "running"],
    ["not-cancellable", "running"],
    ["already-finished", "succeeded"],
  ] as const)("sends cancel once and preserves observation for %s", async (outcome, operation_state) => {
    const cancelResult: OperationCancelResult = { operation_id: operationId, outcome, operation_state }
    const cancel = vi.fn(async () => cancelResult)
    const tracker = createOperationTracker({ submit: vi.fn(async () => accepted()), get: vi.fn(), cancel, refresh: vi.fn() })
    await tracker.submit({ kind: "pull" })
    tracker.observe(running())

    const results = await Promise.all([tracker.cancel(), tracker.cancel()])
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(results[0]).toEqual(cancelResult)
    expect(results[1]).toEqual({ status: "ignored", reason: "cancel-pending" })
    expect(tracker.state()).toMatchObject({ operationId })
  })

  test.each(["succeeded", "failed", "cancelled"] as const)("refreshes and reconciles selection after %s", async (outcome) => {
    let finishRefresh!: () => void
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finishRefresh = resolve }))
    const reconcile = vi.fn()
    const tracker = createOperationTracker({ submit: vi.fn(async () => accepted()), get: vi.fn(), cancel: vi.fn(), refresh, reconcile })
    await tracker.submit({ kind: "pull" })

    const settling = tracker.observe(terminal(outcome))
    expect(tracker.state()).toMatchObject({ phase: "refreshing", operationId })
    expect(reconcile).toHaveBeenCalledWith({ workspaceId, operationId, outcome })
    finishRefresh()
    await settling
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(tracker.state()).toMatchObject({ phase: "ready" })
  })

  test("keeps actions locked after refresh failure until explicit retry succeeds", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined)
    const tracker = createOperationTracker({ submit: vi.fn(async () => accepted()), get: vi.fn(), cancel: vi.fn(), refresh })
    await tracker.submit({ kind: "pull" })

    await tracker.observe(terminal("failed"))
    expect(tracker.state()).toMatchObject({ phase: "refresh-failed", operationId })
    expect(tracker.isLocked()).toBe(true)
    await tracker.retryRefresh()
    expect(tracker.state()).toMatchObject({ phase: "ready" })
    expect(tracker.isLocked()).toBe(false)
  })

  test("bounds visible cards at three and reports overflow", () => {
    const tracker = createOperationTracker({ submit: vi.fn(), get: vi.fn(), cancel: vi.fn(), refresh: vi.fn() })
    for (let index = 0; index < 5; index += 1) tracker.track(accepted(`op_1234567890abcde${index}`))
    expect(tracker.cards()).toHaveLength(3)
    expect(tracker.overflowCount()).toBe(2)
  })
})
