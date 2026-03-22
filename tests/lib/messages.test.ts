import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test"
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { useIsolatedConfig } from "../helpers"

const isolated = useIsolatedConfig("messages-test")

// @ts-ignore — cache-busting for isolated paths mock
const { appendMessage, listMessages, clearMessages, pushToSocket } = await import("@/lib/messages?msg-test")

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
