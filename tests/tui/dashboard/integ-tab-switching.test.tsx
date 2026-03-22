/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll, afterEach, beforeEach } from "bun:test"
import { makeTmpDir, cleanup, write } from "../../helpers"

// Config isolation — set BEFORE any import that touches paths.ts.
// NOTE: Bun shares module cache across test files in the same process run.
// We mock the config module directly with inline fixtures so that our tests
// are resilient to file load order and paths.ts cache contention.
const configDir = makeTmpDir("integ-tabs")
process.env.GIT_STACKS_CONFIG_DIR = configDir

// Inline workspace fixture
const wsFixture = {
  name: "test-ws",
  schema_version: "1" as const,
  branch: "feature/test",
  created: "2026-01-15T00:00:00.000Z",
  repos: [] as any[],
}

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

// Mock config module with inline fixtures — resilient to module cache ordering
mock.module("../../../src/lib/config", () => ({
  listWorkspaces: mock(() => [wsFixture]),
  readWorkspace: mock((_name: string) => wsFixture),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock((name: string) => name === "test-ws"),
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
mock.module("../../../src/lib/git", () => ({
  createWorktree: mock(async () => {}),
  fetchOrigin: mock(async () => {}),
  removeWorktree: mock(async () => {}),
  isWorktreeRegistered: mock(async () => false),
  getWorktreeStatus: mock(async () => ({ dirty: false, ahead: 0, behind: 0 })),
  getCommitsBehind: mock(async () => 0),
}))

mock.module("../../../src/lib/workspace-ops", () => ({
  openWorkspace: mock(async () => {}),
  cleanWorkspace: mock(async () => ({ ok: true })),
  closeWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async () => ({ ok: true })),
  mergeWorkspace: mock(async () => ({ ok: true })),
  renameWorkspace: mock(async () => {}),
  syncWorkspace: mock(async () => ({ ok: true, synced: [], skipped: [] })),
  getWorkspaceStatus: mock(async () => []),
  editWorkspaceYaml: mock(() => ({ path: "/tmp/fake.yml", validate: () => ({ ok: true }) })),
}))

// Mock lifecycle hooks
mock.module("../../../src/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => {}),
}))

// Dynamic import after mocks are set
const { testRender } = await import("@opentui/solid")
const { default: App } = await import("../../../src/tui/dashboard/App")

const renderOpts = { kittyKeyboard: true }

// Track active renderer to destroy after each test (prevents keyboard event leakage)
let activeRenderer: { destroy(): void } | null = null

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
})

afterAll(() => cleanup(configDir))
