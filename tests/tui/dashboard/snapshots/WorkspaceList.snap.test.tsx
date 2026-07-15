/** @jsxImportSource @opentui/solid */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { WorkspaceList } from "../../../../packages/tui/src/WorkspaceList"
import type { GroupedWorkspaceItem, WorkspaceEntry } from "../../../../packages/tui/src/types"

const entries: WorkspaceEntry[] = [
  {
    workspace: {
      name: "api-fix",
      branch: "feature/api-fix",
      created: "2026-01-15T00:00:00.000Z",
      repos: [
        { repo: "api", mode: "worktree", main_path: "/repos/api", task_path: "/tasks/api-fix/api" },
      ],
      labels: ["backend"],
      schema_version: "1",
    } as any,
    status: {
      state: "loaded",
      hasDirty: true,
      hasMissing: false,
      aheadBehindStale: false,
      repos: [{ name: "api", exists: true, dirty: true, branch: "feature/api-fix", mode: "worktree", ahead: 1, behind: 0 }],
    },
  },
  {
    workspace: {
      name: "plain",
      branch: "feature/plain",
      created: "2026-01-15T00:00:00.000Z",
      repos: [],
      schema_version: "1",
    } as any,
    status: { state: "pending" },
  },
]

function grouped(label: string): GroupedWorkspaceItem[] {
  return [
    { kind: "header", label },
    { kind: "entry", entry: entries[0]!, originalIndex: 0 },
    { kind: "header", label: label.includes("backend") ? "label: [unlabeled]" : "template: [adhoc]" },
    { kind: "entry", entry: entries[1]!, originalIndex: 1 },
  ]
}

const FROZEN_NOW = new Date("2026-01-15T00:00:00.000Z").getTime() + (122 * 24 * 60 * 60 * 1000)
const originalDateNow = Date.now

describe("WorkspaceList snapshots", () => {
  beforeAll(() => {
    Date.now = () => FROZEN_NOW
  })

  afterAll(() => {
    Date.now = originalDateNow
  })

  test("renders label grouped headers with concrete row status tokens", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceList
          entries={entries}
          grouped={grouped("label: backend")}
          isGrouped={true}
          cursor={0}
          selected={new Set()}
          filter=""
          height={6}
          allSignals={new Map()}
          tick={0}
        />
      ),
      { width: 110, height: 8, kittyKeyboard: true }
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("label: backend")
    expect(frame).toContain("~1")
    expect(frame).toMatchSnapshot()
  })

  test("renders state and template grouped headers", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WorkspaceList
          entries={entries}
          grouped={[
            { kind: "header", label: "state: dirty" },
            { kind: "entry", entry: entries[0]!, originalIndex: 0 },
            { kind: "header", label: "template: [adhoc]" },
            { kind: "entry", entry: entries[1]!, originalIndex: 1 },
          ]}
          isGrouped={true}
          cursor={1}
          selected={new Set([entries[1]!.workspace.name])}
          filter=""
          height={6}
          allSignals={new Map()}
          tick={0}
        />
      ),
      { width: 110, height: 8, kittyKeyboard: true }
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("state: dirty")
    expect(frame).toContain("template: [adhoc]")
    expect(frame).toMatchSnapshot()
  })
})
