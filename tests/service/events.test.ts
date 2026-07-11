import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendMessage } from "../../src/lib/messages"
import { MESSAGES_DIR } from "../../src/lib/paths"
import { readOfficialClientCredential } from "../../src/lib/service/credentials"
import { startManagedService } from "../../src/service/main"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
function snapshot(revision = "7") {
  return {
    buildAll: async () => [],
    buildWorkspace: async (name: string) => ({ workspace: { id: workspaceId, name } }),
    currentRevision: async () => revision,
  }
}

describe("v1 event transport", () => {
  test("uses the documented SSE admission constants", async () => {
    const server = await import("../../src/service/server")
    expect(server.SSE_HEARTBEAT_MS).toBe(15_000)
    expect(server.SSE_MAX_PER_CREDENTIAL).toBe(8)
    expect(server.SSE_MAX_TOTAL).toBe(32)
  })

  test("managed attention publication is durable and available over authenticated SSE", async () => {
    const root = join(tmpdir(), `git-stacks-events-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const service = await startManagedService({ serviceRoot: root, clientId: "events-client", snapshot: snapshot() as never })
    cleanup.push(() => service.stop())

    mkdirSync(MESSAGES_DIR, { recursive: true })
    cleanup.push(() => rmSync(join(MESSAGES_DIR, "events-workspace.jsonl"), { force: true }))
    await appendMessage("events-workspace", "needs attention")
    const records = readFileSync(join(root, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line))
    expect(records).toMatchObject([{ sequence: "1", type: "attention", attention: { workspace_id: workspaceId, message: "needs attention" } }])

    const credential = readOfficialClientCredential("events-client", { serviceRoot: root })!
    const response = await fetch(new URL("/v1/events?cursor=0", service.descriptor.endpoint), { headers: { authorization: `Bearer ${credential.token}` } })
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const first = await reader.read()
    await reader.cancel()
    expect(new TextDecoder().decode(first.value)).toContain('"type":"attention"')
  })

  test("managed replay gaps expose the authoritative snapshot revision", async () => {
    const root = join(tmpdir(), `git-stacks-gap-${crypto.randomUUID()}`)
    mkdirSync(root, { recursive: true })
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    writeFileSync(join(root, "events.jsonl"), `${JSON.stringify({ protocol: "v1", sequence: "2", timestamp: new Date().toISOString(), type: "attention", attention: { workspace_id: workspaceId, code: "message", message: "retained" } })}\n`)
    const service = await startManagedService({ serviceRoot: root, clientId: "gap-client", snapshot: snapshot("7") as never })
    cleanup.push(() => service.stop())
    const credential = readOfficialClientCredential("gap-client", { serviceRoot: root })!

    const response = await fetch(new URL("/v1/events?cursor=0", service.descriptor.endpoint), { headers: { authorization: `Bearer ${credential.token}` } })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "replay_gap", details: { snapshot_revision: "7" } } })
  })
})
