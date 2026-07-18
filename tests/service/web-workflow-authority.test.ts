import { describe, expect, test } from "@test/api"

import {
  WEB_WORKSPACE_ACTION_IDS,
  WebFileStatusResponseSchema,
  WebNotesResponseSchema,
  WebPinsSchema,
  WebPrioritiesSchema,
  WebWorkspaceActionInventorySchema,
} from "../../packages/protocol/src/web"
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

function authorityWorkspaceId(index: number): string {
  return `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`
}

function authorityWorkspaces(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...workspace,
    workspace: {
      ...workspace.workspace,
      id: authorityWorkspaceId(index + 1),
      name: `workspace-${String(index + 1).padStart(2, "0")}`,
      branch: `feature/${index + 1}`,
      repositories: [],
      status: [],
    },
  }))
}

function snapshot(): SnapshotAdapter {
  return {
    buildAll: async () => [workspace],
    buildWorkspace: async () => workspace,
    buildCatalog: async () => ({ revision: "7", generated_at: generatedAt, workspaces: [workspace], archived_workspaces: [] }),
  }
}

function context(scopes: string[], principalId = "principal-a", mode = "browser") {
  return {
    sessionId: "session-a",
    principalId,
    targetId: "00000000-0000-4000-8000-000000000003",
    origin: "local",
    mode,
    scopes,
  } as never
}

function request(method: string, body: unknown, idempotencyKey?: string) {
  return { request_id: "request-a", method, body, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) } as never
}

describe("secure web workflow authority", () => {
  test("blocks browser access to rich core and snapshot methods while retaining trusted TUI access", async () => {
    const raw = {
      config: { workspace_root: "/private/root" },
      environment: { TOKEN: "credential-canary" },
    }
    const router = new SecureServiceRouter({
      snapshot: {
        ...snapshot(),
        buildAll: async () => [{ ...workspace, ...raw }] as never,
      },
      core: {
        build: async () => raw,
        notes: async () => [],
        editTarget: async () => ({ path: "/private/edit-target", environment: raw.environment }),
      } as never,
    })

    for (const [method, body] of [
      ["core.state", undefined],
      ["core.edit-target", { kind: "workspace", workspace: "demo" }],
      ["snapshot.all", undefined],
    ] as const) {
      await expect(router.request(context(["snapshot.read"]), request(method, body)))
        .rejects.toMatchObject({ code: "unauthorized" })
    }
    expect(await router.request(context(["snapshot.read"], "principal-a", "tui"), request("core.state", undefined))).toEqual(raw)
  })

  test("accepts complete seventeen-workspace pin and priority mutations while retaining authority checks", async () => {
    const rows = authorityWorkspaces(17)
    const ids = rows.map(({ workspace: entry }) => entry.id)
    const priorities = ids.map((workspace_id, index) => ({ workspace_id, priority: 17 - index }))
    const pinCalls: string[][] = []
    const priorityCalls: Array<Array<{ workspace_id: string; priority: number }>> = []
    const largeSnapshot: SnapshotAdapter = {
      buildAll: async () => rows,
      buildWorkspace: async () => rows[0]!,
      buildCatalog: async () => ({ revision: "7", generated_at: generatedAt, workspaces: rows, archived_workspaces: [] }),
    }
    const router = new SecureServiceRouter({
      snapshot: largeSnapshot,
      setWorkspacePins: async (value) => { pinCalls.push([...value]) },
      setWorkspacePriorities: async (value) => { priorityCalls.push(value.map((entry) => ({ ...entry }))) },
    })
    const pinBody = { workspace_ids: ids, expected_revision: "7" }
    const priorityBody = { priorities, expected_revision: "7" }

    expect(WebPinsSchema.parse(pinBody)).toEqual(pinBody)
    expect(WebPrioritiesSchema.parse(priorityBody)).toEqual(priorityBody)
    expect(await router.request(context(["operation.write"]), request("workspace.pins.set", pinBody))).toEqual({ workspace_ids: ids })
    expect(await router.request(context(["operation.write"]), request("workspace.priorities.set", priorityBody))).toEqual({ priorities })
    expect(pinCalls).toEqual([ids])
    expect(priorityCalls).toEqual([priorities])

    expect(WebPinsSchema.safeParse({ workspace_ids: [ids[0], ids[0]], expected_revision: "7" }).success).toBe(false)
    expect(WebPrioritiesSchema.safeParse({ priorities: [priorities[0], priorities[0]], expected_revision: "7" }).success).toBe(false)
    for (const [method, body] of [
      ["workspace.pins.set", { workspace_ids: [ids[0], ids[0]], expected_revision: "7" }],
      ["workspace.priorities.set", { priorities: [priorities[0], priorities[0]], expected_revision: "7" }],
    ] as const) {
      await expect(router.request(context(["operation.write"]), request(method, body)))
        .rejects.toMatchObject({ code: "invalid_request" })
    }
    for (const [method, body] of [
      ["workspace.pins.set", { workspace_ids: ids, expected_revision: "6" }],
      ["workspace.priorities.set", { priorities, expected_revision: "6" }],
    ] as const) {
      await expect(router.request(context(["operation.write"]), request(method, body)))
        .rejects.toMatchObject({ code: "conflict" })
    }
    const unknown = authorityWorkspaceId(99)
    for (const [method, body] of [
      ["workspace.pins.set", { workspace_ids: [...ids, unknown], expected_revision: "7" }],
      ["workspace.priorities.set", { priorities: [...priorities, { workspace_id: unknown, priority: 0 }], expected_revision: "7" }],
    ] as const) {
      await expect(router.request(context(["operation.write"]), request(method, body)))
        .rejects.toMatchObject({ code: "not_found" })
    }
    expect(pinCalls).toEqual([ids])
    expect(priorityCalls).toEqual([priorities])
  })

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
      operations: { workspaceActionState: () => ({ operations: [] }) } as never,
      mutations: Object.fromEntries(["workspace.rename", "workspace.open", "workspace.close", "workspace.sync", "workspace.pull", "workspace.push", "workspace.merge", "workspace.notes.add", "workspace.notes.clear"].map((name) => [name, () => ({ cancellation: "none", steps: [] })])) as never,
      setWorkspacePins: () => undefined,
      workspaceNotes: async () => ({ revision: "1", count: 0, records: [] }),
      workspaceFileStatus: async () => { throw new Error("unused") },
      workspaceLifecycle: { submit: async () => { throw new Error("unused") } } as never,
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

  test("uses only an exact web-snapshot-seeded core state and falls back on a revision miss", async () => {
    const coreState = {
      revision: "7", generated_at: generatedAt, config: {},
      workspaces: [{ definition: { id: workspaceId, name: "demo", schema_version: "1", created: generatedAt, branch: "demo", repos: [] }, projection: workspace.workspace }],
      archived_workspaces: [], templates: [], repositories: [],
    }
    let buildCalls = 0
    let seedCalls = 0
    const cached = new Map<string, typeof coreState>()
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      core: {
        build: async () => { buildCalls += 1; return coreState },
        seed: async (catalog) => { seedCalls += 1; cached.set(catalog.revision, coreState) },
        cached: async (revision) => cached.get(revision),
      } as never,
      operations: { workspaceActionState: () => ({ operations: [] }) } as never,
      workspaceLifecycle: { submit: async () => { throw new Error("unused") } } as never,
    })
    await router.request(context(["snapshot.read"]), request("web.snapshot"))
    expect(seedCalls).toBe(1)
    await router.request(context(["snapshot.read"]), request("workspace.actions", { workspace_id: workspaceId, expected_revision: "7" }))
    expect(buildCalls).toBe(0)
    await router.request(context(["snapshot.read"]), request("workspace.actions", { workspace_id: workspaceId, expected_revision: "6" }))
      .catch((error) => expect(error).toMatchObject({ code: "conflict" }))
    expect(buildCalls).toBe(1)
  })

  test("wires operation, removal, open-state, and capability authority into action derivation", async () => {
    const coreState = {
      revision: "7", generated_at: generatedAt, config: {},
      workspaces: [{ definition: { id: workspaceId, name: "demo", schema_version: "1", created: generatedAt, branch: "demo", repos: [] }, projection: workspace.workspace }],
      archived_workspaces: [], templates: [], repositories: [],
    }
    let active = true
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      core: { build: async () => coreState } as never,
      operations: {
        workspaceActionState: () => ({
          operations: active ? [{
            operation_id: "op_0123456789abcdef", workspace_id: workspaceId, action_id: "workspace.pull",
            state: "running", cancellation: { state: "available" },
          }] : [],
          removal: { revision: "7", details: { kind: "workspace_dirty", terminals_stopped: true, force_allowed: true, blocking_repositories: ["app"] } },
        }),
      } as never,
      mutations: {
        "workspace.pull": () => ({ cancellation: "none", steps: [] }),
        "workspace.open": () => ({ cancellation: "none", steps: [] }),
        "workspace.close": () => ({ cancellation: "none", steps: [] }),
      } as never,
      workspaceLifecycle: { submit: async () => { throw new Error("unused") } } as never,
      workspaceOpenState: () => "closed",
    })
    const inventory = WebWorkspaceActionInventorySchema.parse(await router.request(context(["snapshot.read"]), request("workspace.actions", {
      workspace_id: workspaceId, expected_revision: "7",
    })))
    expect(inventory.find(({ action_id }) => action_id === "operation.cancel")).toMatchObject({
      subject: { operation_id: "op_0123456789abcdef" }, availability: { available: true },
    })
    expect(inventory.find(({ action_id }) => action_id === "workspace.close")?.availability).toMatchObject({ reason: "operation_in_progress" })
    expect(inventory.find(({ action_id }) => action_id === "workspace.rename")?.availability).toMatchObject({ reason: "capability_unavailable" })
    active = false
    const idleInventory = WebWorkspaceActionInventorySchema.parse(await router.request(context(["snapshot.read"]), request("workspace.actions", {
      workspace_id: workspaceId, expected_revision: "7",
    })))
    expect(idleInventory.find(({ action_id }) => action_id === "workspace.open")?.availability).toEqual({ available: true })
    expect(idleInventory.find(({ action_id }) => action_id === "workspace.close")?.availability).toMatchObject({ reason: "workspace_closed" })
    expect(idleInventory.find(({ action_id }) => action_id === "workspace.force-remove")?.availability).toEqual({ available: true })
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

  test("strictly validates operation reads before consulting the registry", async () => {
    let reads = 0
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      operations: {
        getForClient: () => {
          reads += 1
          return { operation_id: "op_0123456789abcdef", state: "accepted", accepted_at: generatedAt }
        },
        webContextForClient: () => ({ actionId: "workspace.pull", workspaceId, workspaceName: "demo", expectedRevision: "7" }),
        cancellationView: () => ({ state: "available" }),
      } as never,
    })
    const valid = { operation_id: "op_0123456789abcdef" }
    expect(await router.request(context(["snapshot.read"]), request("operation.get", valid)))
      .toMatchObject({ operation_id: valid.operation_id, action_id: "workspace.pull", workspace_id: workspaceId, workspace_name: "demo" })
    for (const body of [
      { ...valid, path: "/private/canary" },
      { operation_id: "malformed" },
      {},
    ]) {
      await expect(router.request(context(["snapshot.read"]), request("operation.get", body)))
        .rejects.toMatchObject({ code: "invalid_request" })
    }
    expect(reads).toBe(1)
  })

  test("maps stable-ID browser rename through the strict operation route", async () => {
    const calls: unknown[] = []
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      operations: {
        submit: async (input: unknown) => {
          calls.push(input)
          return { operation_id: "op_0123456789abcdef", state: "accepted", accepted_at: generatedAt }
        },
        cancellationView: () => ({ state: "unavailable", reason: "not-cancellable" }),
      } as never,
      mutations: {
        "workspace.rename": (input: unknown) => {
          calls.push(input)
          return { cancellation: "none", steps: [] }
        },
      },
    })
    const result = await router.request(context(["operation.write"]), request("operation.submit", {
      kind: "workspace.rename",
      request: { workspace_id: workspaceId, expected_revision: "7", new_name: "renamed-demo" },
    }, "rename-key"))
    expect(calls[0]).toEqual({ workspace: "demo", new_name: "renamed-demo", options: {} })
    expect(calls[1]).toMatchObject({
      endpoint: "workspace.rename",
      webContext: { actionId: "workspace.rename", workspaceId, workspaceName: "demo", expectedRevision: "7" },
    })
    expect(result).toMatchObject({ action_id: "workspace.rename", workspace_id: workspaceId, workspace_name: "demo" })
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

  test("maps thrown forge authority failures to fixed safe transport errors", async () => {
    const canary = "/private/provider TOKEN=credential-canary"
    const resolveRouter = new SecureServiceRouter({
      snapshot: snapshot(),
      forgeSourceReview: { resolve: async () => { throw new Error(canary) } },
    })
    const body = { url: "https://github.com/acme/api/pull/42" }
    await expect(resolveRouter.request(context(["operation.write"]), request("forge.source.resolve", body)))
      .rejects.toMatchObject({ code: "operation_failed", message: "Forge source could not be resolved" })

    const token = `review_${"a".repeat(43)}`
    const submitRouter = new SecureServiceRouter({
      snapshot: snapshot(),
      operations: { submit: async () => { throw new Error("must not register") } } as never,
      forgeSourceReview: {
        resolve: async () => { throw new Error("unused") },
        admit: async () => { throw new Error(canary) },
      },
    })
    await expect(submitRouter.request(context(["operation.write"]), request("operation.submit", {
      kind: "workspace.create.reviewed",
      request: {
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
      },
    }, "review-key"))).rejects.toMatchObject({
      code: "operation_failed",
      message: "Reviewed workspace creation could not be prepared",
    })
  })

  test("serializes only typed forge recovery details for reviewed admission failures", async () => {
    const token = `review_${"a".repeat(43)}`
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      operations: {} as never,
      forgeSourceReview: {
        resolve: async () => { throw new Error("unused") },
        admit: async () => ({
          ok: false as const,
          failure: {
            code: "source_changed" as const,
            recovery: "resolve_again" as const,
            message: "The provider source changed after review. Resolve the change again.",
            details: { kind: "provider" as const, provider: "github" as const },
          },
        }),
      },
    })
    const pending = router.request(context(["operation.write"]), request("operation.submit", {
      kind: "workspace.create.reviewed",
      request: {
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
      },
    }, "review-key"))
    await expect(pending).rejects.toMatchObject({
      code: "conflict",
      details: {
        kind: "forge_failure",
        reason: "source_changed",
        recovery: "resolve_again",
        context: { kind: "provider", provider: "github" },
      },
    })
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
