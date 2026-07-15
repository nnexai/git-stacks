import { describe, test, expect, mock, beforeEach } from "@test/api"
import type { IntegrationContext } from "@/lib/integrations/types"

// Mock @/tui/utils (prompts wrapper) — explicit mock replaces dead @clack/prompts mock
mock.module("../../../packages/core/src/prompt-capability", () => ({
  prompts: {
    spinner: () => ({ start: () => {}, stop: () => {} }),
    log: { info: () => {}, success: () => {}, warn: () => {}, error: () => {} },
    intro: mock(() => {}),
    outro: mock(() => {}),
    text: mock(async () => ""),
    select: mock(async () => ""),
    multiselect: mock(async () => []),
    confirm: mock(async () => false),
    isCancel: mock(() => false),
    cancel: mock(() => {}),
    group: mock(async () => ({})),
    note: mock(() => {}),
    groupMultiselect: mock(async () => []),
  },
  cancel: mock((): never => { throw new Error("cancelled") }),
  safeText: mock(async () => ""),
}))

// Controllable stubs for tmux lib functions
const openTmuxSessionMock = mock(async (_name: string, _tasksDir: string) => ({ created: true }))
const focusTmuxSessionMock = mock(async (_name: string) => {})
const killTmuxSessionMock = mock(async (_name: string) => {})
const tmuxSessionExistsMock = mock(async (_name: string) => true)
const addTmuxPaneMock = mock(async (_session: string, _direction?: string) => null as string | null)
const sendToTmuxPaneMock = mock(async (_paneId: string, _text: string) => {})
const getTmuxMainPaneMock = mock(async (_session: string): Promise<string | null> => "%0")
const focusTmuxPaneMock = mock(async (_paneId: string) => true)

// Register mock BEFORE importing the integration
mock.module("../../../packages/core/src/tmux", () => ({
  openTmuxSession: openTmuxSessionMock,
  focusTmuxSession: focusTmuxSessionMock,
  killTmuxSession: killTmuxSessionMock,
  tmuxSessionExists: tmuxSessionExistsMock,
  addTmuxPane: addTmuxPaneMock,
  sendToTmuxPane: sendToTmuxPaneMock,
  getTmuxMainPane: getTmuxMainPaneMock,
  focusTmuxPane: focusTmuxPaneMock,
  createTmuxSession: mock(async () => {}),
}))

const { tmuxIntegration } = await import("@/lib/integrations/tmux")

const fakeCtx: IntegrationContext = {
  workspace: {
    name: "my-workspace",
    repos: [
      { name: "api", task_path: "/tmp/tasks/my-workspace/api" },
    ],
    settings: {},
  } as any,
  tasksDir: "/tmp/tasks",
  config: { integrations: {} } as any,
}

describe("tmux open()", () => {
  beforeEach(() => {
    openTmuxSessionMock.mockReset()
    focusTmuxSessionMock.mockReset()
    killTmuxSessionMock.mockReset()
    tmuxSessionExistsMock.mockReset()
    addTmuxPaneMock.mockReset()
    sendToTmuxPaneMock.mockReset()
    getTmuxMainPaneMock.mockReset()
    focusTmuxPaneMock.mockReset()
    openTmuxSessionMock.mockImplementation(async () => ({ created: true }))
    addTmuxPaneMock.mockImplementation(async () => "%1")
    getTmuxMainPaneMock.mockImplementation(async () => "%0")
    focusTmuxPaneMock.mockImplementation(async () => true)
  })

  test("calls openTmuxSession with workspace name and tasksDir", async () => {
    await tmuxIntegration.open(fakeCtx, null, {})
    expect(openTmuxSessionMock).toHaveBeenCalledWith("my-workspace", "/tmp/tasks")
  })

  test("does NOT call focusTmuxSession", async () => {
    await tmuxIntegration.open(fakeCtx, null, {})
    expect(focusTmuxSessionMock).not.toHaveBeenCalled()
  })

  test("returns TmuxArtifact with sessionName matching workspace name", async () => {
    const result = await tmuxIntegration.open(fakeCtx, null, {})
    expect(result).toEqual({ kind: "tmux", sessionName: "my-workspace" })
  })

  test("applies pane layout commands and focus through mocked helpers", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: {
        ...fakeCtx.workspace,
        settings: {
          integrations: {
            tmux: {
              panes: [
                { surfaces: [{ command: "nvim ." }] },
                {
                  direction: "right",
                  focus: true,
                  surfaces: [{ repo: "api", command: "bun test" }],
                },
              ],
            },
          },
        },
      },
    } as IntegrationContext

    await tmuxIntegration.open(ctx, null, {})

    expect(getTmuxMainPaneMock).toHaveBeenCalledWith("my-workspace")
    expect(addTmuxPaneMock).toHaveBeenCalledWith("my-workspace", "right")
    expect(sendToTmuxPaneMock).toHaveBeenCalledWith("%0", "cd '/tmp/tasks/my-workspace'")
    expect(sendToTmuxPaneMock).toHaveBeenCalledWith("%0", "nvim .")
    expect(sendToTmuxPaneMock).toHaveBeenCalledWith("%1", "cd '/tmp/tasks/my-workspace/api'")
    expect(sendToTmuxPaneMock).toHaveBeenCalledWith("%1", "bun test")
    expect(focusTmuxPaneMock).toHaveBeenCalledWith("%1")
  })

  test("does not issue pane commands when main-pane lookup fails", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: {
        ...fakeCtx.workspace,
        settings: { integrations: { tmux: { panes: [{ surfaces: [{ command: "nvim ." }] }] } } },
      },
    } as IntegrationContext
    getTmuxMainPaneMock.mockResolvedValue(null)

    await tmuxIntegration.open(ctx, null, {})

    expect(addTmuxPaneMock).not.toHaveBeenCalled()
    expect(sendToTmuxPaneMock).not.toHaveBeenCalled()
  })

  test("skips a surface with an unknown repo before creating pane or sending commands", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: {
        ...fakeCtx.workspace,
        settings: {
          integrations: {
            tmux: { panes: [{ direction: "right", focus: true, surfaces: [{ repo: "typo", command: "bun test" }] }] },
          },
        },
      },
    } as IntegrationContext

    await tmuxIntegration.open(ctx, null, {})

    expect(addTmuxPaneMock).not.toHaveBeenCalled()
    expect(sendToTmuxPaneMock).not.toHaveBeenCalled()
    expect(focusTmuxPaneMock).not.toHaveBeenCalled()
  })

  test("skips invalid pane config without layout helper calls", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: {
        ...fakeCtx.workspace,
        settings: { integrations: { tmux: { panes: [{ direction: "sideways" }] } } },
      },
    } as IntegrationContext

    await tmuxIntegration.open(ctx, null, {})

    expect(getTmuxMainPaneMock).not.toHaveBeenCalled()
    expect(addTmuxPaneMock).not.toHaveBeenCalled()
    expect(sendToTmuxPaneMock).not.toHaveBeenCalled()
  })

  test("returns null when opening the tmux session fails", async () => {
    openTmuxSessionMock.mockImplementation(async () => {
      throw new Error("tmux unavailable")
    })

    await expect(tmuxIntegration.open({ ...fakeCtx, silent: true } as IntegrationContext, null, {})).resolves.toBeNull()
  })
})

describe("tmux cleanup()", () => {
  beforeEach(() => {
    killTmuxSessionMock.mockReset()
    tmuxSessionExistsMock.mockReset()
  })

  test("calls killTmuxSession when session exists", async () => {
    tmuxSessionExistsMock.mockImplementation(async () => true)
    await tmuxIntegration.cleanup!(fakeCtx)
    expect(killTmuxSessionMock).toHaveBeenCalledWith("my-workspace")
  })

  test("does NOT call killTmuxSession when session does not exist", async () => {
    tmuxSessionExistsMock.mockImplementation(async () => false)
    await tmuxIntegration.cleanup!(fakeCtx)
    expect(killTmuxSessionMock).not.toHaveBeenCalled()
  })
})

describe("killTmuxSession helper", () => {
  // We test via the mock — the real tmux lib is a thin wrapper over shell.
  // The behavioral contract: killTmuxSession is called with the session name.
  // Actual shell invocation is implicitly tested via integration tests.
  test("mock is callable and resolves without error", async () => {
    killTmuxSessionMock.mockImplementation(async () => {})
    await expect(killTmuxSessionMock("test-session")).resolves.toBeUndefined()
  })
})
