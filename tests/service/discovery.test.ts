import { afterEach, describe, expect, test } from "@test/api"
import { setTimeout as sleep } from "node:timers/promises"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { provisionOfficialClient, readOfficialClientCredential } from "../../packages/service/src/policy/credentials"
import { EventBroker } from "../../packages/service/src/policy/event-broker"
import { EventJournal } from "../../packages/service/src/policy/event-journal"
import { startServiceServer } from "../../packages/service/src/server"
import { createIdleLifecycle, ensureManagedServiceProcess, serviceDescriptorPath, startManagedService } from "../../packages/service/src/main"

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

  test("launches missing services detached and returns discovered state", async () => {
    const descriptor = {
      protocol: "v1" as const,
      endpoint: "http://127.0.0.1:30001/",
      pid: 123,
      instance_id: crypto.randomUUID(),
      server_id: crypto.randomUUID(),
      credential_lookup: "official-client",
      started_at: new Date().toISOString(),
    }
    let reads = 0
    let command: string[] | undefined
    let detached = false
    let unrefCalled = false
    let childEnvironment: Record<string, string | undefined> | undefined
    process.env.GS_WORKSPACE_NAME = "must-not-leak"
    process.env.GIT_STACKS_SIGNAL_TOKEN = "must-not-leak"
    const found = await ensureManagedServiceProcess({
      executable: "/usr/bin/bun",
      entrypoint: "/opt/git-stacks/packages/cli/src/index.ts",
      pollMs: 1,
      readUsable: async () => ++reads >= 2 ? descriptor : null,
      spawn: (nextCommand, options) => {
        command = nextCommand
        detached = options.detached
        childEnvironment = options.env
        return { exited: new Promise<number>(() => {}), unref: () => { unrefCalled = true } }
      },
    })
    delete process.env.GS_WORKSPACE_NAME
    delete process.env.GIT_STACKS_SIGNAL_TOKEN

    expect(found).toEqual(descriptor)
    expect(command).toEqual(["/usr/bin/bun", "/opt/git-stacks/packages/cli/src/index.ts", "service", "start"])
    expect(detached).toBe(true)
    expect(unrefCalled).toBe(true)
    expect(childEnvironment?.GS_WORKSPACE_NAME).toBeUndefined()
    expect(childEnvironment?.GIT_STACKS_SIGNAL_TOKEN).toBeUndefined()
  })

  test("binds a random loopback port and authenticates before routing", async () => {
    const root = join(tmpdir(), `git-stacks-http-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const credential = provisionOfficialClient("test-client", { serviceRoot: root })
    let activity = 0
    const service = await startServiceServer({ serviceRoot: root, snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } }, onActivity: () => { activity += 1 } })
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

  test("flushes SSE readiness without waiting for the heartbeat", async () => {
    const root = join(tmpdir(), `git-stacks-sse-ready-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const credential = provisionOfficialClient("sse-ready", { serviceRoot: root })
    const broker = new EventBroker(new EventJournal({ root }))
    const service = await startServiceServer({
      serviceRoot: root,
      broker,
      heartbeatMs: 60_000,
      snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } },
    })
    cleanup.push(() => service.stop())

    const response = await Promise.race([
      fetch(new URL("/v1/events?cursor=0", service.url), { headers: { authorization: `Bearer ${credential.token}` } }),
      sleep(250).then(() => null),
    ])
    expect(response).toBeInstanceOf(Response)
    const reader = (response as Response).body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain(": connected")
    await reader.cancel()
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

    await sleep(40)
    expect((await fetch(new URL("/v1/snapshot", service.descriptor.endpoint), { headers })).status).toBe(200)
    await sleep(40)
    expect((await fetch(new URL("/v1/snapshot", service.descriptor.endpoint), { headers })).status).toBe(200)
  })
})
