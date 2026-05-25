import { afterEach, describe, expect, mock, test } from "bun:test"
import type { _exec as ExecType } from "../../../src/tui/dashboard/issue-actions"

// @ts-ignore - Bun supports query-suffixed imports for test module isolation.
const actual = await import("../../../src/tui/dashboard/issue-actions?issue-actions-test")
const { _exec, openWorkspaceIssue } = actual as typeof import("../../../src/tui/dashboard/issue-actions") & {
  _exec: typeof ExecType
}

const originalSpawn = _exec.spawn

afterEach(() => {
  _exec.spawn = originalSpawn
})

function mockSpawn() {
  const spawnMock = mock((_args: string[]) => ({
    stdout: new Response("ok\n").body,
    stderr: new Response("warn\n").body,
    exited: Promise.resolve(0),
  }))
  _exec.spawn = spawnMock as unknown as typeof Bun.spawn
  return spawnMock
}

describe("openWorkspaceIssue", () => {
  test("passes --web for forge issue trackers", async () => {
    const spawnMock = mockSpawn()
    await openWorkspaceIssue("test-ws", { tracker: "github", issueId: "123", label: "GitHub: 123" })
    expect(spawnMock.mock.calls[0][0]).toEqual([
      "git-stacks",
      "integration",
      "github",
      "issue",
      "open",
      "test-ws",
      "--web",
    ])
  })

  test("does not pass --web to Jira issue command", async () => {
    const spawnMock = mockSpawn()
    await openWorkspaceIssue("test-ws", { tracker: "jira", issueId: "OPS-1", label: "Jira: OPS-1" })
    expect(spawnMock.mock.calls[0][0]).toEqual([
      "git-stacks",
      "integration",
      "jira",
      "issue",
      "open",
      "test-ws",
    ])
  })

  test("returns stdout and stderr lines with stream tags", async () => {
    mockSpawn()
    const result = await openWorkspaceIssue("test-ws", { tracker: "github", issueId: "123", label: "GitHub: 123" })

    expect(result.lines).toEqual([
      { text: "ok", stream: "stdout" },
      { text: "warn", stream: "stderr" },
    ])
  })

  test("preserves nonzero exit code", async () => {
    const spawnMock = mock((_args: string[]) => ({
      stdout: new Response("").body,
      stderr: new Response("failed\n").body,
      exited: Promise.resolve(7),
    }))
    _exec.spawn = spawnMock as unknown as typeof Bun.spawn

    const result = await openWorkspaceIssue("test-ws", { tracker: "github", issueId: "123", label: "GitHub: 123" })

    expect(result.exitCode).toBe(7)
    expect(result.lines).toEqual([{ text: "failed", stream: "stderr" }])
  })
})
