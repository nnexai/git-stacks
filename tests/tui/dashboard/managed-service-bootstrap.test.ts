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
})
