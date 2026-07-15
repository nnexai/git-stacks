import { describe, expect, test } from "@test/api"
import type { ServiceDescriptor } from "../../packages/service/src/main"
import { ensureManagedServiceProcess } from "../../packages/service/src/main"

const descriptor = { service_id: "test-service" } as ServiceDescriptor

describe("managed service process bootstrap", () => {
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
})
