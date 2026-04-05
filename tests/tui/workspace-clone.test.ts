import { beforeEach, describe, expect, mock, test } from "bun:test"
import { makeConfigMock, makeWorkspaceOpsMock } from "../helpers"

const mockIntro = mock(() => {})
const mockOutro = mock(() => {})
const mockLog = { info: mock(() => {}), success: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) }
const spinnerInstance = {
  start: mock(() => {}),
  stop: mock(() => {}),
  message: mock(() => {}),
}
const mockSpinner = mock(() => spinnerInstance)
const mockSafeText = mock(async () => "mock-value")
const mockSelect = mock(async () => "source" as string | symbol)
const mockConfirm = mock(async () => false as boolean | symbol)
const mockIsCancel = mock((value: unknown) => typeof value === "symbol")
const mockCancel = mock(() => {})

mock.module("@/tui/utils", () => ({
  safeText: mockSafeText,
  cancel: mock((): never => {
    throw new Error("cancelled")
  }),
  prompts: {
    intro: mockIntro,
    outro: mockOutro,
    log: mockLog,
    spinner: mockSpinner,
    select: mockSelect,
    confirm: mockConfirm,
    isCancel: mockIsCancel,
    cancel: mockCancel,
  },
}))

mock.module("@/lib/integrations", () => ({
  integrations: [],
  resolveEnabledGlobally: mock(() => false),
}))

const mockPromptIntegrationOverrides = mock(async () => undefined as Record<string, unknown> | undefined)
mock.module("@/lib/integrations/wizard-helpers", () => ({
  promptIntegrationOverrides: mockPromptIntegrationOverrides,
}))

const mockRunIntegrationGenerate = mock(async () => [])
mock.module("@/lib/integrations/runner", () => ({
  runIntegrationGenerate: mockRunIntegrationGenerate,
}))

const sourceWorkspace = {
  name: "source",
  schema_version: "1" as const,
  branch: "feature/source",
  created: "2026-04-01",
  template: "source-template",
  labels: ["backend", "sprint:14"],
  repos: [
    {
      name: "frontend",
      repo: "frontend",
      type: "typescript" as const,
      mode: "worktree" as const,
      main_path: "/repos/frontend",
      task_path: "/tmp/test-workspaces/tasks/source/frontend",
      base_branch: "main",
    },
  ],
}

const mockListWorkspaces = mock(() => [sourceWorkspace])
const mockReadWorkspace = mock((_name: string) => sourceWorkspace)
const mockWorkspaceExists = mock((name: string) => name === "source")
const mockWriteWorkspace = mock((_ws: unknown) => {})
const mockReadGlobalConfig = mock(() => ({
  workspace_root: "/tmp/test-workspaces",
  integrations: {},
}))
const mockReadTemplate = mock((_name: string) => ({
  name: "source-template",
  schema_version: "1" as const,
  repos: [],
}))

mock.module("@/lib/config", () => makeConfigMock({
  listWorkspaces: mockListWorkspaces,
  readWorkspace: mockReadWorkspace,
  workspaceExists: mockWorkspaceExists,
  writeWorkspace: mockWriteWorkspace,
  readGlobalConfig: mockReadGlobalConfig,
  readTemplate: mockReadTemplate,
  isWorktreeRepo: (repo: { mode: string }) => repo.mode === "worktree",
}))

mock.module("@/lib/paths", () => ({
  getTasksDir: mock(() => "/tmp/test-workspaces/tasks"),
}))

const mockCreateWorktree = mock(async () => {})
const mockEnsureUpstreamTracking = mock(async () => ({ tracked: false }))
mock.module("@/lib/git", () => ({
  createWorktree: mockCreateWorktree,
  ensureUpstreamTracking: mockEnsureUpstreamTracking,
}))

mock.module("@/lib/workspace-ops", () => makeWorkspaceOpsMock({
  openWorkspace: mock(async () => ({ ok: true })),
}))

const { runWorkspaceClone } = await import("@/tui/workspace-clone")

describe("workspace-clone label propagation", () => {
  beforeEach(() => {
    mockSafeText.mockReset()
    mockConfirm.mockReset()
    mockWriteWorkspace.mockReset()
    mockCreateWorktree.mockReset()
    mockEnsureUpstreamTracking.mockReset()
    mockPromptIntegrationOverrides.mockReset()
    mockRunIntegrationGenerate.mockReset()

    mockSafeText
      .mockResolvedValueOnce("source-copy")
      .mockResolvedValueOnce("feature/source-copy")
    mockConfirm.mockResolvedValue(false)
    mockCreateWorktree.mockResolvedValue(undefined)
    mockEnsureUpstreamTracking.mockResolvedValue({ tracked: false })
    mockPromptIntegrationOverrides.mockResolvedValue(undefined)
    mockRunIntegrationGenerate.mockResolvedValue([])
  })

  test("preserves source labels in the cloned workspace YAML", async () => {
    await runWorkspaceClone("source")

    expect(mockCreateWorktree).toHaveBeenCalledWith(
      "/repos/frontend",
      "/tmp/test-workspaces/tasks/source-copy/frontend",
      "feature/source-copy",
    )
    expect(mockWriteWorkspace).toHaveBeenCalledTimes(1)
    expect(mockWriteWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      name: "source-copy",
      branch: "feature/source-copy",
      repos: [
        expect.objectContaining({
          name: "frontend",
          task_path: "/tmp/test-workspaces/tasks/source-copy/frontend",
        }),
      ],
      labels: ["backend", "sprint:14"],
    }))
  })
})
