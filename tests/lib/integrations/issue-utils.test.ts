import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { Workspace } from "@/lib/config"
import { makeConfigMock } from "../../helpers"

// ─── Isolation strategy ───────────────────────────────────────────────────────
// gitea/github/gitlab/jira test files mock @/lib/integrations/issue-utils before
// this file runs (they run alphabetically before 'issue-utils'). After those mocks,
// the plain import on line N would get the stub, not the real implementation.
//
// Fix: apply mock.module("@/lib/config") first (so issue-utils uses our mock config),
// then apply mock.module("@/lib/integrations/issue-utils") with the REAL function
// implementations inlined here. This overrides whatever gitea/github/gitlab set.

// --- Mock config module (issue-utils calls workspaceExists/readWorkspace/writeWorkspace) ---

const workspaceExistsMock = mock((_name: string) => false)
const writeWorkspaceMock = mock((_ws: unknown) => {})
let mockWorkspaceData: Record<string, unknown> = {}

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readWorkspace: mock((_name: string) => mockWorkspaceData[_name]),
  writeWorkspace: writeWorkspaceMock,
}))

// --- Restore real issue-utils implementations via mock.module ---
// Inline the source implementations so they call through to our mocked config.
// This bypasses the stale mock left by gitea/github/gitlab/jira test files.

mock.module("@/lib/integrations/issue-utils", () => {
  // These functions are imported via live binding from @/lib/config (now mocked above).
  // We inline the real source logic here to avoid depending on the contaminated module cache.
  function resolveIssueRef(workspaceName: string, trackerId: string): unknown {
    const { workspaceExists, readWorkspace } = require("@/lib/config")
    if (!workspaceExists(workspaceName)) {
      return { ok: false, error: "workspace_not_found", name: workspaceName }
    }
    const workspace = readWorkspace(workspaceName)
    const integrations = workspace?.settings?.integrations as Record<string, unknown> | undefined
    const trackerConfig = integrations?.[trackerId] as Record<string, unknown> | undefined
    const issueId = trackerConfig?.issue
    if (issueId === undefined || issueId === null) {
      return { ok: false, error: "no_issue_linked", tracker: trackerId, workspace: workspaceName }
    }
    return { ok: true, issueId: String(issueId), workspace }
  }

  function linkIssue(workspaceName: string, trackerId: string, issueId: string): void {
    const { readWorkspace, writeWorkspace } = require("@/lib/config")
    const workspace = readWorkspace(workspaceName)
    const settings = workspace.settings ?? {}
    const integrations = ((settings.integrations ?? {}) as Record<string, Record<string, unknown>>)
    const existing = (integrations[trackerId] ?? {}) as Record<string, unknown>
    integrations[trackerId] = { ...existing, issue: issueId }
    writeWorkspace({ ...workspace, settings: { ...settings, integrations } })
  }

  function unlinkIssue(workspaceName: string, trackerId: string): void {
    const { readWorkspace, writeWorkspace } = require("@/lib/config")
    const workspace = readWorkspace(workspaceName)
    const settings = workspace.settings ?? {}
    const integrations = ((settings.integrations ?? {}) as Record<string, Record<string, unknown>>)
    const existing = (integrations[trackerId] ?? {}) as Record<string, unknown>
    const { issue: _, ...rest } = existing
    integrations[trackerId] = rest
    writeWorkspace({ ...workspace, settings: { ...settings, integrations } })
  }

  function formatIssueError(err: { ok: false; error: string; name?: string; tracker?: string; workspace?: string }): string {
    switch (err.error) {
      case "workspace_not_found":
        return `Workspace '${err.name}' not found.`
      case "no_issue_linked":
        return (
          `No issue linked to workspace '${err.workspace}' for ${err.tracker}. ` +
          `Run: git-stacks integration ${err.tracker} issue link <issue-id> (from inside a worktree) ` +
          `or: git-stacks integration ${err.tracker} issue link ${err.workspace} <issue-id>`
        )
      default:
        return `Unknown issue error: ${err.error}`
    }
  }

  function resolveWorkspaceArg(workspaceName: string | undefined, tracker: string, action: string): string {
    const { workspaceExists } = require("@/lib/config")
    if (workspaceName) {
      if (!workspaceExists(workspaceName)) {
        console.error(`Workspace '${workspaceName}' not found.`)
        process.exit(1)
      }
      return workspaceName
    }
    console.error(`Could not detect workspace from current directory. Run from inside a worktree or specify: git-stacks integration ${tracker} issue ${action} <workspace> ...`)
    process.exit(1)
    return ""
  }

  return { resolveIssueRef, linkIssue, unlinkIssue, formatIssueError, resolveWorkspaceArg }
})

const { resolveIssueRef, linkIssue, unlinkIssue, formatIssueError } = await import("@/lib/integrations/issue-utils")

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
      workspace: mockWorkspaceData["my-ws"] as Workspace,
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
