import { describe, test, expect } from "bun:test"
import { formatAge, isStale, groupBySender } from "../../src/tui/dashboard/messageUtils"
import type { MessageRecord } from "../../src/lib/messages"

describe("formatAge", () => {
  test("returns '0s' for timestamp at current time", () => {
    const now = new Date(Date.now()).toISOString()
    expect(formatAge(now)).toBe("0s")
  })

  test("returns '2m' for timestamp 2 minutes ago", () => {
    const ts = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    expect(formatAge(ts)).toBe("2m")
  })

  test("returns '59m' for timestamp 59 minutes ago", () => {
    const ts = new Date(Date.now() - 59 * 60 * 1000).toISOString()
    expect(formatAge(ts)).toBe("59m")
  })

  test("returns '1h' for timestamp 60 minutes ago", () => {
    const ts = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(formatAge(ts)).toBe("1h")
  })

  test("returns '23h' for timestamp 23 hours ago", () => {
    const ts = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()
    expect(formatAge(ts)).toBe("23h")
  })

  test("returns '1d' for timestamp 24 hours ago", () => {
    const ts = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(formatAge(ts)).toBe("1d")
  })

  test("returns '3d' for timestamp 3 days ago", () => {
    const ts = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatAge(ts)).toBe("3d")
  })

  test("output matches pattern \\d+(s|m|h|d)", () => {
    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatAge(ts)).toMatch(/^\d+(s|m|h|d)$/)
  })
})

describe("isStale", () => {
  test("returns false for timestamp 29 minutes ago (under 30min threshold)", () => {
    const ts = new Date(Date.now() - 29 * 60 * 1000).toISOString()
    expect(isStale(ts)).toBe(false)
  })

  test("returns true for timestamp 31 minutes ago (over 30min threshold)", () => {
    const ts = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    expect(isStale(ts)).toBe(true)
  })

  test("accepts custom threshold: isStale(ts, 5min) returns true for 6 min ago", () => {
    const ts = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    expect(isStale(ts, 5 * 60 * 1000)).toBe(true)
  })

  test("accepts custom threshold: isStale(ts, 5min) returns false for 4 min ago", () => {
    const ts = new Date(Date.now() - 4 * 60 * 1000).toISOString()
    expect(isStale(ts, 5 * 60 * 1000)).toBe(false)
  })

  test("default threshold is 30 minutes (1800000ms)", () => {
    // At 30 minutes exactly the diff equals the threshold, so not stale (> not >=)
    const ts = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    expect(isStale(ts)).toBe(false)
  })
})

describe("groupBySender", () => {
  test("returns empty array for empty input", () => {
    expect(groupBySender([])).toEqual([])
  })

  test("returns single group for single sender", () => {
    const msgs: MessageRecord[] = [
      { workspace: "ws", text: "msg1", from: "agent-a", timestamp: "2026-03-20T12:00:00Z" },
    ]
    const groups = groupBySender(msgs)
    expect(groups.length).toBe(1)
    expect(groups[0].sender).toBe("agent-a")
    expect(groups[0].label).toBe("agent-a")
    expect(groups[0].messages).toEqual(msgs)
  })

  test("puts messages with undefined from into '(system)' group", () => {
    const msgs: MessageRecord[] = [
      { workspace: "ws", text: "sys-msg", timestamp: "2026-03-20T12:00:00Z" },
    ]
    const groups = groupBySender(msgs)
    expect(groups.length).toBe(1)
    expect(groups[0].sender).toBeUndefined()
    expect(groups[0].label).toBe("(system)")
  })

  test("groups mixed senders into separate SenderGroups", () => {
    const msgs: MessageRecord[] = [
      { workspace: "ws", text: "msg1", from: "agent-a", timestamp: "2026-03-20T12:00:00Z" },
      { workspace: "ws", text: "msg2", timestamp: "2026-03-20T11:00:00Z" },
      { workspace: "ws", text: "msg3", from: "agent-a", timestamp: "2026-03-20T10:00:00Z" },
    ]
    const groups = groupBySender(msgs)
    expect(groups.length).toBe(2)
    const agentGroup = groups.find((g) => g.sender === "agent-a")
    const systemGroup = groups.find((g) => g.sender === undefined)
    expect(agentGroup).toBeDefined()
    expect(agentGroup!.messages.length).toBe(2)
    expect(systemGroup).toBeDefined()
    expect(systemGroup!.messages.length).toBe(1)
  })

  test("preserves message order within each group (input order)", () => {
    const msgs: MessageRecord[] = [
      { workspace: "ws", text: "newest", from: "agent-a", timestamp: "2026-03-20T12:00:00Z" },
      { workspace: "ws", text: "middle", from: "agent-a", timestamp: "2026-03-20T11:00:00Z" },
      { workspace: "ws", text: "oldest", from: "agent-a", timestamp: "2026-03-20T10:00:00Z" },
    ]
    const groups = groupBySender(msgs)
    expect(groups[0].messages[0].text).toBe("newest")
    expect(groups[0].messages[1].text).toBe("middle")
    expect(groups[0].messages[2].text).toBe("oldest")
  })

  test("SenderGroup objects have sender, label, and messages fields", () => {
    const msgs: MessageRecord[] = [
      { workspace: "ws", text: "hi", from: "bot", timestamp: "2026-03-20T12:00:00Z" },
    ]
    const groups = groupBySender(msgs)
    expect(groups[0]).toHaveProperty("sender")
    expect(groups[0]).toHaveProperty("label")
    expect(groups[0]).toHaveProperty("messages")
  })
})
