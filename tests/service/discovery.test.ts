import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { provisionOfficialClient, readOfficialClientCredential } from "../../src/lib/service/credentials"
import { startServiceServer } from "../../src/service/server"
import { createIdleLifecycle, serviceDescriptorPath, startManagedService } from "../../src/service/main"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

describe("v1 discovery", () => {
  test("exposes descriptor and idle lifecycle primitives", () => {
    expect(serviceDescriptorPath("/tmp/example")).toBe("/tmp/example/descriptor.json")
    const lifecycle = createIdleLifecycle({ idleMs: 300_000, onIdle: () => {} })
    expect(lifecycle.activeOperations).toBe(0)
    expect(lifecycle.connectedClients).toBe(0)
    lifecycle.dispose()
  })

  test("binds a random loopback port and authenticates before routing", async () => {
    const root = join(tmpdir(), `git-stacks-http-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const credential = provisionOfficialClient("test-client", { serviceRoot: root })
    let activity = 0
    const service = startServiceServer({ serviceRoot: root, snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } }, onActivity: () => { activity += 1 } })
    cleanup.push(() => service.stop())

    expect(service.url.hostname).toBe("127.0.0.1")
    expect(Number(service.url.port)).toBeGreaterThan(0)
    const rejected = await fetch(new URL("/v1/not-a-route", service.url))
    expect(rejected.status).toBe(401)
    expect(await rejected.json()).toEqual({ error: "unauthenticated" })
    expect(activity).toBe(0)

    const response = await fetch(new URL("/v1", service.url), { headers: { authorization: `Bearer ${credential.token}` } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, protocol: "v1", data: { service_version: expect.any(String) } })
    expect(activity).toBe(1)
  })

  test("publishes one owner-only secret-free descriptor and removes only its instance", async () => {
    const root = join(tmpdir(), `git-stacks-managed-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const snapshot = { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") }, currentRevision: async () => "0" }
    const first = await startManagedService({ serviceRoot: root, clientId: "service-test", snapshot })
    cleanup.push(() => first.stop())
    const second = await startManagedService({ serviceRoot: root, clientId: "service-test", snapshot })
    expect(second.existing).toBe(true)
    expect(second.descriptor.instance_id).toBe(first.descriptor.instance_id)
    const path = serviceDescriptorPath(root)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    const raw = readFileSync(path, "utf8")
    expect(raw).not.toContain(provisionOfficialClient("service-test", { serviceRoot: root }).token)
    await first.stop()
    expect(existsSync(path)).toBe(false)
  })

  test("recovers legacy incomplete and dead-owner startup locks", async () => {
    const snapshot = { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") }, currentRevision: async () => "0" }
    for (const owner of ["", `${JSON.stringify({ pid: 2_147_483_647, nonce: crypto.randomUUID(), created_at: new Date().toISOString() })}\n`]) {
      const root = join(tmpdir(), `git-stacks-stale-startup-${crypto.randomUUID()}`)
      mkdirSync(root, { recursive: true, mode: 0o700 })
      cleanup.push(() => rmSync(root, { recursive: true, force: true }))
      const lockPath = join(root, "startup.lock")
      writeFileSync(lockPath, owner, { mode: 0o600 })
      if (!owner) utimesSync(lockPath, new Date(0), new Date(0))

      const service = await startManagedService({ serviceRoot: root, clientId: "service-test", snapshot })
      cleanup.push(() => service.stop())
      expect(service.existing).toBe(false)
      expect(existsSync(lockPath)).toBe(false)
      await service.stop()
    }
  })

  test("authenticated API polling keeps the managed service alive", async () => {
    const root = join(tmpdir(), `git-stacks-managed-activity-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const snapshot = { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") }, currentRevision: async () => "0" }
    const service = await startManagedService({ serviceRoot: root, clientId: "service-test", snapshot, idleMs: 60 })
    cleanup.push(() => service.stop())
    const credential = readOfficialClientCredential("service-test", { serviceRoot: root })!
    const headers = { authorization: `Bearer ${credential.token}` }

    await Bun.sleep(40)
    expect((await fetch(new URL("/v1/snapshot", service.descriptor.endpoint), { headers })).status).toBe(200)
    await Bun.sleep(40)
    expect((await fetch(new URL("/v1/snapshot", service.descriptor.endpoint), { headers })).status).toBe(200)
  })
})
