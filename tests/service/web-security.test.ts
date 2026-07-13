import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { WorkspaceSnapshotResponse } from "../../src/lib/service/contract"
import { provisionOfficialClient } from "../../src/lib/service/credentials"
import { startServiceServer } from "../../src/service/server"
import { WebApplication } from "../../src/service/web/routes"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run() })

function fixture(): WorkspaceSnapshotResponse[] {
  return [{
    protocol: "v1", request_id: "req_abcdefghijklmnop", ok: true, revision: "1", generated_at: "2026-07-13T12:00:00.000Z",
    workspace: {
      id: "11111111-1111-4111-8111-111111111111", name: "demo", branch: "main", repositories: [{ id: "22222222-2222-4222-8222-222222222222", name: "repo", mode: "worktree", path: "/secret/repository" }],
      status: [{ repository_id: "22222222-2222-4222-8222-222222222222", name: "repo", exists: true, dirty: false, branch: "main", default_branch: "main", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, remote: "available", degraded: false }],
      launch: { commands: ["secret command"], environment: { TOKEN: "secret-env" }, redacted: ["TOKEN"], references: { TOKEN: "secret-ref" }, cwd: "/secret/cwd", ports: { app: 4321 }, named: [] },
    },
  }]
}

describe("web request security boundary", () => {
  test("requires one-use pairing, exact host/origin, same-site reads, and emits only browser DTOs", async () => {
    const root = join(tmpdir(), `git-stacks-web-security-${crypto.randomUUID()}`)
    const assets = join(root, "assets")
    mkdirSync(root, { recursive: true, mode: 0o700 })
    mkdirSync(assets, { mode: 0o700 })
    writeFileSync(join(assets, "index.html"), "<!doctype html><title>test</title>")
    writeFileSync(join(assets, "manifest.json"), JSON.stringify({ assets: ["index.html"] }))
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const credential = provisionOfficialClient("web-security", { serviceRoot: root })
    const snapshot = { buildAll: async () => fixture(), buildWorkspace: async () => fixture()[0]! }
    const web = new WebApplication({ assetsRoot: assets, snapshot })
    const service = startServiceServer({ serviceRoot: root, snapshot, web })
    cleanup.push(() => service.stop())
    const origin = service.url.origin
    const official = { authorization: `Bearer ${credential.token}`, "content-type": "application/json" }

    const issuedResponse = await fetch(new URL("/v1/web-pairings", service.url), { method: "POST", headers: official, body: "{}" })
    expect(issuedResponse.status).toBe(201)
    const issued = await issuedResponse.json() as { data: { url: string } }
    const code = new URL(issued.data.url).hash.slice("#pair=".length)
    expect(code.length).toBeGreaterThan(32)

    const crossSite = await fetch(new URL("/web/api/pair", service.url), { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ code }) })
    expect(crossSite.status).toBe(403)

    const malformed = await fetch(new URL("/web/api/pair", service.url), { method: "POST", headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" }, body: "{" })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({ ok: false, error: { code: "invalid_request" } })

    const exchange = await fetch(new URL("/web/api/pair", service.url), { method: "POST", headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ code }) })
    expect(exchange.status).toBe(200)
    const cookie = exchange.headers.get("set-cookie")!.split(";")[0]!
    expect(exchange.headers.get("content-security-policy")).toContain("script-src 'self'")
    const replay = await fetch(new URL("/web/api/pair", service.url), { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ code }) })
    expect(replay.status).toBe(401)

    const snapshotResponse = await fetch(new URL("/web/api/snapshot", service.url), { headers: { cookie, "sec-fetch-site": "same-origin" } })
    expect(snapshotResponse.status).toBe(200)
    const encoded = JSON.stringify(await snapshotResponse.json())
    for (const secret of ["/secret/repository", "secret command", "secret-env", "secret-ref", "/secret/cwd", "4321"]) expect(encoded).not.toContain(secret)

    const rejectedRead = await fetch(new URL("/web/api/snapshot", service.url), { headers: { cookie, "sec-fetch-site": "cross-site" } })
    expect(rejectedRead.status).toBe(403)
    const rejectedMutation = await fetch(new URL("/web/api/logout", service.url), { method: "POST", headers: { cookie, origin: "https://evil.example", "sec-fetch-site": "cross-site" } })
    expect(rejectedMutation.status).toBe(403)
    const rejectedSocket = await web.handle(new Request(new URL("/web/ws/terminals/term_abcdefghijklmnop", service.url), { headers: { host: service.url.host, cookie, origin: "https://evil.example" } }), service.server)
    expect(rejectedSocket?.status).toBe(403)
    const wrongHost = await fetch(new URL("/web/api/snapshot", service.url), { headers: { cookie, host: "evil.example" } })
    expect(wrongHost.status).toBe(403)
    const noCors = await fetch(new URL("/web/api/snapshot", service.url), { headers: { cookie, origin: "https://evil.example" } })
    expect(noCors.headers.get("access-control-allow-origin")).toBeNull()
  })
})
