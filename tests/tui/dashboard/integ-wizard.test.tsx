/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll } from "bun:test"
import { makeTmpDir, cleanup, write } from "../../helpers"

// Config isolation — MUST be set before any import that touches paths.ts
// Each test file has its own Bun module scope, so this env override takes effect
// before App.tsx and its transitive imports are loaded.
const configDir = makeTmpDir("integ-wizard")
process.env.GIT_STACKS_CONFIG_DIR = configDir

// Seed YAML fixtures before App is imported (Pitfall 4: hooks load data at mount time)
write(configDir, "config.yml", "workspace_root: /tmp/integ-wizard-root\n")
write(configDir, "registry.yml", [
  "- name: dev-repo",
  "  local_path: /tmp/integ-wizard-dev-repo",
  "  type: other",
  "  default_branch: main",
].join("\n") + "\n")
write(configDir, "templates/dev-tmpl.yml", [
  "name: dev-tmpl",
  "repos:",
  "  - repo: dev-repo",
  "    mode: worktree",
].join("\n") + "\n")

// Mock git operations to prevent real filesystem git work
mock.module("../../../src/lib/git", () => ({
  createWorktree: mock(async () => {}),
  fetchOrigin: mock(async () => {}),
  removeWorktree: mock(async () => {}),
  isWorktreeRegistered: mock(async () => false),
  getWorktreeStatus: mock(async () => ({ dirty: false, ahead: 0, behind: 0 })),
  getCommitsBehind: mock(async () => 0),
}))

// Mock workspace-ops so executeCreateWorkspace does not attempt real git operations
mock.module("../../../src/lib/workspace-ops", () => ({
  openWorkspace: mock(async () => {}),
  cleanWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async () => ({ ok: true })),
  mergeWorkspace: mock(async () => ({ ok: true })),
  renameWorkspace: mock(async () => {}),
  syncWorkspace: mock(async (_name: string, _opts: any, _onProgress?: any) => ({
    ok: true,
    synced: [],
    skipped: [],
  })),
  getWorkspaceStatus: mock(async () => []),
  getWorkspaceListInfo: mock(async () => []),
  getDirtyWorktrees: mock(async () => []),
  runPreRemoveHooks: mock(async () => {}),
  mergeEnv: mock(() => ({})),
  writeEnvFiles: mock(() => {}),
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
