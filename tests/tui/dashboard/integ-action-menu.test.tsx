/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock, afterAll, afterEach, beforeEach } from "bun:test"
import { existsSync } from "fs"
import { makeTmpDir, cleanup, write, makeWorkspaceOpsMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock, makeWorkspaceGitMock, makeGitMock } from "../../helpers"

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
let workspaceSettings: Record<string, unknown> = {}
let workspaceCommands: Record<string, string> = {}
const workspaceFixture = () => ({ ...wsFixture, settings: workspaceSettings, commands: workspaceCommands })

// Inline registry fixture
const registryFixture = [
  {
    name: "my-repo",
    local_path: "/tmp/integ-action-test-repo",
    type: "other" as const,
    default_branch: "main",
  },
]
const listRegistryEntriesMock = mock(() => registryFixture)
const registryValidateMock = mock(() => ({ ok: true }))
const editRegistryYamlMock = mock(() => ({ path: "/tmp/registry.yml", validate: registryValidateMock }))
const openWorkspaceIssueMock = mock(async (_workspaceName: string, candidate: { label: string }) => ({
  exitCode: 0,
  lines: [{ text: `opened ${candidate.label}`, stream: "stdout" as const }],
}))
const runManualCommandMock = mock(async (_workspace: unknown, _commandName: string, opts?: { onOutput?: (output: { line: string; stream: "stdout" | "stderr" }) => void }) => {
  opts?.onOutput?.({ line: "command stdout", stream: "stdout" })
  return {
  exitCode: 0,
  plan: [],
  }
})

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
  listWorkspaces: mock(() => (wsRemoved ? [] : [workspaceFixture()])),
  readWorkspace: mock((_name: string) => workspaceFixture()),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock((name: string) => !wsRemoved && name === "test-ws"),
  workspacePath: mock((name: string) => `${configDir}/workspaces/${name}.yml`),
  readRegistry: mock(() => registryFixture),
  writeRegistry: mock(() => {}),
  listRegistryEntries: listRegistryEntriesMock,
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
mock.module("../../../src/lib/git", () => makeGitMock())

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
}))

mock.module("../../../src/lib/workspace-git", () => makeWorkspaceGitMock({
  syncWorkspace: mock(async () => ({ ok: true, synced: [], skipped: [] })),
}))

mock.module("../../../src/lib/workspace-status", () => makeWorkspaceStatusMock({
  getWorkspaceStatus: mock(async () => []),
}))

mock.module("../../../src/lib/workspace-yaml", () => makeWorkspaceYamlMock({
  editWorkspaceYaml: mock(() => ({ path: "/tmp/fake.yml", validate: () => ({ ok: true }) })),
  editRegistryYaml: editRegistryYamlMock,
}))

mock.module("../../../src/tui/dashboard/issue-actions", () => ({
  _exec: {},
  issueTrackerLabels: {
    github: "GitHub",
    gitlab: "GitLab",
    gitea: "Gitea",
    jira: "Jira",
  },
  openWorkspaceIssue: openWorkspaceIssueMock,
}))

mock.module("../../../src/lib/workspace-command", () => ({
  listManualCommands: mock((workspace: { commands?: Record<string, string> }, opts?: { all?: boolean }) => {
    const names = Object.keys(workspace.commands ?? {}).sort()
    return opts?.all ? names : names.filter(name => !name.startsWith("pre") && !name.startsWith("post"))
  }),
  runManualCommand: runManualCommandMock,
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
  workspaceSettings = {}
  workspaceCommands = {}
  listRegistryEntriesMock.mockClear()
  registryValidateMock.mockClear()
  editRegistryYamlMock.mockClear()
  openWorkspaceIssueMock.mockClear()
  runManualCommandMock.mockClear()
  process.env.EDITOR = "true"
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

  test("repo edit opens registry YAML and returns to repos list without remove confirmation", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressKey("3")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(captureCharFrame()).toContain("[e] Edit ($EDITOR)")

    mockInput.pressKey("e")
    await renderOnce()
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()

    const frame = captureCharFrame()
    expect(editRegistryYamlMock).toHaveBeenCalled()
    expect(registryValidateMock).toHaveBeenCalled()
    expect(listRegistryEntriesMock.mock.calls.length).toBeGreaterThan(1)
    expect(frame).toContain("my-repo")
    expect(frame).not.toContain("[y]")
  })

  test("single linked issue opens directly and keeps progress visible until keypress", async () => {
    workspaceSettings = { integrations: { github: { issue: "ABC-123" } } }
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(captureCharFrame()).toContain("[i] Issue...")

    mockInput.pressKey("i")
    await renderOnce()
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()

    expect(openWorkspaceIssueMock).toHaveBeenCalledWith("test-ws", {
      tracker: "github",
      issueId: "ABC-123",
      label: "GitHub: ABC-123",
    })
    let frame = captureCharFrame()
    expect(frame).toContain("Opening GitHub: ABC-123")
    expect(frame).toContain("opened GitHub: ABC-123")

    mockInput.pressKey("a")
    await renderOnce()
    frame = captureCharFrame()
    expect(frame).toContain("test-ws")
    expect(frame).not.toContain("Opening GitHub: ABC-123")
  })

  test("multiple linked issues show a tracker picker", async () => {
    workspaceSettings = { integrations: { github: { issue: "ABC-123" }, jira: { issue: "OPS-7" } } }
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("i")
    await renderOnce()

    let frame = captureCharFrame()
    expect(frame).toContain("GitHub: ABC-123")
    expect(frame).toContain("Jira: OPS-7")

    mockInput.pressArrow("down")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()

    expect(openWorkspaceIssueMock).toHaveBeenCalledWith("test-ws", {
      tracker: "jira",
      issueId: "OPS-7",
      label: "Jira: OPS-7",
    })
    frame = captureCharFrame()
    expect(frame).toContain("Opening Jira: OPS-7")
  })

  test("linked issue failure stays in progress view until keypress", async () => {
    workspaceSettings = { integrations: { github: { issue: "ABC-123" } } }
    openWorkspaceIssueMock.mockResolvedValueOnce({
      exitCode: 7,
      lines: [{ text: "tracker unavailable", stream: "stderr" }],
    })
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("i")
    await renderOnce()
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("tracker unavailable")
    expect(frame).toContain("ERROR: GitHub: ABC-123 open failed with exit code 7.")
  })

  test("manual commands picker lists visible commands and runs selected command", async () => {
    workspaceCommands = {
      preverify: "echo pre",
      verify: "bun run verify",
      postverify: "echo post",
    }
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("d")
    await renderOnce()

    let frame = captureCharFrame()
    expect(frame).toContain("verify")
    expect(frame).not.toContain("preverify")
    expect(frame).not.toContain("postverify")

    mockInput.pressEnter()
    await renderOnce()
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()

    expect(runManualCommandMock).toHaveBeenCalled()
    expect(runManualCommandMock.mock.calls[0][1]).toBe("verify")
    expect(runManualCommandMock.mock.calls[0][2]).toEqual(expect.objectContaining({
      onOutput: expect.any(Function),
    }))
    frame = captureCharFrame()
    expect(frame).toContain("Running command verify")
    expect(frame).toContain("command stdout")
    expect(frame).toContain("Command verify completed.")
  })

  test("manual command failure stays in progress view with failed command", async () => {
    workspaceCommands = { verify: "bun run verify" }
    runManualCommandMock.mockResolvedValueOnce({
      exitCode: 42,
      failedCommand: "bun test",
      plan: [],
    })
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("d")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("ERROR: Command verify failed with exit code 42.")
    expect(frame).toContain("Failed command: bun test.")
  })

  test("running manual command cannot be closed until completion and returns to workspaces", async () => {
    workspaceCommands = { verify: "bun run verify" }
    let resolveCommand: ((value: { exitCode: number; plan: unknown[] }) => void) | undefined
    runManualCommandMock.mockImplementationOnce(async (_workspace, _commandName, opts?: { onOutput?: (output: { line: string; stream: "stdout" | "stderr" }) => void }) => {
      opts?.onOutput?.({ line: "line-001", stream: "stdout" })
      return await new Promise(resolve => { resolveCommand = resolve })
    })
    const { renderer, mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <App />, renderOpts
    )
    activeRenderer = renderer

    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("d")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()

    mockInput.pressKey("a")
    await renderOnce()
    expect(captureCharFrame()).toContain("Running command verify")

    resolveCommand?.({ exitCode: 0, plan: [] })
    await new Promise(resolve => setTimeout(resolve, 20))
    await renderOnce()
    mockInput.pressKey("a")
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Workspaces")
    expect(frame).toContain("test-ws")
    expect(frame).not.toContain("Running command verify")
  })
})

afterAll(() => cleanup(configDir))
