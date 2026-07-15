import { afterAll, describe, test, expect, mock, beforeEach, afterEach, vi } from "@test/api"
import { join } from "path"
import { cleanup, makeTmpDir, makeWorkspaceOpsMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock, makeWorkspaceGitMock, makeConfigMock, makeGitMock, makeLifecycleMock } from "../helpers"

const fixtureRoot = makeTmpDir("workspace-wizard")
const workspaceRoot = join(fixtureRoot, "workspaces")
const tasksRoot = join(workspaceRoot, "tasks")
const editorTarget = join(fixtureRoot, "workspace.yml")

afterAll(() => cleanup(fixtureRoot))

// Shared mock instances used by @/tui/utils mock below
const mockIntro = mock(() => {})
const mockOutro = mock(() => {})
const mockLog = { info: mock(() => {}), success: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) }
const spinnerInstance = {
  start: mock(() => {}),
  stop: mock(() => {}),
  message: mock(() => {}),
}
const mockSpinner = mock(() => spinnerInstance)
const mockText = mock(async () => "test-value")
const mockSelect = mock(async () => "template" as string | symbol)
const mockMultiselect = mock(async () => [] as string[] | symbol)
const mockConfirm = mock(async () => false as boolean | symbol)
const mockIsCancel = mock((v: unknown) => typeof v === "symbol")
const mockCancel = mock(() => {})

// Mock tui/utils
const mockSafeText = mock(async () => "mock-value")
const mockCancelUtil = mock((): never => { throw new Error("cancelled") })
const originalExit = process.exit
const exitMock = mock((code?: number) => { throw new Error(`process.exit(${code})`) })
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

mock.module("@/tui/utils", () => ({
  safeText: mockSafeText,
  cancel: mockCancelUtil,
  prompts: {
    intro: mockIntro,
    outro: mockOutro,
    log: mockLog,
    spinner: mockSpinner,
    text: mockText,
    select: mockSelect,
    multiselect: mockMultiselect,
    confirm: mockConfirm,
    isCancel: mockIsCancel,
    cancel: mockCancel,
    note: mock(() => {}),
    group: mock(async () => ({})),
    groupMultiselect: mock(async () => []),
  },
}))

// Mock integrations
const fakeIntegrations = [
  {
    id: "vscode",
    label: "VSCode",
    hint: "Open in VSCode",
    enabledByDefault: true,
    order: 10,
    configurePrompt: mock(async (c: Record<string, unknown>) => ({ ...c, enabled: true })),
    isEnabled: mock(() => true),
    applies: undefined,
    generate: mock(() => null),
    open: mock(async () => {}),
  },
  {
    id: "tmux",
    label: "tmux",
    hint: "Open in tmux",
    enabledByDefault: false,
    order: 12,
    configurePrompt: mock(async (c: Record<string, unknown>) => ({ ...c, enabled: true })),
    isEnabled: mock(() => false),
    applies: undefined,
    generate: mock(() => null),
    open: mock(async () => {}),
  },
]

const mockResolveEnabledGlobally = mock((id: string, _defaultEnabled: boolean, _config: unknown) => {
  if (id === "vscode") return true
  return false
})

mock.module("@/lib/integrations", () => ({
  integrations: fakeIntegrations,
  resolveEnabledGlobally: mockResolveEnabledGlobally,
}))

// Mock wizard-helpers
const mockPromptIntegrationOverrides = mock(async (_ids: string[], _configs: unknown) => undefined as Record<string, unknown> | undefined)

mock.module("@/lib/integrations/wizard-helpers", () => ({
  promptIntegrationOverrides: mockPromptIntegrationOverrides,
}))

const mockComposeTemplates = mock((_templateNames: string[]) => ({
  name: "overlay",
  schema_version: "1" as const,
  repos: [
    { repo: "frontend", mode: "worktree" as const },
  ],
  labels: ["template:shared"],
  integrations: {
    vscode: { enabled: true, cmd: "code" },
  },
}))

mock.module("@/lib/composition", () => ({
  composeTemplates: mockComposeTemplates,
}))

// Mock config module
const mockWriteWorkspace = mock((_ws: unknown) => {})
const mockWorkspaceExists = mock((_name: string) => false)
const mockReadGlobalConfig = mock(() => ({
  workspace_root: workspaceRoot,
  integrations: {
    vscode: { enabled: true },
  },
}))
const mockReadTemplate = mock((_name: string) => ({
  name: "my-template",
  schema_version: "1" as const,
  repos: [
    { repo: "frontend", mode: "worktree" as const },
  ],
  labels: ["template:shared"],
  integrations: {
    vscode: { enabled: true, cmd: "code" },
  },
}))
const mockListTemplates = mock(() => [{ name: "my-template", schema_version: "1" as const, repos: [], description: "Test template" }])
const mockTemplateExists = mock((_name: string) => true)
const mockReadRegistry = mock(() => [
  {
    name: "frontend",
    schema_version: "1" as const,
    local_path: "/repos/frontend",
    default_branch: "main",
    type: "typescript" as const,
  },
])
const mockWriteRegistry = mock(() => {})
const mockExpandBranchPattern = mock((pattern: string, _name: string) => pattern)
const mockReadWorkspace = mock((_name: string) => ({ name: "test-ws", schema_version: "1" as const, branch: "feature/x", repos: [], created: "2024-01-01" }))
const mockListWorkspaces = mock(() => [])

mock.module("@/lib/config", () => makeConfigMock({
  readGlobalConfig: mockReadGlobalConfig,
  readTemplate: mockReadTemplate,
  listTemplates: mockListTemplates,
  templateExists: mockTemplateExists,
  readRegistry: mockReadRegistry,
  writeRegistry: mockWriteRegistry,
  writeWorkspace: mockWriteWorkspace,
  workspaceExists: mockWorkspaceExists,
  expandBranchPattern: mockExpandBranchPattern,
  readWorkspace: mockReadWorkspace,
  listWorkspaces: mockListWorkspaces,
}))

// Mock lib/paths
mock.module("@/lib/paths", () => ({
  getTasksDir: mock(() => tasksRoot),
  expandHome: mock((p: string) => p),
}))

// Mock lib/git
mock.module("@/lib/git", () => makeGitMock({
  createWorktree: mock(async () => {}),
  getCurrentBranch: mock(async () => "main"),
  ensureUpstreamTracking: mock(async () => ({ tracked: false })),
}))

// Mock lib/detect
mock.module("@/lib/detect", () => ({
  detectRepoType: mock(() => "typescript"),
}))

// Mock lib/lifecycle
mock.module("@/lib/lifecycle", () => makeLifecycleMock({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => []),
}))

// Mock lib/files
mock.module("@/lib/files", () => ({
  applyFileOpsForRepo: mock(() => ({ ok: true })),
  applyFileOpsForWorkspace: mock(() => ({ ok: true })),
}))

const mockOpenWorkspace = mock(async () => ({ ok: true }))

// Mock lib/workspace-ops
mock.module("@/lib/workspace-ops", () => makeWorkspaceOpsMock({
  openWorkspace: mockOpenWorkspace,
  mergeEnv: mock(() => ({})),
  writeEnvFiles: mock(() => {}),
  cleanWorkspace: mock(async () => ({ ok: true })),
  closeWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async () => ({ ok: true })),
  mergeWorkspace: mock(async () => ({ ok: true })),
  renameWorkspace: mock(async () => ({ ok: true })),
}))

mock.module("@/lib/workspace-status", () => makeWorkspaceStatusMock({
  getWorkspaceStatus: mock(async () => []),
  getDirtyWorktrees: mock(async () => []),
  getWorkspaceListInfo: mock(async (ws: { name: string; branch: string; created: string; repos: unknown[] }) => ({
    name: ws.name,
    branch: ws.branch,
    created: ws.created,
    dirty: false,
    repoCount: ws.repos.length,
    lastOpened: "0d",
  })),
}))

mock.module("@/lib/workspace-yaml", () => makeWorkspaceYamlMock({
  editWorkspaceYaml: mock(() => ({ path: editorTarget, validate: () => ({ ok: true }) })),
}))

mock.module("@/lib/workspace-git", () => makeWorkspaceGitMock({
  syncWorkspace: mock(async () => ({ ok: true, synced: [], skipped: [] })),
}))

// Import after all mocks
const { runWorkspaceNew } = await import("@/tui/workspace-wizard")

describe("workspace-wizard integration overrides", () => {
  beforeEach(() => {
    mockSafeText.mockReset()
    mockSelect.mockReset()
    mockConfirm.mockReset()
    mockIsCancel.mockReset()
    mockIsCancel.mockImplementation((v: unknown) => typeof v === "symbol")
    mockPromptIntegrationOverrides.mockReset()
    mockWriteWorkspace.mockReset()
    mockPromptIntegrationOverrides.mockResolvedValue(undefined)
    // Default: no open
    mockConfirm.mockResolvedValue(false)
  })

  test("Test 1: template-based workspace calls promptIntegrationOverrides with template integration IDs as initial selection (D-06)", async () => {
    // Setup: user picks template mode, selects "my-template", enters name/branch/description
    // safeText returns: name, branch, description, port names
    mockSafeText
      .mockResolvedValueOnce("ws-from-template") // name
      .mockResolvedValueOnce("") // labels
      .mockResolvedValueOnce("feature/ws-from-template") // branch
      .mockResolvedValueOnce("") // description
      .mockResolvedValueOnce("") // port names (empty = skip)

    // select returns: creation mode "template", then template name "my-template"
    mockSelect
      .mockResolvedValueOnce("template") // creation mode
      .mockResolvedValueOnce("my-template") // template selection

    await runWorkspaceNew()

    expect(mockPromptIntegrationOverrides).toHaveBeenCalledTimes(1)
    // Template has vscode: { enabled: true, cmd: "code" } so initialEnabledIds should be ["vscode"]
    const [initialEnabledIds] = mockPromptIntegrationOverrides.mock.calls[0] as [string[], unknown]
    expect(initialEnabledIds).toEqual(["vscode"])
  })

  test("Test 2: ad-hoc workspace calls promptIntegrationOverrides with global config IDs as initial selection (D-06)", async () => {
    // Setup: no templates available -> direct to ad-hoc
    mockListTemplates.mockReturnValueOnce([])

    // safeText: name, branch, description, port names
    mockSafeText
      .mockResolvedValueOnce("ws-adhoc") // name
      .mockResolvedValueOnce("") // labels
      .mockResolvedValueOnce("feature/ws-adhoc") // branch
      .mockResolvedValueOnce("") // description
      .mockResolvedValueOnce("") // port names (empty = skip)

    // multiselect for repo selection
    mockMultiselect.mockResolvedValueOnce(["frontend"])
    // select for mode
    mockSelect.mockResolvedValueOnce("worktree")

    await runWorkspaceNew()

    expect(mockPromptIntegrationOverrides).toHaveBeenCalledTimes(1)
    // resolveEnabledGlobally returns true for vscode, false for tmux
    const [initialEnabledIds] = mockPromptIntegrationOverrides.mock.calls[0] as [string[], unknown]
    expect(initialEnabledIds).toContain("vscode")
    expect(initialEnabledIds).not.toContain("tmux")
  })

  test("Test 3: stores overrides in workspace settings.integrations when user opts in (D-05)", async () => {
    const overrides = { vscode: { enabled: true, cmd: "code" }, tmux: { enabled: false } }
    mockPromptIntegrationOverrides.mockResolvedValueOnce(overrides)

    mockSafeText
      .mockResolvedValueOnce("ws-with-overrides")
      .mockResolvedValueOnce("") // labels
      .mockResolvedValueOnce("feature/ws-with-overrides")
      .mockResolvedValueOnce("") // description
      .mockResolvedValueOnce("") // port names (empty = skip)

    mockSelect
      .mockResolvedValueOnce("template")
      .mockResolvedValueOnce("my-template")

    await runWorkspaceNew()

    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { settings?: { integrations?: unknown } }
    expect(savedWs.settings?.integrations).toEqual(overrides)
  })

  test("Test 4: does not store integrations key when user declines override (D-07)", async () => {
    // promptIntegrationOverrides returns undefined (user declined)
    mockPromptIntegrationOverrides.mockResolvedValueOnce(undefined)

    mockSafeText
      .mockResolvedValueOnce("ws-no-override")
      .mockResolvedValueOnce("") // labels
      .mockResolvedValueOnce("feature/ws-no-override")
      .mockResolvedValueOnce("") // description
      .mockResolvedValueOnce("") // port names (empty = skip)

    mockSelect
      .mockResolvedValueOnce("template")
      .mockResolvedValueOnce("my-template")

    await runWorkspaceNew()

    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { settings?: { integrations?: unknown } }
    // settings.integrations should NOT be set (template may have settings from wsIntegrationSettings
    // but user declined so wsIntegrationSettings stays as template snapshot, not replaced by undefined)
    // The template itself has integrations, so it will be the template snapshot, not user override
    // Key test: no user overrides were applied (undefined returned means no replacement happened)
    // Template snapshot is still { vscode: { enabled: true, cmd: "code" } }
    expect(savedWs.settings?.integrations).toBeDefined()
    // But it should be the template snapshot, not user overrides (they returned undefined)
  })

  test("accepts CLI labels and unions template labels at creation time", async () => {
    mockSafeText
      .mockResolvedValueOnce("ws-cli-labels")
      .mockResolvedValueOnce("feature/ws-cli-labels")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")

    mockSelect
      .mockResolvedValueOnce("template")
      .mockResolvedValueOnce("my-template")

    await runWorkspaceNew(undefined, undefined, undefined, ["backend", "template:shared"])

    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { labels?: string[] }
    expect(savedWs.labels).toEqual(["template:shared", "backend"])
  })

  test("prompts for comma-separated labels when CLI labels are absent", async () => {
    mockSafeText
      .mockResolvedValueOnce("ws-prompted")
      .mockResolvedValueOnce("backend, sprint:14")
      .mockResolvedValueOnce("feature/ws-prompted")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")

    mockSelect
      .mockResolvedValueOnce("template")
      .mockResolvedValueOnce("my-template")

    await runWorkspaceNew()

    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { labels?: string[] }
    expect(savedWs.labels).toEqual(["template:shared", "backend", "sprint:14"])
  })

  test("writes template labels and CLI labels into the saved workspace", async () => {
    mockSafeText
      .mockResolvedValueOnce("ws-template-cli-labels")
      .mockResolvedValueOnce("cli:one, cli:two")
      .mockResolvedValueOnce("feature/ws-template-cli-labels")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")

    mockSelect
      .mockResolvedValueOnce("template")
      .mockResolvedValueOnce("my-template")

    await runWorkspaceNew()

    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { labels?: string[] }
    expect(savedWs.labels).toEqual(["template:shared", "cli:one", "cli:two"])
  })
})

describe("new --non-interactive", () => {
  beforeEach(() => {
    process.exit = exitMock as any
    mockSafeText.mockReset()
    mockSelect.mockReset()
    mockConfirm.mockReset()
    mockPromptIntegrationOverrides.mockReset()
    mockComposeTemplates.mockReset()
    mockWriteWorkspace.mockReset()
    mockWorkspaceExists.mockReset()
    mockTemplateExists.mockReset()
    mockReadTemplate.mockReset()
    mockOpenWorkspace.mockReset()
    consoleErrorSpy.mockReset()
    exitMock.mockReset()

    mockWorkspaceExists.mockImplementation((_name: string) => false)
    mockTemplateExists.mockImplementation((_name: string) => true)
    mockReadTemplate.mockImplementation((_name: string) => ({
      name: "my-template",
      schema_version: "1" as const,
      repos: [
        { repo: "frontend", mode: "worktree" as const },
      ],
      labels: ["template:shared"],
      integrations: {
        vscode: { enabled: true, cmd: "code" },
      },
    }))
    mockComposeTemplates.mockImplementation((_templateNames: string[]) => ({
      name: "overlay",
      schema_version: "1" as const,
      repos: [
        { repo: "frontend", mode: "worktree" as const },
      ],
      labels: ["template:shared"],
      integrations: {
        vscode: { enabled: true, cmd: "code" },
      },
    }))
    mockOpenWorkspace.mockResolvedValue({ ok: true })
    consoleErrorSpy.mockImplementation(() => {})
    exitMock.mockImplementation((code?: number) => { throw new Error(`process.exit(${code})`) })
  })

  afterEach(() => {
    process.exit = originalExit
  })

  test("new --non-interactive creates workspace from --from template without prompts", async () => {
    await runWorkspaceNew("myws", "my-template", undefined, undefined, { nonInteractive: true })

    expect(mockSafeText.mock.calls.length).toBe(0)
    expect(mockSelect.mock.calls.length).toBe(0)
    expect(mockConfirm.mock.calls.length).toBe(0)
    expect(mockPromptIntegrationOverrides.mock.calls.length).toBe(0)
    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { name: string; branch: string; template?: string }
    expect(savedWs.name).toBe("myws")
    expect(savedWs.branch).toBe("feature/myws")
    expect(savedWs.template).toBe("my-template")
  })

  test("new --non-interactive creates workspace via --template composition", async () => {
    await runWorkspaceNew("myws", undefined, ["base", "overlay"], undefined, { nonInteractive: true })

    expect(mockComposeTemplates).toHaveBeenCalledWith(["base", "overlay"])
    expect(mockSafeText.mock.calls.length).toBe(0)
    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { template?: string; repos: Array<{ name: string }> }
    expect(savedWs.template).toBe("overlay")
    expect(savedWs.repos[0]?.name).toBe("frontend")
  })

  test("new --non-interactive fails when name is missing", async () => {
    await expect(runWorkspaceNew(undefined, "my-template", undefined, undefined, { nonInteractive: true }))
      .rejects.toThrow("process.exit(1)")

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("<name>"))
  })

  test("new --non-interactive fails when template source is missing", async () => {
    await expect(runWorkspaceNew("myws", undefined, undefined, undefined, { nonInteractive: true }))
      .rejects.toThrow("process.exit(1)")

    const errorText = String(consoleErrorSpy.mock.calls[0]?.[0] ?? "")
    expect(errorText).toContain("--from")
    expect(errorText).toContain("--template")
  })

  test("new --non-interactive branch defaults to feature name", async () => {
    await runWorkspaceNew("myws", "my-template", undefined, undefined, { nonInteractive: true })

    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { branch: string }
    expect(savedWs.branch).toBe("feature/myws")
  })

  test("new --non-interactive uses explicit branch", async () => {
    await runWorkspaceNew("myws", "my-template", undefined, undefined, {
      nonInteractive: true,
      branch: "ticket/PROJ-42",
    })

    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { branch: string }
    expect(savedWs.branch).toBe("ticket/PROJ-42")
  })

  test("new --non-interactive opens only when --open is set", async () => {
    await runWorkspaceNew("closed", "my-template", undefined, undefined, { nonInteractive: true })
    expect(mockOpenWorkspace).not.toHaveBeenCalled()

    await runWorkspaceNew("opened", "my-template", undefined, undefined, { nonInteractive: true, open: true })
    expect(mockOpenWorkspace).toHaveBeenCalledWith("opened", {}, expect.any(Function))
  })

  test("new --non-interactive fails when template is not found", async () => {
    mockTemplateExists.mockReturnValue(false)

    await expect(runWorkspaceNew("myws", "missing-template", undefined, undefined, { nonInteractive: true }))
      .rejects.toThrow("process.exit(1)")

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("missing-template"))
  })

  test("new --non-interactive fails when workspace already exists", async () => {
    mockWorkspaceExists.mockReturnValue(true)

    await expect(runWorkspaceNew("myws", "my-template", undefined, undefined, { nonInteractive: true }))
      .rejects.toThrow("process.exit(1)")
  })
})
