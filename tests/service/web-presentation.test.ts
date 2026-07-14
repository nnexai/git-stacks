import { describe, expect, test } from "bun:test"
import { deduplicateProviderSessions, isActiveSession, isBackgroundActivity, lifecycleLabel, matchesSignalScope, providerLetter, providerName, relativeTime, signalGroup, type PresentedSignal } from "../../src/web-client/presentation"

const base: PresentedSignal = {
  kind: "activity",
  source: "codex",
  workspace_id: "workspace-1",
  repository_id: "repository-1",
  surface_id: "surface-1",
  state: "working",
  occurred_at: "2026-07-13T10:00:00.000Z",
}

describe("web signal presentation", () => {
  test("separates attention from recent activity without treating activity as unread", () => {
    expect(signalGroup(base)).toBe("recent-activity")
    expect(signalGroup({ ...base, state: "completed" })).toBe("recent-activity")
    expect(signalGroup({ ...base, state: "waiting" })).toBe("needs-attention")
    expect(signalGroup({ ...base, state: "failed" })).toBe("needs-attention")
    expect(signalGroup({ ...base, kind: "notification", state: undefined })).toBe("needs-attention")
  })

  test("projects active provider and background-work semantics independently", () => {
    expect(isActiveSession(base)).toBe(true)
    expect(isBackgroundActivity(base)).toBe(true)
    expect(isActiveSession({ ...base, state: "waiting" })).toBe(true)
    expect(isBackgroundActivity({ ...base, state: "waiting" })).toBe(false)
    expect(isActiveSession({ ...base, state: "completed" })).toBe(true)
  })

  test("deduplicates sidebar providers while retaining their most important state", () => {
    const sessions = deduplicateProviderSessions([
      { ...base, surface_id: "codex-old", state: "completed", occurred_at: "2026-07-13T10:03:00.000Z" },
      { ...base, surface_id: "codex-new", state: "working", occurred_at: "2026-07-13T10:02:00.000Z" },
      { ...base, source: "copilot", surface_id: "copilot-1", state: "waiting" },
      { ...base, source: "copilot", surface_id: "copilot-2", state: "working", occurred_at: "2026-07-13T10:04:00.000Z" },
      { ...base, kind: "notification", source: "claude" },
    ])

    expect(sessions.map(({ source, state }) => ({ source, state }))).toEqual([
      { source: "copilot", state: "waiting" },
      { source: "codex", state: "working" },
    ])
  })

  test("matches hierarchical scope and provides stable labels", () => {
    expect(matchesSignalScope(base, "workspace-1")).toBe(true)
    expect(matchesSignalScope(base, "workspace-1", "repository-1", "surface-1")).toBe(true)
    expect(matchesSignalScope(base, "workspace-1", "repository-2")).toBe(false)
    expect(providerName("copilot")).toBe("GitHub Copilot")
    expect(providerLetter("codex")).toBe("X")
    expect(lifecycleLabel({ ...base, state: "waiting" })).toBe("Needs input")
  })

  test("formats bounded relative timestamps", () => {
    const now = Date.parse("2026-07-13T12:00:00.000Z")
    expect(relativeTime("2026-07-13T11:59:40.000Z", now)).toBe("now")
    expect(relativeTime("2026-07-13T11:40:00.000Z", now)).toBe("20m ago")
    expect(relativeTime("2026-07-13T10:00:00.000Z", now)).toBe("2h ago")
    expect(relativeTime("invalid", now)).toBe("")
  })
})
