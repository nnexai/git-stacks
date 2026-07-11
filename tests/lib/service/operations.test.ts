import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  OperationRegistry,
  type OperationExecution,
  type OperationStep,
} from "../../../src/lib/service/operations"
import type { Operation, ServiceEvent } from "../../../src/lib/service/contract"

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

function execution(steps: OperationStep[]): OperationExecution {
  return { steps, result: { workspace: "demo" } }
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
    await Bun.sleep(10)
    expect(scheduled).toBe(false)
    const persisted = JSON.parse(await readFile(join(dir, "operations.json"), "utf8"))
    expect(persisted.operations[0].state).toBe("accepted")
    expect(registry.get("op_1234567890abcdef")?.state).toBe("accepted")
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
    ]))
    await firstDone.promise
    await registry.cancel(accepted.operation_id)
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
  })
})
