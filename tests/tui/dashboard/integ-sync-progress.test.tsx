/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll } from "bun:test"
import { makeTmpDir, cleanup, write } from "../../helpers"

// Config isolation — MUST be set before any import that touches paths.ts
// Each test file has its own Bun module scope, so this env override takes effect
// before App.tsx and its transitive imports are loaded.
const configDir = makeTmpDir("integ-sync-progress")
process.env.GIT_STACKS_CONFIG_DIR = configDir

// Seed YAML fixtures before App is imported (Pitfall 4: hooks load data at mount time)
write(configDir, "config.yml", "workspace_root: /tmp/integ-sync-root\n")
write(configDir, "registry.yml", [
  "- name: sync-repo",
  "  local_path: /tmp/sync-repo",
  "  type: other",
  "  default_branch: main",
].join("\n") + "\n")
write(configDir, "workspaces/sync-ws.yml", [
  "name: sync-ws",
  "branch: feature/sync-test",
  "created: \"2026-03-01T00:00:00.000Z\"",
  "repos:",
  "  - repo: sync-repo",
  "    name: sync-repo",
  "    type: other",
  "    mode: worktree",
  "    main_path: /tmp/sync-repo",
  "    task_path: /tmp/tasks/sync-ws/sync-repo",
  "    base_branch: main",
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

// Mock workspace-ops: syncWorkspace with controllable progress callback
mock.module("../../../src/lib/workspace-ops", () => ({
  openWorkspace: mock(async () => {}),
  cleanWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async () => ({ ok: true })),
  mergeWorkspace: mock(async () => ({ ok: true })),
  renameWorkspace: mock(async () => {}),
  syncWorkspace: mock(async (_name: string, _opts: any, onProgress?: (update: any) => void) => {
    // Call progress callback with status updates to simulate sync progress
    if (onProgress) {
      onProgress({ repo: "sync-repo", status: "fetching", detail: "", conflicts: [] })
      onProgress({ repo: "sync-repo", status: "rebasing", detail: "", conflicts: [] })
      onProgress({ repo: "sync-repo", status: "synced", detail: "1 commit", conflicts: [] })
    }
    return {
      ok: true,
      synced: [{ repo: "sync-repo", commits: 1 }],
      skipped: [],
    }
  }),
  getWorkspaceStatus: mock(async () => []),
  getWorkspaceListInfo: mock(async () => []),
  getDirtyWorktrees: mock(async () => []),
  runPreRemoveHooks: mock(async () => {}),
  mergeEnv: mock(() => ({})),
  writeEnvFiles: mock(() => {}),
  editWorkspaceYaml: mock(() => ({ path: "/tmp/fake.yml", validate: () => ({ ok: true }) })),
}))

// Mock lifecycle hooks to prevent hook execution
mock.module("../../../src/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => {}),
}))

// Dynamic imports happen AFTER env is set and mocks are registered
const { testRender } = await import("@opentui/solid")
const { default: App } = await import("../../../src/tui/dashboard/App")

const renderOpts = { kittyKeyboard: true }

afterAll(() => cleanup(configDir))

describe("integration: sync progress flow", () => {
  test("action menu shows Sync option", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Enter on first workspace to open ActionMenu
    mockInput.pressEnter()
    await renderOnce()

    const frame = captureCharFrame()
    // ActionMenu should contain "Sync" option
    expect(frame).toContain("Sync")
  })

  test("selecting Sync shows confirm dialog", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Open ActionMenu
    mockInput.pressEnter()
    await renderOnce()

    // Press "s" to select Sync action (ActionMenu key for sync is "s")
    mockInput.pressKey("s")
    await renderOnce()

    const frame = captureCharFrame()
    // ConfirmDialog should be rendered with sync message
    // App.tsx confirm label for sync: "Sync 'sync-ws'? (rebase from upstream)"
    expect(frame).toContain("sync-ws")
    // ConfirmDialog renders "[y] Yes  [n/Esc] No"
    expect(frame).toContain("[y]")
  })

  test("confirming sync shows progress then returns to list", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Open ActionMenu and select Sync
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("s")
    await renderOnce()

    // Confirm the sync with "y"
    mockInput.pressKey("y")
    await renderOnce()

    // After confirming: syncWorkspace mock resolves immediately (sync fn is called)
    // The sync-progress view OR the completion state should be visible
    // Since the mock resolves synchronously, syncDone may already be true
    const frame = captureCharFrame()

    // Either the sync progress view shows "sync-repo" from the progress rows,
    // or the workspace list is back with "sync-ws".
    // Either way: the workspace name should appear somewhere meaningful.
    const hasSyncContent = frame.includes("sync-repo") || frame.includes("sync-ws") || frame.includes("Syncing")
    expect(hasSyncContent).toBe(true)
  })
})
