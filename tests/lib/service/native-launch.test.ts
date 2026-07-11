import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { provisionOfficialClient } from "../../../src/lib/service/credentials"
import { startServiceServer } from "../../../src/service/server"

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe("native launch resolution", () => {
  test("authenticates, validates, and never returns a launch on resolution failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "git-stacks-launch-")); roots.push(root)
    const credential = provisionOfficialClient("native-test", { serviceRoot: root })
    const snapshot = {
      buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") },
      resolveNativeLaunch: async () => ({ resolved: false as const, error: { code: "conflict" as const, message: "stale" } }),
    }
    const service = startServiceServer({ serviceRoot: root, snapshot })
    const body = { workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", expected_revision: "7" }
    expect((await fetch(new URL("/v1/native-launch", service.url), { method: "POST", body: JSON.stringify(body) })).status).toBe(401)
    const response = await fetch(new URL("/v1/native-launch", service.url), { method: "POST", headers: { authorization: `Bearer ${credential.token}` }, body: JSON.stringify(body) })
    expect(response.status).toBe(409)
    const json = await response.json() as Record<string, unknown>
    expect(JSON.stringify(json)).not.toContain("launch")
    await service.stop()
  })
})
