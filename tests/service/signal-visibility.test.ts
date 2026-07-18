import { describe, expect, test } from "@test/api"
import { SignalVisibilityTracker } from "../../packages/service/src/web/signal-visibility"
import { SecureServiceRouter } from "../../packages/service/src/secure/router"
import type { ServiceEvent, Signal } from "../../packages/protocol/src/service"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const repositoryId = "22222222-2222-4222-8222-222222222222"
const surfaceId = "33333333-3333-4333-8333-333333333333"
const activity = (state: "working" | "completed", occurredAt: string) => ({
  version: 1 as const, kind: "activity" as const, id: "sig_0123456789abcdef", source: "codex" as const,
  workspace_id: workspaceId, repository_id: repositoryId, surface_id: surfaceId, session_id: "codex-surface",
  state, occurred_at: occurredAt,
})

class EventSubscription implements AsyncIterable<ServiceEvent>, AsyncIterator<ServiceEvent> {
  private readonly events: ServiceEvent[] = []
  private waiter?: (value: IteratorResult<ServiceEvent>) => void

  [Symbol.asyncIterator](): AsyncIterator<ServiceEvent> { return this }

  next(): Promise<IteratorResult<ServiceEvent>> {
    const event = this.events.shift()
    if (event) return Promise.resolve({ value: event, done: false })
    return new Promise((resolve) => { this.waiter = resolve })
  }

  publish(event: ServiceEvent): void {
    const waiter = this.waiter
    this.waiter = undefined
    if (waiter) waiter({ value: event, done: false })
    else this.events.push(event)
  }

  close(): void { this.waiter?.({ value: undefined, done: true }); this.waiter = undefined }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
  expect(predicate()).toBe(true)
}

describe("secure browser signal visibility", () => {
  test("acknowledges only attention lifecycle on the current exact surface for one authenticated principal", () => {
    const visibility = new SignalVisibilityTracker()
    const working = activity("working", "2026-07-14T10:00:00.000Z")

    expect(visibility.acknowledgeSurface("browser-1", surfaceId, [working])).toBe(0)
    expect(visibility.visibleSignals("browser-1", [working])).toEqual([working])
    expect(visibility.visibleSignals("browser-2", [working])).toEqual([working])

    const completed = activity("completed", "2026-07-14T10:00:01.000Z")
    expect(visibility.visibleSignals("browser-1", [completed])).toEqual([completed])
    visibility.acknowledgeSurface("browser-1", surfaceId, [completed])
    expect(visibility.visibleSignals("browser-1", [completed])).toEqual([])

    const nextRun = activity("working", "2026-07-14T10:00:02.000Z")
    expect(visibility.visibleSignals("browser-1", [nextRun])).toEqual([nextRun])
  })

  test("returns the post-ack projection while retaining working presence", async () => {
    const working = activity("working", "2026-07-14T10:00:00.000Z")
    const completed = { ...activity("completed", "2026-07-14T10:00:01.000Z"), source: "claude" as const, id: "sig_1123456789abcdef" }
    const router = new SecureServiceRouter({
      snapshot: {
        buildAll: async () => [{ workspace: { id: workspaceId } }] as never,
        buildWorkspace: async () => { throw new Error("unused") },
      },
      signalProjection: async () => ({ signals: [working, completed], dismissed: [], sequence: "2", unread: [], overflow: 0 }),
    })
    ;(router.terminals as unknown as { surfaceIds(principalId: string): Set<string> }).surfaceIds = () => new Set([surfaceId])
    const context = {
      sessionId: "session-1", principalId: "browser-1", targetId: "target-1", origin: "local", mode: "browser",
      scopes: ["signal.dismiss"], sendEvent: async () => undefined,
    } as never

    const projection = await router.request(context, {
      method: "signals.acknowledge", body: { surface_id: surfaceId },
    } as never) as { acknowledged: number; signals: Signal[] }

    expect(projection.acknowledged).toBe(1)
    expect(projection.signals.map(({ source, state }) => ({ source, state }))).toEqual([{ source: "codex", state: "working" }])
    await router.stop()
  })

  test("filters live browser signals by the principal's terminal and active workspace visibility", async () => {
    const visibleWorkspaceId = workspaceId
    const hiddenWorkspaceId = "44444444-4444-4444-8444-444444444444"
    const visibleSurfaceId = surfaceId
    const foreignSurfaceId = "55555555-5555-4555-8555-555555555555"
    const subscription = new EventSubscription()
    const sent: ServiceEvent[] = []
    const router = new SecureServiceRouter({
      snapshot: {
        buildAll: async () => [{ workspace: { id: visibleWorkspaceId } }] as never,
        buildWorkspace: async () => { throw new Error("unused") },
      },
      broker: { subscribe: async () => subscription } as never,
    })
    ;(router.terminals as unknown as { surfaceIds(principalId: string): Set<string> }).surfaceIds = (principalId) =>
      principalId === "browser-1" ? new Set([visibleSurfaceId]) : new Set()
    const context = {
      sessionId: "session-1", principalId: "browser-1", targetId: "target-1", origin: "local", mode: "browser",
      scopes: ["event.read"], sendEvent: async (event: ServiceEvent) => { sent.push(event) },
    } as never
    const signal = (id: string, workspace_id: string, surface_id?: string): Signal => ({
      version: 1, kind: "activity", id, source: "codex", workspace_id, repository_id: repositoryId,
      surface_id: surface_id!, session_id: "session-1", state: "working", occurred_at: "2026-07-18T00:00:00.000Z",
    })
    const event = (sequence: string, item: Signal): ServiceEvent => ({
      protocol: "v1", sequence, timestamp: "2026-07-18T00:00:00.000Z", type: "signal", signal: item,
    })

    await router.request(context, { method: "events.subscribe", body: { cursor: "0" } } as never)
    subscription.publish(event("1", signal("sig_0123456789abcdef", visibleWorkspaceId, foreignSurfaceId)))
    subscription.publish(event("2", signal("sig_1123456789abcdef", hiddenWorkspaceId, visibleSurfaceId)))
    subscription.publish(event("3", signal("sig_2123456789abcdef", visibleWorkspaceId, visibleSurfaceId)))

    await waitFor(() => sent.length === 1)
    expect(sent.map((item) => item.signal.kind === "dismiss_signal" ? item.signal.signal_id : item.signal.id)).toEqual(["sig_2123456789abcdef"])
    await router.stop()
  })
})
