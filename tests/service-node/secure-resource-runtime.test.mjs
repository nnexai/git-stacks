import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { authenticateSecureCarrier } from "../../packages/client/dist/index.js"
import { connectLocalTls, startManagedService } from "../../packages/service/dist/index.js"

const scopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]
const snapshot = {
  currentRevision: async () => "1",
  buildAll: async () => [],
  buildWorkspace: async () => { throw new Error("unused") },
}

async function connect(descriptor) {
  return authenticateSecureCarrier(await connectLocalTls(descriptor.local_tls), {
    mode: "tui", targetId: descriptor.service_id, listenerEpoch: descriptor.listener_epoch,
    launchToken: descriptor.tui_launch.token, requestedScopes: scopes, build: "secure-resource-test",
  })
}

test("repeated authenticated reconnects release sessions, timers, and CPU", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-secure-resource-"))
  const service = await startManagedService({ serviceRoot: root, snapshot, idleMs: 60_000 })
  const beforeRss = process.memoryUsage().rss
  try {
    for (let index = 0; index < 20; index += 1) {
      const descriptor = JSON.parse(await readFile(join(root, "descriptor.json"), "utf8"))
      const session = await connect(descriptor)
      assert.equal((await session.rpc.request("service.discovery")).protocol, "git-stacks/2")
      await session.rpc.close("reconnect iteration complete")
    }
    const deadline = Date.now() + 2_000
    while (service.server.connectedClients !== 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(service.server.connectedClients, 0)
    assert.ok(process.memoryUsage().rss - beforeRss < 64 * 1024 * 1024, "reconnect RSS growth exceeded 64 MiB")

    const cpu = process.cpuUsage()
    await new Promise((resolve) => setTimeout(resolve, 250))
    const used = process.cpuUsage(cpu)
    assert.ok(used.user + used.system < 125_000, "idle secure service consumed more than half a CPU")
  } finally {
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
})
