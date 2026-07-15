import { describe, test, expect, mock, beforeEach, afterAll } from "@test/api"
import { Command } from "commander"
import type { IntegrationContext } from "@/lib/integrations/types"
import { makeConfigMock } from "../../helpers"

const generateCodeWorkspaceMock = mock((_workspace: unknown, _tasksDir: string) => "/tmp/tasks/my-ws/my-ws.code-workspace")

mock.module("@/lib/vscode", () => ({
  generateCodeWorkspace: generateCodeWorkspaceMock,
}))

const workspaceExistsMock = mock((_name: string) => true)
const readGlobalConfigMock = mock(() => ({
  workspace_root: "/tmp/root",
  integrations: { vscode: { enabled: true, cmd: "code" } },
}))
const readWorkspaceMock = mock((name: string) => ({
  name,
  repos: [],
  settings: {},
}))

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: workspaceExistsMock,
  readGlobalConfig: readGlobalConfigMock,
  readWorkspace: readWorkspaceMock,
}))

mock.module("@/lib/paths", () => ({
  getTasksDir: mock((_root: string) => "/tmp/tasks"),
}))

const { _exec, vscodeIntegration } = await import("@/lib/integrations/vscode")

const exitMock = mock((_code?: number) => { throw new Error(`process.exit(${_code})`) })
const originalExit = process.exit

const fakeCtx: IntegrationContext = {
  workspace: { name: "my-ws", repos: [], settings: {} } as any,
  tasksDir: "/tmp/tasks",
  config: { integrations: { vscode: { cmd: "code" } } } as any,
}

function buildParent() {
  const parent = new Command("vscode")
  vscodeIntegration.commands!(parent)
  parent.exitOverride()
  return parent
}

describe("vscode integration plugin", () => {
  beforeEach(() => {
    process.exit = exitMock as any
    generateCodeWorkspaceMock.mockReset()
    workspaceExistsMock.mockReset()
    readGlobalConfigMock.mockReset()
    readWorkspaceMock.mockReset()
    exitMock.mockReset()
    exitMock.mockImplementation((_code?: number) => { throw new Error(`process.exit(${_code})`) })
    generateCodeWorkspaceMock.mockImplementation(() => "/tmp/tasks/my-ws/my-ws.code-workspace")
    workspaceExistsMock.mockImplementation(() => true)
    readGlobalConfigMock.mockImplementation(() => ({
      workspace_root: "/tmp/root",
      integrations: { vscode: { enabled: true, cmd: "code" } },
    }))
    readWorkspaceMock.mockImplementation((name: string) => ({ name, repos: [], settings: {} }))
    _exec.which = mock(async () => true)
    _exec.spawn = mock((_cmd: string[]) => ({ pid: 1234 }))
  })

  test("generate delegates to generateCodeWorkspace", () => {
    expect(vscodeIntegration.generate!(fakeCtx)).toBe("/tmp/tasks/my-ws/my-ws.code-workspace")
    expect(generateCodeWorkspaceMock).toHaveBeenCalledWith(fakeCtx.workspace, "/tmp/tasks")
  })

  test("open returns null when artifact path is missing", async () => {
    await expect(vscodeIntegration.open(fakeCtx, null, {})).resolves.toBeNull()
    expect(_exec.spawn).not.toHaveBeenCalled()
  })

  test("open spawns configured command with artifact path", async () => {
    const result = await vscodeIntegration.open(fakeCtx, "/tmp/work.code-workspace", {})

    expect(_exec.which).toHaveBeenCalledWith("code")
    expect(_exec.spawn).toHaveBeenCalledWith(["code", "/tmp/work.code-workspace"])
    expect(result).toEqual({ kind: "window", pid: 1234, app_id: "code", title: "" })
  })

  test("workspace cmd override takes precedence over global command", async () => {
    const ctx = {
      ...fakeCtx,
      workspace: { ...fakeCtx.workspace, settings: { integrations: { vscode: { cmd: "code-workspace" } } } },
    } as IntegrationContext

    await vscodeIntegration.open(ctx, "/tmp/work.code-workspace", {})

    expect(_exec.which).toHaveBeenCalledWith("code-workspace")
  })

  test("open returns null when configured command is missing", async () => {
    _exec.which = mock(async () => false)

    await expect(vscodeIntegration.open(fakeCtx, "/tmp/work.code-workspace", {})).resolves.toBeNull()
    expect(_exec.spawn).not.toHaveBeenCalled()
  })

  test("command open exits when workspace is missing", async () => {
    workspaceExistsMock.mockImplementation(() => false)
    const parent = buildParent()

    await expect(parent.parseAsync(["node", "x", "open", "missing"])).rejects.toThrow("process.exit(1)")
    expect(generateCodeWorkspaceMock).not.toHaveBeenCalled()
  })

  test("command open exits when generation fails", async () => {
    generateCodeWorkspaceMock.mockImplementation(() => null as unknown as string)
    const parent = buildParent()

    await expect(parent.parseAsync(["node", "x", "open", "my-ws"])).rejects.toThrow("process.exit(1)")
  })
})

afterAll(() => {
  process.exit = originalExit
})
