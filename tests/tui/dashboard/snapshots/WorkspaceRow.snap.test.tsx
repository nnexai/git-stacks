/** @jsxImportSource @opentui/solid */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { testRender } from "@opentui/solid"
import { WorkspaceRow } from "../../../../packages/tui/src/WorkspaceRow"
import type { WorkspaceEntry } from "../../../../packages/tui/src/types"
import type { DashboardSignal } from "../../../../packages/tui/src/hooks/useSignals"

const renderOpts = { kittyKeyboard: true, width: 100, height: 1 }
const compactFrame = (frame: string) => frame.split("\n").map((line) => line.trimEnd()).join("\n").trimEnd()
let signalId = 0
const notification = (title: string, source = "automation"): DashboardSignal => ({ version: 1, kind: "notification", id: `sig_${String(++signalId).padStart(16, "0")}`, source: source === "ci" || source === "ci-pipeline" ? "automation" : "other", workspace_id: "118f47f4-5ab1-7c2d-8e90-123456789abc", title, occurred_at: "2026-01-15T10:05:00Z", unread: true })

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
          signals={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
  })

  test("renders unfocused row with no messages", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          signals={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
  })

  test("renders selected row", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={true}
          selected={true}
          signals={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
  })

  test("renders row with a message preview", async () => {
    const signals = [notification("Build succeeded", "ci")]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          signals={signals}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
  })

  test("renders row with system message (no sender)", async () => {
    const signals = [notification("Workspace created")]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          signals={signals}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
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
          signals={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
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
          signals={[]}
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
          signals={[]}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
  })

  test("renders long message text truncated", async () => {
    const signals = [notification("This is a very long signal that should be truncated when it exceeds the available column width in the workspace row", "ci-pipeline")]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry()}
          focused={false}
          selected={false}
          signals={signals}
          tick={0}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(compactFrame(captureCharFrame())).toMatchSnapshot()
  })

  test.each([
    ["narrow", 60],
    ["medium", 90],
    ["wide", 130],
  ] as const)("renders %s width row with signal projection last", async (_label, width) => {
    const signals = [notification("Needs operator attention before handoff", "ci")]
    const status: WorkspaceEntry["status"] = {
      state: "loaded",
      hasDirty: true,
      hasMissing: false,
      aheadBehindStale: false,
      repos: [
        { name: "api", exists: true, dirty: true, branch: "feat/my-feature", mode: "worktree", ahead: 2, behind: 1 },
        { name: "web", exists: true, dirty: false, branch: "main", mode: "trunk", ahead: 0, behind: 0 },
      ],
    }
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceRow
          entry={makeEntry({ labels: ["backend", "urgent"] } as any, status)}
          focused={true}
          selected={false}
          signals={signals}
          tick={0}
        />
      ),
      { kittyKeyboard: true, width, height: 1 }
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("↑2")
    expect(frame).toContain("↓1")
    if (width >= 90) expect(frame).toContain("automatio")
    if (width >= 90) expect(frame.trimEnd()).toMatch(/\d+[smhd]$/)
    expect(compactFrame(frame)).toMatchSnapshot()
  })
})
