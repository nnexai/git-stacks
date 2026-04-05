/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll } from "bun:test"
import { makeTmpDir, cleanup, makeWorkspaceOpsMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock, makeWorkspaceGitMock, makeGitMock } from "../../helpers"

// Config isolation — set BEFORE any import that touches paths.ts.
// NOTE: Bun shares module cache across test files in the same process run.
// We mock the config module directly with inline fixtures so that our tests
// are resilient to file load order and paths.ts cache contention.
const configDir = makeTmpDir("integ-wizard")
process.env.GIT_STACKS_CONFIG_DIR = configDir

// Inline fixtures
const registryFixture = [
  { name: "dev-repo", local_path: "/tmp/integ-wizard-dev-repo", type: "other" as const, default_branch: "main" },
]
const templateFixture = {
  name: "dev-tmpl",
  schema_version: "1" as const,
  repos: [{ repo: "dev-repo", mode: "worktree" as const }],
}

// Mock config module with inline fixtures — resilient to module cache ordering
mock.module("../../../src/lib/config", () => ({
  listWorkspaces: mock(() => []),
  readWorkspace: mock(() => null),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock(() => false),
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
    workspace_root: "/tmp/integ-wizard-root",
    integrations: {},
  })),
  writeGlobalConfig: mock(() => {}),
  expandBranchPattern: mock((pattern: string, name: string) => pattern.replace("{name}", name)),
  formatZodError: mock(() => ""),
  WorkspaceSchema: {} as any,
  TemplateSchema: {} as any,
  RepoRegistryEntrySchema: {} as any,
}))

// Mock git operations to prevent real filesystem git work
mock.module("../../../src/lib/git", () => makeGitMock())

// Mock workspace-ops so executeCreateWorkspace does not attempt real git operations
mock.module("../../../src/lib/workspace-ops", () => makeWorkspaceOpsMock({
  openWorkspace: mock(async () => {}),
  cleanWorkspace: mock(async () => ({ ok: true })),
  closeWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async () => ({ ok: true })),
  mergeWorkspace: mock(async () => ({ ok: true })),
  renameWorkspace: mock(async () => {}),
}))

mock.module("../../../src/lib/workspace-git", () => makeWorkspaceGitMock({
  syncWorkspace: mock(async (_name: string, _opts: any, _onProgress?: any) => ({
    ok: true,
    synced: [],
    skipped: [],
  })),
}))

mock.module("../../../src/lib/workspace-status", () => makeWorkspaceStatusMock({
  getWorkspaceStatus: mock(async () => []),
  getWorkspaceListInfo: mock(async () => []),
  getDirtyWorktrees: mock(async () => []),
}))

mock.module("../../../src/lib/workspace-yaml", () => makeWorkspaceYamlMock({
  editWorkspaceYaml: mock(() => ({ path: "/tmp/fake.yml", validate: () => ({ ok: true }) })),
}))

// Mock lifecycle hooks to prevent hook execution during workspace creation
mock.module("../../../src/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => {}),
}))

// Dynamic imports happen AFTER env is set and mocks are registered
const { testRender } = await import("@opentui/solid")
const { default: App } = await import("../../../src/tui/dashboard/App")

const renderOpts = { kittyKeyboard: true }

afterAll(() => cleanup(configDir))

describe("integration: wizard entry and navigation", () => {
  test("wizard entry from Templates tab action menu", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Switch to Templates tab (key "2")
    mockInput.pressKey("2")
    await renderOnce()

    // Open TemplateActionMenu with Enter (first template is focused by default)
    mockInput.pressEnter()
    await renderOnce()

    // Verify action menu appears with "Create workspace" option
    const actionMenuFrame = captureCharFrame()
    expect(actionMenuFrame).toContain("Create workspace")

    // Press "w" to trigger "Create workspace" action in TemplateActionMenu
    mockInput.pressKey("w")
    await renderOnce()

    // Capture frame after wizard launch
    const wizardFrame = captureCharFrame()

    // REQUIRED: assert wizard step 1 label (name input) is visible
    expect(wizardFrame).toContain("Workspace name")
  })

  test("escape at first step cancels wizard", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Navigate to Templates tab
    mockInput.pressKey("2")
    await renderOnce()

    // Open action menu and trigger wizard
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("w")
    await renderOnce()

    // Verify wizard is open
    const wizardFrame = captureCharFrame()
    expect(wizardFrame).toContain("Workspace name")

    // Press Escape at first wizard step — should cancel and return to templates list
    mockInput.pressEscape()
    await renderOnce()

    const afterEscapeFrame = captureCharFrame()

    // Wizard should be gone — should not show wizard input prompt
    expect(afterEscapeFrame).not.toContain("Workspace name")

    // Should be back on templates list — template name should be visible
    expect(afterEscapeFrame).toContain("dev-tmpl")
  })

  test("escape at second step goes back to first step", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Navigate to Templates tab
    mockInput.pressKey("2")
    await renderOnce()

    // Open action menu and trigger wizard
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("w")
    await renderOnce()

    // Verify we're at step 1
    const step1Frame = captureCharFrame()
    expect(step1Frame).toContain("Workspace name")

    // Type a workspace name and press Enter to advance to step 2
    await mockInput.typeText("my-new-ws")
    mockInput.pressEnter()

    // Deferred focus: WizardView uses setTimeout(0) for focus between steps
    // Must await the macrotask queue before interacting with step 2 (per CLAUDE.md pitfall 3)
    await new Promise(r => setTimeout(r, 0))
    await renderOnce()

    // Verify we're at step 2 (Branch)
    const step2Frame = captureCharFrame()
    expect(step2Frame).toContain("Branch")

    // Press Escape at step 2 — should go back to step 1
    mockInput.pressEscape()

    // Deferred focus again after back-navigation
    await new Promise(r => setTimeout(r, 0))
    await renderOnce()

    const backToStep1Frame = captureCharFrame()

    // Should be back at step 1 — "Workspace name" label visible again
    expect(backToStep1Frame).toContain("Workspace name")
  })
})
