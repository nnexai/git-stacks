import { describe, expect, test } from "@test/api"

import { WEB_WORKSPACE_ACTION_IDS, WebFileStatusResponseSchema, WebNotesResponseSchema, WebWorkspaceActionInventorySchema } from "../../packages/protocol/src/web"
import { SecureServiceRouter } from "../../packages/service/src/secure/router"
import type { SnapshotAdapter } from "../../packages/service/src/snapshot-adapter"

const workspaceId = "00000000-0000-4000-8000-000000000001"
const repositoryId = "00000000-0000-4000-8000-000000000002"
const generatedAt = "2026-07-16T12:00:00.000Z"

const workspace = {
  protocol: "v1" as const,
  request_id: "req_0123456789abcdef",
  ok: true as const,
  revision: "7",
  generated_at: generatedAt,
  workspace: {
    id: workspaceId,
    name: "demo",
    activity_at: generatedAt,
    branch: "demo",
    repositories: [{ id: repositoryId, name: "app", mode: "worktree" as const, path: "/private/app" }],
    launch: { commands: [], environment: {}, redacted: [], references: {}, named: [] },
    status: [{
      repository_id: repositoryId, name: "app", exists: true, dirty: false, branch: "demo", default_branch: "main",
      mode: "worktree" as const, ahead: 0, behind: 1, additions: 0, removals: 0, remote: "available" as const, degraded: false,
    }],
  },
}

function snapshot(): SnapshotAdapter {
  return {
    buildAll: async () => [workspace],
    buildWorkspace: async () => workspace,
    buildCatalog: async () => ({ revision: "7", generated_at: generatedAt, workspaces: [workspace], archived_workspaces: [] }),
  }
}

function context(scopes: string[], principalId = "principal-a") {
  return {
    sessionId: "session-a",
    principalId,
    targetId: "00000000-0000-4000-8000-000000000003",
    origin: "local",
    mode: "browser",
    scopes,
  } as never
}

function request(method: string, body: unknown, idempotencyKey?: string) {
  return { request_id: "request-a", method, body, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) } as never
}

describe("secure web workflow authority", () => {
  test("exposes a complete service-derived action inventory under snapshot scope", async () => {
    const coreState = {
      revision: "7",
      generated_at: generatedAt,
      config: {},
      workspaces: [{ definition: { id: workspaceId, name: "demo", schema_version: "1", created: generatedAt, branch: "demo", repos: [] }, projection: workspace.workspace }],
      archived_workspaces: [],
      templates: [],
      repositories: [],
    }
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      core: { build: async () => coreState, notes: async () => [], editTarget: () => { throw new Error("unused") } } as never,
    })
    const result = await router.request(context(["snapshot.read"]), request("workspace.actions", {
      workspace_id: workspaceId,
      expected_revision: "7",
    }))
    const parsed = WebWorkspaceActionInventorySchema.parse(result)
    expect(parsed.map(({ action_id }) => action_id)).toEqual(WEB_WORKSPACE_ACTION_IDS.filter((id) => id !== "operation.cancel"))
    expect(parsed.find(({ action_id }) => action_id === "workspace.pull")?.availability).toEqual({ available: true })
    await expect(router.request(context([]), request("workspace.actions", { workspace_id: workspaceId, expected_revision: "7" })))
      .rejects.toMatchObject({ code: "unauthorized" })
  })

  test("resolves stable IDs for bounded note and path-free file reads", async () => {
    let notesCalls = 0
    let fileCalls = 0
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      workspaceNotes: async (name, limit) => {
        notesCalls += 1
        expect([name, limit]).toEqual(["demo", 50])
        return { revision: "4", count: 1, records: [{ text: "remember", created: generatedAt }] }
      },
      workspaceFileStatus: async (name) => {
        fileCalls += 1
        expect(name).toBe("demo")
        return {
          workspace: { scope: "workspace", name: "demo", root: "/private/root", entries: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [] },
          repos: [],
          summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} },
          warnings: [], errors: [],
        }
      },
    })
    const body = { workspace_id: workspaceId, expected_revision: "7" }
    expect(WebNotesResponseSchema.parse(await router.request(context(["snapshot.read"]), request("workspace.notes.list", body)))).toMatchObject({
      workspace_id: workspaceId, revision: "7", notes_revision: "4", count: 1,
    })
    expect(WebFileStatusResponseSchema.parse(await router.request(context(["snapshot.read"]), request("workspace.files.inspect", body)))).toMatchObject({
      workspace_id: workspaceId, revision: "7",
    })
    expect([notesCalls, fileCalls]).toEqual([1, 1])

    for (const method of ["workspace.notes.list", "workspace.files.inspect"]) {
      await expect(router.request(context(["snapshot.read"]), request(method, { ...body, path: "/private/canary" })))
        .rejects.toMatchObject({ code: "invalid_request" })
    }
    expect([notesCalls, fileCalls]).toEqual([1, 1])
  })

  test("maps note mutations to service-owned names without dropping revisioned intent", async () => {
    const calls: unknown[] = []
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      operations: {
        submit: async (input: unknown) => {
          calls.push(input)
          return { operation_id: "op_0123456789abcdef", state: "accepted", accepted_at: generatedAt }
        },
      } as never,
      mutations: {
        "workspace.notes.add": (input: unknown) => {
          calls.push(input)
          return { cancellation: "none", steps: [] }
        },
      },
    })
    await router.request(context(["operation.write"]), request("operation.submit", {
      kind: "workspace.notes.add",
      request: { workspace_id: workspaceId, expected_revision: "7", expected_notes_revision: "4", text: "remember" },
    }, "note-key"))
    expect(calls[0]).toEqual({ workspace: "demo", expected_notes_revision: "4", text: "remember" })
    expect(calls[1]).toMatchObject({ clientId: "principal-a", endpoint: "workspace.notes.add", idempotencyKey: "note-key" })
  })

  test("validates cancellation bodies and ownership before invoking the registry", async () => {
    let cancelCalls = 0
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      operations: {
        getForClient: (id: string, principal: string) => principal === "principal-a" && id === "op_0123456789abcdef"
          ? { operation_id: id, state: "running", accepted_at: generatedAt, started_at: generatedAt, progress: { stage: "executing" } }
          : undefined,
        cancel: async () => {
          cancelCalls += 1
          return { operation_id: "op_0123456789abcdef", outcome: "requested", operation_state: "running" }
        },
      } as never,
    })
    const body = { operation_id: "op_0123456789abcdef" }
    expect(await router.request(context(["operation.write"]), request("operation.cancel", body))).toEqual({
      operation_id: body.operation_id, outcome: "requested", operation_state: "running",
    })
    await expect(router.request(context(["operation.write"]), request("operation.cancel", { ...body, rollback: true })))
      .rejects.toMatchObject({ code: "invalid_request" })
    await expect(router.request(context(["operation.write"], "principal-b"), request("operation.cancel", body)))
      .rejects.toMatchObject({ code: "not_found" })
    expect(cancelCalls).toBe(1)
  })

  test("binds forge resolution to the authenticated principal and operation scope", async () => {
    const calls: unknown[] = []
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      forgeSourceReview: {
        resolve: async (input) => {
          calls.push(input)
          return { resolved: false, failure: { code: "change_not_found", recovery: "change_source", message: "The change could not be found with the current account." } }
        },
      },
    })
    const body = { url: "https://github.com/acme/api/pull/42" }
    await router.request(context(["operation.write"]), request("forge.source.resolve", body))
    expect(calls).toEqual([{ principalId: "principal-a", url: body.url }])
    await expect(router.request(context(["snapshot.read"]), request("forge.source.resolve", body)))
      .rejects.toMatchObject({ code: "unauthorized" })
    await expect(router.request(context(["operation.write"]), request("forge.source.resolve", { ...body, token: "secret" })))
      .rejects.toMatchObject({ code: "invalid_request" })
    expect(calls).toHaveLength(1)
  })

  test("admits reviewed creation for the authenticated principal and cleans up rejected registration", async () => {
    const token = `review_${"a".repeat(43)}`
    const reviewed = {
      token,
      expected_revision: "7",
      draft: {
        workspace_name: "api-pr-42",
        template_name: "review",
        matched_source_repository_id: repositoryId,
        repositories: [{
          repository_id: repositoryId,
          included: true,
          branch: { base_branch: "main", workspace_branch: "feature-topic" },
        }],
      },
    }
    const calls: unknown[] = []
    let cleanupCalls = 0
    const execution = { cancellation: "none" as const, steps: [] }
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      forgeSourceReview: {
        resolve: async () => { throw new Error("unused") },
        admit: async (input) => {
          calls.push(input)
          return { ok: true as const, execution, cleanup: async () => { cleanupCalls += 1 } }
        },
      },
      operations: {
        submit: async (input: unknown) => {
          calls.push(input)
          throw Object.assign(new Error("duplicate"), { code: "idempotency_conflict" })
        },
      } as never,
    })

    await expect(router.request(context(["operation.write"]), request("operation.submit", {
      kind: "workspace.create.reviewed",
      request: reviewed,
    }, "review-key"))).rejects.toMatchObject({ code: "idempotency_conflict" })
    expect(calls[0]).toEqual({
      principalId: "principal-a",
      token,
      expectedRevision: "7",
      draft: reviewed.draft,
      idempotencyKey: "review-key",
    })
    expect(calls[1]).toMatchObject({
      clientId: "principal-a",
      endpoint: "workspace.create.reviewed",
      idempotencyKey: "review-key",
      request: reviewed,
      execution,
    })
    expect(cleanupCalls).toBe(1)
  })
})
