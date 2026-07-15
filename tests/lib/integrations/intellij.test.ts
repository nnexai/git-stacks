import { describe, test, expect, mock, beforeEach } from "@test/api"
import type { IntegrationContext } from "@/lib/integrations/types"

const generateIntellijProjectMock = mock((_workspace: unknown, _tasksDir: string): string | null => "/tmp/tasks/my-ws")

mock.module("@/lib/intellij", () => ({
  generateIntellijProject: generateIntellijProjectMock,
}))

const { _exec, intellijIntegration } = await import("@/lib/integrations/intellij")

const javaWorkspace = {
  name: "my-ws",
  repos: [
    { name: "api", type: "java", mode: "worktree", task_path: "/tmp/tasks/my-ws/api" },
  ],
  settings: {},
} as any

const tsWorkspace = {
  name: "my-ws",
  repos: [
    { name: "web", type: "typescript", mode: "worktree", task_path: "/tmp/tasks/my-ws/web" },
  ],
  settings: {},
} as any

const fakeCtx: IntegrationContext = {
  workspace: javaWorkspace,
  tasksDir: "/tmp/tasks",
  config: { integrations: { intellij: { enabled: true } } } as any,
}

describe("intellij integration plugin", () => {
  beforeEach(() => {
    generateIntellijProjectMock.mockReset()
    generateIntellijProjectMock.mockImplementation(() => "/tmp/tasks/my-ws")
    _exec.which = mock(async () => true)
    _exec.spawn = mock((_cmd: string[]) => ({ pid: 4321 }))
  })

  test("applies only to workspaces with Java repos", () => {
    expect(intellijIntegration.applies!(javaWorkspace)).toBe(true)
    expect(intellijIntegration.applies!(tsWorkspace)).toBe(false)
  })

  test("generate delegates to generateIntellijProject", () => {
    expect(intellijIntegration.generate!(fakeCtx)).toBe("/tmp/tasks/my-ws")
    expect(generateIntellijProjectMock).toHaveBeenCalledWith(javaWorkspace, "/tmp/tasks")
  })

  test("open returns null when artifact path is missing", async () => {
    await expect(intellijIntegration.open(fakeCtx, null, {})).resolves.toBeNull()
    expect(_exec.spawn).not.toHaveBeenCalled()
  })

  test("open spawns idea with artifact path", async () => {
    const result = await intellijIntegration.open(fakeCtx, "/tmp/tasks/my-ws", {})

    expect(_exec.which).toHaveBeenCalledWith("idea")
    expect(_exec.spawn).toHaveBeenCalledWith(["idea", "/tmp/tasks/my-ws"])
    expect(result).toEqual({ kind: "window", pid: 4321, app_id: "idea", title: "" })
  })

  test("open returns null when idea is not available", async () => {
    _exec.which = mock(async () => false)

    await expect(intellijIntegration.open(fakeCtx, "/tmp/tasks/my-ws", {})).resolves.toBeNull()
    expect(_exec.spawn).not.toHaveBeenCalled()
  })

  test("generate can return null for non-Java project output", () => {
    generateIntellijProjectMock.mockImplementation(() => null)

    expect(intellijIntegration.generate!(fakeCtx)).toBeNull()
  })
})
