import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { authenticateSecureCarrier } from "../../packages/client/dist/index.js"
import { decodeCanonical } from "../../packages/protocol/dist/index.js"
import { configureRemoteExposure, connectLocalTls, startManagedService } from "../../packages/service/dist/index.js"
import { acceptRemotePairing, connectNodeWebTransport, connectNodeWebTransportEndpoints } from "../../packages/service/dist/remote.js"

const scopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]

const snapshot = {
  currentRevision: async () => "1",
  buildAll: async () => [],
  buildWorkspace: async () => { throw new Error("not used") },
  resolveTerminalLaunch: async () => ({
    resolved: true, revision: "1",
    launch: {
      argv: ["/bin/bash", "--noprofile", "--norc", "-i"], cwd: process.cwd(),
      environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", PS1: "$ " }, ports: {},
      configuration: { shell: true }, redacted: [],
    },
  }),
}

async function waitFor(predicate, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(predicate(), true)
}

async function localSession(descriptor, token, targetId = descriptor.service_id) {
  return authenticateSecureCarrier(await connectLocalTls(descriptor.local_tls), {
    mode: "tui",
    targetId,
    listenerEpoch: descriptor.listener_epoch,
    launchToken: token,
    requestedScopes: scopes,
    build: "secure-remote-test",
  })
}

test("a paired helper relays an authenticated target session and rejects a wrong pin", async () => {
  const authorityRoot = await mkdtemp(join(tmpdir(), "git-stacks-authority-"))
  const helperRoot = await mkdtemp(join(tmpdir(), "git-stacks-helper-"))
  configureRemoteExposure(authorityRoot, { enabled: true, bindHost: "127.0.0.1", advertiseHost: "127.0.0.1", port: 0 })
  const authority = await startManagedService({ serviceRoot: authorityRoot, snapshot, idleMs: 60_000 })
  let helper
  try {
    const authorityClient = await localSession(authority.descriptor, authority.descriptor.tui_launch.token)
    const bundle = await authorityClient.rpc.request("trust.pair.create", { name: "test-authority", scopes }, { scope: "target.select" })
    await authorityClient.rpc.close("bundle created")
    assert.equal(bundle.pin_set.hashes.length, 2)
    assert.match(bundle.pin_set.alternate_endpoint, /^https:\/\/127\.0\.0\.1:/)

    const wrong = Buffer.from(bundle.pin_set.hashes[0], "base64url")
    wrong[0] ^= 0xff
    await assert.rejects(connectNodeWebTransport(bundle.pin_set.endpoint, [wrong.toString("base64url")]))
    const fallback = await connectNodeWebTransportEndpoints(["https://127.0.0.1:1/git-stacks", bundle.pin_set.endpoint], bundle.pin_set.hashes, { timeoutMs: 250 })
    await fallback.close("fallback verified")

    const target = await acceptRemotePairing(helperRoot, bundle)
    assert.equal(target.service_id, authority.descriptor.service_id)
    helper = await startManagedService({ serviceRoot: helperRoot, snapshot, idleMs: 60_000 })
    const helperLocal = await localSession(helper.descriptor, helper.descriptor.tui_launch.token)
    const launch = await helperLocal.rpc.request("launch.tui", { target_id: target.id }, { scope: "target.select" })
    await helperLocal.rpc.close("target launch issued")

    const relayed = await localSession(helper.descriptor, launch.token, target.id)
    const discovery = await relayed.rpc.request("service.discovery")
    assert.equal(discovery.protocol, "git-stacks/2")
    assert.deepEqual(await relayed.rpc.request("snapshot.all"), [])
    const events = []
    relayed.rpc.observeEvents((event) => events.push(event))
    await relayed.rpc.request("events.subscribe", { cursor: "0" })
    const notification = {
      version: 1, kind: "notification", id: "sig_1234567890123456", source: "automation",
      workspace_id: "11111111-1111-4111-8111-111111111111", title: "Remote attention",
      occurred_at: new Date().toISOString(),
    }
    await relayed.rpc.request("signals.publish", notification)
    await waitFor(() => events.some((event) => event.type === "signal" && event.signal?.id === notification.id))
    assert.deepEqual((await relayed.rpc.request("signals.list")).signals, [notification])

    const terminal = await relayed.rpc.request("terminal.create", {
      workspace_id: "11111111-1111-4111-8111-111111111111",
      repository_id: "22222222-2222-4222-8222-222222222222",
      expected_revision: "1", cols: 80, rows: 24,
    })
    const frames = []
    relayed.rpc.observeFrames((frame) => { if (frame.streamId === 17) frames.push(frame) })
    await relayed.channel.sendControl("terminal_control", { type: "attach", terminal_id: terminal.id, cursor: "0", streaming: true }, 17)
    await relayed.channel.sendControl("terminal_control", { type: "resize", cols: 100, rows: 30 }, 17)
    await relayed.channel.sendControl("terminal_control", { type: "input", data: "printf 'REMOTE_TERMINAL_MARKER\\n'\r" }, 17)
    await waitFor(() => frames.some((frame) => frame.kind === "terminal_data" && new TextDecoder().decode(frame.payload).includes("REMOTE_TERMINAL_MARKER")))
    assert.equal(frames.some((frame) => frame.kind === "terminal_control" && decodeCanonical(frame.payload).type === "ready"), true)
    await relayed.rpc.request("terminal.close", { terminal_id: terminal.id })
    await assert.rejects(relayed.rpc.request("trust.pair.list"), (error) => error.code === "unauthorized")

    const latestAuthorityDescriptor = JSON.parse(await readFile(join(authorityRoot, "descriptor.json"), "utf8"))
    const administrator = await localSession(latestAuthorityDescriptor, latestAuthorityDescriptor.tui_launch.token)
    const paired = await administrator.rpc.request("trust.pair.list")
    assert.equal(paired.length, 1)
    assert.equal((await administrator.rpc.request("trust.pair.revoke", { helper_id: paired[0].helper_id })).revoked, true)
    await administrator.rpc.close("helper revoked")
    await Promise.race([
      relayed.rpc.closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("revoked helper session remained connected")), 2_000)),
    ])
  } finally {
    await helper?.stop()
    await authority.stop()
    await rm(helperRoot, { recursive: true, force: true })
    await rm(authorityRoot, { recursive: true, force: true })
  }
})

test("stopping a helper cancels an in-flight remote connection retry", async () => {
  const authorityRoot = await mkdtemp(join(tmpdir(), "git-stacks-authority-"))
  const helperRoot = await mkdtemp(join(tmpdir(), "git-stacks-helper-"))
  configureRemoteExposure(authorityRoot, { enabled: true, bindHost: "127.0.0.1", advertiseHost: "127.0.0.1", port: 0 })
  const authority = await startManagedService({ serviceRoot: authorityRoot, snapshot, idleMs: 60_000 })
  let helper
  let authorityStopped = false
  try {
    const authorityClient = await localSession(authority.descriptor, authority.descriptor.tui_launch.token)
    const bundle = await authorityClient.rpc.request("trust.pair.create", { name: "retry-target", scopes }, { scope: "target.select" })
    await authorityClient.rpc.close("bundle created")
    const target = await acceptRemotePairing(helperRoot, bundle)
    await authority.stop()
    authorityStopped = true

    helper = await startManagedService({ serviceRoot: helperRoot, snapshot, idleMs: 60_000 })
    const helperLocal = await localSession(helper.descriptor, helper.descriptor.tui_launch.token)
    const launch = await helperLocal.rpc.request("launch.tui", { target_id: target.id }, { scope: "target.select" })
    await helperLocal.rpc.close("target launch issued")
    const relayed = await localSession(helper.descriptor, launch.token, target.id)
    void relayed.rpc.request("snapshot.all").catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 25))
    await Promise.race([
      helper.stop(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("helper shutdown did not cancel remote retry")), 1_000)),
    ])
    helper = undefined
    await relayed.rpc.closed
  } finally {
    await helper?.stop()
    if (!authorityStopped) await authority.stop()
    await rm(helperRoot, { recursive: true, force: true })
    await rm(authorityRoot, { recursive: true, force: true })
  }
})
