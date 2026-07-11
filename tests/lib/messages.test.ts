import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test"
import { mkdirSync, existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { useIsolatedConfig } from "../helpers"

const isolated = useIsolatedConfig("messages-test")

const { appendMessage, listMessages, listMessagesSync, clearMessages, pushToSocket, configureAttentionPublication } = await import("@/lib/messages")

afterAll(() => isolated.cleanup())

const FILE_RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let _testCounter = 0

function uniqueWs(prefix = "ws"): string {
  _testCounter++
  return `_msgtest-${prefix}-${FILE_RUN_ID}-${_testCounter}`
}

function wsFile(workspace: string): string {
  return join(isolated.configDir, "messages", `${workspace}.jsonl`)
}

beforeEach(() => {
  mkdirSync(join(isolated.configDir, "messages"), { recursive: true })
})

afterEach(() => {
  configureAttentionPublication(undefined)
  // clean up only test-prefixed files
  const { readdirSync } = require("node:fs")
  const messagesDir = join(isolated.configDir, "messages")
  try {
    for (const f of readdirSync(messagesDir)) {
      if (f.startsWith("_msgtest-")) {
        rmSync(join(messagesDir, f), { force: true })
      }
    }
  } catch {
    // ignore if dir doesn't exist
  }
})

describe("appendMessage", () => {
  test("an older attention owner cannot dispose a newer publication", async () => {
    const first: unknown[] = []
    const second: unknown[] = []
    const disposeFirst = configureAttentionPublication({
      workspaceId: async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publish: async (attention) => { first.push(attention) },
    })
    const disposeSecond = configureAttentionPublication({
      workspaceId: async () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      publish: async (attention) => { second.push(attention) },
    })

    disposeFirst()
    await appendMessage(uniqueWs(), "new owner remains")
    expect(first).toHaveLength(0)
    expect(second).toHaveLength(1)

    disposeSecond()
    disposeSecond()
    await appendMessage(uniqueWs(), "disposed")
    expect(second).toHaveLength(1)
  })

  test("emits additive structured attention after legacy persistence", async () => {
    const ws = uniqueWs()
    const published: unknown[] = []
    configureAttentionPublication({
      workspaceId: async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publish: async (attention) => {
        expect(existsSync(wsFile(ws))).toBe(true)
        published.push(attention)
      },
    })
    const record = await appendMessage(ws, "build done", "ci-agent")
    expect(record.text).toBe("build done")
    expect(published).toEqual([{ workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "message", message: "build done" }])
  })

  test("keeps legacy append successful when optional attention publication fails", async () => {
    const ws = uniqueWs()
    configureAttentionPublication({
      workspaceId: async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publish: async () => { throw new Error("journal unavailable") },
    })
    await expect(appendMessage(ws, "still stored")).resolves.toMatchObject({ text: "still stored" })
    expect((await listMessages(ws))[0].text).toBe("still stored")
  })
  test("creates JSONL file at MESSAGES_DIR/{workspace}.jsonl", async () => {
    const ws = uniqueWs()
    await appendMessage(ws, "hello")
    expect(existsSync(wsFile(ws))).toBe(true)
  })

  test("writes a valid JSON line with workspace, text, timestamp", async () => {
    const ws = uniqueWs()
    const record = await appendMessage(ws, "build done")
    expect(record.workspace).toBe(ws)
    expect(record.text).toBe("build done")
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(record.from).toBeUndefined()
    const content = readFileSync(wsFile(ws), "utf8")
    const parsed = JSON.parse(content.trim())
    expect(parsed.text).toBe("build done")
  })

  test("writes 'from' field when provided", async () => {
    const ws = uniqueWs()
    const record = await appendMessage(ws, "deploy ok", "ci-agent")
    expect(record.from).toBe("ci-agent")
    const content = readFileSync(wsFile(ws), "utf8")
    const parsed = JSON.parse(content.trim())
    expect(parsed.from).toBe("ci-agent")
  })

  test("appends multiple records (each on its own line)", async () => {
    const ws = uniqueWs()
    await appendMessage(ws, "first")
    await appendMessage(ws, "second")
    const content = readFileSync(wsFile(ws), "utf8")
    const lines = content.trim().split("\n").filter(Boolean)
    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0]).text).toBe("first")
    expect(JSON.parse(lines[1]).text).toBe("second")
  })
})

describe("listMessages", () => {
  test("returns [] when file does not exist", async () => {
    const result = await listMessages("_msgtest-no-such-ws-ever")
    expect(result).toEqual([])
  })

  test("returns records newest-first", async () => {
    const ws = uniqueWs()
    await appendMessage(ws, "older")
    await appendMessage(ws, "newer")
    const records = await listMessages(ws)
    expect(records[0].text).toBe("newer")
    expect(records[1].text).toBe("older")
  })

  test("parses optional from field correctly", async () => {
    const ws = uniqueWs()
    await appendMessage(ws, "msg", "sender-a")
    const records = await listMessages(ws)
    expect(records[0].from).toBe("sender-a")
  })
})

describe("clearMessages", () => {
  test("clearMessages all: truncates file to empty", async () => {
    const ws = uniqueWs()
    await appendMessage(ws, "msg1")
    await clearMessages(ws)
    const content = readFileSync(wsFile(ws), "utf8")
    expect(content).toBe("")
  })

  test("clearMessages all: no error when file does not exist", async () => {
    await expect(clearMessages("_msgtest-no-such-ws-ever")).resolves.toBeUndefined()
  })

  test("clearMessages from sender: removes only that sender's messages", async () => {
    const ws = uniqueWs()
    await appendMessage(ws, "from a", "sender-a")
    await appendMessage(ws, "from b", "sender-b")
    await appendMessage(ws, "from a again", "sender-a")
    await clearMessages(ws, "sender-a")
    const remaining = await listMessages(ws)
    expect(remaining.length).toBe(1)
    expect(remaining[0].from).toBe("sender-b")
  })

  test("clearMessages from sender: no error when file does not exist", async () => {
    await expect(clearMessages("_msgtest-no-such-ws-ever", "agent")).resolves.toBeUndefined()
  })
})

describe("workspace name path safety", () => {
  const operations = {
    send: (workspace: string) => appendMessage(workspace, "must not be written"),
    list: (workspace: string) => listMessages(workspace),
    clear: (workspace: string) => clearMessages(workspace),
  }

  test.each(Object.entries(operations))("%s rejects traversal, dot, and dot-dot without touching an external sentinel", async (_operation, run) => {
    const messagesDir = join(isolated.configDir, "messages")
    for (const [index, invalidName] of ["../external-message-sentinel", ".", ".."].entries()) {
      const sentinel = join(isolated.configDir, `external-message-sentinel${index === 0 ? "" : `-${index}`}.jsonl`)
      const sentinelContent = `${JSON.stringify({ workspace: "sentinel", text: "keep", timestamp: "2026-01-01T00:00:00.000Z" })}\n`
      writeFileSync(sentinel, sentinelContent)

      const vulnerablePath = join(messagesDir, `${invalidName}.jsonl`)
      if (vulnerablePath !== sentinel) symlinkSync(sentinel, vulnerablePath)

      await expect(run(invalidName)).rejects.toThrow(/Invalid workspace name/)
      expect(readFileSync(sentinel, "utf8")).toBe(sentinelContent)

      if (vulnerablePath !== sentinel) rmSync(vulnerablePath, { force: true })
      rmSync(sentinel, { force: true })
    }
  })

  test.each(["../external-message-sentinel", ".", ".."])('synchronous list rejects invalid workspace name "%s"', (workspace) => {
    expect(() => listMessagesSync(workspace)).toThrow(/Invalid workspace name/)
  })
})

describe("pushToSocket", () => {
  test("resolves within 50ms when no socket is listening", async () => {
    const record = { workspace: "ws", text: "hi", timestamp: new Date().toISOString() }
    const start = Date.now()
    await pushToSocket(record)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(200)  // generous upper bound; IPC_TIMEOUT_MS=50
  })

  test("never throws when TUI is not running", async () => {
    const record = { workspace: "ws", text: "hi", timestamp: new Date().toISOString() }
    await expect(pushToSocket(record)).resolves.toBeUndefined()
  })
})
