import { afterEach, describe, expect, test } from "@test/api"
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventJournal, publishOperationEvent } from "@/lib/service/event-journal"
import { decodeCanonical, encodeCanonical } from "../../../packages/protocol/src/secure"

const roots: string[] = []
async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "git-stacks-journal-"))
  roots.push(path)
  return path
}
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

const operation = (id: string) => ({
  operation_id: `op_${id.padEnd(16, "x")}`,
  state: "accepted" as const,
  accepted_at: "2026-07-11T00:00:00.000Z",
})

describe("EventJournal", () => {
  test("serializes concurrent durable appends and resumes sequence after restart", async () => {
    const path = await root()
    const journal = new EventJournal({ root: path })
    const events = await Promise.all(Array.from({ length: 20 }, (_, index) => journal.appendOperation(operation(String(index)))))
    expect(events.map((event) => BigInt(event.sequence)).sort((a, b) => a < b ? -1 : 1)).toEqual(Array.from({ length: 20 }, (_, i) => BigInt(i + 1)))
    const restarted = new EventJournal({ root: path })
    expect((await restarted.appendOperation(operation("restart"))).sequence).toBe("21")
  })

  test("orders and replays durable snapshot invalidations", async () => {
    const path = await root()
    const journal = new EventJournal({ root: path })
    await Promise.all([journal.appendOperation(operation("before")), journal.appendSnapshotInvalidated("7"), journal.appendOperation(operation("after"))])
    const replay = await journal.replay("0")
    expect(replay.kind).toBe("events")
    if (replay.kind === "events") {
      expect(replay.events.map((event) => event.sequence)).toEqual(["1", "2", "3"])
      expect(replay.events[1]).toMatchObject({ type: "control", control: { kind: "snapshot_invalidated", revision: "7" } })
    }
  })

  test("publishes only after the allocated record is durable", async () => {
    const path = await root()
    const journal = new EventJournal({ root: path })
    const observed: string[] = []
    const event = await publishOperationEvent(journal, operation("publish"), async (record) => {
      observed.push(await readFile(join(path, "events.jsonl"), "utf8"))
      expect(record.sequence).toBe("1")
    })
    expect(event.sequence).toBe("1")
    expect(observed[0]).toContain('"sequence":"1"')
  })

  test("publishes the same JSON-safe operation event that it persists", async () => {
    const path = await root()
    const journal = new EventJournal({ root: path })
    let published: unknown
    const event = await publishOperationEvent(journal, {
      ...operation("json-safe"),
      state: "succeeded",
      started_at: "2026-07-11T00:00:01.000Z",
      finished_at: "2026-07-11T00:00:02.000Z",
      completed_steps: ["workspace.command.run"],
      result: { exit_code: 0, failed_command: undefined },
    }, (record) => { published = record })

    expect(event.operation.result).toEqual({ exit_code: 0 })
    expect(published).toEqual(event)
    expect(decodeCanonical(encodeCanonical(published))).toEqual(event)
    expect(JSON.parse((await readFile(join(path, "events.jsonl"), "utf8")).trim())).toEqual(event)
  })

  test("append failure never invokes live publication", async () => {
    const path = await root()
    const journal = new EventJournal({ root: join(path, "missing", "nested"), createRoot: false })
    let called = false
    await expect(publishOperationEvent(journal, operation("failure"), () => { called = true })).rejects.toThrow()
    expect(called).toBe(false)
  })

  test("replays strictly after a cursor and repairs only a partial final line", async () => {
    const path = await root()
    const journal = new EventJournal({ root: path })
    await journal.appendOperation(operation("one"))
    await journal.appendOperation(operation("two"))
    await appendFile(join(path, "events.jsonl"), '{"partial":', "utf8")
    const restarted = new EventJournal({ root: path })
    const replay = await restarted.replay("1")
    expect(replay).toEqual({ kind: "events", events: [expect.objectContaining({ sequence: "2" })] })
    expect(await readFile(join(path, "events.jsonl"), "utf8")).not.toContain("partial")
    await appendFile(join(path, "events.jsonl"), "not-json\n", "utf8")
    await expect(new EventJournal({ root: path }).replay("0")).rejects.toThrow(/corrupt journal/)
  })

  test("removes retired attention records while preserving valid records and cursor monotonicity", async () => {
    const path = await root()
    await writeFile(join(path, "events.jsonl"), [
      JSON.stringify({ protocol: "v1", sequence: "7", timestamp: "2026-07-12T00:00:00.000Z", type: "attention", attention: {} }),
      JSON.stringify({ protocol: "v1", sequence: "8", timestamp: "2026-07-12T00:00:01.000Z", type: "control", control: { kind: "snapshot_invalidated", revision: "3" } }),
    ].join("\n") + "\n")

    const journal = new EventJournal({ root: path })
    expect((await journal.replay("0")).kind).toBe("replay_gap")
    const next = await journal.appendSnapshotInvalidated("4")
    expect(next.sequence).toBe("9")
    expect(await readFile(join(path, "events.jsonl"), "utf8")).not.toContain('"type":"attention"')
  })

  test("reports replay gaps with retained bounds and current snapshot revision", async () => {
    const path = await root()
    let now = Date.parse("2026-07-11T00:00:00Z")
    const journal = new EventJournal({ root: path, now: () => now, snapshotRevision: () => "77", maxAgeMs: 1_000 })
    await journal.appendOperation(operation("old"))
    now += 2_000
    await journal.appendOperation(operation("new"))
    await journal.compact()
    expect(await journal.replay("0")).toEqual({ kind: "replay_gap", requested: "0", earliest_cursor: "2", latest_cursor: "2", snapshot_revision: "77" })
  })

  test("compacts to the configured byte boundary without losing a concurrent generation", async () => {
    const path = await root()
    const journal = new EventJournal({ root: path, maxBytes: 650 })
    await Promise.all(Array.from({ length: 8 }, (_, index) => journal.appendOperation(operation(`large-${index}`))))
    await journal.compact()
    const retained = await journal.replay(await journal.earliestCursor() === "1" ? "0" : String(BigInt(await journal.earliestCursor()) - 1n))
    expect(retained.kind).toBe("events")
    expect((await readFile(join(path, "events.jsonl"))).byteLength).toBeLessThanOrEqual(650)
    expect((await journal.appendOperation(operation("after"))).sequence).toBe("9")
  })
})
