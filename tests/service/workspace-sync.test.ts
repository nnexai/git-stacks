import { afterEach, describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { provisionOfficialClient } from "../../packages/service/src/policy/credentials"
import { EventJournal } from "../../packages/service/src/policy/event-journal"
import { SnapshotBusyError } from "../../packages/service/src/policy/snapshot"
import { startServiceServer } from "../../packages/service/src/server"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("workspace synchronization contract", () => {
  test("replays ordered snapshot invalidations and reports the latest revision after retention", async () => {
    const root = join(tmpdir(), `git-stacks-workspace-sync-${crypto.randomUUID()}`)
    roots.push(root)
    let now = Date.parse("2026-07-12T00:00:00Z")
    const journal = new EventJournal({ root, now: () => now, snapshotRevision: () => "4", maxAgeMs: 10 })
    await journal.appendSnapshotInvalidated("1")
    now += 20
    await journal.appendSnapshotInvalidated("4")
    expect(await journal.replay("0")).toMatchObject({ kind: "events", events: [
      { sequence: "1", control: { kind: "snapshot_invalidated", revision: "1" } },
      { sequence: "2", control: { kind: "snapshot_invalidated", revision: "4" } },
    ] })
    await journal.compact()
    expect(await journal.replay("0")).toEqual({ kind: "replay_gap", requested: "0", earliest_cursor: "2", latest_cursor: "2", snapshot_revision: "4" })
  })

  test("maps transient snapshot contention to a retryable bounded response", async () => {
    const root = join(tmpdir(), `git-stacks-workspace-sync-${crypto.randomUUID()}`)
    roots.push(root)
    const credential = provisionOfficialClient("sync-client", { serviceRoot: root })
    const service = await startServiceServer({
      serviceRoot: root,
      snapshot: { buildAll: async () => { throw new SnapshotBusyError(3) }, buildWorkspace: async () => { throw new SnapshotBusyError(3) } },
    })
    try {
      const response = await fetch(new URL("/v1/snapshot", service.url), { headers: { authorization: `Bearer ${credential.token}` } })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "snapshot_busy", retryable: true, details: { attempts: 3 } } })
    } finally { await service.stop() }
  })
})
