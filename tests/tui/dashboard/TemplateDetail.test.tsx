/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock } from "bun:test"

// Config isolation — set BEFORE any import that touches paths.ts.
process.env.GIT_STACKS_CONFIG_DIR = "/tmp/tpl-detail-test-config"

// Mock the integrations array with controlled fixtures
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
      id: "tmux",
      label: "tmux",
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
    // vscode and tmux enabled by default
    return true
  }),
  resolveEnabled: mock(() => true),
}))

// Mock config module
mock.module("../../../src/lib/config", () => ({
  readGlobalConfig: mock(() => ({
    workspace_root: "/tmp/tpl-detail-root",
    integrations: {},
  })),
  readTemplate: mock(() => null),
  listWorkspaces: mock(() => []),
  writeWorkspace: mock(() => {}),
  workspaceExists: mock(() => false),
  workspacePath: mock((name: string) => `/tmp/tpl-detail-test-config/workspaces/${name}.yml`),
  readRegistry: mock(() => []),
  writeRegistry: mock(() => {}),
  listRegistryEntries: mock(() => []),
  listTemplates: mock(() => []),
  writeTemplate: mock(() => {}),
  templateExists: mock(() => false),
  templatePath: mock((name: string) => `/tmp/tpl-detail-test-config/templates/${name}.yml`),
  writeGlobalConfig: mock(() => {}),
  expandBranchPattern: mock((pattern: string, name: string) => pattern.replace("{name}", name)),
  formatZodError: mock(() => ""),
  WorkspaceSchema: {} as any,
  TemplateSchema: {} as any,
  RepoRegistryEntrySchema: {} as any,
}))

const { testRender } = await import("@opentui/solid")
const { TemplateDetail } = await import("../../../src/tui/dashboard/TemplateDetail")

function makeTemplate(overrides: any = {}) {
  return {
    name: "test-tpl",
    schema_version: "1" as const,
    repos: [],
    ...overrides,
  }
}

describe("TemplateDetail integration display", () => {
  test("Test 1: renders 'Integrations:' section header", async () => {
    const template = makeTemplate()
    const { captureCharFrame, renderOnce } = await testRender(
      () => <TemplateDetail template={template as any} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Integrations:")
  })

  test("Test 2: shows enabled integration with [global] source when template has no overrides", async () => {
    const template = makeTemplate()
    // no integrations field on template
    const { captureCharFrame, renderOnce } = await testRender(
      () => <TemplateDetail template={template as any} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("vscode")
    expect(frame).toContain("[global]")
    expect(frame).toContain("\u2713")
  })

  test("Test 3: shows [template] source when template has integration override", async () => {
    const template = makeTemplate({
      integrations: {
        vscode: { enabled: true, cmd: "code-insiders" },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <TemplateDetail template={template as any} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("vscode")
    expect(frame).toContain("[template]")
  })

  test("Test 4: shows config value inline for enabled integration", async () => {
    const template = makeTemplate({
      integrations: {
        vscode: { enabled: true, cmd: "code-insiders" },
      },
    })
    const { captureCharFrame, renderOnce } = await testRender(
      () => <TemplateDetail template={template as any} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("(cmd: code-insiders)")
  })
})
