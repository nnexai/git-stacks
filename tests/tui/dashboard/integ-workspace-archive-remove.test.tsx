/** @jsxImportSource @opentui/solid */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import {
  cleanup,
  makeDashboardCoreState,
  makeGitMock,
  makeTmpDir,
  makeWorkspaceGitMock,
  makeWorkspaceOpsMock,
  makeWorkspaceStatusMock,
  makeWorkspaceYamlMock,
} from "../../helpers"

const configDir = makeTmpDir("integ-workspace-lifecycle")
process.env.GIT_STACKS_CONFIG_DIR = configDir

type LifecycleKind = "workspace.archive" | "workspace.unarchive" | "workspace.remove" | "workspace.force-remove"
type LifecycleRequest = {
  kind: LifecycleKind
  workspace_id: string
  expected_revision: string
  confirmation_name?: string
}

type ArchivedSummary = { id: string; name: string; activity_at: string }

const UUIDS = {
  target: "00000000-0000-4000-8000-000000000001",
  expected: "00000000-0000-4000-8000-000000000002",
  other: "00000000-0000-4000-8000-000000000003",
  archived: "00000000-0000-4000-8000-000000000004",
} as const

function workspace(input: {
  id: string
  name: string
  repo?: string
  pinned?: boolean
  priority?: number
  activityAt?: string
}) {
  return {
    id: input.id,
    name: input.name,
    schema_version: "1" as const,
    branch: `feature/${input.name}`,
    created: input.activityAt ?? "2026-07-10T00:00:00.000Z",
    last_opened: input.activityAt ?? "2026-07-10T00:00:00.000Z",
    pinned: input.pinned,
    priority: input.priority,
    repos: [{
      id: `10000000-0000-4000-8000-${input.id.slice(-12)}`,
      name: input.repo ?? `${input.name}-repo`,
      repo: input.repo ?? `${input.name}-repo`,
      type: "other" as const,
      mode: "worktree" as const,
      main_path: `/fixture/${input.name}/main`,
      task_path: `/fixture/${input.name}/task`,
      base_branch: "main",
    }],
  }
}

function coreState(
  active: ReturnType<typeof workspace>[],
  archived: ArchivedSummary[] = [],
  revision = "1",
) {
  const state = makeDashboardCoreState(active as any, [], []) as any
  state.revision = revision
  state.archived_workspaces = archived
  state.workspaces = state.workspaces.map((entry: any) => ({
    ...entry,
    projection: {
      ...entry.projection,
      activity_at: entry.definition.last_opened ?? entry.definition.created,
    },
  }))
  return state
}

let currentState = coreState([
  workspace({ id: UUIDS.target, name: "target", pinned: true, priority: 100 }),
])
let reloadedState = currentState
let lifecycleScenario: "success" | "dirty" | "stale" | "terminal-failure" = "success"
let callOrder: string[] = []

const fetchCoreStateMock = mock(async () => {
  callOrder.push(`reload:${reloadedState.revision}`)
  currentState = reloadedState
  return reloadedState
})

const lifecycleMutationMock = mock(async (
  request: LifecycleRequest,
  options?: { onOperation?: (operation: any) => void },
) => {
  callOrder.push(`submit:${request.kind}:${request.expected_revision}`)
  options?.onOperation?.({
    state: "running",
    progress: {
      stage: "executing",
      message: request.kind === "workspace.remove" ? "Stopping terminals" : "Archiving workspace",
      data: { kind: "workspace-lifecycle", phase: "stopping_terminals" },
    },
  })

  if (lifecycleScenario === "dirty" && request.kind === "workspace.remove") {
    throw Object.assign(new Error("Dirty worktrees block removal"), {
      code: "workspace_dirty",
      lifecycle: {
        kind: "workspace_dirty",
        blocking_repositories: ["api", "web"],
        terminals_stopped: true,
        force_allowed: true,
      },
    })
  }
  if (lifecycleScenario === "stale") {
    throw Object.assign(new Error("Authoritative workspace state changed"), {
      code: "conflict",
      lifecycle: { kind: "conflict", terminals_stopped: false, force_allowed: false },
    })
  }
  if (lifecycleScenario === "terminal-failure") {
    throw Object.assign(new Error("One or more terminals did not exit"), {
      code: "terminal_cleanup_failed",
      lifecycle: { kind: "terminal_cleanup_failed", terminals_stopped: false, force_allowed: false },
    })
  }

  return {
    operation_id: "op_1234567890123456",
    state: "succeeded",
    accepted_at: "2026-07-16T00:00:00.000Z",
    started_at: "2026-07-16T00:00:00.000Z",
    finished_at: "2026-07-16T00:00:01.000Z",
    completed_steps: ["workspace-lifecycle"],
    result: { revision: reloadedState.revision, terminals_stopped: request.kind !== "workspace.unarchive" },
  }
})

mock.module("@git-stacks/core/config", () => ({
  listWorkspaces: mock(() => []),
  readWorkspace: mock(() => null),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock(() => false),
  workspacePath: mock((name: string) => `${configDir}/workspaces/${name}.yml`),
  readRegistry: mock(() => []),
  writeRegistry: mock(() => {}),
  listRegistryEntries: mock(() => []),
  listTemplates: mock(() => []),
  readTemplate: mock(() => null),
  writeTemplate: mock(() => {}),
  templateExists: mock(() => false),
  templatePath: mock((name: string) => `${configDir}/templates/${name}.yml`),
  readGlobalConfig: mock(() => ({
    workspace_root: "/tmp/integ-workspace-lifecycle",
    integrations: {},
    ports: { range_start: 10000, range_end: 65000 },
  })),
  writeGlobalConfig: mock(() => {}),
  expandBranchPattern: mock((pattern: string, name: string) => pattern.replace("{name}", name)),
  getRepoPath: mock((repo: { task_path?: string; main_path: string }) => repo.task_path ?? repo.main_path),
  isGitRepo: mock((repo: { mode?: string }) => repo.mode !== "dir"),
  isWorktreeRepo: mock((repo: { mode?: string }) => repo.mode === "worktree"),
  formatZodError: mock(() => ""),
  WorkspaceSchema: {} as any,
  TemplateSchema: {} as any,
  RepoRegistryEntrySchema: {} as any,
}))

mock.module("@git-stacks/core/git", () => makeGitMock())
mock.module("@git-stacks/core/workspace-ops", () => makeWorkspaceOpsMock())
mock.module("@git-stacks/core/workspace-git", () => makeWorkspaceGitMock())
mock.module("@git-stacks/core/workspace-status", () => makeWorkspaceStatusMock({
  getWorkspaceStatus: mock(async () => []),
}))
mock.module("@git-stacks/core/workspace-yaml", () => makeWorkspaceYamlMock())
mock.module("@git-stacks/core/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => {}),
}))
mock.module("@git-stacks/core/workspace-command", () => ({
  listManualCommands: mock(() => []),
  planManualCommand: mock(() => []),
  runManualCommand: mock(async () => ({ exitCode: 0, plan: [] })),
}))
mock.module("@git-stacks/core/labels", () => ({
  matchesLabels: mock(() => false),
}))
mock.module("@git-stacks/core/integrations", () => ({
  integrations: [],
}))
mock.module("@git-stacks/core/integrations/types", () => ({
  isConditional: mock(() => false),
  resolveEnabledGlobally: mock(() => false),
}))
mock.module("../../../packages/tui/src/issue-actions", () => ({
  _exec: {},
  issueTrackerLabels: { github: "GitHub", gitlab: "GitLab", gitea: "Gitea", jira: "Jira" },
  openWorkspaceIssue: mock(async () => ({ exitCode: 0, lines: [] })),
}))
mock.module("../../../packages/tui/src/editor-handoff", () => ({
  resolveEditorHandoff: mock(async () => ({ path: "/tmp/fake.yml", validate: () => ({ ok: true }) })),
  openEditorHandoff: mock(async () => 0),
}))

mock.module("@git-stacks/service/client", () => ({
  fetchCoreState: fetchCoreStateMock,
  fetchSignalProjection: mock(async () => ({ signals: [], dismissed: [], sequence: "0" })),
  dismissSignal: mock(async () => {}),
  subscribeServiceEvents: mock(async () => "0"),
  fetchEventCursor: mock(async () => "0"),
  fetchWorkspaceFileStatus: mock(async () => ({
    workspace: { scope: "workspace", name: "target", root: "/tmp", entries: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [] },
    repos: [], summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} }, warnings: [], errors: [],
  })),
  fetchWorkspaceNotes: mock(async () => []),
  runCoreMutation: mock(async (name: string) => {
    if (name === "workspace.remove") throw new Error("legacy workspace.remove must not own Phase 123 lifecycle")
    return { state: "succeeded", result: {} }
  }),
  runWorkspaceLifecycleMutation: lifecycleMutationMock,
  createWorkspaceThroughService: mock(async () => ({ state: "succeeded" })),
}))

const { testRender } = await import("@opentui/solid")
const { default: App } = await import("../../../packages/tui/src/App")
const {
  setCoreStateFactoryForTests,
  setCoreStateForTests,
} = await import("../../../packages/tui/src/core-store")

setCoreStateFactoryForTests(() => currentState)

const renderOptions = { kittyKeyboard: true, width: 120, height: 42 }
let activeRenderer: { destroy(): void } | null = null

async function renderApp(state = currentState) {
  currentState = state
  setCoreStateForTests(state)
  const rendered = await testRender(() => <App />, renderOptions)
  activeRenderer = rendered.renderer
  await rendered.renderOnce()
  return rendered
}

async function openWorkspaceAction(mockInput: any, renderOnce: () => Promise<void>, key: string) {
  mockInput.pressEnter()
  await renderOnce()
  mockInput.pressKey(key)
  await renderOnce()
}

async function settle(renderOnce: () => Promise<void>) {
  await new Promise(resolve => setTimeout(resolve, 0))
  await renderOnce()
  await renderOnce()
}

beforeEach(() => {
  lifecycleScenario = "success"
  callOrder = []
  lifecycleMutationMock.mockClear()
  fetchCoreStateMock.mockClear()
})

afterEach(() => {
  try { activeRenderer?.destroy() } catch {}
  activeRenderer = null
})

describe("integration: archived workspaces and safe removal", () => {
  test("PHASE123_RED TUI lifecycle contract", async () => {
    const target = workspace({ id: UUIDS.target, name: "target", pinned: true, priority: 100 })
    const successor = workspace({ id: UUIDS.expected, name: "successor", repo: "successor-repo", pinned: true, priority: 50 })
    const other = workspace({ id: UUIDS.other, name: "other", priority: 99 })
    const initial = coreState([target, successor, other], [], "1")
    reloadedState = coreState([successor, other], [{ id: target.id, name: target.name, activity_at: "2026-07-16T01:00:00.000Z" }], "2")

    const { mockInput, renderOnce, captureCharFrame } = await renderApp(initial)
    await openWorkspaceAction(mockInput, renderOnce, "a")
    await settle(renderOnce)

    expect(lifecycleMutationMock).toHaveBeenCalledTimes(1)
    expect(lifecycleMutationMock.mock.calls[0]?.[0]).toEqual({
      kind: "workspace.archive",
      workspace_id: UUIDS.target,
      expected_revision: "1",
    })
    expect(callOrder).toEqual([
      "submit:workspace.archive:1",
      "reload:2",
    ])
    const frame = captureCharFrame()
    expect(frame).toContain("successor-repo")
    expect(frame).toContain("Undo")
    expect(frame).not.toContain("target-repo")
  })

  test("selects the rendered successor through every shared ordering tier", async () => {
    const cases = [
      {
        name: "pin",
        expected: workspace({ id: UUIDS.expected, name: "pin-winner", repo: "PIN-TIER-WINNER", pinned: true }),
        other: workspace({ id: UUIDS.other, name: "pin-loser", repo: "PIN-TIER-LOSER", priority: 999 }),
      },
      {
        name: "priority",
        expected: workspace({ id: UUIDS.expected, name: "priority-winner", repo: "PRIORITY-TIER-WINNER", priority: 20 }),
        other: workspace({ id: UUIDS.other, name: "priority-loser", repo: "PRIORITY-TIER-LOSER", priority: 10 }),
      },
      {
        name: "activity",
        expected: workspace({ id: UUIDS.expected, name: "activity-winner", repo: "ACTIVITY-TIER-WINNER", priority: 10, activityAt: "2026-07-16T02:00:00.000Z" }),
        other: workspace({ id: UUIDS.other, name: "activity-loser", repo: "ACTIVITY-TIER-LOSER", priority: 10, activityAt: "2026-07-15T02:00:00.000Z" }),
      },
      {
        name: "name",
        expected: workspace({ id: UUIDS.expected, name: "alpha", repo: "NAME-TIER-WINNER", priority: 10, activityAt: "2026-07-16T02:00:00.000Z" }),
        other: workspace({ id: UUIDS.other, name: "zulu", repo: "NAME-TIER-LOSER", priority: 10, activityAt: "2026-07-16T02:00:00.000Z" }),
      },
      {
        name: "stable ID",
        expected: workspace({ id: UUIDS.expected, name: "same-name", repo: "ID-TIER-WINNER", priority: 10, activityAt: "2026-07-16T02:00:00.000Z" }),
        other: workspace({ id: UUIDS.other, name: "same-name", repo: "ID-TIER-LOSER", priority: 10, activityAt: "2026-07-16T02:00:00.000Z" }),
      },
    ]

    for (const item of cases) {
      const target = workspace({ id: UUIDS.target, name: `target-${item.name}`, pinned: true, priority: 1000 })
      const initial = coreState([target, item.other, item.expected], [], "1")
      reloadedState = coreState([item.other, item.expected], [{ id: target.id, name: target.name, activity_at: "2026-07-16T03:00:00.000Z" }], "2")
      const { mockInput, renderOnce, captureCharFrame, renderer } = await renderApp(initial)

      await openWorkspaceAction(mockInput, renderOnce, "a")
      await settle(renderOnce)
      expect(captureCharFrame(), `${item.name} successor tier`).toContain(item.expected.repos[0]!.name)

      renderer.destroy()
      activeRenderer = null
      lifecycleMutationMock.mockClear()
      fetchCoreStateMock.mockClear()
      callOrder = []
    }
  })

  test("renders a minimal newest-first archived view, unarchives, and has an empty state", async () => {
    const active = workspace({ id: UUIDS.target, name: "active", repo: "ACTIVE-SECRET-REPO" })
    const initial = coreState([active], [
      { id: UUIDS.archived, name: "newest-archived", activity_at: "2026-07-16T03:00:00.000Z" },
      { id: UUIDS.expected, name: "older-archived", activity_at: "2026-07-15T03:00:00.000Z" },
    ], "7")
    reloadedState = coreState([active, workspace({ id: UUIDS.archived, name: "newest-archived" })], [
      { id: UUIDS.expected, name: "older-archived", activity_at: "2026-07-15T03:00:00.000Z" },
    ], "8")
    const { mockInput, renderOnce, captureCharFrame } = await renderApp(initial)

    mockInput.pressKey("a")
    await renderOnce()
    const archivedFrame = captureCharFrame()
    expect(archivedFrame).toContain("Archived Workspaces")
    expect(archivedFrame.indexOf("newest-archived")).toBeLessThan(archivedFrame.indexOf("older-archived"))
    expect(archivedFrame).toContain("2026-07-16")
    expect(archivedFrame).toContain("Unarchive")
    expect(archivedFrame).not.toContain("ACTIVE-SECRET-REPO")
    expect(archivedFrame).not.toContain("Pin")

    mockInput.pressEnter()
    await settle(renderOnce)
    expect(lifecycleMutationMock.mock.calls[0]?.[0]).toEqual({
      kind: "workspace.unarchive",
      workspace_id: UUIDS.archived,
      expected_revision: "7",
    })

    currentState = coreState([active], [], "9")
    setCoreStateForTests(currentState)
    mockInput.pressKey("a")
    await renderOnce()
    expect(captureCharFrame()).toContain("No archived workspaces")
  })

  test("remove defaults to cancel and inventories every deleted resource class", async () => {
    const initial = coreState([workspace({ id: UUIDS.target, name: "remove-me" })], [], "11")
    const { mockInput, renderOnce, captureCharFrame } = await renderApp(initial)

    await openWorkspaceAction(mockInput, renderOnce, "r")
    const frame = captureCharFrame()
    expect(frame).toContain("Remove remove-me")
    expect(frame).toContain("terminals")
    expect(frame).toContain("managed worktrees")
    expect(frame).toContain("workspace directory")
    expect(frame).toContain("YAML definition")
    expect(frame).toContain("[y] Remove")
    expect(frame).toContain("[n/Esc] Cancel")

    mockInput.pressEscape()
    await renderOnce()
    expect(lifecycleMutationMock).not.toHaveBeenCalled()
  })

  test("does not collapse a multi-workspace Remove selection to one arbitrary target", async () => {
    const initial = coreState([
      workspace({ id: UUIDS.target, name: "remove-alpha" }),
      workspace({ id: UUIDS.other, name: "remove-beta" }),
    ], [], "12")
    const { mockInput, renderOnce, captureCharFrame } = await renderApp(initial)

    mockInput.pressKey(" ")
    await renderOnce()
    mockInput.pressKey(" ")
    await renderOnce()

    expect(captureCharFrame()).toContain("2 selected")
    expect(captureCharFrame()).toContain("Remove one workspace at a time")
    mockInput.pressKey("r")
    await renderOnce()
    expect(lifecycleMutationMock).not.toHaveBeenCalled()
    expect(captureCharFrame()).not.toContain("Remove remove-alpha")
    expect(captureCharFrame()).not.toContain("Remove remove-beta")
  })

  test("offers exact-name Force Remove only for a typed dirty result", async () => {
    const initial = coreState([workspace({ id: UUIDS.target, name: "dirty-demo" })], [], "20")
    reloadedState = coreState([workspace({ id: UUIDS.target, name: "dirty-demo" })], [], "21")
    lifecycleScenario = "dirty"
    const { mockInput, renderOnce, captureCharFrame } = await renderApp(initial)

    await openWorkspaceAction(mockInput, renderOnce, "r")
    mockInput.pressKey("y")
    await settle(renderOnce)

    let frame = captureCharFrame()
    expect(frame).toContain("api")
    expect(frame).toContain("web")
    expect(frame).toContain("Terminals were stopped")
    expect(frame).toContain("Force Remove")
    expect(callOrder).toEqual(["submit:workspace.remove:20", "reload:21"])

    mockInput.pressKey("f")
    await settle(renderOnce)
    frame = captureCharFrame()
    expect(frame).toContain("Type dirty-demo")

    await mockInput.typeText("dirty-dem")
    mockInput.pressEnter()
    await renderOnce()
    expect(lifecycleMutationMock).toHaveBeenCalledTimes(1)

    mockInput.pressEscape()
    await renderOnce()
    mockInput.pressKey("f")
    await settle(renderOnce)
    await mockInput.typeText("Dirty-demo")
    mockInput.pressEnter()
    await renderOnce()
    expect(lifecycleMutationMock).toHaveBeenCalledTimes(1)

    mockInput.pressEscape()
    await renderOnce()
    mockInput.pressKey("f")
    await settle(renderOnce)
    lifecycleScenario = "success"
    reloadedState = coreState([], [], "22")
    await mockInput.typeText("dirty-demo")
    await renderOnce()
    expect(captureCharFrame()).toContain("[Enter] Force Remove")
    mockInput.pressEnter()
    await settle(renderOnce)
    expect(lifecycleMutationMock.mock.calls[1]?.[0]).toEqual({
      kind: "workspace.force-remove",
      workspace_id: UUIDS.target,
      expected_revision: "21",
      confirmation_name: "dirty-demo",
    })
    expect(captureCharFrame()).toContain("No workspaces found")
    expect(captureCharFrame()).toContain("No workspace selected")
  })

  test("never offers force for terminal failure and reloads stale state without replay", async () => {
    const initial = coreState([workspace({ id: UUIDS.target, name: "stale-demo" })], [], "30")
    reloadedState = coreState([workspace({ id: UUIDS.target, name: "renamed-demo" })], [], "31")
    lifecycleScenario = "stale"
    const { mockInput, renderOnce, captureCharFrame } = await renderApp(initial)

    await openWorkspaceAction(mockInput, renderOnce, "r")
    mockInput.pressKey("y")
    await settle(renderOnce)

    expect(callOrder).toEqual(["submit:workspace.remove:30", "reload:31"])
    expect(lifecycleMutationMock).toHaveBeenCalledTimes(1)
    expect(captureCharFrame()).toContain("renamed-demo")
    expect(captureCharFrame()).not.toContain("Force Remove")
    mockInput.pressKey("y")
    await renderOnce()
    expect(lifecycleMutationMock).toHaveBeenCalledTimes(1)

    lifecycleMutationMock.mockClear()
    callOrder = []
    lifecycleScenario = "terminal-failure"
    currentState = initial
    setCoreStateForTests(initial)
    await openWorkspaceAction(mockInput, renderOnce, "a")
    await settle(renderOnce)
    expect(captureCharFrame()).toContain("terminals did not exit")
    expect(captureCharFrame()).not.toContain("Force Remove")
    expect(lifecycleMutationMock).toHaveBeenCalledTimes(1)
  })
})

afterAll(() => {
  setCoreStateFactoryForTests(undefined)
  cleanup(configDir)
})
