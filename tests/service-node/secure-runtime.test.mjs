import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { authenticateSecureCarrier } from "../../packages/client/dist/index.js"
import { startManagedService } from "../../packages/service/dist/index.js"
import { connectLocalTls } from "../../packages/service/dist/index.js"

const scopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]

test("managed service authenticates a one-use client inside pinned TLS and rotates its launch", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-secure-runtime-"))
  const snapshot = {
    currentRevision: async () => "1",
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("not used") },
  }
  const service = await startManagedService({ serviceRoot: root, snapshot, idleMs: 60_000 })
  try {
    assert.equal(service.descriptor.protocol, "git-stacks/2")
    assert.equal(new URL(service.descriptor.webtransport.endpoint).protocol, "https:")
    const originalToken = service.descriptor.tui_launch.token
    await assert.rejects(connectLocalTls({ ...service.descriptor.local_tls, certificate: service.descriptor.local_tls.certificate.replace("A", "B") }))
    await assert.rejects(connectLocalTls({ ...service.descriptor.local_tls, servername: "wrong.invalid" }))
    const carrier = await connectLocalTls(service.descriptor.local_tls)
    const authenticated = await authenticateSecureCarrier(carrier, {
      mode: "tui",
      targetId: service.descriptor.service_id,
      listenerEpoch: service.descriptor.listener_epoch,
      launchToken: originalToken,
      requestedScopes: scopes,
      build: "secure-runtime-test",
    })
    const discovery = await authenticated.rpc.request("service.discovery")
    assert.equal(discovery.protocol, "git-stacks/2")
    const rotated = JSON.parse(await readFile(join(root, "descriptor.json"), "utf8"))
    assert.notEqual(rotated.tui_launch.token, originalToken)
    await authenticated.session.carrier.close("test complete")

    const replayCarrier = await connectLocalTls(rotated.local_tls)
    await assert.rejects(authenticateSecureCarrier(replayCarrier, {
      mode: "tui",
      targetId: rotated.service_id,
      listenerEpoch: rotated.listener_epoch,
      launchToken: originalToken,
      requestedScopes: scopes,
      build: "secure-runtime-replay",
    }), /authentication failed/i)
    await replayCarrier.close("replay rejected")
  } finally {
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
})

test("secure RPC preserves bounded service errors instead of masking them as schema failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-secure-error-"))
  const sourceMessage = `macOS service failure: ${"x".repeat(700)}`
  const service = await startManagedService({
    serviceRoot: root,
    idleMs: 60_000,
    snapshot: {
      currentRevision: async () => "1",
      buildAll: async () => { throw new Error(sourceMessage) },
      buildWorkspace: async () => { throw new Error("not used") },
    },
  })
  let authenticated
  try {
    authenticated = await authenticateSecureCarrier(await connectLocalTls(service.descriptor.local_tls), {
      mode: "tui",
      targetId: service.descriptor.service_id,
      listenerEpoch: service.descriptor.listener_epoch,
      launchToken: service.descriptor.tui_launch.token,
      requestedScopes: scopes,
      build: "secure-runtime-error-test",
    })
    await assert.rejects(authenticated.rpc.request("web.snapshot"), (error) => {
      assert.equal(error.code, "internal_error")
      assert.match(error.message, /^macOS service failure:/)
      assert.ok(error.message.length <= 500)
      assert.match(error.message, /…$/)
      return true
    })
  } finally {
    await authenticated?.rpc.close("error test complete").catch(() => undefined)
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
})
