import { describe, test, expect, mock, beforeEach, afterEach } from "@test/api"
import type { IntegrationContext, ArtifactBag } from "@/lib/integrations/types"
import { makeTmuxMock, makeConfigMock } from "../../helpers"

// === Register ALL mocks BEFORE any integration imports ===

// 1. Shared mock instances
const mockSpinner = { start: mock(() => {}), stop: mock(() => {}) }

// 2. Mock @/lib/tmux
const mockOpenTmuxSession = mock(() => Promise.resolve({ created: false }))
const mockFocusTmuxSession = mock(() => Promise.resolve())
const mockAddTmuxPane = mock(() => Promise.resolve(null))
const mockSendToTmuxPane = mock(() => Promise.resolve())
const mockGetTmuxMainPane = mock(() => Promise.resolve(null))
const mockFocusTmuxPane = mock(() => Promise.resolve())
mock.module("../../../packages/core/src/tmux", () => makeTmuxMock({
  openTmuxSession: mockOpenTmuxSession,
  focusTmuxSession: mockFocusTmuxSession,
  addTmuxPane: mockAddTmuxPane,
  sendToTmuxPane: mockSendToTmuxPane,
  getTmuxMainPane: mockGetTmuxMainPane,
  focusTmuxPane: mockFocusTmuxPane,
}))

// 3. Mock @/lib/cmux
const mockOpenCmuxWorkspace = mock(() => Promise.resolve({ ref: "workspace:42", created: false }))
mock.module("../../../packages/core/src/cmux", () => ({
  openCmuxWorkspace: mockOpenCmuxWorkspace,
  addCmuxPane: mock(() => Promise.resolve(null)),
  addCmuxSurface: mock(() => Promise.resolve(null)),
  sendToCmuxSurface: mock(() => Promise.resolve()),
  getCmuxMainPane: mock(() => Promise.resolve({ paneRef: "p1", surfaceRef: "s1" })),
  focusCmuxSurface: mock(() => Promise.resolve()),
}))

// 4. Mock @/lib/config for cmux
mock.module("../../../packages/core/src/config", () => makeConfigMock({
  workspaceExists: mock(() => false),
  readWorkspace: mock(() => ({})),
  writeWorkspace: mock(() => {}),
}))

// 5. Mock @/lib/vscode
mock.module("../../../packages/core/src/vscode", () => ({
  generateCodeWorkspace: () => null,
}))

// 6. Mock @/lib/intellij
mock.module("../../../packages/core/src/intellij", () => ({
  generateIntellijProject: () => null,
}))

// 7. Mock @/tui/utils — must include prompts object since production code
// imports { prompts as p } from "@/tui/utils"
mock.module("../../../packages/core/src/prompt-capability", () => ({
  safeText: mock(() => Promise.resolve("")),
  prompts: {
    spinner: () => mockSpinner,
    log: { info: mock(() => {}), success: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
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
}))

// === Imports after all mocks registered ===
const { tmuxIntegration } = await import("@/lib/integrations/tmux")
const { cmuxIntegration } = await import("@/lib/integrations/cmux")
const { vscodeIntegration, _exec: vscodeExec } = await import("@/lib/integrations/vscode")
const { intellijIntegration, _exec: intellijExec } = await import("@/lib/integrations/intellij")

// === Shared context ===
const fakeCtx: IntegrationContext = {
  workspace: { name: "test-ws", repos: [], settings: {} } as any,
  tasksDir: "/tmp/tasks",
  config: { integrations: { vscode: { enabled: true, cmd: "code-insiders" } } } as any,
}
const emptyBag: ArtifactBag = {}

// ===================================================================
// tmux artifact tests
// ===================================================================
describe("tmux artifact", () => {
  beforeEach(() => {
    mockOpenTmuxSession.mockReset()
    mockFocusTmuxSession.mockReset()
    mockSpinner.start.mockReset()
    mockSpinner.stop.mockReset()
    mockOpenTmuxSession.mockImplementation(() => Promise.resolve({ created: false }))
    mockFocusTmuxSession.mockImplementation(() => Promise.resolve())
  })

  test("open() returns { kind: 'tmux', sessionName: 'test-ws' } when openTmuxSession succeeds", async () => {
    const result = await tmuxIntegration.open(fakeCtx, null, emptyBag)

    expect(result).toEqual({ kind: "tmux", sessionName: "test-ws" })
  })

  test("open() returns null when openTmuxSession throws", async () => {
    mockOpenTmuxSession.mockImplementation(() => Promise.reject(new Error("tmux not available")))

    const result = await tmuxIntegration.open(fakeCtx, null, emptyBag)

    expect(result).toBeNull()
  })
})

// ===================================================================
// cmux artifact tests
// ===================================================================
describe("cmux artifact", () => {
  beforeEach(() => {
    mockOpenCmuxWorkspace.mockReset()
    mockSpinner.start.mockReset()
    mockSpinner.stop.mockReset()
    mockOpenCmuxWorkspace.mockImplementation(() => Promise.resolve({ ref: "workspace:42", created: false }))
  })

  test("open() returns { kind: 'cmux', workspaceRef: 'workspace:42' } when openCmuxWorkspace succeeds", async () => {
    const result = await cmuxIntegration.open(fakeCtx, null, emptyBag)

    expect(result).toEqual({ kind: "cmux", workspaceRef: "workspace:42" })
  })

  test("open() returns null when openCmuxWorkspace throws", async () => {
    mockOpenCmuxWorkspace.mockImplementation(() => Promise.reject(new Error("cmux not available")))

    const result = await cmuxIntegration.open(fakeCtx, null, emptyBag)

    expect(result).toBeNull()
  })
})

// ===================================================================
// vscode artifact tests
// ===================================================================
describe("vscode artifact", () => {
  let origWhich: typeof vscodeExec.which
  let origSpawn: typeof vscodeExec.spawn

  beforeEach(() => {
    origWhich = vscodeExec.which
    origSpawn = vscodeExec.spawn
    vscodeExec.which = mock(async () => true)
    vscodeExec.spawn = mock(() => ({ pid: 12345 }))
  })

  afterEach(() => {
    vscodeExec.which = origWhich
    vscodeExec.spawn = origSpawn
  })

  test("open() returns null when artifactPath is null", async () => {
    const result = await vscodeIntegration.open(fakeCtx, null, emptyBag)

    expect(result).toBeNull()
  })

  test("open() returns WindowArtifact when which succeeds and spawn succeeds", async () => {
    const result = await vscodeIntegration.open(fakeCtx, "/tmp/test.code-workspace", emptyBag)

    expect(result).not.toBeNull()
    expect(result?.kind).toBe("window")
    expect((result as any)?.pid).toBe(12345)
    expect((result as any)?.app_id).toBe("code-insiders")
    expect((result as any)?.title).toBe("")
    expect(vscodeExec.spawn).toHaveBeenCalledWith(["code-insiders", "/tmp/test.code-workspace"])
  })

  test("open() returns null when which fails (binary not found)", async () => {
    vscodeExec.which = mock(async () => false)

    const result = await vscodeIntegration.open(fakeCtx, "/tmp/test.code-workspace", emptyBag)

    expect(result).toBeNull()
    expect(vscodeExec.spawn).not.toHaveBeenCalled()
  })
})

// ===================================================================
// intellij artifact tests
// ===================================================================
describe("intellij artifact", () => {
  let origWhich: typeof intellijExec.which
  let origSpawn: typeof intellijExec.spawn

  beforeEach(() => {
    origWhich = intellijExec.which
    origSpawn = intellijExec.spawn
    intellijExec.which = mock(async () => true)
    intellijExec.spawn = mock(() => ({ pid: 99999 }))
  })

  afterEach(() => {
    intellijExec.which = origWhich
    intellijExec.spawn = origSpawn
  })

  test("open() returns null when artifactPath is null", async () => {
    const result = await intellijIntegration.open(fakeCtx, null, emptyBag)

    expect(result).toBeNull()
  })

  test("open() returns WindowArtifact when which idea succeeds and spawn succeeds", async () => {
    const result = await intellijIntegration.open(fakeCtx, "/tmp/test.iml", emptyBag)

    expect(result).not.toBeNull()
    expect(result?.kind).toBe("window")
    expect((result as any)?.pid).toBe(99999)
    expect((result as any)?.app_id).toBe("idea")
    expect((result as any)?.title).toBe("")
    expect(intellijExec.spawn).toHaveBeenCalledWith(["idea", "/tmp/test.iml"])
  })

  test("open() returns null when which fails (binary not found)", async () => {
    intellijExec.which = mock(async () => false)

    const result = await intellijIntegration.open(fakeCtx, "/tmp/test.iml", emptyBag)

    expect(result).toBeNull()
    expect(intellijExec.spawn).not.toHaveBeenCalled()
  })
})
