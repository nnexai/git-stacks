import { describe, test, expect, mock, beforeEach, afterAll, spyOn } from "bun:test"
import { Command } from "commander"

// --- Mock forge-utils BEFORE importing gitea.ts ---

const resolveForgeRepoMock = mock(() => ({
  ok: true,
  workspace: { name: "my-workspace", branch: "feat/my-ws", repos: [] },
  repo: { name: "repo-a", task_path: "/tmp/task/repo-a", mode: "worktree" },
  repoPath: "/tmp/task/repo-a",
  baseBranch: "develop",
}))

const formatForgeErrorMock = mock((err: any) => `Error: ${err.error}`)

mock.module("@/lib/integrations/forge-utils", () => ({
  resolveForgeRepo: resolveForgeRepoMock,
  formatForgeError: formatForgeErrorMock,
}))

// Cache-busting import
const { _exec, giteaIntegration } = await import(
  // @ts-ignore — query param cache-busting
  "@/lib/integrations/gitea?unit-test-gitea"
)

// --- Override process.exit to prevent test runner from exiting ---

const originalExit = process.exit
const exitMock = mock((code?: number) => { throw new Error(`process.exit(${code})`) })

beforeEach(() => {
  process.exit = exitMock as any
  _exec.run = mock(async () => ({ exitCode: 0 }))
  _exec.runCapture = mock(async () => ({ exitCode: 0, stdout: "[]" }))
  _exec.openUrl = mock(async () => ({ exitCode: 0 }))
  resolveForgeRepoMock.mockReset()
  resolveForgeRepoMock.mockImplementation(() => ({
    ok: true,
    workspace: { name: "my-workspace", branch: "feat/my-ws", repos: [] },
    repo: { name: "repo-a", task_path: "/tmp/task/repo-a", mode: "worktree" },
    repoPath: "/tmp/task/repo-a",
    baseBranch: "develop",
  }))
  exitMock.mockReset()
  exitMock.mockImplementation((code?: number) => { throw new Error(`process.exit(${code})`) })
})

afterAll(() => {
  process.exit = originalExit
})

// --- Helper to build parent command ---

function buildParent() {
  const parent = new Command("gitea")
  giteaIntegration.commands(parent)
  parent.exitOverride()
  return parent
}

// --- Tests ---

describe("gitea pr create", () => {
  test("calls _exec.run with ['pulls','create','--base','develop'] and correct cwd", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["pulls", "create", "--base", "develop"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='gitea' as third argument", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect((resolveForgeRepoMock.mock.calls[0] as any[])[2]).toBe("gitea")
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

describe("gitea pr open", () => {
  const fakePrs = [
    {
      head: { ref: "feat/my-ws", label: "user:feat/my-ws" },
      html_url: "https://gitea.example.com/org/repo/pulls/42",
    },
    {
      head: { ref: "other-branch", label: "user:other-branch" },
      html_url: "https://gitea.example.com/org/repo/pulls/43",
    },
  ]

  test("calls _exec.runCapture with ['pulls','ls','--output','json','--state','all']", async () => {
    _exec.runCapture = mock(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(fakePrs),
    }))
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace"])
    expect(_exec.runCapture).toHaveBeenCalledWith(
      ["pulls", "ls", "--output", "json", "--state", "all"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='gitea' as third arg for pr open", async () => {
    _exec.runCapture = mock(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(fakePrs),
    }))
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace"])
    expect((resolveForgeRepoMock.mock.calls[0] as any[])[2]).toBe("gitea")
  })

  test("prints URL to stdout when PR found by head.ref", async () => {
    _exec.runCapture = mock(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(fakePrs),
    }))
    const consoleSpy = spyOn(console, "log")
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace"])
    const calls = consoleSpy.mock.calls.map((c: any[]) => c[0])
    expect(calls).toContain("https://gitea.example.com/org/repo/pulls/42")
    consoleSpy.mockRestore()
  })

  test("calls _exec.openUrl with the PR URL when --web flag is set", async () => {
    _exec.runCapture = mock(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(fakePrs),
    }))
    _exec.openUrl = mock(async () => ({ exitCode: 0 }))
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace", "--web"])
    expect(_exec.openUrl).toHaveBeenCalledWith("https://gitea.example.com/org/repo/pulls/42")
  })

  test("exits with error when no PR found for branch", async () => {
    _exec.runCapture = mock(async () => ({
      exitCode: 0,
      stdout: JSON.stringify([
        { head: { ref: "different-branch", label: "user:different-branch" }, html_url: "https://gitea.example.com/pulls/99" },
      ]),
    }))
    const parent = buildParent()
    await expect(
      parent.parseAsync(["node", "x", "pr", "open", "my-workspace"])
    ).rejects.toThrow("process.exit")
  })
})

describe("gitea pr status", () => {
  test("calls _exec.run with ['pulls','ls','--state','open']", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "status", "my-workspace"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["pulls", "ls", "--state", "open"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='gitea' as third arg for pr status", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "status", "my-workspace"])
    expect((resolveForgeRepoMock.mock.calls[0] as any[])[2]).toBe("gitea")
  })
})
