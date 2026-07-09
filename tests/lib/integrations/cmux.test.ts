import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext } from "@/lib/integrations/types"
import { makeConfigMock } from "../../helpers"

mock.module("@/tui/utils", () => ({
  prompts: {
    spinner: () => ({ start: () => {}, stop: () => {} }),
    log: { warn: () => {} },
  },
}))

const openCmuxWorkspaceMock = mock(async (_name: string, _tasksDir: string, _existingRef?: string) => ({
  ref: "workspace:2",
  created: true,
}))
const addCmuxPaneMock = mock(async (_ref: string, _direction?: string) => ({
  paneRef: "pane:2",
  surfaceRef: "surface:2",
}))
const addCmuxSurfaceMock = mock(async (_ref: string, _paneRef: string) => "surface:3")
const sendToCmuxSurfaceMock = mock(async (_ref: string, _surfaceRef: string, _text: string) => {})
const getCmuxMainPaneMock = mock(async (_ref: string) => ({
  paneRef: "pane:1",
  surfaceRef: "surface:1",
}))
const focusCmuxSurfaceMock = mock(async (_ref: string, _surfaceRef: string) => true)

mock.module("@/lib/cmux", () => ({
  openCmuxWorkspace: openCmuxWorkspaceMock,
  addCmuxPane: addCmuxPaneMock,
  addCmuxSurface: addCmuxSurfaceMock,
  sendToCmuxSurface: sendToCmuxSurfaceMock,
  getCmuxMainPane: getCmuxMainPaneMock,
  focusCmuxSurface: focusCmuxSurfaceMock,
}))

const workspaceExistsMock = mock((_name: string) => true)
const readWorkspaceMock = mock((name: string) => ({ name, cmux_workspace_id: "workspace:old" }))
const writeWorkspaceMock = mock((_workspace: unknown) => {})

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readWorkspace: readWorkspaceMock,
  writeWorkspace: writeWorkspaceMock,
}))

const { cmuxIntegration } = await import("@/lib/integrations/cmux")

const fakeCtx: IntegrationContext = {
  workspace: {
    name: "my-workspace",
    cmux_workspace_id: "workspace:old",
    repos: [
      { name: "api", task_path: "/tmp/tasks/my-workspace/api" },
    ],
    settings: {},
  } as any,
  tasksDir: "/tmp/tasks",
  config: { integrations: {} } as any,
}

describe("cmux open()", () => {
  beforeEach(() => {
    openCmuxWorkspaceMock.mockReset()
    addCmuxPaneMock.mockReset()
    addCmuxSurfaceMock.mockReset()
    sendToCmuxSurfaceMock.mockReset()
    getCmuxMainPaneMock.mockReset()
    focusCmuxSurfaceMock.mockReset()
    workspaceExistsMock.mockReset()
    readWorkspaceMock.mockReset()
    writeWorkspaceMock.mockReset()
    openCmuxWorkspaceMock.mockImplementation(async () => ({ ref: "workspace:2", created: true }))
    addCmuxPaneMock.mockImplementation(async () => ({ paneRef: "pane:2", surfaceRef: "surface:2" }))
    addCmuxSurfaceMock.mockImplementation(async () => "surface:3")
    getCmuxMainPaneMock.mockImplementation(async () => ({ paneRef: "pane:1", surfaceRef: "surface:1" }))
    focusCmuxSurfaceMock.mockImplementation(async () => true)
    workspaceExistsMock.mockImplementation(() => true)
    readWorkspaceMock.mockImplementation((name: string) => ({ name, cmux_workspace_id: "workspace:old" }))
  })

  test("opens cmux workspace with saved ref and persists changed ref", async () => {
    const result = await cmuxIntegration.open(fakeCtx, null, {})

    expect(openCmuxWorkspaceMock).toHaveBeenCalledWith("my-workspace", "/tmp/tasks", "workspace:old")
    expect(writeWorkspaceMock).toHaveBeenCalledWith({ name: "my-workspace", cmux_workspace_id: "workspace:2" })
    expect(result).toEqual({ kind: "cmux", workspaceRef: "workspace:2" })
  })

  test("does not apply pane layout when existing workspace is focused", async () => {
    openCmuxWorkspaceMock.mockImplementation(async () => ({ ref: "workspace:old", created: false }))

    await cmuxIntegration.open(fakeCtx, null, {})

    expect(getCmuxMainPaneMock).not.toHaveBeenCalled()
    expect(addCmuxPaneMock).not.toHaveBeenCalled()
    expect(sendToCmuxSurfaceMock).not.toHaveBeenCalled()
  })

  test("applies pane and surface layout commands through mocked helpers", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: {
        ...fakeCtx.workspace,
        settings: {
          integrations: {
            cmux: {
              panes: [
                { surfaces: [{ command: "nvim ." }] },
                {
                  direction: "right",
                  surfaces: [
                    { repo: "api", command: "bun test" },
                    { cwd: "/tmp/custom", command: "npm run dev", focus: true },
                  ],
                },
              ],
            },
          },
        },
      },
    } as IntegrationContext

    await cmuxIntegration.open(ctx, null, {})

    expect(getCmuxMainPaneMock).toHaveBeenCalledWith("workspace:2")
    expect(addCmuxPaneMock).toHaveBeenCalledWith("workspace:2", "right")
    expect(addCmuxSurfaceMock).toHaveBeenCalledWith("workspace:2", "pane:2")
    expect(sendToCmuxSurfaceMock).toHaveBeenCalledWith("workspace:2", "surface:1", "cd /tmp/tasks/my-workspace\n")
    expect(sendToCmuxSurfaceMock).toHaveBeenCalledWith("workspace:2", "surface:1", "nvim .\n")
    expect(sendToCmuxSurfaceMock).toHaveBeenCalledWith("workspace:2", "surface:2", "cd /tmp/tasks/my-workspace/api\n")
    expect(sendToCmuxSurfaceMock).toHaveBeenCalledWith("workspace:2", "surface:2", "bun test\n")
    expect(sendToCmuxSurfaceMock).toHaveBeenCalledWith("workspace:2", "surface:3", "cd /tmp/custom\n")
    expect(focusCmuxSurfaceMock).toHaveBeenCalledWith("workspace:2", "surface:3")
  })

  test("skips a surface with an unknown repo before creating pane or sending commands", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: {
        ...fakeCtx.workspace,
        settings: {
          integrations: {
            cmux: { panes: [{ direction: "right", surfaces: [{ repo: "typo", command: "bun test" }] }] },
          },
        },
      },
    } as IntegrationContext

    await cmuxIntegration.open(ctx, null, {})

    expect(addCmuxPaneMock).not.toHaveBeenCalled()
    expect(addCmuxSurfaceMock).not.toHaveBeenCalled()
    expect(sendToCmuxSurfaceMock).not.toHaveBeenCalled()
    expect(focusCmuxSurfaceMock).not.toHaveBeenCalled()
  })

  test("skips invalid pane config after workspace open", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: {
        ...fakeCtx.workspace,
        settings: { integrations: { cmux: { panes: [{ direction: "diagonal" }] } } },
      },
    } as IntegrationContext

    await cmuxIntegration.open(ctx, null, {})

    expect(getCmuxMainPaneMock).not.toHaveBeenCalled()
    expect(addCmuxPaneMock).not.toHaveBeenCalled()
  })

  test("returns null when cmux helper throws", async () => {
    openCmuxWorkspaceMock.mockImplementation(async () => {
      throw new Error("cmux unavailable")
    })

    await expect(cmuxIntegration.open({ ...fakeCtx, silent: true } as IntegrationContext, null, {})).resolves.toBeNull()
  })
})
