import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { authenticateSecureCarrier } from "../../packages/client/dist/index.js"
import { decodeCanonical } from "../../packages/protocol/dist/index.js"
import { connectLocalTls, startManagedService } from "../../packages/service/dist/index.js"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const repositoryId = "22222222-2222-4222-8222-222222222222"
const scopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]

async function waitFor(predicate, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(predicate(), true)
}

async function browserSession(descriptor) {
  return authenticateSecureCarrier(await connectLocalTls(descriptor.local_tls), {
    mode: "browser",
    targetId: descriptor.service_id,
    listenerEpoch: descriptor.listener_epoch,
    launchToken: descriptor.browser_launch.token,
    requestedScopes: scopes,
    build: "secure-terminal-test",
  })
}

test("service-owned terminal output survives a browser session and replays on a fresh launch", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-secure-terminal-"))
  const snapshot = {
    currentRevision: async () => "1",
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("unused") },
    resolveTerminalLaunch: async () => ({
      resolved: true,
      revision: "1",
      launch: {
        argv: ["/bin/bash", "--noprofile", "--norc", "-i"],
        cwd: process.cwd(),
        environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", PS1: "$ " },
        ports: {},
        configuration: { shell: true },
        redacted: [],
      },
    }),
  }
  const service = await startManagedService({ serviceRoot: root, snapshot, idleMs: 60_000 })
  try {
    const first = await browserSession(service.descriptor)
    const terminal = await first.rpc.request("terminal.create", {
      workspace_id: workspaceId, repository_id: repositoryId, expected_revision: "1", cols: 80, rows: 24,
    })
    const firstFrames = []
    const removeFirst = first.rpc.observeFrames((frame) => { if (frame.streamId === 7) firstFrames.push(frame) })
    await first.channel.sendControl("terminal_control", { type: "attach", terminal_id: terminal.id, cursor: "0", streaming: true }, 7)
    await first.channel.sendControl("terminal_control", { type: "input", data: "printf 'SECURE_REPLAY_MARKER\\n'\r" }, 7)
    await waitFor(() => firstFrames.some((frame) => frame.kind === "terminal_data" && new TextDecoder().decode(frame.payload).includes("SECURE_REPLAY_MARKER")))

    const rotated = JSON.parse(await readFile(join(root, "descriptor.json"), "utf8"))
    const second = await browserSession(rotated)
    await first.rpc.closed
    removeFirst()
    const terminals = await second.rpc.request("terminal.list")
    assert.equal(terminals.some((item) => item.id === terminal.id && item.state === "running"), true)
    const replayFrames = []
    const removeSecond = second.rpc.observeFrames((frame) => { if (frame.streamId === 9) replayFrames.push(frame) })
    await second.channel.sendControl("terminal_control", { type: "attach", terminal_id: terminal.id, cursor: "0", streaming: true }, 9)
    await waitFor(() => replayFrames.some((frame) => frame.kind === "terminal_data" && new TextDecoder().decode(frame.payload).includes("SECURE_REPLAY_MARKER")))
    assert.equal(replayFrames.some((frame) => frame.kind === "terminal_control" && decodeCanonical(frame.payload).type === "ready"), true)
    await second.rpc.request("terminal.close", { terminal_id: terminal.id })
    removeSecond()
    await second.rpc.close("terminal test complete")
  } finally {
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
})
