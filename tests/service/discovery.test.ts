import { afterEach, describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { provisionOfficialClient } from "../../src/lib/service/credentials"
import { startServiceServer } from "../../src/service/server"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

describe("v1 discovery", () => {
  test("binds a random loopback port and authenticates before routing", async () => {
    const root = join(tmpdir(), `git-stacks-http-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const credential = provisionOfficialClient("test-client", { serviceRoot: root })
    const service = startServiceServer({ serviceRoot: root, snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } } })
    cleanup.push(() => service.stop())

    expect(service.url.hostname).toBe("127.0.0.1")
    expect(Number(service.url.port)).toBeGreaterThan(0)
    const rejected = await fetch(new URL("/v1/not-a-route", service.url))
    expect(rejected.status).toBe(401)
    expect(await rejected.json()).toEqual({ error: "unauthenticated" })

    const response = await fetch(new URL("/v1", service.url), { headers: { authorization: `Bearer ${credential.token}` } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, protocol: "v1", data: { service_version: expect.any(String) } })
  })
})
