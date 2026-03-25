/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll, afterEach, beforeEach } from "bun:test"
import { existsSync } from "fs"
import { makeTmpDir, cleanup, write, makeWorkspaceOpsMock } from "../../helpers"

// Config isolation — set BEFORE any import that touches paths.ts.
// NOTE: Bun shares module cache across test files in the same process run.
// We mock the config module directly with inline fixtures so that our tests
// are resilient to file load order and paths.ts cache contention.
const configDir = makeTmpDir("integ-action")
process.env.GIT_STACKS_CONFIG_DIR = configDir

// Workspace YAML path (for D-18 side-effect assertion)
const wsYamlPath = `${configDir}/workspaces/test-ws.yml`

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
    local_path: "/tmp/integ-action-test-repo",
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

// Track whether workspace YAML has been removed (for D-18 assertion)
let wsRemoved = false

// Mock config module with inline fixtures — resilient to module cache ordering.
// listWorkspaces returns empty array when wsRemoved to simulate post-delete state.
mock.module("../../../src/lib/config", () => ({
  listWorkspaces: mock(() => (wsRemoved ? [] : [wsFixture])),
  readWorkspace: mock((_name: string) => wsFixture),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock((name: string) => !wsRemoved && name === "test-ws"),
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
    workspace_root: "/tmp/integ-action-ws-root",
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
  ensureUpstreamTracking: mock(async () => ({ tracked: false })),
}))

// Mock workspace-ops — removeWorkspace deletes the YAML file and sets wsRemoved flag
// to satisfy D-18 side-effect assertion: workspace YAML must not exist after confirm.
mock.module("../../../src/lib/workspace-ops", () => makeWorkspaceOpsMock({
  openWorkspace: mock(async () => ({ ok: true })),
  cleanWorkspace: mock(async () => ({ ok: true })),
  closeWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async (name: string) => {
    wsRemoved = true
    const { unlinkSync } = await import("fs")
    try { unlinkSync(`${configDir}/workspaces/${name}.yml`) } catch {}
    return { ok: true }
  }),
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

// Seed YAML fixtures for D-18 assertion (existsSync check on actual file)
write(configDir, "workspaces/test-ws.yml", `name: test-ws
branch: feature/test
created: "2026-01-15T00:00:00.000Z"
repos: []
`)
write(configDir, "config.yml", `workspace_root: /tmp/integ-action-ws-root
`)

// Dynamic import after mocks are set
const { testRender } = await import("@opentui/solid")
const { default: App } = await import("../../../src/tui/dashboard/App")

const renderOpts = { kittyKeyboard: true }

// Track active renderer for cleanup between tests
let activeRenderer: { destroy(): void } | null = null

beforeEach(() => {
  // Reset wsRemoved state and re-seed workspace YAML for each test
  wsRemoved = false
  write(configDir, "workspaces/test-ws.yml", `name: test-ws
branch: feature/test
created: "2026-01-15T00:00:00.000Z"
repos: []
`)
})

afterEach(() => {
  // Destroy renderer after each test to prevent keyboard event leakage
  if (activeRenderer) {
    try { activeRenderer.destroy() } catch {}
    activeRenderer = null
  }
})

describe("integration: action menu dispatch", () => {
  test("Enter on workspace opens action menu", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    // Press Enter to open action menu on focused workspace row
    mockInput.pressEnter()
    await renderOnce()
    const frame = captureCharFrame()
    // Action menu should show all workspace actions
    expect(frame).toContain("Open")
    expect(frame).toContain("Rename")
    expect(frame).toContain("Remove")
  })

  test("selecting Remove shows confirm dialog and deletes workspace YAML on confirm", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    // Open action menu with Enter
    mockInput.pressEnter()
    await renderOnce()
    // Use 'r' shortcut key to dispatch Remove action directly (bypasses cursor navigation)
    mockInput.pressKey("r")
    await renderOnce()
    const frame = captureCharFrame()
    // Confirm dialog should now be visible (Remove requires confirmation per D-18 flow)
    expect(frame).toContain("test-ws")
    // ConfirmDialog renders "[y] Yes  [n/Esc] No"
    expect(frame).toContain("[y]")

    // Confirm the removal with 'y'
    mockInput.pressKey("y")
    await renderOnce()
    await renderOnce()
    await renderOnce()

    // D-18 side-effect assertion: workspace YAML file must no longer exist after confirm.
    // The mock's removeWorkspace deletes the seeded file from configDir.
    expect(existsSync(wsYamlPath)).toBe(false)
  })

  test("escape from action menu returns to list", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    // Open action menu
    mockInput.pressEnter()
    await renderOnce()
    // Verify action menu is visible
    let frame = captureCharFrame()
    expect(frame).toContain("Open")
    expect(frame).toContain("Sync")

    // Escape from action menu
    mockInput.pressEscape()
    await renderOnce()
    frame = captureCharFrame()
    // Workspace list should be visible after escape
    expect(frame).toContain("test-ws")
    // The action menu ">" cursor indicator should be gone
    expect(frame).not.toContain("> [o] Open")
  })
})

afterAll(() => cleanup(configDir))
