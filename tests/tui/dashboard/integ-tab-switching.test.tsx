/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll, afterEach, beforeEach } from "bun:test"
import { makeDashboardCoreState, makeTmpDir, cleanup, write, makeWorkspaceOpsMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock, makeWorkspaceGitMock, makeGitMock } from "../../helpers"
import type { Workspace } from "../../../packages/core/src/config"

// Config isolation — set BEFORE any import that touches paths.ts.
// NOTE: Bun shares module cache across test files in the same process run.
// We mock the config module directly with inline fixtures so that our tests
// are resilient to file load order and paths.ts cache contention.
const configDir = makeTmpDir("integ-tabs")
process.env.GIT_STACKS_CONFIG_DIR = configDir

// Inline workspace fixture
const wsFixtures = [
  {
    name: "test-ws",
    schema_version: "1" as const,
    branch: "feature/test",
    created: "2026-01-15T00:00:00.000Z",
    repos: [] as any[],
    labels: ["backend", "sprint:14", "client:acme"],
    priority: 1,
  },
  {
    name: "billing",
    schema_version: "1" as const,
    branch: "feature/billing",
    created: "2026-01-15T00:00:00.000Z",
    repos: [] as any[],
    labels: ["ops"],
  },
  {
    name: "api-fix",
    schema_version: "1" as const,
    branch: "feature/api-fix",
    created: "2026-01-15T00:00:00.000Z",
    repos: [] as any[],
    labels: ["backend"],
  },
  {
    name: "plain",
    schema_version: "1" as const,
    branch: "feature/plain",
    created: "2026-01-15T00:00:00.000Z",
    repos: [] as any[],
  },
] as const

// Inline registry fixture
const registryFixture = [
  {
    name: "my-repo",
    local_path: "/tmp/integ-test-repo",
    type: "other" as const,
    default_branch: "main",
  },
]

// Inline template fixture
const templateFixture = {
  name: "my-tmpl",
  schema_version: "1" as const,
  repos: [{ repo: "my-repo", mode: "worktree" as const }],
}

const cleanWorkspaceMock = mock(async (_name: string) => ({ ok: true }))
const removeWorkspaceMock = mock(async (_name: string) => ({ ok: true }))
const mergeWorkspaceMock = mock(async (_name: string) => ({ ok: true }))

// Mock config module with inline fixtures — resilient to module cache ordering
mock.module("@git-stacks/core/config", () => ({
  listWorkspaces: mock(() => [...wsFixtures]),
  readWorkspace: mock((name: string) => wsFixtures.find(ws => ws.name === name) ?? wsFixtures[0]),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock((name: string) => wsFixtures.some(ws => ws.name === name)),
  workspacePath: mock((name: string) => `${configDir}/workspaces/${name}.yml`),
  readRegistry: mock(() => registryFixture),
  writeRegistry: mock(() => {}),
  listRegistryEntries: mock(() => registryFixture),
  listTemplates: mock(() => [templateFixture]),
  readTemplate: mock((_name: string) => templateFixture),
  writeTemplate: mock(() => {}),
  templateExists: mock(() => false),
  templatePath: mock((name: string) => `${configDir}/templates/${name}.yml`),
  readGlobalConfig: mock(() => ({
    workspace_root: "/tmp/integ-ws-root",
    integrations: {},
  })),
  writeGlobalConfig: mock(() => {}),
  expandBranchPattern: mock((pattern: string, name: string) => pattern.replace("{name}", name)),
  formatZodError: mock(() => ""),
  WorkspaceSchema: {} as any,
  TemplateSchema: {} as any,
  RepoRegistryEntrySchema: {} as any,
}))

// Mock git operations before App import
mock.module("@git-stacks/core/git", () => makeGitMock())

mock.module("@git-stacks/core/workspace-ops", () => makeWorkspaceOpsMock({
  openWorkspace: mock(async () => {}),
  cleanWorkspace: cleanWorkspaceMock,
  closeWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: removeWorkspaceMock,
  mergeWorkspace: mergeWorkspaceMock,
  renameWorkspace: mock(async () => {}),
}))

mock.module("@git-stacks/core/workspace-git", () => makeWorkspaceGitMock({
  syncWorkspace: mock(async () => ({ ok: true, synced: [], skipped: [] })),
}))

mock.module("@git-stacks/core/workspace-status", () => makeWorkspaceStatusMock({
  getWorkspaceStatus: mock(async () => []),
}))

mock.module("@git-stacks/core/workspace-yaml", () => makeWorkspaceYamlMock({
  editWorkspaceYaml: mock(() => ({ path: "/tmp/fake.yml", validate: () => ({ ok: true }) })),
}))

// Mock lifecycle hooks
mock.module("@git-stacks/core/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => {}),
}))

mock.module("@git-stacks/service/client", () => ({
  fetchCoreState: mock(async () => { throw new Error("core state must be injected") }),
  fetchSignalProjection: mock(async () => ({ signals: [], dismissed: [], sequence: "0" })),
  dismissSignal: mock(async () => {}),
  subscribeServiceEvents: mock(async () => "0"),
  fetchEventCursor: mock(async () => "0"),
  fetchWorkspaceFileStatus: mock(async () => ({ workspace: { scope: "workspace", name: "test", root: "/tmp", entries: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [] }, repos: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [] })),
  fetchWorkspaceNotes: mock(async () => []),
  fetchEditTarget: mock(async () => ({ kind: "registry", path: "/tmp/registry.yml" })),
  runCoreMutation: mock(async (name: string, request: { workspace?: string }) => {
    if (name === "workspace.clean") await cleanWorkspaceMock(request.workspace ?? "")
    if (name === "workspace.remove") await removeWorkspaceMock(request.workspace ?? "")
    if (name === "workspace.merge") await mergeWorkspaceMock(request.workspace ?? "")
    return { state: "succeeded", operation_id: "op_1234567890123456", accepted_at: "2026-07-14T00:00:00.000Z", started_at: "2026-07-14T00:00:00.000Z", finished_at: "2026-07-14T00:00:00.000Z", completed_steps: [], result: {} }
  }),
  createWorkspaceThroughService: mock(async () => ({ state: "succeeded" })),
}))

// Dynamic import after mocks are set
const { testRender } = await import("@opentui/solid")
const { default: App, matchesWorkspaceFilter, nextWorkspaceGroupingMode } = await import("../../../packages/tui/src/App")
const { setCoreStateFactoryForTests } = await import("../../../packages/tui/src/core-store")
setCoreStateFactoryForTests(() => makeDashboardCoreState(wsFixtures as any, [templateFixture as any], registryFixture as any))

const renderOpts = { kittyKeyboard: true }

// Track active renderer to destroy after each test (prevents keyboard event leakage)
let activeRenderer: { destroy(): void } | null = null

beforeEach(() => {
  cleanWorkspaceMock.mockClear()
  removeWorkspaceMock.mockClear()
  mergeWorkspaceMock.mockClear()
})

afterEach(() => {
  // Destroy renderer after each test to prevent keyboard event leakage between tests
  if (activeRenderer) {
    try { activeRenderer.destroy() } catch {}
    activeRenderer = null
  }
})

describe("integration: tab switching", () => {
  test("starts on Workspaces tab showing workspace entry", async () => {
    const { renderer, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("test-ws")
    expect(frame).toContain("feature/test")
  })

  test("workspace row renders max two labels with overflow", async () => {
    const { renderer, renderOnce, captureCharFrame } = await testRender(
      () => <App />, { kittyKeyboard: true, width: 140, height: 30 }
    )
    activeRenderer = renderer

    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("[backend] [sprint:14] +1")
  })

  test("pressing 2 switches to Templates tab", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressKey("2")
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("my-tmpl")
  })

  test("pressing 3 switches to Repos tab", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressKey("3")
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("my-repo")
  })

  test("help bar fits within 80 columns", async () => {
    const { renderer, renderOnce, captureCharFrame } = await testRender(
      () => <App />, { kittyKeyboard: true, width: 80, height: 30 }
    )
    activeRenderer = renderer

    // Render multiple times to allow async status loading to complete
    await renderOnce()
    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()
    // At exactly 80 columns, the help bar should NOT include "1/2/3 Tabs" (that's >=81)
    // It should include "r Refresh" and core shortcuts, fitting within 80 chars
    expect(frame).not.toContain("1/2/3 Tabs")
    expect(frame).toContain("r Refresh")
    expect(frame).toContain("Enter Actions")
    // Verify the help bar line fits within 80 columns
    const lines = frame.split("\n")
    const helpLine = lines.find(l => l.includes("r Refresh"))
    expect(helpLine).toBeDefined()
    expect(helpLine!.length).toBeLessThanOrEqual(80)
  })

  test("workspace row shows relative age not ISO date", async () => {
    const { renderer, renderOnce, captureCharFrame } = await testRender(
      () => <App />, { kittyKeyboard: true, width: 120, height: 30 }
    )
    activeRenderer = renderer

    // Multiple renders to allow async workspace status loading to complete
    await renderOnce()
    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()
    // Find the workspace list row (not the detail pane which intentionally shows full date)
    const lines = frame.split("\n")
    const wsLine = lines.find(l => l.includes("test-ws") && l.includes("feature/test") && l.includes("0wt"))
    expect(wsLine).toBeDefined()
    // The list row should show relative age (e.g. "66d"), not raw ISO timestamp
    expect(wsLine).not.toContain("2026-01-15T")
    expect(wsLine).toMatch(/\d+[smhd]/)
  })

  test("filter matches workspace labels by default", () => {
    expect(matchesWorkspaceFilter(wsFixtures[1] as unknown as Workspace, "ops")).toBe(true)
    expect(matchesWorkspaceFilter(wsFixtures[0] as unknown as Workspace, "ops")).toBe(false)
  })

  test("label: filter restricts matching to labels only", () => {
    expect(matchesWorkspaceFilter(wsFixtures[0] as unknown as Workspace, "label:backend")).toBe(true)
    expect(matchesWorkspaceFilter(wsFixtures[1] as unknown as Workspace, "label:backend")).toBe(false)
    expect(matchesWorkspaceFilter({ ...wsFixtures[1], name: "backend-service" } as Workspace, "label:backend")).toBe(false)
  })

  test("batch selection remains bound to workspace name after filtering reindexes the list", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    await mockInput.pressKeys([" "]) // select test-ws at index 0
    await renderOnce()
    expect(captureCharFrame()).toContain("1 selected")

    mockInput.pressKey("/")
    await renderOnce()
    await mockInput.typeText("billing") // billing is now the only entry, at index 0
    mockInput.pressEnter()
    await renderOnce()
    expect(captureCharFrame()).toContain("billing")

    mockInput.pressKey("c")
    await renderOnce()
    expect(captureCharFrame()).toContain("clean 1 workspace(s)?")
    mockInput.pressKey("y")
    await renderOnce()
    await renderOnce()

    expect(cleanWorkspaceMock).toHaveBeenCalledTimes(1)
    expect(cleanWorkspaceMock.mock.calls[0]?.[0]).toBe("test-ws")
    expect(cleanWorkspaceMock).not.toHaveBeenCalledWith("billing", expect.anything(), expect.anything())
  })

  test("grouping shortcut cycles through locked workspace grouping modes", () => {
    expect(nextWorkspaceGroupingMode("none")).toBe("label")
    expect(nextWorkspaceGroupingMode("label")).toBe("state")
    expect(nextWorkspaceGroupingMode("state")).toBe("template")
    expect(nextWorkspaceGroupingMode("template")).toBe("none")
  })

  test("g cycles grouped workspace views including label, state, and template sections", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, { kittyKeyboard: true, width: 140, height: 30 }
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressKey("g")
    await renderOnce()

    const labelFrame = captureCharFrame()
    expect(labelFrame).toContain("label: backend")
    expect(labelFrame).toContain("label: ops")
    expect(labelFrame).toContain("label: [unlabeled]")
    expect(labelFrame).toContain("├─")
    expect(labelFrame).toContain("└─")

    mockInput.pressKey("g")
    await renderOnce()
    expect(captureCharFrame()).toContain("state:")

    mockInput.pressKey("g")
    await renderOnce()
    expect(captureCharFrame()).toContain("template: [adhoc]")
  })
})

afterAll(() => { setCoreStateFactoryForTests(undefined); cleanup(configDir) })
