import { describe, expect, test } from "@test/api"
import { WEB_PRINCIPAL_HARD_MS, WEB_PRINCIPAL_IDLE_MS, WebPrincipalManager } from "../../packages/service/src/web/principal-manager"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const repositoryId = "22222222-2222-4222-8222-222222222222"
const surfaceId = "33333333-3333-4333-8333-333333333333"
const activity = (state: "working" | "completed", occurredAt: string) => ({
  version: 1 as const, kind: "activity" as const, id: "sig_0123456789abcdef", source: "codex" as const,
  workspace_id: workspaceId, repository_id: repositoryId, surface_id: surfaceId, session_id: "codex-surface",
  state, occurred_at: occurredAt,
})

function request(cookie?: string): Request {
  return new Request("http://127.0.0.1/web/api/snapshot", { headers: cookie ? { cookie } : {} })
}

describe("web principal manager", () => {
  test("issues one-use short-lived pairings without retaining plaintext credentials", () => {
    let now = 1_000
    const manager = new WebPrincipalManager(() => now)
    const pairing = manager.issue("http://127.0.0.1:1234")
    const code = new URL(pairing.url).hash.slice("#pair=".length)
    expect(pairing.url.startsWith("http://127.0.0.1:1234/web/#pair=")).toBe(true)
    expect(JSON.stringify(manager)).not.toContain(code)
    const exchanged = manager.exchange(code)
    expect(exchanged).not.toBeNull()
    expect(manager.exchange(code)).toBeNull()
    expect(exchanged!.cookie!).toContain("HttpOnly")
    expect(exchanged!.cookie!).toContain("SameSite=Strict")
    expect(exchanged!.cookie!).not.toContain(exchanged!.principal.digest)
    expect(manager.authenticate(request(exchanged!.cookie!.split(";")[0]!))?.id).toBe(exchanged!.principal.id)

    const expired = manager.issue("http://127.0.0.1:1234")
    now += 60_001
    expect(manager.exchange(new URL(expired.url).hash.slice("#pair=".length))).toBeNull()
  })

  test("expires idle and hard-lifetime principals and reports their identity", () => {
    let now = 10_000
    const expired: string[] = []
    const manager = new WebPrincipalManager(() => now, (id) => expired.push(id))
    const pairing = manager.issue("http://127.0.0.1:1234")
    const exchanged = manager.exchange(new URL(pairing.url).hash.slice("#pair=".length))!
    const cookie = exchanged.cookie!.split(";")[0]!
    now += WEB_PRINCIPAL_IDLE_MS + 1
    expect(manager.authenticate(request(cookie))).toBeNull()
    expect(expired).toEqual([exchanged.principal.id])

    const second = manager.issue("http://127.0.0.1:1234")
    const hard = manager.exchange(new URL(second.url).hash.slice("#pair=".length))!
    now += WEB_PRINCIPAL_HARD_MS + 1
    manager.sweep()
    expect(expired).toContain(hard.principal.id)
  })

  test("consumes a fresh pairing without replacing an authenticated browser principal", () => {
    const manager = new WebPrincipalManager()
    const first = manager.issue("http://127.0.0.1:1234")
    const exchanged = manager.exchange(new URL(first.url).hash.slice("#pair=".length))!
    const existing = manager.authenticate(request(exchanged.cookie!.split(";")[0]))!
    const next = manager.issue("http://127.0.0.1:1234")
    const resumed = manager.exchange(new URL(next.url).hash.slice("#pair=".length), existing)!

    expect(resumed.principal.id).toBe(existing.id)
    expect(resumed.cookie).toBeUndefined()
    expect(manager.size).toBe(1)
  })

  test("marks only the current exact-surface lifecycle seen for one browser principal", () => {
    const manager = new WebPrincipalManager()
    const first = manager.issue("http://127.0.0.1:1234")
    const principal = manager.exchange(new URL(first.url).hash.slice("#pair=".length))!.principal
    const second = manager.issue("http://127.0.0.1:1234")
    const other = manager.exchange(new URL(second.url).hash.slice("#pair=".length))!.principal
    const working = activity("working", "2026-07-14T10:00:00.000Z")

    expect(manager.acknowledgeSurface(principal.id, surfaceId, [working])).toBe(1)
    expect(manager.visibleSignals(principal.id, [working])).toEqual([])
    expect(manager.visibleSignals(other.id, [working])).toEqual([working])

    const completed = activity("completed", "2026-07-14T10:00:01.000Z")
    expect(manager.visibleSignals(principal.id, [completed])).toEqual([completed])
    manager.acknowledgeSurface(principal.id, surfaceId, [completed])
    expect(manager.visibleSignals(principal.id, [completed])).toEqual([])

    const nextRun = activity("working", "2026-07-14T10:00:02.000Z")
    expect(manager.visibleSignals(principal.id, [nextRun])).toEqual([nextRun])
  })
})
