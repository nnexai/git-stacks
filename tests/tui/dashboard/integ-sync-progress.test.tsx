/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll, beforeEach } from "bun:test"
import {
  WEB_WORKSPACE_ACTION_IDS,
  type WebForgeResolveResponse,
  type WebOperation,
  type WebOperationMutation,
  type WebWorkspaceAction,
  type WebWorkspaceActionDisabledReason,
  type WebWorkspaceActionId,
} from "@git-stacks/protocol"
import { makeConfigMock, makeDashboardCoreState, makeLifecycleMock, makeTmpDir, cleanup, write, makeWorkspaceOpsMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock, makeWorkspaceGitMock, makeGitMock } from "../../helpers"

// Config isolation — MUST be set before any import that touches paths.ts
// Each test file has its own Bun module scope, so this env override takes effect
// before App.tsx and its transitive imports are loaded.
const configDir = makeTmpDir("integ-sync-progress")
process.env.GIT_STACKS_CONFIG_DIR = configDir
const syncWorkspaceId = "00000000-0000-4000-8000-000000000001"

type UnavailableAction = {
  reason: WebWorkspaceActionDisabledReason
  message: string
}

function canonicalActionInventory(
  id: string,
  unavailable: Partial<Record<WebWorkspaceActionId, UnavailableAction>>,
): WebWorkspaceAction[] {
  return WEB_WORKSPACE_ACTION_IDS
    .filter((actionId) => actionId !== "operation.cancel")
    .map((action_id): WebWorkspaceAction => {
      const disabled = unavailable[action_id]
      return {
        action_id,
        subject: { kind: "workspace", workspace_id: id },
        availability: disabled ? { available: false, ...disabled } : { available: true },
        confirmation: action_id === "workspace.force-remove"
          ? "exact-name"
          : action_id === "workspace.remove" || action_id === "workspace.merge" || action_id === "workspace.notes.clear"
            ? "confirm"
            : "none",
      }
    })
}

const syncActionInventory = canonicalActionInventory(syncWorkspaceId, {
  "workspace.unarchive": {
    reason: "workspace_active",
    message: "This action does not apply to the active workspace state.",
  },
  "workspace.force-remove": {
    reason: "dirty_worktree",
    message: "Force Remove requires a fresh dirty-worktree check.",
  },
  "workspace.unpin": {
    reason: "workspace_active",
    message: "This action does not apply to the active workspace state.",
  },
  "workspace.pull": {
    reason: "nothing_to_pull",
    message: "All repositories are up to date with their remotes.",
  },
  "workspace.push": {
    reason: "nothing_to_push",
    message: "No repository commits are waiting to be pushed.",
  },
})

const completedSyncOperation: WebOperation = {
  operation_id: "op_1234567890123456",
  state: "succeeded",
  accepted_at: "2026-07-14T00:00:00.000Z",
  started_at: "2026-07-14T00:00:00.000Z",
  finished_at: "2026-07-14T00:00:01.000Z",
  result: { snapshot_changed: true, revision: "2" },
}
const reviewedOperationId = "op_reviewed1234567890"
const reviewedAcceptedOperation: WebOperation = {
  operation_id: reviewedOperationId,
  state: "accepted",
  accepted_at: "2026-07-16T00:00:00.000Z",
}
const reviewedFailedOperation: WebOperation = {
  operation_id: reviewedOperationId,
  state: "failed",
  accepted_at: "2026-07-16T00:00:00.000Z",
  started_at: "2026-07-16T00:00:00.000Z",
  finished_at: "2026-07-16T00:00:01.000Z",
  error: {
    code: "branch_conflict",
    message: "Change the reviewed branch and retry.",
    forge: { kind: "forge_failure", reason: "branch_conflict", recovery: "change_branch" },
  },
}
const forgeResolution: Extract<WebForgeResolveResponse, { resolved: true }> = {
  resolved: true,
  token: `review_${"a".repeat(43)}`,
  expires_at: "2026-07-17T01:00:00.000Z",
  revision: "1",
  source: {
    provider: "github",
    change_kind: "pull_request",
    change_number: 42,
    web_url: "https://github.com/acme/sync-repo/pull/42",
    host: "github.com",
    target_repository: "acme/sync-repo",
    source_repository: "contrib/sync-repo",
    source_branch: "feature/reviewed",
    target_branch: "main",
    head_sha: "a".repeat(40),
    cross_repository: true,
    confidence: "provider",
  },
  terminology: { provider: "github", change: "Pull request", source_branch: "Head branch", target_branch: "Base branch" },
  candidates: {
    templates: [{ name: "review", repositories: [{ repository_id: syncWorkspaceId, name: "sync-repo", mode: "worktree", matched_source: true }] }],
    source_repositories: [{ repository_id: syncWorkspaceId, name: "sync-repo", mode: "worktree", matched_source: true }],
  },
  draft: {
    workspace_name: "review-ws",
    template_name: "review",
    matched_source_repository_id: syncWorkspaceId,
    repositories: [{ repository_id: syncWorkspaceId, included: true, branch: { base_branch: "main", workspace_branch: "feature/reviewed" } }],
  },
}
let reviewedFetchFailures = 0
const submitWebOperationMock = mock(async (mutation: WebOperationMutation) => mutation.kind === "workspace.create.reviewed" ? reviewedAcceptedOperation : completedSyncOperation)
const fetchWebOperationMock = mock(async (operationId: string) => {
  if (operationId !== reviewedOperationId) return completedSyncOperation
  if (reviewedFetchFailures > 0) {
    reviewedFetchFailures -= 1
    throw new Error("review observation transport failed")
  }
  return reviewedFailedOperation
})
let coreRefreshError: Error | undefined

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

const fetchCoreStateMock = mock(async () => {
  if (coreRefreshError) throw coreRefreshError
  return makeDashboardCoreState([syncWsFixture as any], [], registryFixture as any)
})

mock.module("@git-stacks/service/client", () => ({
  fetchCoreState: fetchCoreStateMock,
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
  officialService: {
    fetchWorkspaceActionInventory: mock(async () => syncActionInventory),
    resolveForgeSourceReview: mock(async () => forgeResolution),
    submitWebOperation: submitWebOperationMock,
    fetchWebOperation: fetchWebOperationMock,
    cancelWebOperation: mock(async () => ({
      operation_id: completedSyncOperation.operation_id,
      outcome: "already-finished" as const,
      operation_state: "succeeded" as const,
    })),
  },
}))

// Dynamic imports happen AFTER env is set and mocks are registered
const { testRender } = await import("@opentui/solid")
const { default: App } = await import("../../../packages/tui/src/App")
const { setCoreStateFactoryForTests } = await import("../../../packages/tui/src/core-store")
setCoreStateFactoryForTests(() => makeDashboardCoreState([syncWsFixture as any], [], registryFixture as any))

const renderOpts = { kittyKeyboard: true }

beforeEach(() => {
  coreRefreshError = undefined
  reviewedFetchFailures = 0
  submitWebOperationMock.mockClear()
  fetchWebOperationMock.mockClear()
  fetchCoreStateMock.mockClear()
})

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

  test("selecting Sync submits the canonical operation without a legacy confirmation", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("s")
    await Bun.sleep(20)
    await renderOnce()

    expect(submitWebOperationMock).toHaveBeenCalledTimes(1)
    expect(submitWebOperationMock).toHaveBeenCalledWith({
      kind: "workspace.sync",
      request: { workspace_id: syncWorkspaceId, expected_revision: "1" },
    })
    expect(captureCharFrame()).not.toContain("[y]")
  })

  test("rejected foreground core refresh enters refresh-failed and stays locked until retry succeeds", async () => {
    coreRefreshError = new Error("authoritative core refresh failed")
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts,
    )
    await renderOnce()

    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("s")
    await Bun.sleep(20)
    await renderOnce()

    expect(fetchCoreStateMock).toHaveBeenCalledTimes(1)
    expect(captureCharFrame()).toContain("Authoritative refresh failed")
    expect(captureCharFrame()).toContain("[r] Retry refresh")
    expect(captureCharFrame()).not.toContain("[Enter/Esc] Back")
    mockInput.pressEscape()
    await renderOnce()
    expect(captureCharFrame()).toContain("Workspace operation")

    coreRefreshError = undefined
    mockInput.pressKey("r")
    await Bun.sleep(20)
    await renderOnce()
    expect(fetchCoreStateMock).toHaveBeenCalledTimes(2)
    expect(captureCharFrame()).toContain("[Enter/Esc] Back")
    mockInput.pressEnter()
    await renderOnce()
    expect(captureCharFrame()).toContain("sync-ws")
    expect(captureCharFrame()).not.toContain("Workspace operation")
  })

  test("reviewed create reconnects by known ID and remains locked through rejected reconciliation", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts,
    )
    await renderOnce()

    mockInput.pressKey("u")
    await Bun.sleep(1)
    await renderOnce()
    await mockInput.typeText("https://github.com/acme/sync-repo/pull/42")
    mockInput.pressEnter()
    await Bun.sleep(20)
    await renderOnce()
    expect(captureCharFrame()).toContain("Review workspace")

    reviewedFetchFailures = 1
    coreRefreshError = new Error("review reconciliation failed")
    mockInput.pressKey("c")
    await Bun.sleep(350)
    await renderOnce()

    expect(submitWebOperationMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "workspace.create.reviewed" }))
    expect(fetchWebOperationMock.mock.calls.map(([operationId]) => operationId)).toEqual([
      reviewedOperationId,
      reviewedOperationId,
    ])
    expect(fetchCoreStateMock).toHaveBeenCalled()
    expect(captureCharFrame()).toContain("Creating review-ws")
    expect(captureCharFrame()).toContain("Authoritative refresh failed")
    expect(captureCharFrame()).not.toContain("Change the reviewed branch and retry.")
    mockInput.pressKey("u")
    await renderOnce()
    expect(captureCharFrame()).toContain("Creating review-ws")

    coreRefreshError = undefined
    await Bun.sleep(300)
    await renderOnce()
    expect(captureCharFrame()).toContain("Review workspace")
    expect(captureCharFrame()).toContain("Change the reviewed branch and retry.")
  })

  test("completed canonical Sync remains visible until Back returns to the list", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />,
      renderOpts
    )
    await renderOnce()

    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("s")
    await Bun.sleep(20)
    await renderOnce()

    expect(captureCharFrame()).toContain("Sync workspace completed.")
    mockInput.pressEnter()
    await renderOnce()
    expect(captureCharFrame()).toContain("sync-ws")
    expect(captureCharFrame()).not.toContain("Workspace operation")
  })
})
