import { afterEach, describe, expect, test } from "@test/api"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { WorkspaceCatalog, WorkspaceLifecycleMutation } from "../../../packages/protocol/src/service"
import { OperationRegistry } from "../../../packages/service/src/policy/operations"
import { createWorkspaceLifecycleAdmission } from "../../../packages/service/src/policy/workspace-lifecycle-admission"
import {
  WorkspaceLifecycleError,
  createWorkspaceLifecycleCoordinator,
  type WorkspaceLifecycleCoordinatorOptions,
} from "../../../packages/service/src/policy/workspace-lifecycle"

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111"
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222"
const roots: string[] = []

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

async function operationRoot(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "git-stacks-lifecycle-operations-"))
  roots.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

type Target = { id: string; name: string; archived: boolean }

function catalog(revision: string, targets: Target[]): WorkspaceCatalog {
  return {
    revision,
    generated_at: "2026-07-16T08:00:00.000Z",
    workspaces: targets.filter((target) => !target.archived).map((target) => ({
      revision,
      workspace: { id: target.id, name: target.name },
    })) as WorkspaceCatalog["workspaces"],
    archived_workspaces: targets.filter((target) => target.archived).map((target) => ({
      id: target.id,
      name: target.name,
      activity_at: "2026-07-16T08:00:00.000Z",
    })),
  } as WorkspaceCatalog
}

function mutation(kind: WorkspaceLifecycleMutation["kind"], workspaceId = WORKSPACE_A, expectedRevision = "1", confirmationName?: string): WorkspaceLifecycleMutation {
  return kind === "workspace.force-remove"
    ? { kind, workspace_id: workspaceId, expected_revision: expectedRevision, confirmation_name: confirmationName ?? "alpha" }
    : { kind, workspace_id: workspaceId, expected_revision: expectedRevision }
}

function harness(overrides: Partial<WorkspaceLifecycleCoordinatorOptions> = {}) {
  const calls: string[] = []
  let revision = "1"
  const targets: Target[] = [
    { id: WORKSPACE_A, name: "alpha", archived: false },
    { id: WORKSPACE_B, name: "beta", archived: false },
  ]
  const options: WorkspaceLifecycleCoordinatorOptions = {
    admission: {
      async acquire(id) {
        calls.push(`acquire:${id}`)
        return { workspaceId: id, release: () => { calls.push(`release:${id}`) } }
      },
      admitTerminal(id) { return { workspaceId: id, release() {} } },
    },
    terminals: {
      async closeWorkspace(id) {
        calls.push(`terminals:${id}`)
        return { ok: true, status: "closed", requested: 1, closed: 1, failed: 0 }
      },
    },
    snapshot: {
      async buildAll() { return [] },
      async buildWorkspace() { throw new Error("unused") },
      async buildCatalog() {
        calls.push(`catalog:${revision}`)
        return catalog(revision, targets)
      },
    },
    archiveWorkspace(name) {
      calls.push(`archive:${name}`)
      const target = targets.find((entry) => entry.name === name)!
      target.archived = true
      revision = String(Number(revision) + 1)
      return {} as never
    },
    unarchiveWorkspace(name) {
      calls.push(`unarchive:${name}`)
      const target = targets.find((entry) => entry.name === name)!
      target.archived = false
      revision = String(Number(revision) + 1)
      return {} as never
    },
    async inspectWorkspaceRemoval(name) {
      calls.push(`inspect:${name}`)
      return { ok: true, plan: { name } as never }
    },
    async commitWorkspaceRemoval(_plan, options) {
      calls.push(`commit:${options.allow_dirty === true ? "dirty" : "clean"}`)
      await options.onPhase?.("removing_worktrees")
      await options.onPhase?.("deleting_workspace_files")
      const index = targets.findIndex((entry) => entry.id === WORKSPACE_A)
      if (index >= 0) targets.splice(index, 1)
      revision = String(Number(revision) + 1)
      return { ok: true }
    },
    clock: () => new Date("2026-07-16T08:00:00.000Z"),
    ...overrides,
  }
  return { calls, targets, options, coordinator: createWorkspaceLifecycleCoordinator(options), revision: () => revision, setRevision: (value: string) => { revision = value } }
}

async function runExecution(coordinator: ReturnType<typeof createWorkspaceLifecycleCoordinator>, request: WorkspaceLifecycleMutation) {
  const execution = coordinator.execution(request)
  const phases: string[] = []
  await execution.steps[0]!.run((progress) => {
    const phase = progress.data?.lifecycle_phase
    if (typeof phase === "string") phases.push(phase)
  })
  return { execution, phases }
}

describe("service workspace lifecycle coordinator", () => {
  test("PHASE123_RED service lifecycle coordinator contract", async () => {
    const state = harness()
    const { execution, phases } = await runExecution(state.coordinator, mutation("workspace.archive"))

    expect(phases).toEqual(["stopping_terminals", "reconciling_state"])
    expect(execution.result).toEqual({ workspace_name: "alpha", snapshot_changed: true, revision: "2", terminals_stopped: true })
    expect(state.calls).toEqual([
      `acquire:${WORKSPACE_A}`,
      "catalog:1",
      `terminals:${WORKSPACE_A}`,
      "archive:alpha",
      "catalog:2",
      `release:${WORKSPACE_A}`,
    ])
  })

  test("aborts before archive or inspection when terminal exit is unconfirmed", async () => {
    const state = harness({ terminals: { async closeWorkspace() { state.calls.push("terminals:failed"); return { ok: false, status: "cleanup_failed", requested: 1, closed: 0, failed: 1 } } } })

    await expect(runExecution(state.coordinator, mutation("workspace.archive"))).rejects.toMatchObject({
      code: "operation_failed",
      details: { kind: "terminal_cleanup_failed", terminals_stopped: false, force_allowed: false },
    })
    expect(state.calls).not.toContain("archive:alpha")
    expect(state.calls.some((call) => call.startsWith("inspect:"))).toBe(false)
    expect(state.calls.some((call) => call.startsWith("commit:"))).toBe(false)
  })

  test("checks revision under the lease and converges only an already-satisfied same-ID archive transition", async () => {
    const state = harness()
    state.targets[0]!.archived = true
    state.setRevision("2")

    const converged = await runExecution(state.coordinator, mutation("workspace.archive", WORKSPACE_A, "1"))
    expect(converged.execution.result).toMatchObject({ workspace_name: "alpha", revision: "2", terminals_stopped: true })
    expect(converged.phases).toEqual(["stopping_terminals"])
    expect(state.calls).toContain(`terminals:${WORKSPACE_A}`)
    expect(state.calls).not.toContain("archive:alpha")

    await expect(runExecution(state.coordinator, mutation("workspace.remove", WORKSPACE_A, "1"))).rejects.toMatchObject({ code: "conflict" })
    expect(state.calls.some((call) => call.startsWith("inspect:"))).toBe(false)
    expect(state.calls.some((call) => call.startsWith("commit:"))).toBe(false)
  })

  test("keeps an already-archived definition unchanged when terminal shutdown cannot be confirmed", async () => {
    const state = harness({
      terminals: {
        async closeWorkspace(id) {
          state.calls.push(`terminals:failed:${id}`)
          return { ok: false, status: "cleanup_failed", requested: 1, closed: 0, failed: 1 }
        },
      },
    })
    state.targets[0]!.archived = true
    state.setRevision("2")

    await expect(runExecution(state.coordinator, mutation("workspace.archive", WORKSPACE_A, "1"))).rejects.toMatchObject({
      code: "operation_failed",
      details: { kind: "terminal_cleanup_failed", terminals_stopped: false, force_allowed: false },
    })
    expect(state.calls).toContain(`terminals:failed:${WORKSPACE_A}`)
    expect(state.calls).not.toContain("archive:alpha")
    expect(state.revision()).toBe("2")
    expect(state.targets[0]).toMatchObject({ id: WORKSPACE_A, archived: true })
  })

  test("carries the catalog stable ID into archive and removal core boundaries", async () => {
    const expectedIds: string[] = []
    const state = harness({
      archiveWorkspace(name, options) {
        expectedIds.push(`archive:${options?.expectedId}`)
        state.targets.find((entry) => entry.name === name)!.archived = true
        state.setRevision("2")
        return {} as never
      },
      async inspectWorkspaceRemoval(name, options) {
        expectedIds.push(`remove:${options?.expectedId}`)
        return { ok: true, plan: { name } as never }
      },
    })

    await runExecution(state.coordinator, mutation("workspace.archive"))
    state.targets[0]!.archived = false
    state.setRevision("1")
    await runExecution(state.coordinator, mutation("workspace.remove"))

    expect(expectedIds).toEqual([`archive:${WORKSPACE_A}`, `remove:${WORKSPACE_A}`])
  })

  test("reports a stable-definition conflict without reconciling it as an operation failure", async () => {
    const state = harness({
      archiveWorkspace() {
        throw Object.assign(new Error("same-name replacement"), { code: "workspace_definition_conflict" })
      },
    })

    await expect(runExecution(state.coordinator, mutation("workspace.archive"))).rejects.toMatchObject({
      code: "conflict",
      details: { kind: "workspace_definition_conflict", terminals_stopped: true, force_allowed: false },
    })
    expect(state.calls.filter((call) => call.startsWith("catalog:"))).toEqual(["catalog:1"])
  })

  test("normal dirty removal returns every blocker after terminals stop and never commits", async () => {
    const state = harness({
      async inspectWorkspaceRemoval(name) {
        state.calls.push(`inspect:${name}`)
        return { ok: false, code: "workspace_dirty", error: "dirty", blocking_repositories: ["api", "web"], plan: {} as never }
      },
    })
    const phases: string[] = []
    await expect(state.coordinator.execution(mutation("workspace.remove")).steps[0]!.run((progress) => {
      const phase = progress.data?.lifecycle_phase
      if (typeof phase === "string") phases.push(phase)
    })).rejects.toMatchObject({
      details: { kind: "workspace_dirty", blocking_repositories: ["api", "web"], terminals_stopped: true, force_allowed: true },
    })
    expect(phases).toEqual(["stopping_terminals", "checking_worktrees"])
    expect(state.calls.some((call) => call.startsWith("commit:"))).toBe(false)
  })

  test("a fresh dirty blocker returned at commit remains eligible for typed Force Remove", async () => {
    const state = harness({
      async commitWorkspaceRemoval() {
        return { ok: false, code: "workspace_dirty", error: "became dirty", blocking_repositories: ["api"] }
      },
    })

    await expect(runExecution(state.coordinator, mutation("workspace.remove"))).rejects.toMatchObject({
      details: {
        kind: "workspace_dirty",
        blocking_repositories: ["api"],
        terminals_stopped: true,
        force_allowed: true,
      },
    })
  })

  test.each([
    ["not_found", "gone"],
    ["workspace_invalid", "parse failed"],
    ["inspection_failed", "inspection failed"],
  ] as const)("propagates %s inspection failures without force eligibility or commit", async (code, error) => {
    const state = harness({ async inspectWorkspaceRemoval(name) { state.calls.push(`inspect:${name}`); return { ok: false, code, error } } })
    await expect(runExecution(state.coordinator, mutation("workspace.force-remove"))).rejects.toMatchObject({
      details: { kind: code, terminals_stopped: true, force_allowed: false },
    })
    expect(state.calls.some((call) => call.startsWith("commit:"))).toBe(false)
  })

  test("force repeats fresh non-forced inspection and accepts only current dirty state plus exact current name", async () => {
    let inspection: "clean" | "dirty" = "clean"
    const state = harness({
      async inspectWorkspaceRemoval(name) {
        state.calls.push(`inspect:${name}:${inspection}`)
        return inspection === "dirty"
          ? { ok: false, code: "workspace_dirty", error: "dirty", blocking_repositories: ["api"], plan: {} as never }
          : { ok: true, plan: {} as never }
      },
    })

    await expect(runExecution(state.coordinator, mutation("workspace.force-remove"))).rejects.toMatchObject({
      details: { kind: "force_not_eligible", terminals_stopped: true, force_allowed: false },
    })
    expect(state.calls.some((call) => call.startsWith("commit:"))).toBe(false)

    inspection = "dirty"
    await expect(runExecution(state.coordinator, mutation("workspace.force-remove", WORKSPACE_A, "1", "wrong"))).rejects.toMatchObject({
      details: { kind: "confirmation_mismatch", terminals_stopped: true, force_allowed: false },
    })
    expect(state.calls.some((call) => call.startsWith("commit:"))).toBe(false)

    const completed = await runExecution(state.coordinator, mutation("workspace.force-remove"))
    expect(completed.phases).toEqual(["stopping_terminals", "checking_worktrees", "removing_worktrees", "deleting_workspace_files", "reconciling_state"])
    expect(state.calls.filter((call) => call.startsWith("inspect:"))).toEqual([
      "inspect:alpha:clean",
      "inspect:alpha:dirty",
      "inspect:alpha:dirty",
    ])
    expect(state.calls).toContain("commit:dirty")
  })

  test("holds only the target lease through reconciliation so unrelated targets continue", async () => {
    const admission = createWorkspaceLifecycleAdmission()
    const alphaClose = deferred()
    const calls: string[] = []
    const targets: Target[] = [
      { id: WORKSPACE_A, name: "alpha", archived: false },
      { id: WORKSPACE_B, name: "beta", archived: false },
    ]
    let revision = "1"
    const state = harness({
      admission,
      terminals: {
        async closeWorkspace(id) {
          calls.push(`terminals:${id}`)
          if (id === WORKSPACE_A) await alphaClose.promise
          return { ok: true, status: "closed", requested: 0, closed: 0, failed: 0 }
        },
      },
      snapshot: {
        async buildAll() { return [] },
        async buildWorkspace() { throw new Error("unused") },
        async buildCatalog() { calls.push(`catalog:${revision}`); return catalog(revision, targets) },
      },
      archiveWorkspace(name) {
        calls.push(`archive:${name}`)
        targets.find((entry) => entry.name === name)!.archived = true
        revision = String(Number(revision) + 1)
        return {} as never
      },
    })

    const alpha = runExecution(state.coordinator, mutation("workspace.archive", WORKSPACE_A, "1"))
    await Promise.resolve()
    await Promise.resolve()
    const beta = runExecution(state.coordinator, mutation("workspace.archive", WORKSPACE_B, "1"))
    await beta
    expect(calls).toContain("archive:beta")
    expect(calls).not.toContain("archive:alpha")
    alphaClose.resolve()
    await alpha
    expect(calls.indexOf("archive:beta")).toBeLessThan(calls.indexOf("archive:alpha"))
  })

  test("cancels a queued removal before terminal or filesystem mutation and removes its waiter", async () => {
    const dir = await operationRoot()
    const admission = createWorkspaceLifecycleAdmission()
    const blocker = await admission.acquire(WORKSPACE_A)
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_cancelqueued1234",
      publishOperationEvent: async () => ({} as never),
    })
    const state = harness({ admission, operations: registry })
    const accepted = await state.coordinator.submit({
      clientId: "client-a",
      idempotencyKey: "cancel-queued",
      mutation: mutation("workspace.remove"),
    })

    for (let attempt = 0; attempt < 100 && registry.get(accepted.operation_id)?.state !== "running"; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
    }
    await registry.cancel(accepted.operation_id)
    const nextLease = admission.acquire(WORKSPACE_A)
    blocker.release()
    const granted = await nextLease
    granted.release()
    await registry.wait(accepted.operation_id)

    expect(registry.get(accepted.operation_id)).toMatchObject({
      state: "cancelled",
      completed_steps: [],
      error: { details: { reason: "cancelled" } },
    })
    expect(state.calls).toEqual([])
    expect(state.targets.map((target) => target.id)).toContain(WORKSPACE_A)
  })

  test("preserves durable idempotency and a new key cannot target deleted or recreated state", async () => {
    const dir = await operationRoot()
    let id = 0
    const registry = new OperationRegistry({
      root: dir,
      id: () => `op_${String(++id).padStart(16, "0")}`,
      publishOperationEvent: async () => ({} as never),
    })
    const state = harness({ operations: registry })
    const request = mutation("workspace.remove")

    const original = await state.coordinator.submit({ clientId: "client-a", idempotencyKey: "key-a", mutation: request })
    const same = await state.coordinator.submit({ clientId: "client-a", idempotencyKey: "key-a", mutation: request })
    expect(same.operation_id).toBe(original.operation_id)
    await expect(state.coordinator.submit({ clientId: "client-a", idempotencyKey: "key-a", mutation: mutation("workspace.archive") })).rejects.toMatchObject({ code: "idempotency_conflict" })
    await registry.wait(original.operation_id)
    expect(registry.get(original.operation_id)?.state).toBe("succeeded")

    const missing = await state.coordinator.submit({ clientId: "client-a", idempotencyKey: "key-b", mutation: request })
    await registry.wait(missing.operation_id)
    expect(registry.get(missing.operation_id)).toMatchObject({ state: "failed", error: { code: "not_found" } })

    state.targets.push({ id: "33333333-3333-4333-8333-333333333333", name: "alpha", archived: false })
    const recreated = await state.coordinator.submit({ clientId: "client-a", idempotencyKey: "key-c", mutation: request })
    await registry.wait(recreated.operation_id)
    expect(registry.get(recreated.operation_id)).toMatchObject({ state: "failed", error: { code: "not_found" } })
  })

  test("releases the lease after archive, removal hook, and reconciliation failures", async () => {
    for (const [label, overrides] of [
      ["archive", { archiveWorkspace: () => { throw new Error("archive failed") } }],
      ["remove", { commitWorkspaceRemoval: async () => ({ ok: false as const, code: "removal_failed" as const, error: "hook failed" }) }],
      ["reconcile", { archiveWorkspace: () => ({} as never), snapshot: { async buildAll() { return [] }, async buildWorkspace() { throw new Error("unused") }, async buildCatalog() { throw new Error("reconcile failed") } } }],
    ] as const) {
      const state = harness(overrides)
      await expect(runExecution(state.coordinator, mutation(label === "remove" ? "workspace.remove" : "workspace.archive"))).rejects.toBeInstanceOf(Error)
      expect(state.calls.at(-1)).toBe(`release:${WORKSPACE_A}`)
    }
  })

  test("exports typed lifecycle failures for registry integration", () => {
    const failure = new WorkspaceLifecycleError("conflict", "stale", {
      kind: "stale_revision",
      terminals_stopped: false,
      force_allowed: false,
    })
    expect(failure).toMatchObject({ code: "conflict", message: "stale", details: { kind: "stale_revision" } })
  })

  test("persists typed lifecycle failure details on the durable operation", async () => {
    const dir = await operationRoot()
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_typedfailure1234",
      publishOperationEvent: async () => ({} as never),
    })
    const state = harness({
      operations: registry,
      terminals: { async closeWorkspace() { return { ok: false, status: "cleanup_failed", requested: 1, closed: 0, failed: 1 } } },
    })
    const accepted = await state.coordinator.submit({ clientId: "client-a", idempotencyKey: "key-a", mutation: mutation("workspace.remove") })
    await registry.wait(accepted.operation_id)
    expect(registry.get(accepted.operation_id)).toMatchObject({
      state: "failed",
      error: { code: "operation_failed" },
      lifecycle: { kind: "terminal_cleanup_failed", terminals_stopped: false, force_allowed: false },
    })
  })
})
