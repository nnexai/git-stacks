import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { authenticateSecureCarrier } from "../../packages/client/dist/index.js"
import { CLIENT_MODEL_LIMITS } from "../../packages/protocol/dist/index.js"
import { connectLocalTls, startManagedService } from "../../packages/service/dist/index.js"

const scopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]
const workspaceId = "11111111-1111-4111-8111-111111111111"

async function connect(descriptor, mode, token) {
  return authenticateSecureCarrier(await connectLocalTls(descriptor.local_tls), {
    mode, targetId: descriptor.service_id, listenerEpoch: descriptor.listener_epoch,
    launchToken: token, requestedScopes: scopes, build: `secure-contract-${mode}`,
  })
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(predicate(), true)
}

test("secure routing preserves catalog, idempotent operations, ownership, events, and signals", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-secure-contract-"))
  const snapshot = {
    currentRevision: async () => "7",
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("unused") },
  }
  const service = await startManagedService({
    serviceRoot: root, snapshot, idleMs: 60_000,
    workspaceCreationCatalog: () => ({
      templates: [{ name: "full", repository_count: 1, command_count: 0, labels: [] }],
      repositories: [{ name: "app", type: "typescript", default_branch: "main" }],
      client_model: CLIENT_MODEL_LIMITS,
    }),
    workspaceCreate: (request) => ({
      steps: [{ name: "workspace.create", stage: "executing", message: "Creating", run: async (report) => { await report({ message: "Created" }) } }],
      result: { workspace_name: request.name, snapshot_changed: true },
    }),
  })
  try {
    const browser = await connect(service.descriptor, "browser", service.descriptor.browser_launch.token)
    const events = []
    browser.rpc.observeEvents((event) => events.push(event))
    const webSnapshot = await browser.rpc.request("web.snapshot")
    assert.deepEqual({ ...webSnapshot, generated_at: "<timestamp>" }, {
      protocol: "web-v1", revision: "0", generated_at: "<timestamp>", pinned_workspace_ids: [], workspaces: [],
    })
    assert.ok(Number.isFinite(Date.parse(webSnapshot.generated_at)))
    const catalog = await browser.rpc.request("workspace-creation.catalog")
    assert.deepEqual(catalog.templates[0], { name: "full", repository_count: 1, command_count: 0, labels: [] })
    assert.equal(JSON.stringify(catalog).includes("local_path"), false)
    await browser.rpc.request("events.subscribe", { cursor: "0" })

    const request = { name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["app"] } }
    const first = await browser.rpc.request("operation.submit", { kind: "workspace.create", request }, { idempotencyKey: "create-demo" })
    const duplicate = await browser.rpc.request("operation.submit", { kind: "workspace.create", request }, { idempotencyKey: "create-demo" })
    assert.equal(first.operation_id, duplicate.operation_id)
    let operation = first
    while (operation.state === "accepted" || operation.state === "running") {
      await new Promise((resolve) => setTimeout(resolve, 10))
      operation = await browser.rpc.request("operation.get", { operation_id: first.operation_id })
    }
    assert.deepEqual(operation.result, { workspace_name: "demo", snapshot_changed: true })

    const notification = {
      version: 1, kind: "notification", id: "sig_1234567890123456", source: "automation",
      workspace_id: workspaceId, title: "Approval required", occurred_at: new Date().toISOString(),
    }
    await browser.rpc.request("signals.publish", notification)
    await waitFor(() => events.some((event) => event.type === "signal" && event.signal?.id === notification.id))
    assert.deepEqual((await browser.rpc.request("signals.list")).signals, [notification])
    await browser.rpc.request("signals.dismiss", { signal_id: notification.id })
    assert.deepEqual((await browser.rpc.request("signals.list")).dismissed, [notification.id])

    const descriptor = JSON.parse(await readFile(join(root, "descriptor.json"), "utf8"))
    const tui = await connect(descriptor, "tui", descriptor.tui_launch.token)
    await assert.rejects(tui.rpc.request("operation.get", { operation_id: first.operation_id }), (error) => error.code === "not_found")
    await tui.rpc.close("ownership verified")
    await browser.rpc.close("contract verified")
  } finally {
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
})
