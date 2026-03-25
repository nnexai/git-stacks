import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test"
import { Command } from "commander"
import { makeConfigMock, makeForgeUtilsMock, makeIssueUtilsMock } from "../../helpers"

// --- Mock forge-utils BEFORE importing gitlab.ts ---

const resolveForgeRepoMock = mock(() => ({
  ok: true,
  workspace: { name: "my-workspace", branch: "feat/my-ws", repos: [] },
  repo: { name: "repo-a", task_path: "/tmp/task/repo-a", mode: "worktree" },
  repoPath: "/tmp/task/repo-a",
  baseBranch: "develop",
}))

const formatForgeErrorMock = mock((err: any) => `Error: ${err.error}`)

mock.module("@/lib/integrations/forge-utils", () => makeForgeUtilsMock({
  resolveForgeRepo: resolveForgeRepoMock,
  resolveForgeRepoAnyMode: mock(() => ({ ok: true, repoPath: "/tmp/task/repo-a" })),
  resolveRepoCwd: mock(async () => "/tmp/task/repo-a"),
  formatForgeError: formatForgeErrorMock,
}))

// --- Mock issue-utils BEFORE importing gitlab.ts ---

const linkIssueMock = mock(() => {})
const unlinkIssueMock = mock(() => {})
const resolveIssueRefMock = mock(() => ({
  ok: true,
  issueId: "15",
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

// --- Mock config (for workspaceExists) ---

// workspaceExists returns true only for "my-ws" to support disambiguation tests
const workspaceExistsMock = mock((name: string) => name === "my-ws")

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
}))

const { _exec, gitlabIntegration } = await import("@/lib/integrations/gitlab")

// --- Override process.exit to prevent test runner from exiting ---

const originalExit = process.exit
const exitMock = mock((code?: number) => { throw new Error(`process.exit(${code})`) })

beforeEach(() => {
  process.exit = exitMock as any
  _exec.run = mock(async () => ({ exitCode: 0 }))
  resolveForgeRepoMock.mockReset()
  resolveForgeRepoMock.mockImplementation(() => ({
    ok: true,
    workspace: { name: "my-workspace", branch: "feat/my-ws", repos: [] },
    repo: { name: "repo-a", task_path: "/tmp/task/repo-a", mode: "worktree" },
    repoPath: "/tmp/task/repo-a",
    baseBranch: "develop",
  }))
  resolveIssueRefMock.mockReset()
  resolveIssueRefMock.mockImplementation(() => ({
    ok: true,
    issueId: "15",
    workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] },
  }))
  resolveWorkspaceArgMock.mockReset()
  resolveWorkspaceArgMock.mockImplementation((name: string | undefined) => name ?? "detected-ws")
  workspaceExistsMock.mockReset()
  workspaceExistsMock.mockImplementation((name: string) => name === "my-ws")
  linkIssueMock.mockReset()
  unlinkIssueMock.mockReset()
  exitMock.mockReset()
  exitMock.mockImplementation((code?: number) => { throw new Error(`process.exit(${code})`) })
})

afterAll(() => {
  process.exit = originalExit
})

// --- Helper to get the pr subcommand ---

function buildParent() {
  const parent = new Command("gitlab")
  gitlabIntegration.commands(parent)
  parent.exitOverride()
  return parent
}

// --- Tests ---

describe("gitlab pr create", () => {
  test("calls _exec.run with ['mr','create','--target-branch','develop'] and correct cwd", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["mr", "create", "--target-branch", "develop"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='gitlab' as third argument", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect((resolveForgeRepoMock.mock.calls[0] as any[])[2]).toBe("gitlab")
  })

  test("calls resolveForgeRepo with workspaceName as first arg", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect((resolveForgeRepoMock.mock.calls[0] as any[])[0]).toBe("my-workspace")
  })

  test("exits process when resolveForgeRepo returns error", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(resolveForgeRepoMock as any).mockImplementation(() => ({
      ok: false,
      error: "workspace_not_found",
      name: "bad-ws",
    }))
    const parent = buildParent()
    await expect(
      parent.parseAsync(["node", "x", "pr", "create", "bad-ws"])
    ).rejects.toThrow("process.exit")
  })
})

describe("gitlab pr open --web", () => {
  test("calls _exec.run with ['mr','view','--web'] when --web flag is set", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace", "--web"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["mr", "view", "--web"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='gitlab' as third arg for pr open", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace", "--web"])
    expect((resolveForgeRepoMock.mock.calls[0] as any[])[2]).toBe("gitlab")
  })
})

describe("gitlab pr status", () => {
  test("calls _exec.run with ['mr','list'] (NOT 'mr status' — glab does not have mr status)", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "status", "my-workspace"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["mr", "list"],
      "/tmp/task/repo-a"
    )
  })

  test("does NOT call _exec.run with ['mr','status']", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "status", "my-workspace"])
    const calls = (_exec.run as ReturnType<typeof mock>).mock.calls
    const calledWithMrStatus = calls.some((args: any[]) =>
      Array.isArray(args[0]) && args[0][0] === "mr" && args[0][1] === "status"
    )
    expect(calledWithMrStatus).toBe(false)
  })

  test("calls resolveForgeRepo with forge='gitlab' as third arg for pr status", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "status", "my-workspace"])
    expect((resolveForgeRepoMock.mock.calls[0] as any[])[2]).toBe("gitlab")
  })
})

describe("gitlab issue commands", () => {
  test("issue link with two args calls linkIssue with correct args (backward compat)", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "link", "my-ws", "15"])
    expect(linkIssueMock).toHaveBeenCalledWith("my-ws", "gitlab", "15")
  })

  test("issue link with one arg (CWD fallback) calls resolveWorkspaceArg and linkIssue", async () => {
    // "99" is not a workspace name (workspaceExists returns false)
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "link", "99"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith(undefined, "gitlab", "link")
    expect(linkIssueMock).toHaveBeenCalledWith("detected-ws", "gitlab", "99")
  })

  test("issue link with one arg that is a workspace name exits with missing issue ID error", async () => {
    // "my-ws" is a workspace name (workspaceExists returns true)
    const parent = buildParent()
    await expect(
      parent.parseAsync(["node", "x", "issue", "link", "my-ws"])
    ).rejects.toThrow("process.exit(1)")
  })

  test("issue link with no args exits with missing issue ID error", async () => {
    const parent = buildParent()
    await expect(
      parent.parseAsync(["node", "x", "issue", "link"])
    ).rejects.toThrow("process.exit(1)")
  })

  test("issue unlink with explicit workspace calls resolveWorkspaceArg and unlinkIssue", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "unlink", "my-ws"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith("my-ws", "gitlab", "unlink")
    expect(unlinkIssueMock).toHaveBeenCalledWith("my-ws", "gitlab")
  })

  test("issue unlink with no args (CWD fallback) calls resolveWorkspaceArg with undefined", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "unlink"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith(undefined, "gitlab", "unlink")
    expect(unlinkIssueMock).toHaveBeenCalledWith("detected-ws", "gitlab")
  })

  test("issue open --web calls _exec.run with glab issue view --web", async () => {
    _exec.run = mock(async () => ({ exitCode: 0 }))
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true, issueId: "15", workspace: { name: "my-ws", branch: "feat/my-ws", repos: [] }
    }))
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws", "--web"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["issue", "view", "15", "--web"],
      "/tmp/task/repo-a"
    )
  })

  test("issue open (no --web) calls _exec.run with --output json", async () => {
    _exec.run = mock(async () => ({ exitCode: 0 }))
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["issue", "view", "15", "--output", "json"],
      "/tmp/task/repo-a"
    )
  })

  test("issue open with no args (CWD fallback) calls resolveWorkspaceArg with undefined", async () => {
    resolveIssueRefMock.mockImplementation(() => ({
      ok: true, issueId: "15", workspace: { name: "detected-ws", branch: "feat/my-ws", repos: [] }
    }))
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "open"])
    expect(resolveWorkspaceArgMock).toHaveBeenCalledWith(undefined, "gitlab", "open")
  })

  test("issue open with no linked issue prints error and exits", async () => {
    resolveIssueRefMock.mockImplementation((() => ({
      ok: false,
      error: "no_issue_linked",
      tracker: "gitlab",
      workspace: "my-ws",
    })) as any)
    const parent = buildParent()
    await expect(
      parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    ).rejects.toThrow("process.exit")
  })

  test("issue open uses resolveForgeRepo for CWD", async () => {
    _exec.run = mock(async () => ({ exitCode: 0 }))
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "issue", "open", "my-ws"])
    expect(resolveForgeRepoMock).toHaveBeenCalledWith("my-ws", undefined, "gitlab")
  })
})
