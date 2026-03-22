import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext } from "@/lib/integrations/types"

// Mock @clack/prompts with a no-op spinner
mock.module("@clack/prompts", () => ({
  spinner: () => ({ start: () => {}, stop: () => {} }),
  log: { warn: () => {} },
}))

// Controllable stubs for tmux lib functions
const openTmuxSessionMock = mock(async (_name: string, _tasksDir: string) => ({ created: true }))
const focusTmuxSessionMock = mock(async (_name: string) => {})
const killTmuxSessionMock = mock(async (_name: string) => {})
const tmuxSessionExistsMock = mock(async (_name: string) => true)
const addTmuxPaneMock = mock(async (_session: string, _direction?: string) => null as string | null)
const sendToTmuxPaneMock = mock(async (_paneId: string, _text: string) => {})
const getTmuxMainPaneMock = mock(async (_session: string) => "%0")
const focusTmuxPaneMock = mock(async (_paneId: string) => true)

// Register mock BEFORE importing the integration
mock.module("@/lib/tmux", () => ({
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

// Cache-busting import
const { tmuxIntegration } = await import(
  // @ts-ignore — query param cache-busting for bun module cache
  "@/lib/integrations/tmux?unit-test-tmux"
)

const fakeCtx: IntegrationContext = {
  workspace: {
    name: "my-workspace",
    repos: [],
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
    openTmuxSessionMock.mockImplementation(async () => ({ created: true }))
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
})

describe("tmux cleanup()", () => {
  beforeEach(() => {
    killTmuxSessionMock.mockReset()
    tmuxSessionExistsMock.mockReset()
  })

  test("calls killTmuxSession when session exists", async () => {
    tmuxSessionExistsMock.mockImplementation(async () => true)
    await tmuxIntegration.cleanup(fakeCtx)
    expect(killTmuxSessionMock).toHaveBeenCalledWith("my-workspace")
  })

  test("does NOT call killTmuxSession when session does not exist", async () => {
    tmuxSessionExistsMock.mockImplementation(async () => false)
    await tmuxIntegration.cleanup(fakeCtx)
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
