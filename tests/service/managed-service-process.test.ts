import { describe, expect, test } from "@test/api"
import type { ServiceDescriptor } from "../../packages/service/src/main"
import { ensureManagedServiceProcess, resolveExistingServiceDescriptor } from "../../packages/service/src/main"

const descriptor = { service_id: "test-service" } as ServiceDescriptor

describe("managed service descriptor process lifetime", () => {
  test("reuses a healthy live service without removing its descriptor or continuing startup", async () => {
    let removed = false
    let continued = false
    const resolved = await resolveExistingServiceDescriptor(descriptor, {
      processAlive: () => true,
      probe: async () => true,
      removeStale: () => { removed = true },
    })
    if (!resolved) continued = true

    expect(resolved).toBe(descriptor)
    expect(removed).toBe(false)
    expect(continued).toBe(false)
  })

  test("removes a dead process descriptor and permits normal replacement recovery", async () => {
    let removed = false
    let probed = false
    const resolved = await resolveExistingServiceDescriptor(descriptor, {
      processAlive: () => false,
      probe: async () => { probed = true; return true },
      removeStale: () => { removed = true },
    })

    expect(resolved).toBeNull()
    expect(removed).toBe(true)
    expect(probed).toBe(false)
  })

  test("fails closed on an unreachable live process before descriptor removal or replacement startup", async () => {
    let removed = false
    let continued = false
    let failure: unknown
    try {
      const resolved = await resolveExistingServiceDescriptor(descriptor, {
        processAlive: () => true,
        probe: async () => { throw new Error("/private/socket TOKEN=credential-canary") },
        removeStale: () => { removed = true },
      })
      if (!resolved) continued = true
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      code: "service_unreachable",
      message: "The existing git-stacks service is running but unreachable. Stop the service and retry.",
    })
    expect(removed).toBe(false)
    expect(continued).toBe(false)
    expect(JSON.stringify(failure)).not.toMatch(/private|TOKEN|credential-canary/)
  })
})

describe("managed service process bootstrap", () => {
  test("preserves launcher PATH and SSH socket while stripping workspace authority from daemon bootstrap", async () => {
    const previous = {
      PATH: process.env.PATH,
      SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK,
      GS_WORKSPACE_NAME: process.env.GS_WORKSPACE_NAME,
    }
    process.env.PATH = "/phase124/runtime/bin:/usr/bin"
    process.env.SSH_AUTH_SOCK = "/tmp/phase124-agent.sock"
    process.env.GS_WORKSPACE_NAME = "must-be-stripped"
    let environment: Record<string, string | undefined> | undefined
    try {
      await ensureManagedServiceProcess({
        executable: "node-test",
        readUsable: (() => { let reads = 0; return async () => reads++ === 0 ? null : descriptor })(),
        spawn: (_command, options) => {
          environment = options.env
          return { exited: new Promise<number>(() => {}), unref() {} }
        },
      })
    } finally {
      for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value
    }
    expect(environment).toMatchObject({ PATH: "/phase124/runtime/bin:/usr/bin", SSH_AUTH_SOCK: "/tmp/phase124-agent.sock" })
    expect(environment).not.toHaveProperty("GS_WORKSPACE_NAME")
  })

  test("launches the dedicated Node daemon instead of recursively invoking the client entrypoint", async () => {
    let reads = 0
    let spawned: string[] | undefined
    let spawnedEnvironment: Record<string, string | undefined> | undefined
    let unreferenced = false

    const result = await ensureManagedServiceProcess({
      serviceRoot: "/tmp/git-stacks-managed-service-test",
      executable: "node-test",
      readUsable: async () => reads++ === 0 ? null : descriptor,
      spawn: (command, options) => {
        spawned = command
        spawnedEnvironment = options.env
        return {
          exited: new Promise<number>(() => {}),
          unref: () => { unreferenced = true },
        }
      },
    })

    expect(result).toBe(descriptor)
    expect(spawned?.[0]).toBe("node-test")
    expect(spawned).toHaveLength(2)
    expect(spawned?.[1]).toMatch(/packages[/\\]service[/\\]dist[/\\]daemon\.js$/)
    expect(spawnedEnvironment?.GIT_STACKS_SERVICE_BOOTSTRAP).toBe("1")
    expect(unreferenced).toBe(true)
  })

  test("refuses to spawn again from an already bootstrapped child", async () => {
    const previous = process.env.GIT_STACKS_SERVICE_BOOTSTRAP
    process.env.GIT_STACKS_SERVICE_BOOTSTRAP = "1"
    let spawned = false
    try {
      await expect(ensureManagedServiceProcess({
        serviceRoot: "/tmp/git-stacks-recursive-service-test",
        readUsable: async () => null,
        spawn: () => {
          spawned = true
          return { exited: Promise.resolve(1), unref() {} }
        },
      })).rejects.toThrow("Refusing to recursively bootstrap")
    } finally {
      if (previous === undefined) delete process.env.GIT_STACKS_SERVICE_BOOTSTRAP
      else process.env.GIT_STACKS_SERVICE_BOOTSTRAP = previous
    }
    expect(spawned).toBe(false)
  })

  test("keeps discovering after a concurrent launcher exits successfully", async () => {
    let reads = 0
    const result = await ensureManagedServiceProcess({
      serviceRoot: "/tmp/git-stacks-concurrent-service-test",
      pollMs: 1,
      readUsable: async () => reads++ < 2 ? null : descriptor,
      spawn: () => ({ exited: Promise.resolve(0), unref() {} }),
    })

    expect(result).toBe(descriptor)
    expect(reads).toBe(3)
  })

  test("fails immediately when the service launcher exits unsuccessfully", async () => {
    await expect(ensureManagedServiceProcess({
      serviceRoot: "/tmp/git-stacks-failed-service-test",
      pollMs: 1,
      readUsable: async () => null,
      spawn: () => ({ exited: Promise.resolve(7), unref() {} }),
    })).rejects.toThrow("service startup exited with code 7")
  })
})
