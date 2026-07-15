import { afterEach, describe, expect, test } from "@test/api"
import { runProcess } from "../process"
import { readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readOfficialClientCredential } from "../../packages/service/src/policy/credentials"
import { startManagedService } from "../../packages/service/src/main"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const repositoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const surfaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const snapshot = () => ({ buildAll: async () => [{ workspace: { id: workspaceId, name: "alpha" } }], buildWorkspace: async () => ({ workspace: { id: workspaceId, name: "alpha" } }), currentRevision: async () => "7" })

describe("v1 signal event transport", () => {
  test("publishes, projects, dismisses, and replays one authenticated signal contract", async () => {
    const root = join(tmpdir(), `git-stacks-signals-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const service = await startManagedService({ serviceRoot: root, clientId: "events-client", snapshot: snapshot() as never })
    cleanup.push(() => service.stop())
    const credential = readOfficialClientCredential("events-client", { serviceRoot: root })!
    const headers = { authorization: `Bearer ${credential.token}`, "content-type": "application/json" }
    const notification = { version: 1, kind: "notification", id: "sig_1234567890123456", source: "automation", workspace_id: workspaceId, title: "Approval required", occurred_at: new Date().toISOString() }
    expect((await fetch(new URL("/v1/signals", service.descriptor.endpoint), { method: "POST", headers, body: JSON.stringify(notification) })).status).toBe(202)
    const projection = await (await fetch(new URL("/v1/signals", service.descriptor.endpoint), { headers })).json() as any
    expect(projection.data.signals).toEqual([notification])
    expect((await fetch(new URL("/v1/signals/dismiss", service.descriptor.endpoint), { method: "POST", headers, body: JSON.stringify({ kind: "dismiss_signal", signal_id: notification.id }) })).status).toBe(202)
    const dismissed = await (await fetch(new URL("/v1/signals", service.descriptor.endpoint), { headers })).json() as any
    expect(dismissed.data.dismissed).toEqual([notification.id])
    const records = readFileSync(join(root, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line))
    expect(records.map((record) => record.type)).toEqual(["signal", "signal"])
  })

  test("service projection coalesces one activity identity even when ingress changes its id", async () => {
    const root = join(tmpdir(), `git-stacks-signal-coalescing-${crypto.randomUUID()}`)
    const service = await startManagedService({ serviceRoot: root })
    const credential = readOfficialClientCredential(service.descriptor.credential_lookup, { serviceRoot: root })!
    const headers = { authorization: `Bearer ${credential.token}`, "content-type": "application/json" }
    const activity = { version: 1, kind: "activity", id: "sig_0123456789abcdef", state: "working", source: "codex", workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", surface_id: "018f47f4-5ab1-7c2d-8e90-abcdef012346", session_id: "session-a", occurred_at: "2026-07-13T00:00:00.000Z" }
    expect((await fetch(new URL("/v1/signals", service.descriptor.endpoint), { method: "POST", headers, body: JSON.stringify(activity) })).status).toBe(202)
    expect((await fetch(new URL("/v1/signals", service.descriptor.endpoint), { method: "POST", headers, body: JSON.stringify({ ...activity, id: "sig_1123456789abcdef", state: "completed" }) })).status).toBe(202)
    const projection = await (await fetch(new URL("/v1/signals", service.descriptor.endpoint), { headers })).json() as any
    expect(projection.data.signals).toHaveLength(1)
    expect(projection.data.signals[0]).toMatchObject({ id: "sig_1123456789abcdef", state: "completed" })
    expect((await fetch(new URL("/v1/signals/dismiss", service.descriptor.endpoint), { method: "POST", headers, body: JSON.stringify({ kind: "dismiss_signal", signal_id: "sig_1123456789abcdef" }) })).status).toBe(202)
    const dismissed = await (await fetch(new URL("/v1/signals", service.descriptor.endpoint), { headers })).json() as any
    expect(dismissed.data.dismissed).toEqual(["sig_1123456789abcdef"])
    await service.stop()
  })

  test("CLI activity publication carries exact surface and stable provider session identity", async () => {
    const configRoot = join(tmpdir(), `git-stacks-hook-signal-${crypto.randomUUID()}`)
    const root = join(configRoot, "service")
    cleanup.push(() => rmSync(configRoot, { recursive: true, force: true }))
    const service = await startManagedService({ serviceRoot: root, snapshot: snapshot() as never })
    cleanup.push(() => service.stop())
    const child = runProcess(["node", join(import.meta.dirname, "../../packages/cli/dist/index.js"), "service", "signal", "publish", "--state", "completed", "--source", "copilot", "--workspace", "alpha", "--repository-id", repositoryId, "--surface-id", surfaceId, "--session-id", "copilot-session"], { cwd: join(import.meta.dirname, "../.."), env: { ...process.env, GIT_STACKS_CONFIG_DIR: configRoot }, stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    const record = JSON.parse(readFileSync(join(root, "events.jsonl"), "utf8").trim())
    expect(record).toMatchObject({ type: "signal", signal: { kind: "activity", source: "copilot", state: "completed", repository_id: repositoryId, surface_id: surfaceId, session_id: "copilot-session" } })
  })
})
