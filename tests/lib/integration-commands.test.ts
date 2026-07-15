import { describe, test, expect, mock } from "@test/api"
import { makeConfigMock, makeForgeUtilsMock, makeIssueUtilsMock, makeTmuxMock, makePathsMock } from "../helpers"

// Mock issue-utils so jira integration doesn't trigger real config I/O
mock.module("@/lib/integrations/issue-utils", () => makeIssueUtilsMock({
  linkIssue: mock(() => {}),
  unlinkIssue: mock(() => {}),
  resolveIssueRef: mock(() => ({ ok: false, error: "workspace_not_found", name: "test" })),
  formatIssueError: mock(() => "test error"),
}))

// Mock config for workspaceExists/readGlobalConfig used in jira and other integrations
mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: mock(() => false),
  readGlobalConfig: mock(() => ({ integrations: {}, workspace_root: "/tmp" })),
  readWorkspace: mock(() => ({ name: "test", branch: "main", repos: [], settings: {} })),
  writeWorkspace: mock(() => {}),
  readRegistry: mock(() => []),
  listWorkspaces: mock(() => []),
}))

// Mock tui/utils for Jira configurePrompt and other integration configurePrompts
mock.module("@/tui/utils", () => ({
  prompts: {
    text: mock(async () => ""),
    select: mock(async () => ""),
    confirm: mock(async () => false),
    isCancel: mock(() => false),
  },
  safeText: mock(async () => ""),
  cancel: mock(() => {}),
}))

// Mock forge-utils so forge integrations don't trigger real config I/O
mock.module("@/lib/integrations/forge-utils", () => makeForgeUtilsMock({
  resolveForgeRepo: mock(() => ({ ok: false, error: "workspace_not_found", name: "test" })),
  formatForgeError: mock(() => "test error"),
  detectForgeForRepo: mock(async () => []),
  detectGitHubForge: mock(async () => false),
  detectGitLabForge: mock(async () => false),
  detectGiteaForge: mock(async () => false),
  _detect: {
    which: mock(async () => false),
    gitRemoteUrl: mock(async () => null),
    teaPullsLs: mock(async () => false),
  },
}))

// Mock tmux lib so no real shell commands run during import
mock.module("@/lib/tmux", () => makeTmuxMock({
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

// Mock aerospace lib so no real shell commands run during import
mock.module("@/lib/aerospace", () => ({
  _exec: { run: mock(async () => ({ exitCode: 0, stdout: "" })) },
  isAerospaceRunning: mock(async () => false),
  getVersion: mock(async () => null),
  listWindows: mock(async () => []),
  listWorkspaces: mock(async () => []),
  moveNodeToWorkspace: mock(async () => {}),
  focusWindow: mock(async () => {}),
  setLayout: mock(async () => {}),
  flattenWorkspaceTree: mock(async () => {}),
  snapshotWindowIds: mock(async () => []),
}))

// Mock vscode lib so no real workspace generation happens during import
mock.module("@/lib/vscode", () => ({
  generateCodeWorkspace: mock(() => "/tmp/test.code-workspace"),
}))

// Mock paths so getTasksDir doesn't read real filesystem
mock.module("@/lib/paths", () => ({
  ...makePathsMock(),
  getTasksDir: mock(() => "/tmp/tasks"),
}))

// No @/tui/utils mock needed — tests only exercise command structure, not prompt paths

// Mock lifecycle
mock.module("@/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
  runHooksCaptured: mock(async () => []),
}))

const { integrationCommand } = await import("@/commands/integration")

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
    const tmuxSubNames = tmux!.commands.map((c: any) => c.name())
    expect(tmuxSubNames).toContain("attach")
  })

  test("niri subcommand has 'focus-workspace' sub-subcommand", () => {
    const niri = integrationCommand.commands.find((c: any) => c.name() === "niri")
    expect(niri).toBeDefined()
    const niriSubNames = niri!.commands.map((c: any) => c.name())
    expect(niriSubNames).toContain("focus-workspace")
  })

  test("has 'github' subcommand", () => {
    const names = integrationCommand.commands.map((c: any) => c.name())
    expect(names).toContain("github")
  })

  test("has 'gitlab' subcommand", () => {
    const names = integrationCommand.commands.map((c: any) => c.name())
    expect(names).toContain("gitlab")
  })

  test("has 'gitea' subcommand", () => {
    const names = integrationCommand.commands.map((c: any) => c.name())
    expect(names).toContain("gitea")
  })

  test("github subcommand has 'pr' sub-subcommand", () => {
    const github = integrationCommand.commands.find((c: any) => c.name() === "github")
    expect(github).toBeDefined()
    const subNames = github!.commands.map((c: any) => c.name())
    expect(subNames).toContain("pr")
  })

  test("github pr has create/open/status commands", () => {
    const github = integrationCommand.commands.find((c: any) => c.name() === "github")
    const pr = github!.commands.find((c: any) => c.name() === "pr")
    const prSubNames = pr!.commands.map((c: any) => c.name())
    expect(prSubNames).toContain("create")
    expect(prSubNames).toContain("open")
    expect(prSubNames).toContain("status")
  })

  test("github subcommand has 'issue' sub-subcommand", () => {
    const github = integrationCommand.commands.find((c: any) => c.name() === "github")
    const subNames = github!.commands.map((c: any) => c.name())
    expect(subNames).toContain("issue")
  })

  test("github issue has link/unlink/open commands", () => {
    const github = integrationCommand.commands.find((c: any) => c.name() === "github")
    const issue = github!.commands.find((c: any) => c.name() === "issue")
    const issueSubNames = issue!.commands.map((c: any) => c.name())
    expect(issueSubNames).toContain("link")
    expect(issueSubNames).toContain("unlink")
    expect(issueSubNames).toContain("open")
  })

  test("has 'jira' subcommand", () => {
    const names = integrationCommand.commands.map((c: any) => c.name())
    expect(names).toContain("jira")
  })

  test("jira subcommand has 'issue' sub-subcommand", () => {
    const jira = integrationCommand.commands.find((c: any) => c.name() === "jira")
    expect(jira).toBeDefined()
    const subNames = jira!.commands.map((c: any) => c.name())
    expect(subNames).toContain("issue")
  })

  test("jira issue has link/unlink/open commands", () => {
    const jira = integrationCommand.commands.find((c: any) => c.name() === "jira")
    const issue = jira!.commands.find((c: any) => c.name() === "issue")
    const issueSubNames = issue!.commands.map((c: any) => c.name())
    expect(issueSubNames).toContain("link")
    expect(issueSubNames).toContain("unlink")
    expect(issueSubNames).toContain("open")
  })

  // --- Phase 50: list subcommand ---

  test("has 'list' subcommand on integrationCommand", () => {
    const names = integrationCommand.commands.map((c: any) => c.name())
    expect(names).toContain("list")
  })

  test("list subcommand has --json option", () => {
    const list = integrationCommand.commands.find((c: any) => c.name() === "list")
    expect(list).toBeDefined()
    const optionFlags = list!.options.map((o: any) => o.long)
    expect(optionFlags).toContain("--json")
  })

  // --- Phase 50: config subgroup on all integrations ---

  test("all 10 integration subcommands have 'config' sub-subcommand", () => {
    const integrationIds = ["vscode", "intellij", "cmux", "tmux", "niri", "aerospace", "github", "gitlab", "gitea", "jira"]
    for (const id of integrationIds) {
      const sub = integrationCommand.commands.find((c: any) => c.name() === id)
      expect(sub).toBeDefined()
      const subNames = sub!.commands.map((c: any) => c.name())
      expect(subNames).toContain("config")
    }
  })

  test("config subcommand has 'example' and 'show' children", () => {
    const aerospace = integrationCommand.commands.find((c: any) => c.name() === "aerospace")
    const config = aerospace!.commands.find((c: any) => c.name() === "config")
    expect(config).toBeDefined()
    const configSubNames = config!.commands.map((c: any) => c.name())
    expect(configSubNames).toContain("example")
    expect(configSubNames).toContain("show")
  })

  test("config show has --json option", () => {
    const aerospace = integrationCommand.commands.find((c: any) => c.name() === "aerospace")
    const config = aerospace!.commands.find((c: any) => c.name() === "config")
    const show = config!.commands.find((c: any) => c.name() === "show")
    expect(show).toBeDefined()
    const optionFlags = show!.options.map((o: any) => o.long)
    expect(optionFlags).toContain("--json")
  })

  // --- Phase 50: aerospace focus subcommand ---

  test("aerospace subcommand has 'focus' sub-subcommand", () => {
    const aerospace = integrationCommand.commands.find((c: any) => c.name() === "aerospace")
    expect(aerospace).toBeDefined()
    const subNames = aerospace!.commands.map((c: any) => c.name())
    expect(subNames).toContain("focus")
  })

  // --- Phase 50: vscode open subcommand ---

  test("vscode subcommand has 'open' sub-subcommand", () => {
    const vscode = integrationCommand.commands.find((c: any) => c.name() === "vscode")
    expect(vscode).toBeDefined()
    const subNames = vscode!.commands.map((c: any) => c.name())
    expect(subNames).toContain("open")
  })

  // --- Phase 50: integrations without commands still have config ---

  test("intellij (no commands()) still has config subcommand", () => {
    const intellij = integrationCommand.commands.find((c: any) => c.name() === "intellij")
    expect(intellij).toBeDefined()
    const subNames = intellij!.commands.map((c: any) => c.name())
    expect(subNames).toContain("config")
  })

})
