import { afterEach, describe, expect, mock, test } from "bun:test"
import { _exec, openWorkspaceIssue } from "../../../src/tui/dashboard/issue-actions"

const originalSpawn = _exec.spawn

afterEach(() => {
  _exec.spawn = originalSpawn
})

function mockSpawn() {
  const spawnMock = mock((_args: string[]) => ({
    stdout: new Response("ok\n").body,
    stderr: new Response("").body,
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
})
