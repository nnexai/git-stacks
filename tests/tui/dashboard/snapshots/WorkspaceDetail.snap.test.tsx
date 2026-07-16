/** @jsxImportSource @opentui/solid */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { createSignal } from "solid-js"
import { testRender } from "@opentui/solid"
const compactFrame = (frame: string) => frame.split("\n").map((line) => line.replace(/[█▀▄]+$/u, "").trimEnd()).join("\n").trimEnd()

mock.module("@git-stacks/core/config", () => ({
  readGlobalConfig: mock(() => ({ workspace_root: "/tmp/detail-snap", integrations: { vscode: { enabled: true, cmd: "code" } } })),
  readTemplate: mock((name: string) => ({ name, schema_version: "1", repos: [], integrations: {} })),
}))

mock.module("@git-stacks/core/integrations", () => ({
  integrations: [
    { id: "vscode", label: "VS Code", hint: "", enabledByDefault: true, open: mock(async () => null), configurePrompt: mock(async () => null), isEnabled: mock(() => true) },
    { id: "tmux", label: "tmux", hint: "", enabledByDefault: true, open: mock(async () => null), configurePrompt: mock(async () => null), isEnabled: mock(() => true) },
  ],
}))

mock.module("@git-stacks/core/integrations/types", () => ({
  resolveEnabledGlobally: mock(() => true),
  resolveEnabled: mock(() => true),
  isConditional: mock(() => false),
  isGenerator: mock(() => false),
  isCleaner: mock(() => false),
  isWindowDetecting: mock(() => false),
}))

const { WorkspaceDetail } = await import("../../../../packages/tui/src/WorkspaceDetail")

const FROZEN_NOW = new Date("2026-01-15T10:00:00Z").getTime() + (122 * 24 * 60 * 60 * 1000)
const originalDateNow = Date.now
const detailConfig = { workspace_root: "/tmp/detail-snap", integrations: { vscode: { enabled: true, cmd: "code" } }, ports: { range_start: 10000, range_end: 65000 } }

const entry = {
  workspace: {
    name: "operator-ws",
    branch: "feature/operator",
    created: "2026-01-01T00:00:00.000Z",
    template: "control",
    labels: ["ops"],
    schema_version: "1",
    repos: [],
    settings: { integrations: { jira: { issue: "OPS-7" } } },
  },
  status: {
    state: "loaded" as const,
    hasDirty: true,
    hasMissing: false,
    aheadBehindStale: false,
    repos: [
      { name: "api", exists: true, dirty: true, branch: "feature/operator", mode: "worktree", ahead: 2, behind: 1 },
      { name: "web", exists: true, dirty: false, branch: "main", mode: "trunk", ahead: 0, behind: 0 },
    ],
  },
}

const fileStatus = {
  state: "loaded" as const,
  workspaceName: "operator-ws",
  view: {
    workspace_id: "00000000-0000-4000-8000-000000000126",
    revision: "7",
    generated_at: "2026-07-16T12:00:00.000Z",
    summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
    groups: [{
      scope: "workspace" as const,
      name: "Workspace files",
      summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
      entries: [{
        id: "file_1234567890123456",
        type: "copy" as const,
        target: ".env.local",
        state: "pullable" as const,
        severity: "warning" as const,
        needs_attention: true,
        reason: "content_differs" as const,
        message: "Source and target content differ.",
      }],
    }],
  },
}

const notes = {
  workspace_id: "00000000-0000-4000-8000-000000000126",
  revision: "7",
  notes_revision: "notes-7",
  count: 2,
  records: [
    { text: "Review file sync drift", created_at: "2026-01-15T10:00:00Z" },
    { text: "Ping owner before merge", created_at: "2026-01-14T10:00:00Z" },
  ],
}

describe("WorkspaceDetail snapshots", () => {
  beforeAll(() => {
    Date.now = () => FROZEN_NOW
  })

  afterAll(() => {
    Date.now = originalDateNow
  })

  test("renders ordered detail sections with notes and file status", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <WorkspaceDetail entry={entry as any} signals={[{ version: 1, kind: "notification", id: "sig_1234567890123456", source: "automation", workspace_id: "118f47f4-5ab1-7c2d-8e90-123456789abc", title: "Build failed", occurred_at: "2026-01-15T10:00:00Z", unread: true }]} tick={0} fileStatus={fileStatus as any} notes={notes as any} config={detailConfig as any} />,
      { width: 100, height: 28, kittyKeyboard: true }
    )
    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Signals:")
    expect(frame).toContain("Files:")
    expect(frame).toContain(".env.local")
    expect(frame).toContain("Review file sync drift")
    expect(compactFrame(frame)).toMatchSnapshot()
  })

  test("renders scrolled long detail content", async () => {
    const [scrollRequest, setScrollRequest] = createSignal({ sequence: 0, direction: 1 as -1 | 1 })
    const { renderOnce, captureCharFrame } = await testRender(
      () => <WorkspaceDetail entry={entry as any} signals={[]} tick={0} fileStatus={fileStatus as any} notes={notes as any} scrollRequest={scrollRequest()} config={detailConfig as any} />,
      { width: 100, height: 10, kittyKeyboard: true }
    )
    await renderOnce()
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      setScrollRequest({ sequence, direction: 1 })
      await renderOnce()
    }
    const frame = captureCharFrame()
    expect(frame).toContain("Notes:")
    expect(frame).not.toContain("Signals:")
    expect(compactFrame(frame)).toMatchSnapshot()
  })
})
