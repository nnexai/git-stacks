import { describe, expect, test } from "bun:test"
import type { ServiceDescriptor } from "../../../packages/service/src/main"
import { ensureManagedServiceProcess } from "../../../packages/service/src/main"

const descriptor = { service_id: "test-service" } as ServiceDescriptor

describe("TUI managed service bootstrap", () => {
  test("delegates service hosting to the Node CLI without invoking the TUI bundle", async () => {
    let reads = 0
    let spawned: string[] | undefined

    await ensureManagedServiceProcess({
      serviceRoot: "/tmp/git-stacks-tui-service-test",
      readUsable: async () => reads++ === 0 ? null : descriptor,
      spawn: (command) => {
        spawned = command
        return {
          exited: new Promise<number>(() => {}),
          unref() {},
        }
      },
    })

    expect(spawned).toEqual(["git-stacks", "service", "start"])
  })

  test("models refresh acceptance as a hard barrier before the first TUI request", async () => {
    const events: string[] = []
    const handoff = async (refresh: () => Promise<void>, request: () => Promise<void>) => {
      await refresh()
      await request()
    }

    await handoff(
      async () => { events.push("refresh:accepted") },
      async () => { events.push("core.state") },
    )
    expect(events).toEqual(["refresh:accepted", "core.state"])

    await expect(handoff(
      async () => { events.push("refresh:denied"); throw new Error("unauthorized") },
      async () => { events.push("terminal.create") },
    )).rejects.toThrow("unauthorized")
    expect(events).not.toContain("terminal.create")
  })
})
