import { describe, test, expect, mock, beforeEach } from "@test/api"
import { Command } from "commander"
import { makeConfigMock, makeIssueUtilsMock } from "../../helpers"

// --- Mocks ---
const linkIssueMock = mock(() => {})
const unlinkIssueMock = mock(() => {})
const resolveIssueRefMock = mock((): any => ({
  ok: true,
  issueId: "PROJ-123",
  workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
}))
const formatIssueErrorMock = mock((err: any) => `Issue error: ${err.error}`)
const resolveWorkspaceArgMock = mock((name: string | undefined) => name ?? "detected-ws")

mock.module("@/lib/integrations/issue-utils", () => makeIssueUtilsMock({
  linkIssue: linkIssueMock,
  unlinkIssue: unlinkIssueMock,
  resolveIssueRef: resolveIssueRefMock,
  formatIssueError: formatIssueErrorMock,
  resolveWorkspaceArg: resolveWorkspaceArgMock,
}))

// Named reference so tests can swap return values via .mockImplementation()
const readGlobalConfigMock = mock(() => ({
  integrations: {},
  workspace_root: "/tmp",
}))

// workspaceExists returns true only for "my-ws" (function-based mock for disambiguation tests)
const workspaceExistsMock = mock((name: string) => name === "my-ws")

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readGlobalConfig: readGlobalConfigMock,
}))

mock.module("@/tui/utils", () => ({
  prompts: {
    text: mock(async () => "jira open $ISSUE_ID"),
    isCancel: mock(() => false),
  },
}))

const { _exec, jiraIntegration } = await import("@/lib/integrations/jira")

// Override process.exit to prevent test runner exit
const exitMock = mock((_code?: number) => { throw new Error(`process.exit(${_code})`) })
beforeEach(() => {
  process.exit = exitMock as any
  linkIssueMock.mockClear()
  unlinkIssueMock.mockClear()
  resolveIssueRefMock.mockClear()
  resolveWorkspaceArgMock.mockClear()
  workspaceExistsMock.mockClear()
  readGlobalConfigMock.mockClear()
  exitMock.mockClear()
  exitMock.mockImplementation((_code?: number) => { throw new Error(`process.exit(${_code})`) })
  resolveWorkspaceArgMock.mockImplementation((name: string | undefined) => name ?? "detected-ws")
  workspaceExistsMock.mockImplementation((name: string) => name === "my-ws")
  _exec.runShell = mock(async () => ({ exitCode: 0 }))
})

describe("jiraIntegration properties", () => {
  test("id is jira", () => expect(jiraIntegration.id).toBe("jira"))
  test("enabledByDefault is false", () => expect(jiraIntegration.enabledByDefault).toBe(false))
  test("order is 53", () => expect(jiraIntegration.order).toBe(53))
})

describe("issue link — two-arg backward compat", () => {
  test("link with two args calls linkIssue with explicit workspace (backward compat)", async () => {
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "link", "my-ws", "PROJ-123"])
    expect(linkIssueMock).toHaveBeenCalledWith("my-ws", "jira", "PROJ-123")
  })

  test("link with two args does NOT call resolveWorkspaceArg", async () => {
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "link", "my-ws", "PROJ-123"])
    expect(resolveWorkspaceArgMock).not.toHaveBeenCalled()
  })
})

describe("issue link — one arg (CWD fallback)", () => {
  test("link with one arg that is NOT a workspace name treats it as issue-id and CWD-detects workspace", async () => {
    // "PROJ-123" is not a workspace name (workspaceExists returns false for it)
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "link", "PROJ-123"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith(undefined, "jira", "link")
    expect(linkIssueMock).toHaveBeenCalledWith("detected-ws", "jira", "PROJ-123")
  })

  test("link with one arg that IS a workspace name exits with missing issue ID error", async () => {
    // "my-ws" is a workspace name (workspaceExists returns true)
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await expect(
      parent.parseAsync(["node", "x", "issue", "link", "my-ws"])
    ).rejects.toThrow("process.exit(1)")
  })

  test("link with no args exits with missing issue ID error", async () => {
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await expect(
      parent.parseAsync(["node", "x", "issue", "link"])
    ).rejects.toThrow("process.exit(1)")
  })
})

describe("issue unlink", () => {
  test("unlink with explicit workspace calls resolveWorkspaceArg with workspace name", async () => {
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "unlink", "my-ws"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith("my-ws", "jira", "unlink")
    expect(unlinkIssueMock).toHaveBeenCalledWith("my-ws", "jira")
  })

  test("unlink with no args (CWD fallback) calls resolveWorkspaceArg with undefined", async () => {
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "unlink"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith(undefined, "jira", "unlink")
    expect(unlinkIssueMock).toHaveBeenCalledWith("detected-ws", "jira")
  })
})

describe("issue open", () => {
  test("open with explicit workspace calls resolveWorkspaceArg with workspace name", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true, issueId: "PROJ-123", workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
    }))
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith("my-ws", "jira", "open")
  })

  test("open with no args (CWD fallback) calls resolveWorkspaceArg with undefined", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true, issueId: "PROJ-123", workspace: { name: "detected-ws", branch: "feat/detected", repos: [] },
    }))
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "open"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith(undefined, "jira", "open")
  })

  test("calls _exec.runShell with default template and ISSUE_ID env", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true, issueId: "PROJ-123", workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
    }))
    readGlobalConfigMock.mockImplementation(() => ({
      integrations: {},
      workspace_root: "/tmp",
    }))
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    expect(_exec.runShell).toHaveBeenCalledWith(
      "jira open $ISSUE_ID",
      { ISSUE_ID: "PROJ-123" }
    )
  })

  test("uses custom open_cmd from global config", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true, issueId: "PROJ-456", workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
    }))
    readGlobalConfigMock.mockImplementation(() => ({
      integrations: {
        jira: { open_cmd: "xdg-open https://company.example.com/browse/$ISSUE_ID" },
      },
      workspace_root: "/tmp",
    }))
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    expect(_exec.runShell).toHaveBeenCalledWith(
      "xdg-open https://company.example.com/browse/$ISSUE_ID",
      { ISSUE_ID: "PROJ-456" }
    )
  })

  test("propagates nonzero open command exit code", async () => {
    _exec.runShell = mock(async () => ({ exitCode: 11 }))
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true, issueId: "PROJ-789", workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
    }))
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await expect(
      parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    ).rejects.toThrow("process.exit(11)")
    expect(exitMock).toHaveBeenCalledWith(11)
  })

  test("exits with error when no issue linked", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: false, error: "no_issue_linked", tracker: "jira", workspace: "my-ws",
    }))
    const parent = new Command()
    parent.exitOverride()
    jiraIntegration.commands!(parent)
    await expect(
      parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    ).rejects.toThrow("process.exit(1)")
  })
})
