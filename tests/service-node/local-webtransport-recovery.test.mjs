import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { authenticateSecureCarrier } from "../../packages/client/dist/index.js"
import { connectLocalTls, startManagedService } from "../../packages/service/dist/index.js"
import { connectNodeWebTransport } from "../../packages/service/dist/remote.js"

const scopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]

const snapshot = {
  currentRevision: async () => "1",
  buildAll: async () => [],
  buildWorkspace: async () => { throw new Error("unused") },
}

async function localTui(descriptor) {
  return authenticateSecureCarrier(await connectLocalTls(descriptor.local_tls), {
    mode: "tui",
    targetId: descriptor.service_id,
    listenerEpoch: descriptor.listener_epoch,
    launchToken: descriptor.tui_launch.token,
    requestedScopes: scopes,
    build: "local-webtransport-recovery-test",
  })
}

async function browser(descriptor, launch) {
  const carrier = await connectNodeWebTransport(
    descriptor.webtransport.endpoint,
    [descriptor.webtransport.certificate_hash],
    { timeoutMs: 2_000 },
  )
  return authenticateSecureCarrier(carrier, {
    mode: "browser",
    targetId: launch.grant.targetId,
    listenerEpoch: launch.listenerEpoch,
    launchToken: launch.token,
    requestedScopes: scopes,
    build: "local-webtransport-recovery-test",
  })
}

test("trusted local recovery replaces only WebTransport and preserves TLS authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-webtransport-recovery-"))
  const service = await startManagedService({ serviceRoot: root, snapshot, idleMs: 60_000 })
  let tui
  let web
  try {
    tui = await localTui(service.descriptor)
    const before = JSON.parse(await readFile(join(root, "descriptor.json"), "utf8"))
    const recovery = await tui.rpc.request("service.transport.recover", undefined, { scope: "target.select" })
    const after = JSON.parse(await readFile(join(root, "descriptor.json"), "utf8"))

    assert.equal(recovery.endpoint, after.webtransport.endpoint)
    assert.equal(recovery.certificate_hash, after.webtransport.certificate_hash)
    assert.notEqual(after.webtransport.endpoint, before.webtransport.endpoint)
    assert.equal(after.webtransport.certificate_hash, before.webtransport.certificate_hash)
    assert.equal(after.local_tls.port, before.local_tls.port)
    assert.equal((await tui.rpc.request("service.discovery")).protocol, "git-stacks/2")

    const launch = await tui.rpc.request("launch.browser", { target_id: after.service_id }, { scope: "target.select" })
    web = await browser(after, launch)
    assert.equal((await web.rpc.request("service.discovery")).protocol, "git-stacks/2")
    await assert.rejects(
      web.rpc.request("service.transport.recover", undefined, { scope: "target.select" }),
      (error) => error.code === "unauthorized",
    )
  } finally {
    await web?.rpc.close("recovery test complete").catch(() => undefined)
    await tui?.rpc.close("recovery test complete").catch(() => undefined)
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
})
