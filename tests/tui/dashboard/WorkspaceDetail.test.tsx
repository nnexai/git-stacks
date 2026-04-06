/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock } from "bun:test"

// Config isolation — set BEFORE any import that touches paths.ts.
process.env.GIT_STACKS_CONFIG_DIR = "/tmp/ws-detail-test-config"

// Mock the integrations array with controlled fixtures
const mockApplies = mock(() => true)
const mockAppliesSkipped = mock(() => false)

mock.module("../../../src/lib/integrations", () => ({
  integrations: [
    {
      id: "vscode",
      label: "VS Code",
      hint: "",
      enabledByDefault: true,
      configurePrompt: mock(async () => null),
      isEnabled: mock(() => true),
      open: mock(async () => {}),
    },
    {
      id: "intellij",
      label: "IntelliJ",
      hint: "",
      enabledByDefault: false,
      applies: mockAppliesSkipped,
      configurePrompt: mock(async () => null),
      isEnabled: mock(() => false),
      open: mock(async () => {}),
    },
    {
      id: "tmux",
      label: "tmux",
      hint: "",
      enabledByDefault: true,
      configurePrompt: mock(async () => null),
      isEnabled: mock(() => true),
      open: mock(async () => {}),
    },
    {
      id: "niri",
      label: "niri",
      hint: "",
      enabledByDefault: true,
      configurePrompt: mock(async () => null),
      isEnabled: mock(() => true),
      open: mock(async () => {}),
    },
  ],
  resolveEnabledGlobally: mock(() => true),
}))

// Mock resolveEnabledGlobally from types separately
mock.module("../../../src/lib/integrations/types", () => ({
  resolveEnabledGlobally: mock((id: string, _enabledByDefault: boolean, _config: any) => {
    // vscode and tmux enabled by default, intellij disabled
    return id !== "intellij"
  }),
  resolveEnabled: mock(() => true),
  isConditional: mock((integration: { applies?: unknown }) => typeof integration.applies === "function"),
}))

// Mock config module
mock.module("../../../src/lib/config", () => ({
  readGlobalConfig: mock(() => ({
    workspace_root: "/tmp/ws-detail-root",
    integrations: {
      vscode: { enabled: true, cmd: "code" },
      jira: { issue: "GLOBAL-999" },
    },
  })),
  readTemplate: mock((name: string) => ({
    name,
    schema_version: "1" as const,
    repos: [],
    integrations: {
      vscode: { enabled: true, cmd: "code-insiders" },
    },
  })),
  listWorkspaces: mock(() => []),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock(() => false),
  workspacePath: mock((name: string) => `/tmp/ws-detail-test-config/workspaces/${name}.yml`),
  readRegistry: mock(() => []),
  writeRegistry: mock(() => {}),
  listRegistryEntries: mock(() => []),
  listTemplates: mock(() => []),
  writeTemplate: mock(() => {}),
  templateExists: mock(() => false),
  templatePath: mock((name: string) => `/tmp/ws-detail-test-config/templates/${name}.yml`),
  writeGlobalConfig: mock(() => {}),
  expandBranchPattern: mock((pattern: string, name: string) => pattern.replace("{name}", name)),
  formatZodError: mock(() => ""),
  WorkspaceSchema: {} as any,
  TemplateSchema: {} as any,
  RepoRegistryEntrySchema: {} as any,
}))

const { testRender } = await import("@opentui/solid")
const { WorkspaceDetail } = await import("../../../src/tui/dashboard/WorkspaceDetail")

// Base workspace fixture
function makeEntry(overrides: any = {}) {
  return {
    workspace: {
      name: "test-ws",
      branch: "feat/test",
      schema_version: "1" as const,
      created: "2026-01-01T00:00:00.000Z",
      repos: [],
      ...overrides.workspace,
    },
    status: { state: "loaded" as const, repos: [] },
    ...overrides.entry,
  }
}

describe("WorkspaceDetail integration display", () => {
  test("Test 1: renders 'Integrations:' section header", async () => {
    const entry = makeEntry()
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Integrations:")
  })

  test("Test 2: shows enabled integration with checkmark and [global] source when no overrides", async () => {
    const entry = makeEntry()
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("vscode")
    expect(frame).toContain("[global]")
    expect(frame).toContain("\u2713")
  })

  test("Test 3: shows disabled integration with cross icon and [workspace] source when workspace override has enabled:false", async () => {
    const entry = makeEntry({
      workspace: {
        settings: {
          integrations: {
            tmux: { enabled: false },
          },
        },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("tmux")
    expect(frame).toContain("[workspace]")
    expect(frame).toContain("\u2717")
  })

  test("Test 4: shows [template] source when workspace has template and template has override but workspace does not", async () => {
    const entry = makeEntry({
      workspace: {
        template: "my-tpl",
        // no workspace-level integration override
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("vscode")
    expect(frame).toContain("[template]")
  })

  test("Test 5: shows config value inline for enabled integration", async () => {
    const entry = makeEntry({
      workspace: {
        settings: {
          integrations: {
            vscode: { enabled: true, cmd: "code" },
          },
        },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("(cmd: code)")
  })

  test("Test 6: shows [skipped: no matching repos] for integration where applies() returns false", async () => {
    const entry = makeEntry()
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("[skipped:")
  })

  test("Test 7: niri columns render as '2 cols' not '[object Object]'", async () => {
    const entry = makeEntry({
      workspace: {
        settings: {
          integrations: {
            niri: {
              enabled: true,
              focus: true,
              columns: [
                { width: "50%", windows: [{ app: "foot" }] },
                { windows: [{ source: "vscode" }] },
              ],
            },
          },
        },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("2 cols")
    expect(frame).not.toContain("[object Object]")
  })

  test("Test 8: renders per-repo ahead/behind with stale suffix from workspace status", async () => {
    const entry = makeEntry({
      entry: {
        status: {
          state: "loaded" as const,
          hasDirty: false,
          hasMissing: false,
          aheadBehindStale: true,
          repos: [
            { name: "api", exists: true, dirty: false, branch: "feat/test", mode: "worktree", ahead: 3, behind: 2 },
            { name: "web", exists: true, dirty: false, branch: "main", mode: "trunk", ahead: 0, behind: 0 },
          ],
        },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("api")
    expect(frame).toContain("↑3?")
    expect(frame).toContain("↓2?")
    expect(frame).not.toContain("↑0")
    expect(frame).not.toContain("↓0")
  })
})

describe("WorkspaceDetail linked issues display", () => {
  test("Test A: workspace with linked jira issue shows Linked Issues section", async () => {
    const entry = makeEntry({
      workspace: {
        settings: {
          integrations: {
            jira: { issue: "PROJ-123" },
          },
        },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Linked Issues:")
    expect(frame).toContain("PROJ-123")
  })

  test("Test B: workspace with no linked issues does not show Linked Issues section", async () => {
    const entry = makeEntry()
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Linked Issues:")
  })

  test("Test C: issue key is filtered from config summary parenthetical", async () => {
    const entry = makeEntry({
      workspace: {
        settings: {
          integrations: {
            vscode: { enabled: true, cmd: "code", issue: "42" },
          },
        },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("(cmd: code)")
    expect(frame).not.toContain("issue: 42")
  })

  test("Test D: global config jira issue does not appear when workspace has no jira settings", async () => {
    // Global config has jira: { issue: "GLOBAL-999" } (set in mock above)
    // Workspace has no jira settings at all
    const entry = makeEntry()
    const { captureCharFrame, renderOnce } = await testRender(
      () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("GLOBAL-999")
  })
})
