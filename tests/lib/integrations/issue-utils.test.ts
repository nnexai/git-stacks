import { describe, test, expect, mock, beforeEach } from "@test/api"
import type { Workspace } from "@/lib/config"
import { makeConfigMock } from "../../helpers"

// --- Mock canonical core modules used by issue-utils ---

const workspaceExistsMock = mock((_name: string) => false)
const writeWorkspaceMock = mock((_ws: unknown) => {})
let mockWorkspaceData: Record<string, unknown> = {}
const detectWorkspaceFromCwdMock = mock((): { ok: false } | { ok: true; workspace: Workspace } => ({ ok: false }))

mock.module("../../../packages/core/src/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readWorkspace: mock((_name: string) => mockWorkspaceData[_name]),
  writeWorkspace: writeWorkspaceMock,
  updateWorkspace: (name: string, updater: (workspace: unknown) => unknown) => {
    const next = updater(mockWorkspaceData[name])
    mockWorkspaceData[name] = next
    writeWorkspaceMock(next)
    return next
  },
}))

mock.module("../../../packages/core/src/workspace-resolution", () => {
  return { resolveOptionalWorkspace: (name?: string) => {
    if (name) return workspaceExistsMock(name)
      ? { ok: true, workspace: mockWorkspaceData[name] }
      : { ok: false, error: "workspace_not_found", name }
    const detected = detectWorkspaceFromCwdMock()
    return detected.ok ? detected : { ok: false, error: "cwd_not_in_workspace", cwd: process.cwd() }
  } }
})

const {
  resolveIssueRef,
  linkIssue,
  unlinkIssue,
  formatIssueError,
  resolveWorkspaceArg,
} = await import("@/lib/integrations/issue-utils")

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
    detectWorkspaceFromCwdMock.mockReset()
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
    detectWorkspaceFromCwdMock.mockReset()
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
    detectWorkspaceFromCwdMock.mockReset()
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

describe("resolveWorkspaceArg", () => {
  beforeEach(() => {
    workspaceExistsMock.mockReset()
    writeWorkspaceMock.mockReset()
    detectWorkspaceFromCwdMock.mockReset()
    mockWorkspaceData = {}
    workspaceExistsMock.mockImplementation((_name: string) => _name === "my-ws")
    mockWorkspaceData["my-ws"] = makeWorkspace()
    detectWorkspaceFromCwdMock.mockImplementation(() => ({ ok: false }))
  })

  test("returns explicit workspace when it exists", () => {
    expect(resolveWorkspaceArg("my-ws", "github", "link")).toBe("my-ws")
  })

  test("returns detected workspace from cwd when workspace argument is omitted", () => {
    detectWorkspaceFromCwdMock.mockImplementation(() => ({
      ok: true,
      workspace: makeWorkspace() as Workspace,
    }))

    expect(resolveWorkspaceArg(undefined, "github", "link")).toBe("my-ws")
  })

  test("exits with guidance when explicit workspace does not exist", () => {
    workspaceExistsMock.mockImplementation(() => false)
    const exitMock = mock(((_code?: string | number | null) => {
      throw new Error("process.exit")
    }) as typeof process.exit)
    const errorMock = mock((_message: string) => {})
    const previousExit = process.exit
    const previousError = console.error
    process.exit = exitMock
    console.error = errorMock

    try {
      expect(() => resolveWorkspaceArg("missing", "github", "link")).toThrow("process.exit")
      expect(exitMock).toHaveBeenCalledWith(1)
      expect(errorMock.mock.calls[0]?.[0]).toContain("missing")
    } finally {
      process.exit = previousExit
      console.error = previousError
    }
  })

  test("exits with cwd guidance when no workspace can be detected", () => {
    const exitMock = mock(((_code?: string | number | null) => {
      throw new Error("process.exit")
    }) as typeof process.exit)
    const errorMock = mock((_message: string) => {})
    const previousExit = process.exit
    const previousError = console.error
    process.exit = exitMock
    console.error = errorMock

    try {
      expect(() => resolveWorkspaceArg(undefined, "github", "link")).toThrow("process.exit")
      expect(exitMock).toHaveBeenCalledWith(1)
      expect(errorMock.mock.calls[0]?.[0]).toContain("Could not detect workspace")
    } finally {
      process.exit = previousExit
      console.error = previousError
    }
  })
})
