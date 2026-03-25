import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join, dirname } from "path"
import { execSync } from "child_process"
import { mock } from "bun:test"

// --- Schema stub helper ---

function makeSchemaStub() {
  return {
    parse: mock((x: unknown) => x),
    safeParse: mock((x: unknown) => ({ success: true, data: x })),
  }
}

export function makeTmpDir(prefix = "ws-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true })
}

export function mkdir(base: string, ...parts: string[]) {
  mkdirSync(join(base, ...parts), { recursive: true })
}

export function touch(base: string, ...parts: string[]) {
  const p = join(base, ...parts)
  mkdirSync(join(p, ".."), { recursive: true })
  writeFileSync(p, "")
}

export function write(base: string, rel: string, content: string) {
  const p = join(base, rel)
  mkdirSync(join(p, ".."), { recursive: true })
  writeFileSync(p, content)
}

/**
 * Create a directory tree from a flat map of relative paths to contents.
 * Paths ending with "/" create directories. Others create files with the given content.
 * Example: makeFileTree(base, { "a/b.txt": "hello", "c/": "" })
 */
export function makeFileTree(base: string, entries: Record<string, string>) {
  for (const [rel, content] of Object.entries(entries)) {
    if (rel.endsWith("/")) {
      mkdirSync(join(base, rel), { recursive: true })
    } else {
      const full = join(base, rel)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, content)
    }
  }
}

export function makeGitRepo(base: string, name = "repo"): string {
  const repoPath = join(base, name)
  mkdirSync(repoPath, { recursive: true })
  const opts = { cwd: repoPath, stdio: "pipe" as const }
  execSync("git init -b main", opts)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test User"', opts)
  writeFileSync(join(repoPath, "README.md"), "init\n")
  execSync("git add .", opts)
  execSync('git commit -m "init"', opts)
  return repoPath
}

/**
 * Create an isolated config directory and mock @/lib/paths to use it.
 * Call this at the top level of test files (before describe blocks) or in beforeEach.
 * Returns { configDir, cleanup } — caller must call cleanup() in afterEach/afterAll.
 *
 * IMPORTANT: Because paths.ts constants are evaluated at import time, any module
 * that imports from @/lib/paths or @/lib/config must be dynamically imported with
 * a cache-busting query string AFTER calling this function.
 */
export function useIsolatedConfig(prefix = "isolated-config"): { configDir: string; cleanup: () => void } {
  const configDir = makeTmpDir(prefix)
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
  mkdirSync(join(configDir, "templates"), { recursive: true })
  mkdirSync(join(configDir, "messages"), { recursive: true })

  mock.module("@/lib/paths", () => ({
    HOME: configDir,
    DEFAULT_WORKSPACE_ROOT: join(configDir, "ws-root"),
    WS_CONFIG_DIR: configDir,
    WORKSPACES_DIR: join(configDir, "workspaces"),
    GLOBAL_CONFIG_FILE: join(configDir, "config.yml"),
    REGISTRY_FILE: join(configDir, "registry.yml"),
    TEMPLATES_DIR: join(configDir, "templates"),
    MESSAGES_DIR: join(configDir, "messages"),
    getMainDir: (wsRoot: string) => join(wsRoot, "main"),
    getTasksDir: (wsRoot: string) => join(wsRoot, "tasks"),
    expandHome: (p: string) => p.startsWith("~/") ? join(configDir, p.slice(2)) : p,
  }))

  return {
    configDir,
    cleanup: () => cleanup(configDir),
  }
}

// --- Mock factory helpers ---
// Each factory returns ALL runtime-value exports of the target module with sensible stubs.
// Tests spread overrides: makeConfigMock({ listWorkspaces: mock(() => myWorkspaces) })

/**
 * Returns a complete mock of src/lib/config.ts exports.
 * Includes all schema stubs and all function stubs.
 */
export function makeConfigMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    // Schemas
    RepoTypeSchema: makeSchemaStub(),
    ForgeTypeSchema: makeSchemaStub(),
    FilesSchema: makeSchemaStub(),
    RepoRegistryEntrySchema: makeSchemaStub(),
    RepoRegistrySchema: makeSchemaStub(),
    TemplateRepoSchema: makeSchemaStub(),
    TemplateSchema: makeSchemaStub(),
    WorkspaceRepoSchema: makeSchemaStub(),
    WorkspaceSettingsSchema: makeSchemaStub(),
    WorkspaceSchema: makeSchemaStub(),
    GlobalConfigSchema: makeSchemaStub(),
    // Functions
    formatZodError: mock(() => "zod error"),
    readGlobalConfig: mock(() => ({ workspace_root: "/tmp/test-ws", integrations: {} })),
    writeGlobalConfig: mock(() => {}),
    workspacePath: mock((name: string) => `/tmp/test-ws/workspaces/${name}.yml`),
    workspaceExists: mock(() => false),
    readWorkspace: mock(() => ({ name: "test-ws", branch: "main", repos: [], settings: {} })),
    writeWorkspace: mock(() => {}),
    listWorkspaces: mock(() => []),
    readRegistry: mock(() => []),
    writeRegistry: mock(() => {}),
    listRegistryEntries: mock(() => []),
    templatePath: mock((name: string) => `/tmp/test-ws/templates/${name}.yml`),
    templateExists: mock(() => false),
    readTemplate: mock(() => ({ name: "test-template", repos: [] })),
    writeTemplate: mock(() => {}),
    listTemplates: mock(() => []),
    expandBranchPattern: mock((pattern: string) => pattern),
    expandHome: mock((p: string) => p),
    ...overrides,
  }
}

/**
 * Returns a complete mock of src/lib/workspace-ops.ts exports.
 * Includes all function stubs.
 */
export function makeWorkspaceOpsMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    getWorkspaceListInfo: mock(async () => []),
    mergeEnv: mock(() => ({})),
    buildBaseEnv: mock(() => ({})),
    buildRepoEnv: mock(() => ({})),
    writeEnvFiles: mock(async () => {}),
    getDirtyWorktrees: mock(async () => []),
    getWorkspaceStatus: mock(async () => []),
    cleanWorkspace: mock(async () => ({ ok: true })),
    closeWorkspace: mock(async () => ({ ok: true })),
    removeWorkspace: mock(async () => ({ ok: true })),
    mergeWorkspace: mock(async () => ({ ok: true })),
    openWorkspace: mock(async () => ({ ok: true })),
    renameWorkspace: mock(async () => ({ ok: true })),
    renameTemplate: mock(async () => ({ ok: true })),
    syncWorkspace: mock(async () => ({ ok: true, rows: [] })),
    editWorkspaceYaml: mock(() => ({ path: "/tmp/ws.yml", validate: mock(() => true) })),
    openYamlInEditor: mock(async () => {}),
    editTemplateYaml: mock(() => ({ path: "/tmp/template.yml", validate: mock(() => true) })),
    editGlobalConfigYaml: mock(() => ({ path: "/tmp/config.yml", validate: mock(() => true) })),
    editRegistryYaml: mock(() => ({ path: "/tmp/registry.yml", validate: mock(() => true) })),
    detectWorkspaceFromCwd: mock(() => ({ ok: false, error: "no_match" })),
    ...overrides,
  }
}

/**
 * Returns a complete mock of src/lib/integrations/forge-utils.ts exports.
 * Includes all function stubs and the _detect injectable object.
 */
export function makeForgeUtilsMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resolveForgeRepo: mock(() => ({ ok: false, error: "no-forge" })),
    resolveForgeRepoAnyMode: mock(() => ({ ok: false, error: "no-forge" })),
    resolveRepoCwd: mock(async () => null),
    _detect: {
      which: mock(async () => null),
      gitRemoteUrl: mock(async () => null),
      teaPullsLs: mock(async () => ({ exitCode: 1, stdout: "" })),
    },
    detectGitHubForge: mock(async () => false),
    detectGitLabForge: mock(async () => false),
    detectGiteaForge: mock(async () => false),
    detectForgeForRepo: mock(async () => []),
    formatForgeError: mock(() => "forge error"),
    ...overrides,
  }
}

/**
 * Returns a complete mock of src/lib/integrations/issue-utils.ts exports.
 * Includes all function stubs.
 */
export function makeIssueUtilsMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resolveIssueRef: mock(() => ({ ok: false, error: "no-issue" })),
    linkIssue: mock(() => {}),
    unlinkIssue: mock(() => {}),
    formatIssueError: mock(() => "issue error"),
    resolveWorkspaceArg: mock(() => "test-ws"),
    ...overrides,
  }
}

/**
 * Returns a complete mock of src/lib/paths.ts exports.
 * Uses /tmp/test-home as a safe test base path.
 */
export function makePathsMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const testHome = "/tmp/test-home"
  return {
    HOME: testHome,
    DEFAULT_WORKSPACE_ROOT: `${testHome}/workspaces`,
    WS_CONFIG_DIR: `${testHome}/.config/git-stacks`,
    WORKSPACES_DIR: `${testHome}/.config/git-stacks/workspaces`,
    GLOBAL_CONFIG_FILE: `${testHome}/.config/git-stacks/config.yml`,
    REGISTRY_FILE: `${testHome}/.config/git-stacks/registry.yml`,
    TEMPLATES_DIR: `${testHome}/.config/git-stacks/templates`,
    MESSAGES_DIR: `${testHome}/.config/git-stacks/messages`,
    getMainDir: mock((wsRoot: string) => `${wsRoot}/main`),
    getTasksDir: mock((wsRoot: string) => `${wsRoot}/tasks`),
    expandHome: mock((p: string) => p.startsWith("~/") ? `${testHome}/${p.slice(2)}` : p),
    ...overrides,
  }
}

/**
 * Returns a complete mock of src/lib/lifecycle.ts exports.
 * Includes the _exec injectable object and all function stubs.
 */
export function makeLifecycleMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _exec: {
      spawn: mock(() => ({ exited: Promise.resolve(0), stdout: null, stderr: null })),
    },
    runHooks: mock(async () => {}),
    runHooksCaptured: mock(async () => {}),
    ...overrides,
  }
}

/**
 * Returns a complete mock of src/lib/tmux.ts exports.
 * Includes the _exec injectable object and all function stubs.
 */
export function makeTmuxMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _exec: {
      run: mock(async () => ({ exitCode: 0, stdout: "" })),
    },
    killTmuxSession: mock(async () => {}),
    tmuxSessionExists: mock(async () => false),
    focusTmuxSession: mock(async () => {}),
    createTmuxSession: mock(async () => {}),
    openTmuxSession: mock(async () => ({ created: false })),
    getTmuxMainPane: mock(async () => "main"),
    addTmuxPane: mock(async () => null),
    sendToTmuxPane: mock(async () => {}),
    focusTmuxPane: mock(async () => false),
    ...overrides,
  }
}

// --- Real module captures ---
// Captured here at helpers.ts load time (before any test file applies mock.module).
// helpers.ts is first imported by agent-hooks.test.ts (alphabetically first test file),
// so these captures precede all mock.module calls from test files.
//
// Destructured named exports are STABLE references — they are not updated when
// mock.module replaces the module later. This allows test files to access real
// implementations even after other test files have mocked those modules.
//
// Use case: test files that need real module behavior (e.g. to test real shell
// execution or real file I/O) import these captures instead of using cache-busting
// query strings like `await import("@/lib/X?cache-bust")`.

export const {
  runHooks: realRunHooks,
  runHooksCaptured: realRunHooksCaptured,
  _exec: lifecycleRealExec,
} = await import("@/lib/lifecycle") as any

export const {
  _exec: tmuxRealExec,
  killTmuxSession: realKillTmuxSession,
  tmuxSessionExists: realTmuxSessionExists,
  focusTmuxSession: realFocusTmuxSession,
  createTmuxSession: realCreateTmuxSession,
  openTmuxSession: realOpenTmuxSession,
  getTmuxMainPane: realGetTmuxMainPane,
  addTmuxPane: realAddTmuxPane,
  sendToTmuxPane: realSendToTmuxPane,
  focusTmuxPane: realFocusTmuxPane,
} = await import("@/lib/tmux") as any

export const {
  _exec: niriRealExec,
  isNiriRunning: realIsNiriRunning,
  listNiriWindows: realListNiriWindows,
  listNiriWorkspaces: realListNiriWorkspaces,
  setNiriWorkspaceName: realSetNiriWorkspaceName,
  unsetNiriWorkspaceName: realUnsetNiriWorkspaceName,
  moveWindowToWorkspace: realMoveWindowToWorkspace,
  niriSpawn: realNiriSpawn,
  focusNiriWorkspace: realFocusNiriWorkspace,
  focusNiriWorkspaceDown: realFocusNiriWorkspaceDown,
  snapshotWindowIds: realSnapshotWindowIds,
  focusNiriWindow: realFocusNiriWindow,
  setNiriColumnWidth: realSetNiriColumnWidth,
  consumeOrExpelWindowLeft: realConsumeOrExpelWindowLeft,
  niriSpawnSh: realNiriSpawnSh,
  moveColumnToIndex: realMoveColumnToIndex,
  setWindowWidth: realSetWindowWidth,
} = await import("@/lib/niri") as any

export const {
  listWorkspaces: realListWorkspaces,
  workspaceExists: realWorkspaceExists,
  workspacePath: realWorkspacePath,
  writeWorkspace: realWriteWorkspace,
  readWorkspace: realReadWorkspace,
  writeGlobalConfig: realWriteGlobalConfig,
  readGlobalConfig: realReadGlobalConfig,
  templateExists: realTemplateExists,
  readTemplate: realReadTemplate,
  writeTemplate: realWriteTemplate,
  listTemplates: realListTemplates,
  readRegistry: realReadRegistry,
  writeRegistry: realWriteRegistry,
  listRegistryEntries: realListRegistryEntries,
  expandBranchPattern: realExpandBranchPattern,
} = await import("@/lib/config") as any

export const {
  createWorktree: realCreateWorktree,
  isWorktreeRegistered: realIsWorktreeRegistered,
} = await import("@/lib/git") as any

export const {
  mergeWorkspace: realMergeWorkspace,
  removeWorkspace: realRemoveWorkspace,
  cleanWorkspace: realCleanWorkspace,
  renameWorkspace: realRenameWorkspace,
  closeWorkspace: realCloseWorkspace,
  renameTemplate: realRenameTemplate,
  editTemplateYaml: realEditTemplateYaml,
  editGlobalConfigYaml: realEditGlobalConfigYaml,
  editRegistryYaml: realEditRegistryYaml,
} = await import("@/lib/workspace-ops") as any

export const {
  appendMessage: realAppendMessage,
  listMessages: realListMessages,
  clearMessages: realClearMessages,
  pushToSocket: realPushToSocket,
} = await import("@/lib/messages") as any
