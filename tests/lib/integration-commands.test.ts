import { describe, test, expect, mock } from "bun:test"

// Mock tmux lib so no real shell commands run during import
mock.module("@/lib/tmux", () => ({
  openTmuxSession: mock(async () => ({ created: false })),
  focusTmuxSession: mock(async () => {}),
  killTmuxSession: mock(async () => {}),
  tmuxSessionExists: mock(async () => false),
  addTmuxPane: mock(async () => null),
  sendToTmuxPane: mock(async () => {}),
  getTmuxMainPane: mock(async () => "%0"),
  focusTmuxPane: mock(async () => true),
  createTmuxSession: mock(async () => {}),
}))

// Mock niri lib so no real shell commands run during import
mock.module("@/lib/niri", () => ({
  isNiriRunning: mock(async () => false),
  listNiriWindows: mock(async () => []),
  listNiriWorkspaces: mock(async () => []),
  setNiriWorkspaceName: mock(async () => {}),
  moveWindowToWorkspace: mock(async () => {}),
  focusNiriWorkspace: mock(async () => {}),
  focusNiriWorkspaceDown: mock(async () => {}),
  unsetNiriWorkspaceName: mock(async () => {}),
  niriSpawn: mock(async () => {}),
  focusNiriWindow: mock(async () => {}),
  consumeOrExpelWindowLeft: mock(async () => {}),
  niriSpawnSh: mock(async () => {}),
  moveColumnToIndex: mock(async () => {}),
  setWindowWidth: mock(async () => {}),
  setNiriColumnWidth: mock(async () => {}),
  snapshotWindowIds: mock(async () => []),
  _exec: { run: mock(async () => ({ exitCode: 0, stdout: "" })) },
}))

// No @/tui/utils mock needed — tests only exercise command structure, not prompt paths

// Mock lifecycle
mock.module("@/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => []),
}))

// Cache-busting import of the integration command
const { integrationCommand } = await import(
  // @ts-ignore — query param cache-busting
  "@/commands/integration?unit-test-cmds"
)

describe("integrationCommand structure", () => {
  test("has 'integration' as the command name", () => {
    expect(integrationCommand.name()).toBe("integration")
  })

  test("has 'tmux' subcommand", () => {
    const names = integrationCommand.commands.map((c: any) => c.name())
    expect(names).toContain("tmux")
  })

  test("has 'niri' subcommand", () => {
    const names = integrationCommand.commands.map((c: any) => c.name())
    expect(names).toContain("niri")
  })

  test("tmux subcommand has 'attach' sub-subcommand", () => {
    const tmux = integrationCommand.commands.find((c: any) => c.name() === "tmux")
    expect(tmux).toBeDefined()
    const tmuxSubNames = tmux.commands.map((c: any) => c.name())
    expect(tmuxSubNames).toContain("attach")
  })

  test("niri subcommand has 'focus-workspace' sub-subcommand", () => {
    const niri = integrationCommand.commands.find((c: any) => c.name() === "niri")
    expect(niri).toBeDefined()
    const niriSubNames = niri.commands.map((c: any) => c.name())
    expect(niriSubNames).toContain("focus-workspace")
  })
})
