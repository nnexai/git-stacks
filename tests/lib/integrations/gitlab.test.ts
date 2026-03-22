import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test"
import { Command } from "commander"

// --- Mock forge-utils BEFORE importing gitlab.ts ---

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
const { _exec, gitlabIntegration } = await import(
  // @ts-ignore — query param cache-busting
  "@/lib/integrations/gitlab?unit-test-gl"
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
