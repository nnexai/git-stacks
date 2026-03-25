import { describe, test, expect, mock, beforeEach } from "bun:test"
import { makeConfigMock } from "../../helpers"

// --- Mock config module ---

const workspaceExistsMock = mock((_name: string) => false)
const writeWorkspaceMock = mock((_ws: unknown) => {})
let mockWorkspaceData: Record<string, unknown> = {}

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readWorkspace: mock((_name: string) => mockWorkspaceData[_name]),
  writeWorkspace: writeWorkspaceMock,
}))

// Cache-busting import to avoid stale module cache
const { resolveIssueRef, linkIssue, unlinkIssue, formatIssueError } = await import(
  // @ts-ignore — cache-busting for bun module cache
  "@/lib/integrations/issue-utils?unit-test"
)

// --- Factory helpers ---

function makeWorkspace(overrides: Partial<{ settings: unknown }> = {}): unknown {
  return {
    name: "my-ws",
    schema_version: "1",
    branch: "feat/test",
    created: "2026-01-01",
    repos: [],
    ...overrides,
  }
}

// --- resolveIssueRef tests ---

describe("resolveIssueRef", () => {
  beforeEach(() => {
    workspaceExistsMock.mockReset()
    writeWorkspaceMock.mockReset()
    mockWorkspaceData = {}
    // Default: workspace does not exist
    workspaceExistsMock.mockImplementation((_name: string) => _name === "my-ws")
    // Default workspace data
    mockWorkspaceData["my-ws"] = makeWorkspace()
  })

  test("returns workspace_not_found for nonexistent workspace", () => {
    workspaceExistsMock.mockImplementation(() => false)
    const result = resolveIssueRef("nonexistent", "github")
    expect(result).toEqual({ ok: false, error: "workspace_not_found", name: "nonexistent" })
  })

  test("returns issueId when issue linked under settings.integrations.github.issue", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace({
      settings: { integrations: { github: { issue: "42" } } },
    })
    const result = resolveIssueRef("my-ws", "github")
    expect(result).toEqual({
      ok: true,
      issueId: "42",
      workspace: mockWorkspaceData["my-ws"],
    })
  })

  test("returns no_issue_linked when no issue stored for the tracker", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace({
      settings: { integrations: { github: { enabled: true } } },
    })
    const result = resolveIssueRef("my-ws", "github")
    expect(result).toEqual({
      ok: false,
      error: "no_issue_linked",
      tracker: "github",
      workspace: "my-ws",
    })
  })

  test("returns no_issue_linked when workspace has no settings", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace()
    const result = resolveIssueRef("my-ws", "github")
    expect(result).toEqual({
      ok: false,
      error: "no_issue_linked",
      tracker: "github",
      workspace: "my-ws",
    })
  })

  test("returns issueId for jira key format (PROJ-123)", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace({
      settings: { integrations: { jira: { issue: "PROJ-123" } } },
    })
    const result = resolveIssueRef("my-ws", "jira")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.issueId).toBe("PROJ-123")
    }
  })

  test("coerces numeric issue ID to string", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace({
      settings: { integrations: { github: { issue: 42 } } },
    })
    const result = resolveIssueRef("my-ws", "github")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.issueId).toBe("42")
      expect(typeof result.issueId).toBe("string")
    }
  })
})

// --- linkIssue tests ---

describe("linkIssue", () => {
  beforeEach(() => {
    workspaceExistsMock.mockReset()
    writeWorkspaceMock.mockReset()
    mockWorkspaceData = {}
    workspaceExistsMock.mockImplementation((_name: string) => _name === "my-ws")
    mockWorkspaceData["my-ws"] = makeWorkspace()
  })

  test("writes issue under settings.integrations.github", () => {
    linkIssue("my-ws", "github", "42")
    expect(writeWorkspaceMock.mock.calls.length).toBe(1)
    const written = writeWorkspaceMock.mock.calls[0][0] as any
    expect(written.settings?.integrations?.github?.issue).toBe("42")
  })

  test("preserves existing config fields (enabled: true) when adding issue", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace({
      settings: { integrations: { github: { enabled: true } } },
    })
    linkIssue("my-ws", "github", "42")
    const written = writeWorkspaceMock.mock.calls[0][0] as any
    expect(written.settings?.integrations?.github).toEqual({ enabled: true, issue: "42" })
  })

  test("creates settings path if workspace has no settings", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace()
    linkIssue("my-ws", "github", "42")
    const written = writeWorkspaceMock.mock.calls[0][0] as any
    expect(written.settings?.integrations?.github?.issue).toBe("42")
  })
})

// --- unlinkIssue tests ---

describe("unlinkIssue", () => {
  beforeEach(() => {
    workspaceExistsMock.mockReset()
    writeWorkspaceMock.mockReset()
    mockWorkspaceData = {}
    workspaceExistsMock.mockImplementation((_name: string) => _name === "my-ws")
    mockWorkspaceData["my-ws"] = makeWorkspace()
  })

  test("removes issue key but preserves other fields (enabled: true)", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace({
      settings: { integrations: { github: { enabled: true, issue: "42" } } },
    })
    unlinkIssue("my-ws", "github")
    const written = writeWorkspaceMock.mock.calls[0][0] as any
    expect(written.settings?.integrations?.github).toEqual({ enabled: true })
    expect(written.settings?.integrations?.github?.issue).toBeUndefined()
  })

  test("does not error when no issue was linked", () => {
    mockWorkspaceData["my-ws"] = makeWorkspace({
      settings: { integrations: { github: { enabled: true } } },
    })
    expect(() => unlinkIssue("my-ws", "github")).not.toThrow()
    const written = writeWorkspaceMock.mock.calls[0][0] as any
    expect(written.settings?.integrations?.github).toEqual({ enabled: true })
  })
})

// --- formatIssueError tests ---

describe("formatIssueError", () => {
  test("workspace_not_found includes workspace name", () => {
    const msg = formatIssueError({ ok: false, error: "workspace_not_found", name: "my-ws" })
    expect(msg).toContain("my-ws")
    expect(msg.toLowerCase()).toContain("not found")
  })

  test("no_issue_linked suggests link command with tracker and workspace", () => {
    const msg = formatIssueError({ ok: false, error: "no_issue_linked", tracker: "github", workspace: "my-ws" })
    expect(msg).toContain("my-ws")
    expect(msg).toContain("github")
    expect(msg.toLowerCase()).toContain("link")
  })
})
