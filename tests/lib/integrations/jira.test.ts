import { describe, test, expect, mock, beforeEach } from "bun:test"
import { Command } from "commander"

// --- Mocks ---
const linkIssueMock = mock(() => {})
const unlinkIssueMock = mock(() => {})
const resolveIssueRefMock = mock(() => ({
  ok: true as const,
  issueId: "PROJ-123",
  workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
}))
const formatIssueErrorMock = mock((err: any) => `Issue error: ${err.error}`)

mock.module("@/lib/integrations/issue-utils", () => ({
  linkIssue: linkIssueMock,
  unlinkIssue: unlinkIssueMock,
  resolveIssueRef: resolveIssueRefMock,
  formatIssueError: formatIssueErrorMock,
}))

// Named reference so tests can swap return values via .mockImplementation()
const readGlobalConfigMock = mock(() => ({
  integrations: {},
  workspace_root: "/tmp",
}))

mock.module("@/lib/config", () => ({
  workspaceExists: mock(() => true),
  readGlobalConfig: readGlobalConfigMock,
}))

mock.module("@/tui/utils", () => ({
  prompts: {
    text: mock(async () => "jira open $ISSUE_ID"),
    isCancel: mock(() => false),
  },
}))

const { _exec, jiraIntegration } = await import("@/lib/integrations/jira?unit-test")

// Override process.exit to prevent test runner exit
const exitMock = mock((_code?: number) => { throw new Error(`process.exit(${_code})`) })
beforeEach(() => {
  process.exit = exitMock as any
  linkIssueMock.mockClear()
  unlinkIssueMock.mockClear()
  resolveIssueRefMock.mockClear()
  readGlobalConfigMock.mockClear()
  _exec.runShell = mock(async () => ({ exitCode: 0 }))
})

describe("jiraIntegration properties", () => {
  test("id is jira", () => expect(jiraIntegration.id).toBe("jira"))
  test("enabledByDefault is false", () => expect(jiraIntegration.enabledByDefault).toBe(false))
  test("order is 53", () => expect(jiraIntegration.order).toBe(53))
})

describe("issue link", () => {
  test("calls linkIssue with jira tracker", async () => {
    const parent = new Command()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "link", "my-ws", "PROJ-123"])
    expect(linkIssueMock).toHaveBeenCalledWith("my-ws", "jira", "PROJ-123")
  })
})

describe("issue unlink", () => {
  test("calls unlinkIssue with jira tracker", async () => {
    const parent = new Command()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "unlink", "my-ws"])
    expect(unlinkIssueMock).toHaveBeenCalledWith("my-ws", "jira")
  })
})

describe("issue open", () => {
  test("calls _exec.runShell with default template and ISSUE_ID env", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true as const, issueId: "PROJ-123", workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
    }))
    readGlobalConfigMock.mockImplementation(() => ({
      integrations: {},
      workspace_root: "/tmp",
    }))
    const parent = new Command()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    expect(_exec.runShell).toHaveBeenCalledWith(
      "jira open $ISSUE_ID",
      { ISSUE_ID: "PROJ-123" }
    )
  })

  test("uses custom open_cmd from global config", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true as const, issueId: "PROJ-456", workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
    }))
    readGlobalConfigMock.mockImplementation(() => ({
      integrations: {
        jira: { open_cmd: "xdg-open https://company.example.com/browse/$ISSUE_ID" },
      },
      workspace_root: "/tmp",
    }))
    const parent = new Command()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    expect(_exec.runShell).toHaveBeenCalledWith(
      "xdg-open https://company.example.com/browse/$ISSUE_ID",
      { ISSUE_ID: "PROJ-456" }
    )
  })

  test("exits with error when no issue linked", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: false as const, error: "no_issue_linked" as const, tracker: "jira", workspace: "my-ws",
    }))
    const parent = new Command()
    jiraIntegration.commands!(parent)
    await expect(
      parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    ).rejects.toThrow("process.exit(1)")
  })
})
