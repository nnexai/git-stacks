import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  readOfficialClientCredential,
  startManagedService,
  WebTerminalManager,
} from "../../packages/service/dist/index.js"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const repositoryId = "22222222-2222-4222-8222-222222222222"
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function eventually(predicate, timeout = 3_000) {
  const deadline = Date.now() + timeout
  while (!predicate() && Date.now() < deadline) await delay(10)
  assert.equal(predicate(), true)
}

function terminalSnapshot() {
  return {
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
}

function attach(manager, terminalId, streaming = true) {
  const sent = []
  const socket = {
    data: { kind: "web-terminal", principalId: "browser", sessionId: terminalId, streaming },
    send: (value) => { sent.push(value); return value.length },
    close: () => {},
    getBufferedAmount: () => 0,
  }
  manager.attach(socket)
  return { socket, sent }
}

function terminalText(sent) {
  const chunks = sent.filter((entry) => entry instanceof Uint8Array).map((entry) => entry.slice(9))
  return new TextDecoder().decode(Buffer.concat(chunks))
}

test("Node managed service authenticates, serves the web package, and shuts down cleanly", async () => {
  const configRoot = await mkdtemp(join(tmpdir(), "git-stacks-node-service-"))
  const serviceRoot = join(configRoot, "service")
  const service = await startManagedService({
    serviceRoot,
    snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") }, currentRevision: async () => "1" },
  })
  try {
    const credential = readOfficialClientCredential(service.descriptor.credential_lookup, { serviceRoot })
    assert.ok(credential)
    const headers = { authorization: `Bearer ${credential.token}` }
    const discovery = await fetch(new URL("/v1", service.descriptor.endpoint), { headers })
    assert.equal(discovery.status, 200)
    const pairing = await fetch(new URL("/v1/web-pairings", service.descriptor.endpoint), { method: "POST", headers })
    assert.equal(pairing.status, 201)
    const html = await fetch(new URL("/web/", service.descriptor.endpoint))
    assert.equal(html.status, 200)
    assert.match(await html.text(), /\/web\/assets\/app-[A-Z0-9]+\.js/)
  } finally {
    await service.stop()
    await rm(configRoot, { recursive: true, force: true })
  }
})

test("node-pty preserves resize, hidden signal capture, and reconnect replay", async () => {
  const signals = []
  const manager = new WebTerminalManager(terminalSnapshot(), async (signal) => signals.push(signal))
  const terminal = await manager.create("browser", {
    workspace_id: workspaceId,
    repository_id: repositoryId,
    expected_revision: "1",
    cols: 80,
    rows: 24,
  })
  const first = attach(manager, terminal.id, false)
  manager.message(first.socket, JSON.stringify({ type: "resize", cols: 91, rows: 27 }))
  manager.message(first.socket, JSON.stringify({ type: "input", data: "printf '\\033]9;git-stacks-signal:%s:codex:node-session:working\\033\\\\' \"$GIT_STACKS_SIGNAL_TOKEN\"; echo NODE_PTY_MARKER; stty size\r" }))
  await eventually(() => signals.length === 1)
  assert.equal(first.sent.some((entry) => entry instanceof Uint8Array), false)
  manager.detached(first.socket)

  const second = attach(manager, terminal.id, true)
  await eventually(() => terminalText(second.sent).includes("NODE_PTY_MARKER"))
  assert.match(terminalText(second.sent), /27 91/)
  assert.equal(signals[0].source, "codex")
  assert.equal(signals[0].session_id, "node-session")
  await manager.close("browser", terminal.id)
  assert.equal(manager.diagnostics.sessions, 0)
  assert.equal(signals.at(-1).state, "idle")
  await manager.stop()
})

test("node-pty bounds hidden history and reports a reset when replay is unavailable", async () => {
  const manager = new WebTerminalManager(terminalSnapshot())
  const terminal = await manager.create("browser", {
    workspace_id: workspaceId,
    repository_id: repositoryId,
    expected_revision: "1",
    cols: 80,
    rows: 24,
  })
  const connection = attach(manager, terminal.id, false)
  manager.message(connection.socket, JSON.stringify({ type: "input", data: "printf '%1050000s' x\r" }))
  await eventually(() => manager.get("browser", terminal.id)?.history_available === false, 5_000)

  manager.message(connection.socket, JSON.stringify({ type: "flow", streaming: true }))
  await eventually(() => connection.sent.some((entry) => typeof entry === "string" && entry.includes('"type":"history_unavailable"')))
  assert.equal(connection.sent.some((entry) => typeof entry === "string" && entry.includes('"type":"ready"') && entry.includes('"reset":true')), true)
  const replayBytes = connection.sent
    .filter((entry) => entry instanceof Uint8Array)
    .reduce((size, frame) => size + frame.byteLength - 9, 0)
  assert.ok(replayBytes <= 1024 * 1024)

  await manager.close("browser", terminal.id)
  await manager.stop()
})
