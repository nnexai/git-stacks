import { describe, expect, test } from "bun:test"
import { WEB_PRINCIPAL_HARD_MS, WEB_PRINCIPAL_IDLE_MS, WebPrincipalManager } from "../../src/service/web/principal-manager"

function request(cookie?: string): Request {
  return new Request("http://127.0.0.1/web/api/snapshot", { headers: cookie ? { cookie } : {} })
}

describe("web principal manager", () => {
  test("issues one-use short-lived pairings without retaining plaintext credentials", () => {
    let now = 1_000
    const manager = new WebPrincipalManager(() => now)
    const pairing = manager.issue("http://127.0.0.1:1234")
    const code = new URL(pairing.url).hash.slice("#pair=".length)
    expect(pairing.url).toStartWith("http://127.0.0.1:1234/web/#pair=")
    expect(JSON.stringify(manager)).not.toContain(code)
    const exchanged = manager.exchange(code)
    expect(exchanged).not.toBeNull()
    expect(manager.exchange(code)).toBeNull()
    expect(exchanged!.cookie).toContain("HttpOnly")
    expect(exchanged!.cookie).toContain("SameSite=Strict")
    expect(exchanged!.cookie).not.toContain(exchanged!.principal.digest)
    expect(manager.authenticate(request(exchanged!.cookie.split(";")[0]))?.id).toBe(exchanged!.principal.id)

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
    const cookie = exchanged.cookie.split(";")[0]!
    now += WEB_PRINCIPAL_IDLE_MS + 1
    expect(manager.authenticate(request(cookie))).toBeNull()
    expect(expired).toEqual([exchanged.principal.id])

    const second = manager.issue("http://127.0.0.1:1234")
    const hard = manager.exchange(new URL(second.url).hash.slice("#pair=".length))!
    now += WEB_PRINCIPAL_HARD_MS + 1
    manager.sweep()
    expect(expired).toContain(hard.principal.id)
  })
})
