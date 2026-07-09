import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { join } from "path"
import { cleanup, makeConfigMock, makeTmpDir, makeWorkspaceOpsMock } from "../helpers"

const fixtureRoot = makeTmpDir("workspace-clone")
const workspaceRoot = join(fixtureRoot, "workspaces")
const tasksRoot = join(workspaceRoot, "tasks")

afterAll(() => cleanup(fixtureRoot))

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
const originalExit = process.exit
const exitMock = mock((code?: number) => { throw new Error(`process.exit(${code})`) })
const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})

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
  cmux_workspace_id: "runtime-only",
  settings: { integrations: { vscode: { enabled: true } } },
  labels: ["backend", "sprint:14"],
  repos: [
    {
      name: "frontend",
      repo: "frontend",
      type: "typescript" as const,
      mode: "worktree" as const,
      main_path: "/repos/frontend",
      task_path: join(tasksRoot, "source", "frontend"),
      base_branch: "main",
    },
  ],
}

const mockListWorkspaces = mock(() => [sourceWorkspace])
const mockReadWorkspace = mock((_name: string) => sourceWorkspace)
const mockWorkspaceExists = mock((name: string): boolean => name === "source")
const mockReadGlobalConfig = mock(() => ({
  workspace_root: workspaceRoot,
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
  readGlobalConfig: mockReadGlobalConfig,
  readTemplate: mockReadTemplate,
  isWorktreeRepo: (repo: { mode: string }) => repo.mode === "worktree",
}))

mock.module("@/lib/paths", () => ({
  getTasksDir: mock(() => tasksRoot),
}))

const mockCreateWorkspace = mock(async (_input: unknown): Promise<
  { ok: true; workspace: unknown } | { ok: false; error: string; rollbackErrors: string[] }
> => ({ ok: true, workspace: {} }))
mock.module("@/lib/workspace-lifecycle", () => ({
  createWorkspace: mockCreateWorkspace,
}))

const mockOpenWorkspace = mock(async () => ({ ok: true }))
mock.module("@/lib/workspace-ops", () => makeWorkspaceOpsMock({
  openWorkspace: mockOpenWorkspace,
}))

const { runWorkspaceClone } = await import("@/tui/workspace-clone")

describe("workspace-clone label propagation", () => {
  beforeEach(() => {
    mockSafeText.mockReset()
    mockConfirm.mockReset()
    mockCreateWorkspace.mockReset()
    mockPromptIntegrationOverrides.mockReset()
    mockRunIntegrationGenerate.mockReset()

    mockSafeText
      .mockResolvedValueOnce("source-copy")
      .mockResolvedValueOnce("feature/source-copy")
    mockConfirm.mockResolvedValue(false)
    mockCreateWorkspace.mockResolvedValue({ ok: true, workspace: {} })
    mockPromptIntegrationOverrides.mockResolvedValue(undefined)
    mockRunIntegrationGenerate.mockResolvedValue([])
  })

  test("passes source labels and snapshot refs to transactional creation", async () => {
    await runWorkspaceClone("source")

    expect(mockCreateWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      wsName: "source-copy",
      branch: "feature/source-copy",
      repos: [
        expect.objectContaining({
          name: "frontend",
          task_path: join(tasksRoot, "source-copy", "frontend"),
        }),
      ],
      labels: ["backend", "sprint:14"],
      sourceStartRefs: { frontend: "feature/source" },
      wsIntegrationSettings: { vscode: { enabled: true } },
    }))
    expect(mockCreateWorkspace.mock.calls[0][0]).not.toHaveProperty("cmux_workspace_id")
  })
})

describe("clone --non-interactive", () => {
  beforeEach(() => {
    process.exit = exitMock as any
    mockSafeText.mockReset()
    mockSelect.mockReset()
    mockConfirm.mockReset()
    mockCreateWorkspace.mockReset()
    mockPromptIntegrationOverrides.mockReset()
    mockRunIntegrationGenerate.mockReset()
    mockWorkspaceExists.mockReset()
    mockOpenWorkspace.mockReset()
    consoleErrorSpy.mockReset()
    exitMock.mockReset()

    mockWorkspaceExists.mockImplementation((name: string) => name === "source")
    mockCreateWorkspace.mockResolvedValue({ ok: true, workspace: {} })
    mockPromptIntegrationOverrides.mockResolvedValue(undefined)
    mockRunIntegrationGenerate.mockResolvedValue([])
    mockOpenWorkspace.mockResolvedValue({ ok: true })
    consoleErrorSpy.mockImplementation(() => {})
    exitMock.mockImplementation((code?: number) => { throw new Error(`process.exit(${code})`) })
  })

  afterEach(() => {
    process.exit = originalExit
  })

  test("clone --non-interactive clones workspace without prompts", async () => {
    await runWorkspaceClone("source", { nonInteractive: true, name: "dest" })

    expect(mockSafeText.mock.calls.length).toBe(0)
    expect(mockSelect.mock.calls.length).toBe(0)
    expect(mockConfirm.mock.calls.length).toBe(0)
    expect(mockPromptIntegrationOverrides.mock.calls.length).toBe(0)
    expect(mockCreateWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      wsName: "dest",
      branch: "feature/dest",
      labels: ["backend", "sprint:14"],
      sourceStartRefs: { frontend: "feature/source" },
    }))
  })

  test("clone --non-interactive fails when --name is missing", async () => {
    await expect(runWorkspaceClone("source", { nonInteractive: true }))
      .rejects.toThrow("process.exit(1)")

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("--name"))
  })

  test("clone --non-interactive fails when source arg is missing", async () => {
    await expect(runWorkspaceClone(undefined, { nonInteractive: true, name: "dest" }))
      .rejects.toThrow("process.exit(1)")

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("<workspace>"))
  })

  test("clone --non-interactive fails when source workspace is not found", async () => {
    mockWorkspaceExists.mockReturnValue(false)

    await expect(runWorkspaceClone("source", { nonInteractive: true, name: "dest" }))
      .rejects.toThrow("process.exit(1)")

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("source"))
  })

  test("clone --non-interactive branch defaults to feature destination name", async () => {
    await runWorkspaceClone("source", { nonInteractive: true, name: "dest" })

    const input = mockCreateWorkspace.mock.calls[0][0] as { branch: string }
    expect(input.branch).toBe("feature/dest")
  })

  test("clone --non-interactive uses explicit branch", async () => {
    await runWorkspaceClone("source", { nonInteractive: true, name: "dest", branch: "ticket/99" })

    const input = mockCreateWorkspace.mock.calls[0][0] as { branch: string; repos: Array<{ task_path: string }> }
    expect(input.branch).toBe("ticket/99")
    expect(input.repos[0].task_path).toBe(join(tasksRoot, "dest", "frontend"))
  })

  test("clone --non-interactive reports transactional creation failures", async () => {
    mockCreateWorkspace.mockResolvedValue({ ok: false, error: "repo two failed", rollbackErrors: [] })

    await expect(runWorkspaceClone("source", { nonInteractive: true, name: "dest" }))
      .rejects.toThrow("process.exit(1)")

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("repo two failed"))
  })

  test("clone --non-interactive opens only when --open is set", async () => {
    await runWorkspaceClone("source", { nonInteractive: true, name: "closed" })
    expect(mockOpenWorkspace).not.toHaveBeenCalled()

    await runWorkspaceClone("source", { nonInteractive: true, name: "opened", open: true })
    expect(mockOpenWorkspace).toHaveBeenCalledWith("opened", {}, expect.any(Function))
  })

  test("clone --non-interactive fails when destination already exists", async () => {
    mockWorkspaceExists.mockImplementation((name: string) => name === "source" || name === "dest")

    await expect(runWorkspaceClone("source", { nonInteractive: true, name: "dest" }))
      .rejects.toThrow("process.exit(1)")
  })
})
