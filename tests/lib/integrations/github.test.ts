import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test"
import { Command } from "commander"

// --- Mock forge-utils BEFORE importing github.ts ---

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
const { _exec, githubIntegration } = await import(
  // @ts-ignore — query param cache-busting
  "@/lib/integrations/github?unit-test-gh"
)

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
  exitMock.mockReset()
  exitMock.mockImplementation((code?: number) => { throw new Error(`process.exit(${code})`) })
})

afterAll(() => {
  process.exit = originalExit
})

// --- Helper to get the pr subcommand ---

function buildParent() {
  const parent = new Command("github")
  githubIntegration.commands(parent)
  parent.exitOverride() // prevent commander from calling process.exit on parse errors
  return parent
}

// --- Tests ---

describe("github pr create", () => {
  test("calls _exec.run with ['pr','create','--base','develop'] and correct cwd", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["pr", "create", "--base", "develop"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='github' as third argument", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect(resolveForgeRepoMock.mock.calls[0][2]).toBe("github")
  })

  test("calls resolveForgeRepo with workspaceName as first arg", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "create", "my-workspace"])
    expect(resolveForgeRepoMock.mock.calls[0][0]).toBe("my-workspace")
  })

  test("exits process when resolveForgeRepo returns error", async () => {
    resolveForgeRepoMock.mockImplementation(() => ({
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

describe("github pr open --web", () => {
  test("calls _exec.run with ['pr','view','--web'] when --web flag is set", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace", "--web"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["pr", "view", "--web"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='github' as third arg for pr open", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace", "--web"])
    expect(resolveForgeRepoMock.mock.calls[0][2]).toBe("github")
  })
})

describe("github pr open (no --web)", () => {
  test("calls _exec.run with ['pr','view','--json','url','--jq','.url'] when no --web flag", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "open", "my-workspace"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["pr", "view", "--json", "url", "--jq", ".url"],
      "/tmp/task/repo-a"
    )
  })
})

describe("github pr status", () => {
  test("calls _exec.run with ['pr','status']", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "status", "my-workspace"])
    expect(_exec.run).toHaveBeenCalledWith(
      ["pr", "status"],
      "/tmp/task/repo-a"
    )
  })

  test("calls resolveForgeRepo with forge='github' as third arg for pr status", async () => {
    const parent = buildParent()
    await parent.parseAsync(["node", "x", "pr", "status", "my-workspace"])
    expect(resolveForgeRepoMock.mock.calls[0][2]).toBe("github")
  })
})
