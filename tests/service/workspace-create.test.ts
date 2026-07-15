import { afterEach, describe, expect, test } from "@test/api"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { provisionOfficialClient } from "../../packages/service/src/policy/credentials"
import { OperationRegistry } from "../../packages/service/src/policy/operations"
import { CLIENT_MODEL_LIMITS } from "../../packages/protocol/src/service"
import { startServiceServer } from "../../packages/service/src/server"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("workspace creation transport", () => {
  test("authenticates the path-free catalog and accepts idempotent creation", async () => {
    const serviceRoot = join(tmpdir(), `git-stacks-create-${crypto.randomUUID()}`)
    roots.push(serviceRoot)
    const credential = provisionOfficialClient("workspace-create-test", { serviceRoot })
    let sequence = 0
    const operations = new OperationRegistry({ root: serviceRoot, publishOperationEvent: async (operation) => ({ protocol: "v1", type: "operation", sequence: String(++sequence), timestamp: new Date().toISOString(), operation }), schedule: (run) => run() })
    const service = await startServiceServer({
      serviceRoot, operations,
      snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } },
      workspaceCreationCatalog: () => ({ templates: [{ name: "full", repository_count: 1, command_count: 0, labels: [] }], repositories: [{ name: "app", type: "typescript", default_branch: "main" }], client_model: CLIENT_MODEL_LIMITS }),
      workspaceCreate: (request) => ({ steps: [{ name: "workspace.create", stage: "executing", message: "Creating", run: async (report) => { await report({ message: "Created" }) } }], result: { workspace_name: request.name, snapshot_changed: true } }),
    })
    try {
      expect((await fetch(new URL("/v1/workspace-creation/catalog", service.url))).status).toBe(401)
      const headers = { authorization: `Bearer ${credential.token}` }
      const catalog = await (await fetch(new URL("/v1/workspace-creation/catalog", service.url), { headers })).json()
      expect(catalog.data.templates[0]).toEqual({ name: "full", repository_count: 1, command_count: 0, labels: [] })
      expect(JSON.stringify(catalog)).not.toContain("local_path")

      const request = { name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["app"] } }
      const create = () => fetch(new URL("/v1/operations/workspace.create", service.url), { method: "POST", headers: { ...headers, "content-type": "application/json", "idempotency-key": "create-demo" }, body: JSON.stringify(request) })
      const first = await (await create()).json()
      const duplicate = await (await create()).json()
      expect(first.data.operation_id).toBe(duplicate.data.operation_id)
      await operations.wait(first.data.operation_id)
      expect(operations.get(first.data.operation_id)).toMatchObject({ state: "succeeded", result: { workspace_name: "demo", snapshot_changed: true } })
    } finally { await service.stop() }
  })
})
