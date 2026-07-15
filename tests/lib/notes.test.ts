import { afterAll, afterEach, describe, expect, test } from "@test/api"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { useIsolatedConfig } from "../helpers"

const isolated = useIsolatedConfig("notes-test")
const notesLib = await import("@/lib/notes")

const { addWorkspaceNote, listWorkspaceNotes, clearWorkspaceNotes, getWorkspaceNoteSummary } = notesLib

afterAll(() => isolated.cleanup())

const FILE_RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let _testCounter = 0

function uniqueWs(prefix = "ws"): string {
  _testCounter++
  return `_notetest-${prefix}-${FILE_RUN_ID}-${_testCounter}`
}

function wsFile(workspace: string): string {
  return join(isolated.configDir, "notes", `${workspace}.jsonl`)
}

function parseLines(workspace: string): Array<Record<string, unknown>> {
  const raw = readFileSync(wsFile(workspace), "utf8")
  return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
}

function writeMalformed(workspace: string): void {
  mkdirSync(join(isolated.configDir, "notes"), { recursive: true })
  writeFileSync(wsFile(workspace), "{\"text\":\"ok\",\"created\":\"2026-01-01T00:00:00.000Z\"}\n{bad-json}\n", "utf8")
}

afterEach(() => {
  const notesDir = join(isolated.configDir, "notes")
  try {
    for (const f of require("node:fs").readdirSync(notesDir)) {
      if (f.startsWith("_notetest-")) {
        rmSync(join(notesDir, f), { force: true })
      }
    }
  } catch {
    // ignore
  }
})

describe("workspace notes store", () => {
  test("add writes plain JSONL lines and list returns newest-first with limit support", async () => {
    const ws = uniqueWs("order")
    const first = await addWorkspaceNote(ws, "older")
    const second = await addWorkspaceNote(ws, "middle")
    const third = await addWorkspaceNote(ws, "newer")

    expect(first.text).toBe("older")
    expect(second.text).toBe("middle")
    expect(third.text).toBe("newer")
    expect(existsSync(wsFile(ws))).toBe(true)

    const onDisk = parseLines(ws)
    expect(onDisk.map((r) => r.text)).toEqual(["older", "middle", "newer"])
    for (const row of onDisk) {
      expect(Object.keys(row).sort()).toEqual(["created", "text"])
    }

    const listed = await listWorkspaceNotes(ws)
    expect(listed.map((row: { text: string }) => row.text)).toEqual(["newer", "middle", "older"])

    const limited = await listWorkspaceNotes(ws, { limit: 2 })
    expect(limited.map((row: { text: string }) => row.text)).toEqual(["newer", "middle"])
  })

  test("clear deletes file and summary returns empty contract for missing store", async () => {
    const ws = uniqueWs("clear")
    await addWorkspaceNote(ws, "one")
    expect(existsSync(wsFile(ws))).toBe(true)

    await clearWorkspaceNotes(ws)
    expect(existsSync(wsFile(ws))).toBe(false)

    const summary = await getWorkspaceNoteSummary(ws)
    expect(summary).toEqual({ count: 0, latest: null })
  })

  test("malformed JSONL fails closed for add/list/clear/summary without mutating file", async () => {
    const ws = uniqueWs("bad")
    writeMalformed(ws)
    const before = readFileSync(wsFile(ws), "utf8")

    await expect(addWorkspaceNote(ws, "later")).rejects.toThrow(/malformed|invalid|json/i)
    await expect(listWorkspaceNotes(ws)).rejects.toThrow(/malformed|invalid|json/i)
    await expect(clearWorkspaceNotes(ws)).rejects.toThrow(/malformed|invalid|json/i)
    await expect(getWorkspaceNoteSummary(ws)).rejects.toThrow(/malformed|invalid|json/i)

    const after = readFileSync(wsFile(ws), "utf8")
    expect(after).toBe(before)
  })
})
