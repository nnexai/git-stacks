import { afterEach, describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { provisionOfficialClient } from "../../packages/service/src/policy/credentials"
import { OperationRegistry } from "../../packages/service/src/policy/operations"
import { startServiceServer } from "../../packages/service/src/server"
import { makeDashboardCoreState } from "../helpers"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("first-party core API", () => {
  test("serves one trusted read model and validates typed mutation requests", async () => {
    const root = join(tmpdir(), `git-stacks-core-api-${crypto.randomUUID()}`)
    roots.push(root)
    const credential = provisionOfficialClient("core-api-test", { serviceRoot: root })
    let sequence = 0
    const operations = new OperationRegistry({
      root,
      publishOperationEvent: async (operation) => ({ protocol: "v1", type: "operation", sequence: String(++sequence), timestamp: new Date().toISOString(), operation }),
      schedule: (run) => run(),
    })
    const state = makeDashboardCoreState([], [], [])
    const service = await startServiceServer({
      serviceRoot: root,
      operations,
      snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } },
      core: {
        build: async () => state,
        editTarget: () => ({ kind: "registry", path: "/tmp/registry.yml" }),
        notes: async () => [],
      },
      eventCursor: async () => "7",
      workspaceFileStatus: async () => ({
        workspace: { scope: "workspace", name: "demo", root: "/tmp/demo", entries: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [] },
        repos: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [],
      }),
      mutations: {
        "workspace.rename": (request) => ({ steps: [{ name: "workspace.rename", stage: "executing", message: "rename", run: async () => {} }], result: { workspace: request.new_name } }),
      },
    })
    try {
      expect((await fetch(new URL("/v1/core", service.url))).status).toBe(401)
      const headers = { authorization: `Bearer ${credential.token}`, "content-type": "application/json", "idempotency-key": "rename-demo" }
      const core = await (await fetch(new URL("/v1/core", service.url), { headers })).json()
      expect(core.data).toEqual(state)
      expect(await (await fetch(new URL("/v1/events/cursor", service.url), { headers })).json()).toMatchObject({ data: { cursor: "7" } })

      const invalid = await fetch(new URL("/v1/operations/workspace.rename", service.url), {
        method: "POST", headers, body: JSON.stringify({ workspace: "demo" }),
      })
      expect(invalid.status).toBe(400)

      const valid = await fetch(new URL("/v1/operations/workspace.rename", service.url), {
        method: "POST", headers: { ...headers, "idempotency-key": "rename-demo-valid" },
        body: JSON.stringify({ workspace: "demo", new_name: "renamed", options: {} }),
      })
      expect(valid.status).toBe(202)
      const accepted = await valid.json()
      await operations.wait(accepted.data.operation_id)
      expect(operations.get(accepted.data.operation_id)).toMatchObject({ state: "succeeded", result: { workspace: "renamed" } })
    } finally { await service.stop() }
  })
})
