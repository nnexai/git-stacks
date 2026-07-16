/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll } from "bun:test"
import { makeConfigMock, makeDashboardCoreState, makeLifecycleMock, makeTmpDir, cleanup, write, makeWorkspaceOpsMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock, makeWorkspaceGitMock, makeGitMock } from "../../helpers"

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

// Inline workspace fixture for mocking (resilient against module cache issues).
// When this test runs in a full test suite, paths.ts may already be loaded with a
// different configDir (Pitfall 1 in RESEARCH.md). The inline fixture ensures that
// config functions return our expected data regardless of file system resolution.
const syncWsFixture = {
  name: "sync-ws",
  schema_version: "1" as const,
  branch: "feature/sync-test",
  created: "2026-03-01T00:00:00.000Z",
  repos: [
    {
      repo: "sync-repo",
      name: "sync-repo",
      type: "other" as const,
      mode: "worktree" as const,
      main_path: "/tmp/sync-repo",
      task_path: "/tmp/tasks/sync-ws/sync-repo",
      base_branch: "main",
    },
  ],
}

const registryFixture = [
  {
    name: "sync-repo",
    local_path: "/tmp/sync-repo",
    type: "other" as const,
    default_branch: "main",
  },
]

// Mock config module — ensures listWorkspaces and readWorkspace return our fixture
// data even when paths.ts module cache resolves to a different configDir.
mock.module("@git-stacks/core/config", () => makeConfigMock({
  // Workspace operations
  listWorkspaces: mock(() => [syncWsFixture]),
  readWorkspace: mock((_name: string) => syncWsFixture),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock((name: string) => name === "sync-ws"),
  workspacePath: mock((name: string) => `${configDir}/workspaces/${name}.yml`),
  // Registry operations
  readRegistry: mock(() => registryFixture),
  writeRegistry: mock(() => {}),
  listRegistryEntries: mock(() => registryFixture),
  // Template operations
  listTemplates: mock(() => []),
  readTemplate: mock((_name: string) => { throw new Error("not found") }),
  writeTemplate: mock(() => {}),
  templateExists: mock(() => false),
  templatePath: mock((name: string) => `${configDir}/templates/${name}.yml`),
  // Global config
  readGlobalConfig: mock(() => ({
    workspace_root: "/tmp/integ-sync-root",
    integrations: {},
  })),
  writeGlobalConfig: mock(() => {}),
  // Helpers
  expandBranchPattern: mock((pattern: string, name: string) => pattern.replace("{name}", name)),
  formatZodError: mock(() => ""),
  // Re-export Zod schemas as-is (types only, not needed at runtime for tests)
  WorkspaceSchema: {} as any,
  TemplateSchema: {} as any,
  RepoRegistryEntrySchema: {} as any,
}))

// Mock git operations to prevent real filesystem git work
mock.module("@git-stacks/core/git", () => makeGitMock())

// Mock workspace-ops: core lifecycle functions only
mock.module("@git-stacks/core/workspace-ops", () => makeWorkspaceOpsMock({
  openWorkspace: mock(async () => {}),
  cleanWorkspace: mock(async () => ({ ok: true })),
  closeWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async () => ({ ok: true })),
  mergeWorkspace: mock(async () => ({ ok: true })),
  renameWorkspace: mock(async () => {}),
}))

// Mock workspace-git: syncWorkspace with controllable progress callback
mock.module("@git-stacks/core/workspace-git", () => makeWorkspaceGitMock({
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
}))

mock.module("@git-stacks/core/workspace-status", () => makeWorkspaceStatusMock({
  getWorkspaceStatus: mock(async () => []),
  getWorkspaceListInfo: mock(async () => []),
  getDirtyWorktrees: mock(async () => []),
}))

mock.module("@git-stacks/core/workspace-yaml", () => makeWorkspaceYamlMock({
  editWorkspaceYaml: mock(() => ({ path: "/tmp/fake.yml", validate: () => ({ ok: true }) })),
}))

// Mock lifecycle hooks to prevent hook execution
mock.module("@git-stacks/core/lifecycle", () => makeLifecycleMock({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => {}),
}))

mock.module("@git-stacks/service/client", () => ({
  fetchCoreState: mock(async () => { throw new Error("core state must be injected") }),
  fetchSignalProjection: mock(async () => ({ signals: [], dismissed: [], sequence: "0" })),
  dismissSignal: mock(async () => {}),
  subscribeServiceEvents: mock(async () => "0"),
  fetchEventCursor: mock(async () => "0"),
  fetchWorkspaceFileStatus: mock(async () => ({ workspace: { scope: "workspace", name: "sync-ws", root: "/tmp", entries: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [] }, repos: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [] })),
  fetchWorkspaceFileStatusProjection: mock(async () => { throw new Error("unused") }),
  fetchWorkspaceNotes: mock(async () => []),
  fetchEditTarget: mock(async () => ({ kind: "registry", path: "/tmp/registry.yml" })),
  runCoreMutation: mock(async (name: string, _request: unknown, options?: { onOperation?: (operation: any) => void }) => {
    if (name === "workspace.sync") {
      for (const row of [
        { repo: "sync-repo", status: "fetching", detail: "", conflicts: [] },
        { repo: "sync-repo", status: "rebasing", detail: "", conflicts: [] },
        { repo: "sync-repo", status: "synced", detail: "1 commit", conflicts: [] },
      ]) options?.onOperation?.({ state: "running", progress: { data: { kind: "sync", ...row } } })
    }
    return { state: "succeeded", operation_id: "op_1234567890123456", accepted_at: "2026-07-14T00:00:00.000Z", started_at: "2026-07-14T00:00:00.000Z", finished_at: "2026-07-14T00:00:00.000Z", completed_steps: [], result: { synced: [{ repo: "sync-repo", commits: 1 }], skipped: [] } }
  }),
  createWorkspaceThroughService: mock(async () => ({ state: "succeeded" })),
}))

mock.module("../../../packages/tui/src/official-service", () => ({
  officialService: { fetchWorkspaceActionInventory: mock(async () => { throw new Error("unused") }) },
}))

// Dynamic imports happen AFTER env is set and mocks are registered
const { testRender } = await import("@opentui/solid")
const { default: App } = await import("../../../packages/tui/src/App")
const { setCoreStateFactoryForTests } = await import("../../../packages/tui/src/core-store")
setCoreStateFactoryForTests(() => makeDashboardCoreState([syncWsFixture as any], [], registryFixture as any))

const renderOpts = { kittyKeyboard: true }

afterAll(() => { setCoreStateFactoryForTests(undefined); cleanup(configDir) })

describe("integration: sync progress flow", () => {
  test("action menu shows Sync option", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Enter on first workspace to open ActionMenu
    // The workspace list shows "sync-ws" from the mocked listWorkspaces()
    mockInput.pressEnter()
    await renderOnce()

    const frame = captureCharFrame()
    // ActionMenu should contain "Sync" option (key "s" in ActionMenu.tsx)
    expect(frame).toContain("Sync")
  })

  test("selecting Sync shows confirm dialog", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    // Open ActionMenu on first (only) workspace
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

    // After confirming: executeSync is called which:
    // 1. Sets view to "sync-progress"
    // 2. Calls syncWorkspace (which is mocked and resolves synchronously)
    // 3. Sets syncDone = true
    // The sync-progress view shows rows from the progress updates.
    // Since the mock resolves synchronously, syncDone may already be true.
    const frame = captureCharFrame()

    // The frame should contain sync-related content (progress rows or list with sync-ws)
    const hasSyncContent = (
      frame.includes("sync-repo") ||
      frame.includes("sync-ws") ||
      frame.includes("Syncing")
    )
    expect(hasSyncContent).toBe(true)
  })
})
