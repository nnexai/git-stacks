import { afterEach, describe, expect, mock, test } from "@test/api"
import { setTimeout as sleep } from "node:timers/promises"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  OperationRegistry,
  createWorkspaceMutationAdapters,
  type OperationExecution,
  type OperationStep,
} from "../../../packages/service/src/policy/operations"
import type { Operation, ServiceEvent } from "../../../packages/protocol/src/service"
import { CLIENT_MODEL_LIMITS, WorkspaceLifecycleMutationSchema } from "../../../packages/protocol/src/service"
import { WorkspaceLifecycleMutationSchemas } from "../../../packages/service/src/policy/core-contract"
import { CoreMutationSchemas } from "../../../packages/service/src/policy/core-contract"

const roots: string[] = []
async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "git-stacks-operations-"))
  roots.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function execution(
  steps: OperationStep[],
  cancellation: OperationExecution["cancellation"] = "none",
  finalize?: () => void | Promise<void>,
): OperationExecution {
  return { steps, result: { workspace: "demo" }, cancellation, finalize }
}

describe("OperationRegistry lifecycle", () => {
  test("persists accepted before scheduling, stays queryable, and publishes before observers", async () => {
    const dir = await root()
    const gate = deferred()
    const published: Operation[] = []
    const observed: Operation[] = []
    let scheduled = false
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_1234567890abcdef",
      now: (() => { let n = 0; return () => Date.UTC(2026, 0, 1, 0, 0, n++) })(),
      publishOperationEvent: async (operation) => {
        published.push(structuredClone(operation))
        if (operation.state === "accepted") await gate.promise
        return {} as ServiceEvent
      },
      schedule: (run) => { scheduled = true; queueMicrotask(run) },
      onOperation: (operation) => { observed.push(structuredClone(operation)) },
    })

    const accepting = registry.accept(execution([]))
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const persisted = JSON.parse(await readFile(join(dir, "operations.json"), "utf8"))
        if (persisted.operations.length > 0) break
      } catch {}
      await sleep(1)
    }
    expect(scheduled).toBe(false)
    const persisted = JSON.parse(await readFile(join(dir, "operations.json"), "utf8"))
    expect(persisted.operations[0].state).toBe("accepted")
    expect(registry.get("op_1234567890abcdef")).toBeUndefined()
    expect(observed).toHaveLength(0)

    gate.resolve()
    const accepted = await accepting
    expect(accepted.state).toBe("accepted")
    expect(scheduled).toBe(true)
    await registry.wait(accepted.operation_id)
    expect(published.map((item) => item.state)).toEqual(["accepted", "running", "succeeded"])
    expect(observed.map((item) => item.state)).toEqual(["accepted", "running", "succeeded"])
  })

  test("emits structured progress and cancels only between safe steps with honest rollback", async () => {
    const dir = await root()
    const firstDone = deferred()
    const continueFirst = deferred()
    const calls: string[] = []
    const events: Operation[] = []
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_abcdef1234567890",
      publishOperationEvent: async (operation) => { events.push(structuredClone(operation)); return {} as ServiceEvent },
    })
    const accepted = await registry.accept(execution([
      {
        name: "open.repositories",
        stage: "executing",
        message: "Opening repositories",
        run: async () => { calls.push("run:first"); firstDone.resolve(); await continueFirst.promise },
        rollback: async () => { calls.push("rollback:first"); throw new Error("rollback failed") },
      },
      { name: "open.integrations", stage: "executing", message: "Opening integrations", run: async () => { calls.push("run:second") } },
    ], "safe-boundaries"))
    await firstDone.promise
    expect(registry.cancellationView(accepted.operation_id)).toEqual({ state: "available" })
    expect(await registry.cancel(accepted.operation_id)).toMatchObject({ outcome: "requested", operation_state: "running" })
    expect(registry.cancellationView(accepted.operation_id)).toEqual({ state: "requested" })
    expect(registry.get(accepted.operation_id)?.state).toBe("running")
    continueFirst.resolve()
    await registry.wait(accepted.operation_id)

    const terminal = registry.get(accepted.operation_id)
    expect(terminal?.state).toBe("cancelled")
    if (terminal?.state !== "cancelled") throw new Error("expected cancelled")
    expect(terminal.completed_steps).toEqual(["open.repositories"])
    expect(terminal.rollback_attempted).toBe(true)
    expect(terminal.rollback_succeeded).toBe(false)
    expect(terminal.rollback_errors.map((error) => error.message)).toEqual(["rollback failed"])
    expect(calls).toEqual(["run:first", "rollback:first"])
    expect(events.filter((event) => event.state === "running").map((event) => event.progress.stage)).toEqual([
      "preparing", "executing", "rolling_back",
    ])
  })

  test("keeps original failure separate from rollback failures", async () => {
    const dir = await root()
    const registry = new OperationRegistry({ root: dir, id: () => "op_failure123456789", publishOperationEvent: async () => ({} as ServiceEvent) })
    const accepted = await registry.accept(execution([
      { name: "first", stage: "executing", message: "First", run: async () => {}, rollback: async () => { throw new Error("undo broke") } },
      { name: "second", stage: "executing", message: "Second", run: async () => { throw new Error("forward broke") } },
    ]))
    await registry.wait(accepted.operation_id)
    const terminal = registry.get(accepted.operation_id)
    expect(terminal?.state).toBe("failed")
    if (terminal?.state !== "failed") throw new Error("expected failed")
    expect(terminal.error.message).toBe("forward broke")
    expect(terminal.rollback_errors.map((error) => error.message)).toEqual(["undo broke"])
  })

  test("retains only allowlisted forge recovery details on terminal failures", async () => {
    const dir = await root()
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_forge12345678901",
      publishOperationEvent: async () => ({} as ServiceEvent),
    })
    const accepted = await registry.accept(execution([{
      name: "review.fetch",
      stage: "executing",
      message: "Fetching reviewed source",
      run: async () => {
        throw Object.assign(new Error("The provider source changed after review. Resolve the change again."), {
          code: "operation_failed",
          details: {
            kind: "forge_failure",
            reason: "source_changed",
            recovery: "resolve_again",
            context: { kind: "provider", provider: "github" },
          },
        })
      },
    }]))
    await registry.wait(accepted.operation_id)
    const terminal = registry.get(accepted.operation_id)
    expect(terminal?.state).toBe("failed")
    if (terminal?.state !== "failed") return
    expect(terminal.error.details).toEqual({
      kind: "forge_failure",
      reason: "source_changed",
      recovery: "resolve_again",
    })
  })

  test("does not expose or observe a transition whose journal append fails", async () => {
    const dir = await root()
    const observed: Operation[] = []
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_append1234567890",
      publishOperationEvent: async (operation) => {
        if (operation.state === "running") throw new Error("journal unavailable")
        return {} as ServiceEvent
      },
      onOperation: (operation) => { observed.push(structuredClone(operation)) },
    })
    const accepted = await registry.accept(execution([]))
    await registry.wait(accepted.operation_id)
    expect(observed.map((item) => item.state)).toEqual(["accepted", "failed"])
    const terminal = registry.get(accepted.operation_id)
    expect(terminal?.state).toBe("failed")
    if (terminal?.state === "failed") expect(terminal.error.code).toBe("internal_error")
  })

  test("restart converts accepted and running operations to interrupted failures", async () => {
    const dir = await root()
    const blocker = deferred()
    const first = new OperationRegistry({
      root: dir,
      id: () => "op_restart123456789",
      publishOperationEvent: async () => ({} as ServiceEvent),
      schedule: () => {},
    })
    await first.accept(execution([{ name: "blocked", stage: "executing", message: "Blocked", run: () => blocker.promise }]))

    const recoveredEvents: Operation[] = []
    const recovered = new OperationRegistry({ root: dir, publishOperationEvent: async (operation) => { recoveredEvents.push(structuredClone(operation)); return {} as ServiceEvent } })
    await recovered.initialize()
    const operation = recovered.get("op_restart123456789")
    expect(operation?.state).toBe("failed")
    if (operation?.state === "failed") expect(operation.error.details?.reason).toBe("interrupted")
    expect(recoveredEvents).toHaveLength(1)
    await expect(recovered.cancel("op_restart123456789")).resolves.toMatchObject({
      outcome: "already-finished",
      operation_state: "failed",
    })
  })

  test("serializes cancellation before start, during safe work, duplicate requests, and terminal refresh", async () => {
    const dir = await root()
    let scheduled: (() => void) | undefined
    let ran = false
    let finalized = 0
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_safe123456789012",
      publishOperationEvent: async () => ({} as ServiceEvent),
      schedule: (run) => { scheduled = run },
    })
    const accepted = await registry.accept(execution([{
      name: "safe",
      stage: "executing",
      message: "Safe work",
      run: async () => { ran = true },
    }], "safe-boundaries", () => { finalized += 1 }))

    expect(registry.cancellationView(accepted.operation_id)).toEqual({ state: "available" })
    expect(await registry.cancel(accepted.operation_id)).toMatchObject({ outcome: "requested", operation_state: "accepted" })
    expect(await registry.cancel(accepted.operation_id)).toMatchObject({ outcome: "requested", operation_state: "accepted" })
    expect(registry.cancellationView(accepted.operation_id)).toEqual({ state: "requested" })

    scheduled?.()
    await registry.wait(accepted.operation_id)
    expect(ran).toBe(false)
    expect(registry.get(accepted.operation_id)?.state).toBe("cancelled")
    expect(registry.cancellationView(accepted.operation_id)).toEqual({ state: "unavailable", reason: "finished" })
    expect(await registry.cancel(accepted.operation_id)).toMatchObject({ outcome: "already-finished", operation_state: "cancelled" })
    expect(finalized).toBe(1)
  })

  test("makes commit visible before irreversible work and reports too-late without rollback claims", async () => {
    const dir = await root()
    const committed = deferred()
    const release = deferred()
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_commit12345678901",
      publishOperationEvent: async () => ({} as ServiceEvent),
    })
    const accepted = await registry.accept(execution([{
      name: "irreversible",
      stage: "executing",
      message: "Committing",
      run: async (_report, cancellation) => {
        cancellation?.commit()
        committed.resolve()
        await release.promise
      },
    }], "safe-boundaries"))
    await committed.promise

    expect(registry.cancellationView(accepted.operation_id)).toEqual({ state: "unavailable", reason: "committed" })
    expect(await registry.cancel(accepted.operation_id)).toEqual({
      operation_id: accepted.operation_id,
      outcome: "too-late",
      operation_state: "running",
    })
    release.resolve()
    await registry.wait(accepted.operation_id)
    const terminal = registry.get(accepted.operation_id)
    expect(terminal?.state).toBe("succeeded")
    if (terminal?.state === "succeeded") expect(terminal).not.toHaveProperty("rollback_attempted")
    expect(await registry.cancel(accepted.operation_id)).toMatchObject({ outcome: "already-finished", operation_state: "succeeded" })
  })

  test("never advertises or accepts cancellation for non-cancellable work", async () => {
    const dir = await root()
    const started = deferred()
    const release = deferred()
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_none123456789012",
      publishOperationEvent: async () => ({} as ServiceEvent),
    })
    const accepted = await registry.accept(execution([{
      name: "core",
      stage: "executing",
      message: "Core work",
      run: async (_report, cancellation) => {
        expect(cancellation).toBeUndefined()
        started.resolve()
        await release.promise
      },
    }]))
    await started.promise
    expect(registry.cancellationView(accepted.operation_id)).toEqual({ state: "unavailable", reason: "not-cancellable" })
    expect(await registry.cancel(accepted.operation_id)).toMatchObject({ outcome: "not-cancellable", operation_state: "running" })
    release.resolve()
    await registry.wait(accepted.operation_id)
    expect(registry.get(accepted.operation_id)?.state).toBe("succeeded")
  })

  test("runs terminal reconciliation once after failure", async () => {
    const dir = await root()
    let finalized = 0
    const registry = new OperationRegistry({
      root: dir,
      id: () => "op_finalize123456789",
      publishOperationEvent: async () => ({} as ServiceEvent),
    })
    const accepted = await registry.accept(execution([{
      name: "fail",
      stage: "executing",
      message: "Fail",
      run: async () => { throw new Error("failed") },
    }], "none", () => { finalized += 1 }))
    await registry.wait(accepted.operation_id)
    expect(registry.get(accepted.operation_id)?.state).toBe("failed")
    expect(finalized).toBe(1)
  })
})

describe("workspace lifecycle operation contract", () => {
  test("uses the shared strict lifecycle schemas for trusted operation submission", () => {
    const id = "11111111-1111-4111-8111-111111111111"
    const archive = { kind: "workspace.archive", workspace_id: id, expected_revision: "7" } as const
    const forceRemove = { ...archive, kind: "workspace.force-remove", confirmation_name: "demo" } as const

    expect(WorkspaceLifecycleMutationSchemas["workspace.archive"].parse(archive)).toEqual(
      WorkspaceLifecycleMutationSchema.parse(archive),
    )
    expect(WorkspaceLifecycleMutationSchemas["workspace.force-remove"].parse(forceRemove)).toEqual(
      WorkspaceLifecycleMutationSchema.parse(forceRemove),
    )
    expect(WorkspaceLifecycleMutationSchemas["workspace.archive"].safeParse({ ...archive, confirmation_name: "demo" }).success).toBe(false)
    expect(WorkspaceLifecycleMutationSchemas["workspace.force-remove"].safeParse(archive).success).toBe(false)
  })
})

describe("Workspace creation admission", () => {
  test("keeps the client model at sixteen and rejects workspace seventeen before mutation", async () => {
    const request = {
      name: "workspace-17",
      branch: "feature/workspace-17",
      source: { kind: "repositories" as const, repositories: ["app"] },
    }
    const planWorkspace = mock(async () => ({
      ok: true as const,
      plan: {
        request,
        inputs: { wsName: request.name, branch: request.branch, repos: [] },
      },
    }))
    const createWorkspace = mock(async () => ({ ok: true as const }))
    const current = Array.from({ length: CLIENT_MODEL_LIMITS.workspaces }, (_, index) => ({
      id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `workspace-${String(index + 1).padStart(2, "0")}`,
      schema_version: "1" as const,
      branch: `feature/${index + 1}`,
      created: "2026-07-17T12:00:00.000Z",
      repos: [],
    }))
    const adapters = createWorkspaceMutationAdapters({
      planWorkspace: planWorkspace as never,
      listWorkspaces: (() => current) as never,
      createWorkspace: createWorkspace as never,
    })

    expect(CLIENT_MODEL_LIMITS.workspaces).toBe(16)
    await expect(adapters["workspace.create"](request).steps[0]!.run(async () => undefined))
      .rejects.toThrow("capacity_exceeded: workspaces")
    expect(planWorkspace).toHaveBeenCalledTimes(1)
    expect(createWorkspace).not.toHaveBeenCalled()
  })
})

describe("Pull and notes mutation adapters", () => {
  test("exposes strict Pull and revision-bound notes schemas", () => {
    expect(CoreMutationSchemas["workspace.pull"].parse({ workspace: "demo" })).toEqual({ workspace: "demo" })
    expect(CoreMutationSchemas["workspace.notes.add"].parse({
      workspace: "demo",
      expected_notes_revision: "3",
      text: "Remember this",
    })).toEqual({ workspace: "demo", expected_notes_revision: "3", text: "Remember this" })
    expect(CoreMutationSchemas["workspace.notes.clear"].safeParse({ workspace: "demo" }).success).toBe(false)
  })

  test("Pull reuses core progress but never places raw errors or paths in progress/results", async () => {
    const pullWorkspace = mock(async (_workspace: string, progress?: (row: {
      repo: string
      status: "failed"
      detail: string
    }) => void) => {
      progress?.({ repo: "repo", status: "failed", detail: "/home/person/private/repo: credentials leaked" })
      return {
        ok: false,
        pulled: [],
        skipped: [],
        failed: [{ repo: "repo", reason: "/home/person/private/repo: credentials leaked" }],
        error: "/home/person/private/repo: credentials leaked",
      }
    })
    const adapters = createWorkspaceMutationAdapters({ pullWorkspace })
    const execution = adapters["workspace.pull"]({ workspace: "demo" })
    const progress: unknown[] = []
    await expect(execution.steps[0]!.run((row) => { progress.push(row) })).rejects.toThrow("Workspace pull failed")

    expect(pullWorkspace).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(progress)).not.toContain("/home/person")
    expect(JSON.stringify(execution.result)).not.toContain("/home/person")
  })

  test("notes adapters bind revisions, return newest-first refresh data, and request terminal reconciliation", async () => {
    const addWorkspaceNote = mock(async () => ({ text: "new", created: "2026-07-16T12:00:00.000Z" }))
    const clearWorkspaceNotes = mock(async () => undefined)
    const getWorkspaceNotesSnapshot = mock(async () => ({
      revision: "4",
      count: 2,
      records: [
        { text: "new", created: "2026-07-16T12:00:00.000Z" },
        { text: "old", created: "2026-07-15T12:00:00.000Z" },
      ],
    }))
    const refresh = mock(async () => undefined)
    const adapters = createWorkspaceMutationAdapters({
      addWorkspaceNote,
      clearWorkspaceNotes,
      getWorkspaceNotesSnapshot,
      refreshWorkspace: refresh,
    })

    const add = adapters["workspace.notes.add"]({ workspace: "demo", expected_notes_revision: "3", text: "new" })
    await add.steps[0]!.run(async () => undefined)
    await add.finalize?.()
    expect(addWorkspaceNote).toHaveBeenCalledWith("demo", "new", { expectedRevision: "3" })
    expect(add.result).toMatchObject({ notes_revision: "4", note_count: 2 })
    expect((add.result?.notes as Array<{ text: string }>).map(({ text }) => text)).toEqual(["new", "old"])
    expect(refresh).toHaveBeenCalledWith("demo")

    const clear = adapters["workspace.notes.clear"]({ workspace: "demo", expected_notes_revision: "4" })
    await clear.steps[0]!.run(async () => undefined)
    expect(clearWorkspaceNotes).toHaveBeenCalledWith("demo", { expectedRevision: "4" })
  })
})
