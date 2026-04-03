/** @jsxImportSource @opentui/solid */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { testRender } from "@opentui/solid"
import { WorkspaceRow } from "../../../../src/tui/dashboard/WorkspaceRow"
import type { WorkspaceEntry } from "../../../../src/tui/dashboard/types"
import type { MessageRecord } from "../../../../src/lib/messages"

const renderOpts = { kittyKeyboard: true, width: 100, height: 1 }

const baseWorkspace = {
  name: "my-feature",
  branch: "feat/my-feature",
  created: "2026-01-15T10:00:00Z",
  repos: [
    { repo: "api", mode: "worktree" as const, main_path: "/w/main/api", task_path: "/w/tasks/my-feature/api" },
    { repo: "web", mode: "trunk" as const, main_path: "/w/main/web", task_path: "/w/tasks/my-feature/web" },
  ],
}

function makeEntry(overrides: Partial<typeof baseWorkspace> = {}, status: WorkspaceEntry["status"] = { state: "pending" }): WorkspaceEntry {
  return {
    workspace: { ...baseWorkspace, ...overrides } as any,
    status,
  }
}

// Freeze time to exactly 70 days after baseWorkspace.created
// so formatAge produces a deterministic "70d" output
const FROZEN_NOW = new Date("2026-01-15T10:00:00Z").getTime() + (70 * 24 * 60 * 60 * 1000)
const originalDateNow = Date.now

describe("WorkspaceRow snapshots", () => {
  beforeAll(() => {
    Date.now = () => FROZEN_NOW
  })

  afterAll(() => {
    Date.now = originalDateNow
  })

  test("renders focused row with no messages (shows creation date)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={true}
          selected={false}
          messages={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })

  test("renders unfocused row with no messages", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          messages={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })

  test("renders selected row", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={true}
          selected={true}
          messages={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })

  test("renders row with a message preview", async () => {
    const messages: MessageRecord[] = [
      { workspace: "my-feature", text: "Build succeeded", from: "ci", timestamp: "2026-01-15T10:05:00Z" },
    ]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          messages={messages}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })

  test("renders row with system message (no sender)", async () => {
    const messages: MessageRecord[] = [
      { workspace: "my-feature", text: "Workspace created", timestamp: "2026-01-15T10:00:00Z" },
    ]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          messages={messages}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })

  test("renders loaded status with dirty repos", async () => {
    const status: WorkspaceEntry["status"] = {
      state: "loaded",
      hasDirty: true,
      hasMissing: false,
      aheadBehindStale: false,
      repos: [
        { name: "api", exists: true, dirty: true, branch: "feat/my-feature", mode: "worktree", ahead: 0, behind: 0 },
        { name: "web", exists: true, dirty: false, branch: "main", mode: "trunk", ahead: 0, behind: 0 },
      ],
    }
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry({}, status)}
          focused={false}
          selected={false}
          messages={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })

  test("renders ahead/behind indicators with stale suffix", async () => {
    const status: WorkspaceEntry["status"] = {
      state: "loaded",
      hasDirty: false,
      hasMissing: false,
      aheadBehindStale: true,
      repos: [
        { name: "api", exists: true, dirty: false, branch: "feat/my-feature", mode: "worktree", ahead: 3, behind: 2 },
        { name: "web", exists: true, dirty: false, branch: "main", mode: "trunk", ahead: 0, behind: 0 },
      ],
    }
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry({}, status)}
          focused={false}
          selected={false}
          messages={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("↑3?")
    expect(frame).toContain("↓2?")
    expect(frame).not.toContain("↑0")
    expect(frame).not.toContain("↓0")
  })

  test("renders long workspace name truncated", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry({ name: "a-very-long-workspace-name-that-exceeds-column-width" })}
          focused={false}
          selected={false}
          messages={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })

  test("renders long message text truncated", async () => {
    const messages: MessageRecord[] = [
      { workspace: "my-feature", text: "This is a very long message that should be truncated when it exceeds the available column width in the workspace row", from: "ci-pipeline", timestamp: "2026-01-15T10:05:00Z" },
    ]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          messages={messages}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toMatchSnapshot()
  })
})
