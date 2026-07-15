import { afterEach, describe, expect, mock, test } from "@test/api"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  IdempotencyConflictError,
  OperationRegistry,
  canonicalRequestHash,
  createWorkspaceMutationAdapters,
} from "../../../packages/service/src/policy/operations"
import type { ServiceEvent } from "../../../packages/protocol/src/service"

const roots: string[] = []
async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "git-stacks-idempotency-"))
  roots.push(value)
  return value
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))).then(() => undefined))

const publisher = async () => ({} as ServiceEvent)

describe("operation idempotency", () => {
  test("canonical hashes ignore object key order", () => {
    expect(canonicalRequestHash({ workspace: "demo", options: { ide: false, captured: true } }))
      .toBe(canonicalRequestHash({ options: { captured: true, ide: false }, workspace: "demo" }))
  })

  test("parallel equivalent requests reserve one operation and schedule exactly once", async () => {
    const dir = await root()
    let ids = 0
    let scheduled = 0
    const registry = new OperationRegistry({
      root: dir,
      id: () => `op_parallel1234567${ids++}`,
      publishOperationEvent: publisher,
      schedule: () => { scheduled += 1 },
    })
    const request = { workspace: "demo", options: { captured: true } }
    const calls = Array.from({ length: 20 }, () => registry.submit({
      clientId: "client-a", endpoint: "workspace.open", idempotencyKey: "retry-1", request,
      execution: { steps: [] },
    }))
    const results = await Promise.all(calls)
    expect(new Set(results.map((item) => item.operation_id)).size).toBe(1)
    expect(scheduled).toBe(1)
  })

  test("operation ownership exposes records only to the submitting client", async () => {
    const dir = await root()
    const registry = new OperationRegistry({ root: dir, id: () => "op_owned12345678901", publishOperationEvent: publisher, schedule: () => {} })
    const operation = await registry.submit({ clientId: "web:principal-a", endpoint: "workspace.open", idempotencyKey: "key", request: { workspace: "demo" }, execution: { steps: [] } })
    expect(registry.ownerOf(operation.operation_id)).toBe("web:principal-a")
    expect(registry.getForClient(operation.operation_id, "web:principal-a")?.operation_id).toBe(operation.operation_id)
    expect(registry.getForClient(operation.operation_id, "web:principal-b")).toBeUndefined()
    expect(registry.getForClient(operation.operation_id, "official-client")).toBeUndefined()
  })

  test("same scoped key with different input conflicts without scheduling", async () => {
    const dir = await root()
    let scheduled = 0
    const registry = new OperationRegistry({ root: dir, id: () => "op_conflict12345678", publishOperationEvent: publisher, schedule: () => { scheduled += 1 } })
    await registry.submit({ clientId: "client-a", endpoint: "workspace.close", idempotencyKey: "key", request: { workspace: "one" }, execution: { steps: [] } })
    await expect(registry.submit({ clientId: "client-a", endpoint: "workspace.close", idempotencyKey: "key", request: { workspace: "two" }, execution: { steps: [] } }))
      .rejects.toBeInstanceOf(IdempotencyConflictError)
    expect(scheduled).toBe(1)
  })

  test("reservation survives restart before execution and returns original operation", async () => {
    const dir = await root()
    const first = new OperationRegistry({ root: dir, id: () => "op_restartreserve12", publishOperationEvent: publisher, schedule: () => {} })
    const original = await first.submit({ clientId: "client-a", endpoint: "workspace.open", idempotencyKey: "key", request: { workspace: "demo" }, execution: { steps: [] } })
    let scheduled = 0
    const restarted = new OperationRegistry({ root: dir, publishOperationEvent: publisher, schedule: () => { scheduled += 1 } })
    await restarted.initialize()
    const duplicate = await restarted.submit({ clientId: "client-a", endpoint: "workspace.open", idempotencyKey: "key", request: { workspace: "demo" }, execution: { steps: [] } })
    expect(duplicate.operation_id).toBe(original.operation_id)
    expect(duplicate.state).toBe("failed")
    expect(scheduled).toBe(0)
  })

  test("expired terminal reservations are evicted and can schedule new work", async () => {
    const dir = await root()
    let now = Date.UTC(2026, 0, 1)
    let id = 0
    const registry = new OperationRegistry({ root: dir, now: () => now, id: () => `op_retention123456${id++}`, publishOperationEvent: publisher, retentionMs: 100 })
    const input = { clientId: "client-a", endpoint: "workspace.close", idempotencyKey: "key", request: { workspace: "demo" }, execution: { steps: [] } }
    const first = await registry.submit(input)
    await registry.wait(first.operation_id)
    now += 101
    const second = await registry.submit(input)
    expect(second.operation_id).not.toBe(first.operation_id)
    await registry.wait(second.operation_id)
  })
})

describe("workspace mutation adapters", () => {
  test("advertises the complete core mutation surface and translates existing progress callbacks", async () => {
    const open = mock(async (_workspace: string, _options: Record<string, unknown>, progress?: (message: string) => void) => { progress?.("Opened repo 1"); return { ok: true } })
    const close = mock(async (_workspace: string, _options: Record<string, unknown>, progress?: (message: string) => void) => { progress?.("Closed repo 1"); return { ok: true } })
    const adapters = createWorkspaceMutationAdapters({ openWorkspace: open, closeWorkspace: close })
    expect(Object.keys(adapters).sort()).toEqual([
      "repository.delete", "template.clone", "template.delete", "template.write", "workspace.clean", "workspace.close",
      "workspace.command.run", "workspace.create", "workspace.issue.open", "workspace.labels.set", "workspace.merge",
      "workspace.open", "workspace.push", "workspace.remove", "workspace.rename", "workspace.sync",
    ])
    const reports: string[] = []
    const operation = adapters["workspace.open"]({ workspace: "demo", options: { captured: true } })
    await operation.steps[0]!.run((progress) => { reports.push(progress.message ?? "") })
    expect(open).toHaveBeenCalledTimes(1)
    expect(reports).toEqual(["Opened repo 1"])
  })
})
