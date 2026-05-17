/** @jsxImportSource @opentui/solid */
import { describe, expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"

mock.module("../../../../src/lib/config", () => ({
  readGlobalConfig: mock(() => ({ workspace_root: "/tmp/detail-snap", integrations: { vscode: { enabled: true, cmd: "code" } } })),
  readTemplate: mock((name: string) => ({ name, schema_version: "1", repos: [], integrations: {} })),
}))

mock.module("../../../../src/lib/integrations", () => ({
  integrations: [
    { id: "vscode", label: "VS Code", hint: "", enabledByDefault: true, open: mock(async () => null), configurePrompt: mock(async () => null), isEnabled: mock(() => true) },
    { id: "tmux", label: "tmux", hint: "", enabledByDefault: true, open: mock(async () => null), configurePrompt: mock(async () => null), isEnabled: mock(() => true) },
  ],
}))

mock.module("../../../../src/lib/integrations/types", () => ({
  resolveEnabledGlobally: mock(() => true),
  resolveEnabled: mock(() => true),
  isConditional: mock(() => false),
  isGenerator: mock(() => false),
  isCleaner: mock(() => false),
  isWindowDetecting: mock(() => false),
}))

mock.module("../../../../src/lib/notes", () => ({
  listWorkspaceNotes: mock(async () => [
    { text: "Review file sync drift", created: "2026-01-15T10:00:00Z" },
    { text: "Ping owner before merge", created: "2026-01-14T10:00:00Z" },
  ]),
}))

const { WorkspaceDetail } = await import("../../../../src/tui/dashboard/WorkspaceDetail")

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
    summary: { total: 2, ok: 1, warnings: 1, errors: 0, attention: 1, sections: 2, byState: {}, byType: {} },
    warnings: [],
    errors: [],
    workspace: {
      scope: "workspace" as const,
      name: "operator-ws",
      root: "/tmp/operator-ws",
      summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1, sections: 1, byState: {}, byType: {} },
      warnings: [],
      errors: [],
      entries: [{
        scope: "workspace" as const,
        repo: null,
        type: "sync" as any,
        target: ".env.local",
        state: "pullable" as any,
        severity: "warning" as const,
        needsAttention: true,
        hint: "source newer",
        details: { warnings: [], errors: [] },
      }],
    },
    repos: [],
  },
}

describe("WorkspaceDetail snapshots", () => {
  test("renders ordered detail sections with notes and file status", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[{ workspace: "operator-ws", text: "Build failed", from: "ci", timestamp: "2026-01-15T10:00:00Z" }]} tick={0} fileStatus={fileStatus as any} />,
      { width: 100, height: 28, kittyKeyboard: true }
    )
    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Messages:")
    expect(frame).toContain("Files:")
    expect(frame).toContain(".env.local")
    expect(frame).toContain("Review file sync drift")
    expect(frame).toMatchSnapshot()
  })

  test("renders scrolled long detail content", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} fileStatus={fileStatus as any} height={7} scrollOffset={18} />,
      { width: 100, height: 10, kittyKeyboard: true }
    )
    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Notes:")
    expect(frame).not.toContain("Messages:")
    expect(frame).toMatchSnapshot()
  })
})
