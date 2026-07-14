import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { ServiceEvent } from "../../../src/lib/service/contract"

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const fetchSignalProjection = mock(async () => ({ signals: [], dismissed: [], sequence: "0" }))
const dismissSignal = mock(async () => {})
let eventObserver: ((event: ServiceEvent) => void) | undefined

mock.module("../../../src/lib/service/client", () => ({
  fetchSignalProjection,
  dismissSignal,
}))

mock.module("../../../src/tui/dashboard/core-store", () => ({
  useCoreState: () => ({
    state: () => ({ revision: "1", workspaces: [{ projection: { id: workspaceId, name: "demo" } }] }),
  }),
  subscribeCoreEvents: (observer: (event: ServiceEvent) => void) => {
    eventObserver = observer
    return () => { eventObserver = undefined }
  },
}))

const { useSignals } = await import("../../../src/tui/dashboard/hooks/useSignals")

test("applies signal SSE events locally without refetching the projection", async () => {
  fetchSignalProjection.mockClear()
  let signals!: ReturnType<typeof useSignals>
  let dispose!: () => void
  createRoot((cleanup) => {
    dispose = cleanup
    signals = useSignals()
  })
  await Bun.sleep(5)
  expect(fetchSignalProjection).toHaveBeenCalledTimes(1)

  eventObserver?.({
    protocol: "v1",
    sequence: "1",
    timestamp: "2026-07-14T12:00:00.000Z",
    type: "signal",
    signal: {
      version: 1,
      kind: "notification",
      id: "sig_1234567890123456",
      source: "automation",
      workspace_id: workspaceId,
      title: "Build finished",
      occurred_at: "2026-07-14T12:00:00.000Z",
    },
  })

  expect(fetchSignalProjection).toHaveBeenCalledTimes(1)
  expect(signals.signalMap().get("demo")?.map((signal) => signal.title)).toEqual(["Build finished"])
  dispose()
})

test("optimistically removes dismissed activity from the rendered map", async () => {
  fetchSignalProjection.mockClear()
  dismissSignal.mockClear()
  let signals!: ReturnType<typeof useSignals>
  let dispose!: () => void
  createRoot((cleanup) => {
    dispose = cleanup
    signals = useSignals()
  })
  await Bun.sleep(5)

  eventObserver?.({
    protocol: "v1",
    sequence: "2",
    timestamp: "2026-07-14T12:00:00.000Z",
    type: "signal",
    signal: {
      version: 1,
      kind: "activity",
      id: "sig_2234567890123456",
      source: "codex",
      workspace_id: workspaceId,
      repository_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      surface_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      session_id: "session-1",
      state: "completed",
      occurred_at: "2026-07-14T12:00:00.000Z",
    },
  })
  expect(signals.signalMap().get("demo")).toHaveLength(1)

  const pending = signals.dismiss("sig_2234567890123456")
  expect(signals.signalMap().get("demo") ?? []).toHaveLength(0)
  await pending
  expect(dismissSignal).toHaveBeenCalledWith("sig_2234567890123456")
  expect(signals.signalMap().get("demo") ?? []).toHaveLength(0)
  dispose()
})
