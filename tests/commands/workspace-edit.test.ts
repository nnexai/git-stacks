import { describe, test, expect, mock, beforeEach } from "bun:test"

// Mock @clack/prompts (comprehensive — must include all properties used by workspace-wizard.ts)
const mockIntro = mock(() => {})
const mockOutro = mock(() => {})
const mockLog = { info: mock(() => {}), success: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) }
const spinnerInstance = {
  start: mock(() => {}),
  stop: mock(() => {}),
  message: mock(() => {}),
}
const mockSpinner = mock(() => spinnerInstance)
const mockSelect = mock(async () => "integrations" as string | symbol)
const mockMultiselect = mock(async () => [] as string[] | symbol)
const mockIsCancel = mock((v: unknown) => typeof v === "symbol")
const mockText = mock(async () => "new description")
const mockConfirm = mock(async () => false as boolean | symbol)
const mockSafeText = mock(async () => "new description")
const mockCancelUtil = mock((): never => { throw new Error("cancelled") })

mock.module("@clack/prompts", () => ({
  intro: mockIntro,
  outro: mockOutro,
  log: mockLog,
  spinner: mockSpinner,
  select: mockSelect,
  multiselect: mockMultiselect,
  isCancel: mockIsCancel,
  text: mockText,
  confirm: mockConfirm,
  cancel: mock(() => {}),
}))

mock.module("@/tui/utils", () => ({
  safeText: mockSafeText,
  cancel: mockCancelUtil,
}))

// Mock integrations
const fakeIntegrations = [
  {
    id: "vscode",
    label: "VSCode",
    hint: "Open in VSCode",
    enabledByDefault: true,
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

// Mock lib/config
const baseWorkspace = {
  name: "my-workspace",
  schema_version: "1" as const,
  branch: "feature/my-workspace",
  repos: [],
  created: "2024-01-01",
  description: "old description",
  settings: {
    integrations: {
      vscode: { enabled: true, cmd: "code" },
    },
  },
}
const mockReadWorkspace = mock((_name: string) => ({ ...baseWorkspace }))
const mockWriteWorkspace = mock((_ws: unknown) => {})
const mockReadGlobalConfig = mock(() => ({
  workspace_root: "/tmp/test-workspaces",
  integrations: {
    vscode: { enabled: true },
  },
}))
const mockWorkspaceExists = mock((_name: string) => true)
const mockReadRegistry = mock(() => [])
const mockWriteRegistry = mock(() => {})
const mockListTemplates = mock(() => [])
const mockTemplateExists = mock(() => false)
const mockReadTemplate = mock(() => ({ name: "t", schema_version: "1" as const, repos: [] }))
const mockListWorkspaces = mock(() => [])
const mockExpandBranchPattern = mock((p: string) => p)

mock.module("@/lib/config", () => ({
  readWorkspace: mockReadWorkspace,
  writeWorkspace: mockWriteWorkspace,
  readGlobalConfig: mockReadGlobalConfig,
  workspaceExists: mockWorkspaceExists,
  readRegistry: mockReadRegistry,
  writeRegistry: mockWriteRegistry,
  listTemplates: mockListTemplates,
  templateExists: mockTemplateExists,
  readTemplate: mockReadTemplate,
  listWorkspaces: mockListWorkspaces,
  expandBranchPattern: mockExpandBranchPattern,
}))

// Mock lib/paths, lib/git, lib/detect, lib/lifecycle, lib/files, lib/workspace-ops
mock.module("@/lib/paths", () => ({
  getTasksDir: mock(() => "/tmp/test-workspaces/tasks"),
  expandHome: mock((p: string) => p),
}))

mock.module("@/lib/git", () => ({
  createWorktree: mock(async () => {}),
  getCurrentBranch: mock(async () => "main"),
}))

mock.module("@/lib/detect", () => ({
  detectRepoType: mock(() => "typescript"),
}))

mock.module("@/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => []),
}))

mock.module("@/lib/files", () => ({
  applyFileOpsForRepo: mock(() => ({ ok: true })),
  applyFileOpsForWorkspace: mock(() => ({ ok: true })),
}))

mock.module("@/lib/workspace-ops", () => ({
  openWorkspace: mock(async () => ({ ok: true })),
  getWorkspaceStatus: mock(async () => []),
  editWorkspaceYaml: mock(() => ({ path: "/tmp/test.yml", validate: () => ({ ok: true }) })),
  mergeEnv: mock(() => ({})),
  writeEnvFiles: mock(() => {}),
  getDirtyWorktrees: mock(async () => []),
  runPreRemoveHooks: mock(async () => {}),
  cleanWorkspace: mock(async () => ({ ok: true })),
  closeWorkspace: mock(async () => ({ ok: true })),
  removeWorkspace: mock(async () => ({ ok: true })),
  mergeWorkspace: mock(async () => ({ ok: true })),
  renameWorkspace: mock(async () => ({ ok: true })),
  syncWorkspace: mock(async () => ({ ok: true, synced: [], skipped: [] })),
  getWorkspaceListInfo: mock(async () => ({
    name: "ws",
    branch: "main",
    created: "2024-01-01",
    dirty: false,
    repoCount: 0,
    lastOpened: "0d",
  })),
}))

// Import after all mocks
const { runWorkspaceEdit } = await import("@/tui/workspace-wizard")

describe("runWorkspaceEdit", () => {
  beforeEach(() => {
    mockSelect.mockReset()
    mockIsCancel.mockReset()
    mockIsCancel.mockImplementation((v: unknown) => typeof v === "symbol")
    mockPromptIntegrationOverrides.mockReset()
    mockPromptIntegrationOverrides.mockResolvedValue(undefined)
    mockWriteWorkspace.mockReset()
    mockSafeText.mockReset()
    mockSafeText.mockResolvedValue("new description")
    mockReadWorkspace.mockReset()
    mockReadWorkspace.mockImplementation(() => ({ ...baseWorkspace }))
  })

  test("Test 1: calls promptIntegrationOverrides when user selects integrations (D-08)", async () => {
    mockSelect.mockResolvedValueOnce("integrations")
    const overrides = { vscode: { enabled: true, cmd: "code" }, tmux: { enabled: false } }
    mockPromptIntegrationOverrides.mockResolvedValueOnce(overrides)

    await runWorkspaceEdit("my-workspace")

    expect(mockPromptIntegrationOverrides).toHaveBeenCalledTimes(1)
    // Pre-selection should come from workspace's current overrides
    const [initialEnabledIds] = mockPromptIntegrationOverrides.mock.calls[0] as [string[], unknown]
    // workspace has vscode.enabled: true so it should be pre-selected
    expect(initialEnabledIds).toContain("vscode")
  })

  test("Test 2: writes updated workspace with new integration overrides (D-08)", async () => {
    mockSelect.mockResolvedValueOnce("integrations")
    const overrides = { vscode: { enabled: true, cmd: "cursor" }, tmux: { enabled: true } }
    mockPromptIntegrationOverrides.mockResolvedValueOnce(overrides)

    await runWorkspaceEdit("my-workspace")

    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { settings?: { integrations?: unknown } }
    expect(savedWs.settings?.integrations).toEqual(overrides)
  })

  test("Test 3: removes integrations key when promptIntegrationOverrides returns empty object", async () => {
    mockSelect.mockResolvedValueOnce("integrations")
    // User selected nothing — empty object returned
    mockPromptIntegrationOverrides.mockResolvedValueOnce({})

    await runWorkspaceEdit("my-workspace")

    // Should write workspace without integrations key (empty result = remove overrides)
    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    const savedWs = mockWriteWorkspace.mock.calls[0][0] as { settings?: { integrations?: unknown } }
    expect(savedWs.settings?.integrations).toBeUndefined()
  })

  test("Test 4: does not write workspace when promptIntegrationOverrides returns undefined (user cancelled)", async () => {
    mockSelect.mockResolvedValueOnce("integrations")
    mockPromptIntegrationOverrides.mockResolvedValueOnce(undefined)

    await runWorkspaceEdit("my-workspace")

    expect(mockWriteWorkspace).not.toHaveBeenCalled()
  })

  test("Test 5: does not write workspace when user selects done", async () => {
    mockSelect.mockResolvedValueOnce("done")

    await runWorkspaceEdit("my-workspace")

    expect(mockWriteWorkspace).not.toHaveBeenCalled()
    expect(mockPromptIntegrationOverrides).not.toHaveBeenCalled()
  })
})
