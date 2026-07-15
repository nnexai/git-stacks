import assert from "node:assert/strict"
import { createPrivateKey, createPublicKey } from "node:crypto"
import { createSocket } from "node:dgram"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { authenticateSecureCarrier } from "../../packages/client/dist/index.js"
import { acceptRemotePairing, connectNodeWebTransport } from "../../packages/service/dist/remote.js"
import { configureRemoteExposure, connectLocalTls, IdentityStore, startManagedService } from "../../packages/service/dist/index.js"

const scopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]

function contains(chunks, marker) {
  return Buffer.concat(chunks).includes(Buffer.from(marker))
}

async function keyPair(identity) {
  const privateDer = createPrivateKey(identity.privateKeyPem).export({ type: "pkcs8", format: "der" })
  const publicDer = createPublicKey(identity.publicKeyPem).export({ type: "spki", format: "der" })
  return {
    privateKey: await crypto.subtle.importKey("pkcs8", privateDer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
    publicKey: await crypto.subtle.importKey("spki", publicDer, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
  }
}

test("recorded remote WebTransport datagrams reveal neither helper proof material nor classified payload", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-secure-wire-authority-"))
  const helperRoot = await mkdtemp(join(tmpdir(), "git-stacks-secure-wire-helper-"))
  configureRemoteExposure(root, { enabled: true, bindHost: "127.0.0.1", advertiseHost: "127.0.0.1", port: 0 })
  const service = await startManagedService({
    serviceRoot: root, idleMs: 60_000,
    snapshot: {
      currentRevision: async () => "1", buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
    },
  })
  const administrator = await authenticateSecureCarrier(await connectLocalTls(service.descriptor.local_tls), {
    mode: "tui", targetId: service.descriptor.service_id, listenerEpoch: service.descriptor.listener_epoch,
    launchToken: service.descriptor.tui_launch.token, requestedScopes: scopes, build: "secure-wire-admin",
  })
  const bundle = await administrator.rpc.request("trust.pair.create", { name: "wire-helper", scopes })
  await administrator.rpc.close("pairing bundle created")
  await acceptRemotePairing(helperRoot, bundle)
  const target = new URL(bundle.pin_set.endpoint)
  const relay = createSocket("udp4")
  const recorded = []
  let client
  relay.on("message", (message, peer) => {
    recorded.push(Buffer.from(message))
    if (peer.port === Number(target.port)) {
      if (client) relay.send(message, client.port, client.address)
    } else {
      client = peer
      relay.send(message, Number(target.port), target.hostname)
    }
  })
  relay.bind(0, "127.0.0.1")
  await once(relay, "listening")
  try {
    const address = relay.address()
    const endpoint = `https://127.0.0.1:${address.port}/git-stacks`
    const carrier = await connectNodeWebTransport(endpoint, bundle.pin_set.hashes)
    const helper = new IdentityStore(helperRoot, "helper").loadOrCreate()
    const session = await authenticateSecureCarrier(carrier, {
      mode: "helper", principalId: helper.id, helperEpoch: crypto.randomUUID(),
      targetId: service.descriptor.service_id, listenerEpoch: service.descriptor.service_id,
      requestedScopes: scopes, build: "secure-wire-test", keyPair: await keyPair(helper),
    })
    const marker = `CLASSIFIED-${crypto.randomUUID()}`
    await assert.rejects(session.rpc.request("unknown.classified", { marker }), (error) => error.code === "not_found")
    await session.rpc.close("wire capture complete")
    assert.equal(contains(recorded, marker), false)
    assert.equal(contains(recorded, helper.privateKeyPem), false)
    assert.equal(contains([...recorded, Buffer.from(marker)], marker), true, "capture scanner positive control failed")
  } finally {
    relay.close()
    await once(relay, "close").catch(() => undefined)
    await service.stop()
    await rm(helperRoot, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})
