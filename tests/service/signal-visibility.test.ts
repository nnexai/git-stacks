import { describe, expect, test } from "@test/api"
import { SignalVisibilityTracker } from "../../packages/service/src/web/signal-visibility"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const repositoryId = "22222222-2222-4222-8222-222222222222"
const surfaceId = "33333333-3333-4333-8333-333333333333"
const activity = (state: "working" | "completed", occurredAt: string) => ({
  version: 1 as const, kind: "activity" as const, id: "sig_0123456789abcdef", source: "codex" as const,
  workspace_id: workspaceId, repository_id: repositoryId, surface_id: surfaceId, session_id: "codex-surface",
  state, occurred_at: occurredAt,
})

describe("secure browser signal visibility", () => {
  test("acknowledges only the current exact-surface lifecycle for one authenticated principal", () => {
    const visibility = new SignalVisibilityTracker()
    const working = activity("working", "2026-07-14T10:00:00.000Z")

    expect(visibility.acknowledgeSurface("browser-1", surfaceId, [working])).toBe(1)
    expect(visibility.visibleSignals("browser-1", [working])).toEqual([])
    expect(visibility.visibleSignals("browser-2", [working])).toEqual([working])

    const completed = activity("completed", "2026-07-14T10:00:01.000Z")
    expect(visibility.visibleSignals("browser-1", [completed])).toEqual([completed])
    visibility.acknowledgeSurface("browser-1", surfaceId, [completed])
    expect(visibility.visibleSignals("browser-1", [completed])).toEqual([])

    const nextRun = activity("working", "2026-07-14T10:00:02.000Z")
    expect(visibility.visibleSignals("browser-1", [nextRun])).toEqual([nextRun])
  })
})
