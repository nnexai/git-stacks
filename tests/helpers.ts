import { chmodSync, existsSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { join, dirname } from "path"
import { execSync, spawnSync, type ExecSyncOptions } from "child_process"
import { mock } from "@test/api"
import type { CoreState } from "../packages/service/src/policy/core-contract"
import type { RepoRegistryEntry, Template, Workspace } from "../packages/core/src/config"

// --- Schema stub helper ---

function makeSchemaStub() {
  return {
    parse: mock((x: unknown) => x),
    safeParse: mock((x: unknown) => ({ success: true, data: x })),
  }
}

export function makeDashboardCoreState(
  workspaces: readonly Workspace[],
  templates: readonly Template[] = [],
  repositories: readonly RepoRegistryEntry[] = [],
): CoreState {
  const generatedAt = "2026-07-14T00:00:00.000Z"
  return {
    revision: "1",
    generated_at: generatedAt,
    config: { workspace_root: "/tmp/dashboard-workspaces", integrations: {}, ports: { range_start: 10000, range_end: 65000 } },
    workspaces: workspaces.map((workspace, workspaceIndex) => {
      const workspaceId = `00000000-0000-4000-8000-${String(workspaceIndex + 1).padStart(12, "0")}`
      const definition = {
        ...workspace,
        id: workspace.id ?? workspaceId,
        repos: workspace.repos.map((repo, repoIndex) => ({
          ...repo,
          id: repo.id ?? `10000000-0000-4000-8000-${String(workspaceIndex * 100 + repoIndex + 1).padStart(12, "0")}`,
        })),
      }
      return {
        definition,
        projection: {
          id: definition.id,
          name: definition.name,
          branch: definition.branch,
          labels: definition.labels ?? [],
          repositories: definition.repos.map((repo) => ({ id: repo.id!, name: repo.name, mode: repo.mode, path: repo.task_path ?? repo.main_path })),
          status: definition.repos.map((repo) => ({
            repository_id: repo.id!, name: repo.name, exists: true, dirty: false, branch: definition.branch,
            default_branch: repo.base_branch ?? "main", mode: repo.mode, ahead: 0, behind: 0, additions: 0, removals: 0,
            remote: repo.mode === "dir" ? "not_applicable" as const : "available" as const, degraded: false, fetch_stale: false,
          })),
          launch: { commands: [], environment: {}, redacted: [], references: {}, named: [] },
        },
      }
    }),
    templates: [...templates],
    repositories: repositories.map((repository) => ({ ...repository, disk_exists: true })),
  }
}

export function makeTmpDir(prefix = "ws-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function ensureGitTestHome(baseDir: string): string {
  const gitHome = join(baseDir, ".git-test-home")
  const gitConfig = join(gitHome, "gitconfig")

  mkdirSync(gitHome, { recursive: true })
  mkdirSync(join(gitHome, ".config"), { recursive: true })
  mkdirSync(join(gitHome, ".gnupg"), { recursive: true })

  if (!existsSync(gitConfig)) {
    writeFileSync(
      gitConfig,
      [
        "[user]",
        "\tname = Test User",
        "\temail = test@example.com",
        "[commit]",
        "\tgpgsign = false",
        "[tag]",
        "\tgpgSign = false",
        "[core]",
        "\thooksPath = /dev/null",
        "[init]",
        "\tdefaultBranch = main",
        "",
      ].join("\n")
    )
  }

  return gitHome
}

export function getTestGitEnv(baseDir: string): NodeJS.ProcessEnv {
  const gitHome = ensureGitTestHome(baseDir)
  return {
    ...process.env,
    HOME: gitHome,
    XDG_CONFIG_HOME: join(gitHome, ".config"),
    GNUPGHOME: join(gitHome, ".gnupg"),
    GIT_CONFIG_GLOBAL: join(gitHome, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  }
}

export function gitExecOptions(cwd: string, baseDir = cwd): ExecSyncOptions {
  return {
    cwd,
    stdio: "pipe",
    env: getTestGitEnv(baseDir),
  }
}

export function applyTestGitEnv(baseDir: string): () => void {
  const nextEnv = getTestGitEnv(baseDir)
  const managedKeys = [
    "HOME",
    "XDG_CONFIG_HOME",
    "GNUPGHOME",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_TERMINAL_PROMPT",
  ] as const

  const previous = Object.fromEntries(
    managedKeys.map((key) => [key, process.env[key]])
  ) as Record<(typeof managedKeys)[number], string | undefined>

  for (const key of managedKeys) {
    process.env[key] = nextEnv[key]
  }

  return () => {
    for (const key of managedKeys) {
      const value = previous[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

export function applyHostileGlobalGitEnv(baseDir: string): () => void {
  const hostileHome = join(baseDir, ".hostile-git-home")
  const hostileConfig = join(hostileHome, "gitconfig")
  const hostileHooks = join(hostileHome, "hooks")
  const hostileSigner = writeExecutable(
    hostileHome,
    "fail-signing",
    "#!/bin/sh\nexit 94\n"
  )

  writeExecutable(hostileHooks, "pre-commit", "#!/bin/sh\nexit 93\n")
  writeFileSync(
    hostileConfig,
    [
      "[user]",
      "\tname = Hostile User",
      "\temail = hostile@example.com",
      "[commit]",
      "\tgpgsign = true",
      "[tag]",
      "\tgpgSign = true",
      "[core]",
      `\thooksPath = ${hostileHooks}`,
      "[gpg]",
      `\tprogram = ${hostileSigner}`,
      "[init]",
      "\tdefaultBranch = hostile",
      "",
    ].join("\n")
  )

  const managedKeys = [
    "HOME",
    "XDG_CONFIG_HOME",
    "GNUPGHOME",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_TERMINAL_PROMPT",
  ] as const
  const previous = Object.fromEntries(
    managedKeys.map((key) => [key, process.env[key]])
  ) as Record<(typeof managedKeys)[number], string | undefined>
  const nextEnv: Record<(typeof managedKeys)[number], string> = {
    HOME: hostileHome,
    XDG_CONFIG_HOME: join(hostileHome, ".config"),
    GNUPGHOME: join(hostileHome, ".gnupg"),
    GIT_CONFIG_GLOBAL: hostileConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  }

  for (const key of managedKeys) {
    process.env[key] = nextEnv[key]
  }

  return () => {
    for (const key of managedKeys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

export function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true })
}

export const TEST_CLI_ENV_ALLOWLIST = [
  "HOME",
  "XDG_CONFIG_HOME",
  "GNUPGHOME",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_TERMINAL_PROMPT",
  "GIT_STACKS_CONFIG_DIR",
  "PATH",
] as const

export type RunCliOptions = {
  baseDir: string
  cwd?: string
  configDir?: string
  env?: Record<string, string>
  artifactPaths?: string[]
  envAllowlistExtras?: string[]
}

export type RunCliResult = {
  argv: string[]
  cwd: string
  exitCode: number
  stdout: string
  stderr: string
  envPreview: Record<string, string>
  artifactPaths: string[]
}

function buildEnvPreview(env: NodeJS.ProcessEnv, extras: readonly string[]): Record<string, string> {
  const allowed = new Set<string>([...TEST_CLI_ENV_ALLOWLIST, ...extras])
  const preview: Record<string, string> = {}

  for (const key of allowed) {
    const value = env[key]
    if (value !== undefined) {
      preview[key] = value
    }
  }

  return preview
}

export function runCli(argv: string[], opts: RunCliOptions): RunCliResult {
  const projectRoot = join(import.meta.dirname, "..")
  const cwd = opts.cwd ?? projectRoot
  const env = {
    ...getTestGitEnv(opts.baseDir),
    GIT_STACKS_CONFIG_DIR: opts.configDir ?? join(opts.baseDir, "config"),
    ...opts.env,
  }

  const result = spawnSync("node", [join(projectRoot, "packages/cli/dist/index.js"), ...argv], {
    cwd,
    env,
    encoding: "utf8",
  })

  return {
    argv,
    cwd,
    exitCode: result.status ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
    envPreview: buildEnvPreview(env, opts.envAllowlistExtras ?? []),
    artifactPaths: opts.artifactPaths ?? [],
  }
}

export function formatCliFailure(result: RunCliResult): string {
  return [
    "CLI command failed",
    `argv: ${JSON.stringify(result.argv)}`,
    `cwd: ${result.cwd}`,
    `exitCode: ${result.exitCode}`,
    "env:",
    JSON.stringify(result.envPreview, null, 2),
    "artifactPaths:",
    JSON.stringify(result.artifactPaths, null, 2),
    "stdout:",
    result.stdout,
    "stderr:",
    result.stderr,
  ].join("\n")
}

export function createConfigFixture(baseDir: string, workspaceRoot = join(baseDir, "ws-root")): string {
  const configDir = join(baseDir, "config")
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
  mkdirSync(join(configDir, "templates"), { recursive: true })
  mkdirSync(join(configDir, "notes"), { recursive: true })
  mkdirSync(workspaceRoot, { recursive: true })
  writeFileSync(join(configDir, "config.yml"), `workspace_root: ${workspaceRoot}\n`)
  writeRegistryFixture(configDir)
  return configDir
}

export function writeRegistryFixture(configDir: string, yaml = "[]\n"): string {
  const path = join(configDir, "registry.yml")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, yaml)
  return path
}

export function writeTemplateFixture(configDir: string, fileName: string, yaml: string): string {
  const path = join(configDir, "templates", fileName)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, yaml)
  return path
}

export function writeWorkspaceFixture(configDir: string, fileName: string, yaml: string): string {
  const path = join(configDir, "workspaces", fileName)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, yaml)
  return path
}

export function renderCommandsYaml(
  commands: Record<string, string> | undefined,
  indent = ""
): string {
  if (!commands || Object.keys(commands).length === 0) return ""
  const lines: string[] = [`${indent}commands:`]
  for (const [name, shell] of Object.entries(commands)) {
    lines.push(`${indent}  ${name}: "${shell.replaceAll('"', '\\"')}"`)
  }
  return `${lines.join("\n")}\n`
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

export function writeExecutable(base: string, rel: string, content: string): string {
  const p = join(base, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
  chmodSync(p, 0o755)
  return p
}

export function childPathWithPrependedBin(binDir: string): Record<string, string> {
  return {
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  }
}

export function fakeGitLabProviderEnv(baseDir: string, input: {
  targetPath: string
  sourcePath?: string
  sourceBranch: string
  sourceSha: string
  targetBranch?: string
  targetSha?: string
  changeNumber?: number
}): Record<string, string> {
  const binDir = join(baseDir, "forge-bin")
  const sourcePath = input.sourcePath ?? input.targetPath
  const changeNumber = input.changeNumber ?? 42
  const sourceProjectId = 91
  const targetProjectId = sourcePath === input.targetPath ? sourceProjectId : 90
  const mr = JSON.stringify({
    iid: changeNumber,
    state: "opened",
    web_url: `https://gitlab.example.com/${input.targetPath}/-/merge_requests/${changeNumber}`,
    sha: input.sourceSha,
    source_branch: input.sourceBranch,
    source_project_id: sourceProjectId,
    target_branch: input.targetBranch ?? "main",
    target_project_id: targetProjectId,
    diff_refs: {
      head_sha: input.sourceSha,
      ...(input.targetSha ? { base_sha: input.targetSha } : {}),
    },
  })
  const project = JSON.stringify({
    id: sourceProjectId,
    path_with_namespace: sourcePath,
    ssh_url_to_repo: `git@gitlab.example.com:${sourcePath}.git`,
    http_url_to_repo: `https://gitlab.example.com/${sourcePath}.git`,
    web_url: `https://gitlab.example.com/${sourcePath}`,
  })
  writeExecutable(binDir, "glab", `#!/usr/bin/env node
const endpoint = process.argv.at(-1) ?? ""
if (endpoint.includes("/merge_requests/")) process.stdout.write(${JSON.stringify(mr)})
else if (endpoint === "projects/${sourceProjectId}") process.stdout.write(${JSON.stringify(project)})
else { process.stderr.write("unsupported fake glab endpoint"); process.exitCode = 1 }
`)
  return childPathWithPrependedBin(binDir)
}

export function fakeEditorPath(): string {
  return join(import.meta.dirname, "support", "fake-editor.ts")
}

export function fakeEditorEnv(capturePath: string, mode = "mutate-valid"): Record<string, string> {
  return {
    EDITOR: fakeEditorPath(),
    FAKE_EDITOR_CAPTURE: capturePath,
    FAKE_EDITOR_MODE: mode,
  }
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

export function makeBareRemote(baseDir: string, name = "origin"): string {
  const originDir = join(baseDir, `${name}-bare`)
  mkdirSync(originDir, { recursive: true })
  execSync("git init --bare -b main", gitExecOptions(originDir, baseDir))
  return originDir
}

export function makeRepoWithRemote(
  baseDir: string,
  repoName: string,
  wsBranch: string
): { originDir: string; mainPath: string; taskPath: string } {
  const originDir = makeBareRemote(baseDir, `${repoName}-origin`)
  const mainPath = join(baseDir, `main-${repoName}`)
  const taskPath = join(baseDir, `task-${repoName}`)

  execSync(`git clone ${originDir} ${mainPath}`, gitExecOptions(baseDir, baseDir))
  const opts = gitExecOptions(mainPath, baseDir)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test User"', opts)
  execSync("git config commit.gpgsign false", opts)
  writeFileSync(join(mainPath, "README.md"), "init\n")
  execSync("git add .", opts)
  execSync('git commit -m "init"', opts)
  execSync("git push origin main", opts)

  execSync(`git worktree add ${taskPath} -b ${wsBranch}`, opts)
  const taskOpts = gitExecOptions(taskPath, baseDir)
  execSync('git config user.email "test@example.com"', taskOpts)
  execSync('git config user.name "Test User"', taskOpts)
  execSync("git config commit.gpgsign false", taskOpts)

  return { originDir, mainPath, taskPath }
}

export function makeWorkspaceFixture(
  cfgDir: string,
  wsName: string,
  repos: Array<{
    name: string
    repo?: string
    mode?: "worktree" | "trunk" | "dir"
    mainPath: string
    taskPath?: string
    baseBranch?: string
    type?: string
    hooks?: Record<string, string[]>
  }>,
  opts: {
    wsRoot?: string
    branch?: string
    template?: string
    env?: Record<string, string>
    hooks?: Record<string, string[]>
    envFile?: string
  } = {}
): string {
  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  mkdirSync(join(cfgDir, "templates"), { recursive: true })

  const wsRoot = opts.wsRoot ?? join(cfgDir, "..", "workspaces")
  if (!existsSync(join(cfgDir, "config.yml"))) {
    writeFileSync(join(cfgDir, "config.yml"), `workspace_root: ${wsRoot}\n`)
  }
  if (!existsSync(join(cfgDir, "registry.yml"))) {
    writeFileSync(join(cfgDir, "registry.yml"), "[]\n")
  }

  const repoLines = repos.map((repo) => {
    const lines = [
      `  - name: ${repo.name}`,
      `    repo: ${repo.repo ?? repo.name}`,
      `    type: ${repo.type ?? "other"}`,
      `    mode: ${repo.mode ?? "worktree"}`,
      `    main_path: ${repo.mainPath}`,
      `    base_branch: ${repo.baseBranch ?? "main"}`,
    ]
    if (repo.taskPath !== undefined) {
      lines.push(`    task_path: ${repo.taskPath}`)
    }
    if (repo.hooks) {
      lines.push("    hooks:")
      for (const [hook, commands] of Object.entries(repo.hooks)) {
        lines.push(`      ${hook}:`)
        for (const command of commands) lines.push(`        - "${command}"`)
      }
    }
    return lines.join("\n")
  }).join("\n")

  let yaml = `schema_version: "1"\nname: ${wsName}\nbranch: ${opts.branch ?? `feat/${wsName}`}\ncreated: "2024-01-01"\n`
  if (opts.template) yaml += `template: ${opts.template}\n`
  if (opts.env) {
    yaml += "env:\n"
    for (const [key, value] of Object.entries(opts.env)) {
      yaml += `  ${key}: ${value}\n`
    }
  }
  if (opts.envFile) yaml += `env_file: ${opts.envFile}\n`
  if (opts.hooks) {
    yaml += "hooks:\n"
    for (const [hook, commands] of Object.entries(opts.hooks)) {
      yaml += `  ${hook}:\n`
      for (const command of commands) yaml += `    - "${command}"\n`
    }
  }
  yaml += `repos:\n${repoLines}\n`

  writeFileSync(join(cfgDir, "workspaces", `${wsName}.yml`), yaml)
  return cfgDir
}

export function makeRealWorkspaceFixture(
  baseDir: string,
  cfgDir: string,
  wsName: string,
  opts: {
    repoName?: string
    branch?: string
    hooks?: Record<string, string[]>
    repoHooks?: Record<string, string[]>
  } = {}
): {
  repo: ReturnType<typeof makeRepoWithRemote>
  wsRoot: string
  wsName: string
  branch: string
} {
  const branch = opts.branch ?? `feat/${wsName}`
  const repoName = opts.repoName ?? "api"
  const repo = makeRepoWithRemote(baseDir, repoName, branch)
  const wsRoot = join(baseDir, "workspaces")
  const taskPath = join(wsRoot, "tasks", wsName, repoName)
  mkdirSync(dirname(taskPath), { recursive: true })
  execSync(`git worktree remove ${repo.taskPath} --force`, gitExecOptions(repo.mainPath, baseDir))
  execSync(`git worktree add ${taskPath} ${branch}`, gitExecOptions(repo.mainPath, baseDir))
  mkdirSync(cfgDir, { recursive: true })
  writeFileSync(join(cfgDir, "config.yml"), `workspace_root: ${wsRoot}\n`)
  const workspaceRepo = { ...repo, taskPath }

  makeWorkspaceFixture(cfgDir, wsName, [
    {
      name: repoName,
      mainPath: workspaceRepo.mainPath,
      taskPath: workspaceRepo.taskPath,
      hooks: opts.repoHooks,
    },
  ], { wsRoot, branch, hooks: opts.hooks })

  return { repo: workspaceRepo, wsRoot, wsName, branch }
}

export function makeProbeHook(artifactPath: string, envVars: string[]): string {
  const lines = [
    "#!/bin/sh",
    `echo "PROBE_PWD=$(pwd)" >> "${artifactPath}"`,
    ...envVars.map((name) => `echo "${name}=\${${name}}" >> "${artifactPath}"`),
  ]
  return lines.join("\n")
}

export function writeProbeScript(
  dir: string,
  name: string,
  artifactPath: string,
  envVars: string[]
): string {
  const scriptPath = join(dir, name)
  writeFileSync(scriptPath, makeProbeHook(artifactPath, envVars))
  execSync(`chmod +x "${scriptPath}"`)
  return scriptPath
}

export function makeGitRepo(base: string, name = "repo"): string {
  const repoPath = join(base, name)
  mkdirSync(repoPath, { recursive: true })
  const opts = gitExecOptions(repoPath, base)
  execSync("git init -b main", opts)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test User"', opts)
  execSync("git config commit.gpgsign false", opts)
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
  const configDir = process.env.GIT_STACKS_CONFIG_DIR ?? makeTmpDir(prefix)
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
  mkdirSync(join(configDir, "templates"), { recursive: true })
  mkdirSync(join(configDir, "notes"), { recursive: true })

  return {
    configDir,
    cleanup: () => cleanup(configDir),
  }
}

// --- Mock factory helpers ---
// Each factory returns ALL runtime-value exports of the target module with sensible stubs.
// Tests spread overrides: makeConfigMock({ listWorkspaces: mock(() => myWorkspaces) })

/**
 * Returns a complete mock of packages/core/src/config.ts exports.
 * Includes all schema stubs and all function stubs.
 */
export function makeConfigMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    // Schemas
    RepoTypeSchema: makeSchemaStub(),
    ForgeTypeSchema: makeSchemaStub(),
    ForgeIntegrationConfigSchema: makeSchemaStub(),
    ForgeRepoMetadataSchema: makeSchemaStub(),
    FileSyncEntrySchema: makeSchemaStub(),
    FilesSchema: makeSchemaStub(),
    ShellIdentifierSchema: makeSchemaStub(),
    PortsSchema: makeSchemaStub(),
    NameSchema: makeSchemaStub(),
    RepoRegistryEntrySchema: makeSchemaStub(),
    RepoRegistrySchema: makeSchemaStub(),
    TemplateRepoSchema: makeSchemaStub(),
    TemplateSchema: makeSchemaStub(),
    WorktreeRepoSchema: makeSchemaStub(),
    TrunkRepoSchema: makeSchemaStub(),
    DirRepoSchema: makeSchemaStub(),
    WorkspaceRepoSchema: makeSchemaStub(),
    WorkspaceSettingsSchema: makeSchemaStub(),
    WorkspaceSourceSchema: makeSchemaStub(),
    WorkspaceSchema: makeSchemaStub(),
    GlobalConfigSchema: makeSchemaStub(),
    // Functions
    invalidateConfigCache: mock(() => {}),
    formatZodError: mock(() => "zod error"),
    readGlobalConfig: mock(() => ({ workspace_root: "/tmp/test-ws", integrations: {}, ports: { range_start: 10000, range_end: 65000 } })),
    writeGlobalConfig: mock(() => {}),
    updateGlobalConfig: mock((intent: (value: Record<string, unknown>) => unknown) => intent({})),
    workspacePath: mock((name: string) => `/tmp/test-ws/workspaces/${name}.yml`),
    workspaceExists: mock(() => false),
    readWorkspace: mock(() => ({ name: "test-ws", branch: "main", repos: [], settings: {} })),
    writeWorkspace: mock(() => {}),
    updateWorkspace: mock((_name: string, intent: (value: Record<string, unknown>) => unknown) => intent({})),
    workspaceFilePath: mock((name: string) => `/tmp/test-ws/workspaces/${name}.yml`),
    listWorkspaces: mock(() => []),
    listWorkspacesUncached: mock(() => []),
    readRegistry: mock(() => []),
    writeRegistry: mock(() => {}),
    updateRegistry: mock((intent: (value: unknown[]) => unknown) => intent([])),
    listRegistryEntries: mock(() => []),
    templatePath: mock((name: string) => `/tmp/test-ws/templates/${name}.yml`),
    templateExists: mock(() => false),
    readTemplate: mock(() => ({ name: "test-template", repos: [] })),
    writeTemplate: mock(() => {}),
    updateTemplate: mock((_name: string, intent: (value: Record<string, unknown>) => unknown) => intent({})),
    listTemplates: mock(() => []),
    listTemplatesUncached: mock(() => []),
    expandBranchPattern: mock((pattern: string) => pattern),
    expandHome: mock((p: string) => p),
    getRepoPath: mock((repo: { task_path?: string; main_path?: string }) => repo.task_path ?? repo.main_path ?? ""),
    isWorktreeRepo: mock((repo: { mode?: string }) => repo.mode === "worktree"),
    isGitRepo: mock((repo: { mode?: string }) => repo.mode === "worktree" || repo.mode === "trunk"),
    deleteWorkspace: mock(() => {}),
    deleteTemplate: mock(() => {}),
    _cache: { workspaces: new Map(), templates: new Map(), resetList: mock(() => {}) },
    ...overrides,
  }
}

/**
 * Returns a complete mock of packages/core/src/workspace-ops.ts exports.
 * Only covers what workspace-ops.ts still exports: env re-exports, lifecycle re-exports, direct functions.
 */
export function makeWorkspaceOpsMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    // Env re-exports
    mergeEnv: mock(() => ({})),
    buildWorkspaceEnv: mock(async () => ({})),
    buildBaseEnv: mock(() => ({})),
    buildRepoEnv: mock(() => ({})),
    writeEnvFiles: mock(async () => {}),
    // Lifecycle re-exports
    cleanWorkspace: mock(async () => ({ ok: true })),
    closeWorkspace: mock(async () => ({ ok: true })),
    removeWorkspace: mock(async () => ({ ok: true })),
    mergeWorkspace: mock(async () => ({ ok: true })),
    // Direct functions
    openWorkspace: mock(async () => ({ ok: true })),
    renameWorkspace: mock(async () => ({ ok: true })),
    renameTemplate: mock(async () => ({ ok: true })),
    ...overrides,
  }
}

/**
 * Returns a mock of packages/core/src/workspace-git.ts exports.
 */
export function makeWorkspaceGitMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    syncWorkspace: mock(async () => ({ ok: true, rows: [] })),
    pushWorkspace: mock(async () => ({ ok: true, rows: [] })),
    pullWorkspace: mock(async () => ({ ok: true, pulled: [], skipped: [], failed: [] })),
    _exec: {},
    ...overrides,
  }
}

/**
 * Returns a mock of packages/core/src/workspace-status.ts exports.
 */
export function makeWorkspaceStatusMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    getWorkspaceListInfo: mock(async () => []),
    getWorkspaceStatus: mock(async () => []),
    getDirtyWorktrees: mock(async () => []),
    detectWorkspaceFromCwd: mock(() => ({ ok: false, error: "no_match" })),
    ...overrides,
  }
}

/**
 * Returns a mock of packages/core/src/workspace-yaml.ts exports.
 */
export function makeWorkspaceYamlMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    editWorkspaceYaml: mock(() => ({ path: "/tmp/ws.yml", validate: mock(() => true) })),
    openYamlInEditor: mock(async () => {}),
    editTemplateYaml: mock(() => ({ path: "/tmp/template.yml", validate: mock(() => true) })),
    editGlobalConfigYaml: mock(() => ({ path: "/tmp/config.yml", validate: mock(() => true) })),
    editRegistryYaml: mock(() => ({ path: "/tmp/registry.yml", validate: mock(() => true) })),
    _exec: { spawnEditor: mock(() => ({ exited: Promise.resolve(0) })) },
    ...overrides,
  }
}

/**
 * Returns a complete mock of packages/core/src/integrations/forge-utils.ts exports.
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
 * Returns a complete mock of packages/core/src/integrations/issue-utils.ts exports.
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
 * Returns a complete mock of packages/core/src/git.ts exports.
 * Covers all exported git functions including staleness-related ones.
 */
export function makeGitMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isGitTrackedPathSync: mock(() => false),
    isGitTrackedPath: mock(async () => false),
    resolveCommonGitDirSync: mock((repoPath: string) => repoPath),
    writeLocalGitExcludesSync: mock(() => ""),
    checkBranchExists: mock(async () => false),
    createWorktree: mock(async () => {}),
    createWorktreeFromRef: mock(async () => ({ movedExistingBranch: false })),
    removeWorktree: mock(async () => {}),
    isWorktreeRegistered: mock(async () => false),
    isRepoDirty: mock(async () => false),
    getGitLineChanges: mock(async () => ({ additions: 0, removals: 0 })),
    getCurrentBranch: mock(async () => "main"),
    isBranchGoneOnRemote: mock(async () => ({ status: "present" })),
    getMergeConflicts: mock(async () => ({ status: "clean" })),
    mergeNoFF: mock(async () => ({ ok: true })),
    prepareMergeCommit: mock(async () => ({ ok: true, commit: "0000000" })),
    compareAndSwapBranch: mock(async () => ({ ok: true })),
    deleteLocalBranch: mock(async () => {}),
    fetchOrigin: mock(async () => {}),
    fetchSourceRef: mock(async () => {}),
    deleteRef: mock(async () => {}),
    resolveRef: mock(async () => ({ ok: true, sha: "0000000" })),
    pullFFOnly: mock(async () => ({ ok: true })),
    checkRemoteTrackingRef: mock(async () => false),
    checkBranchExistsOnRemote: mock(async () => false),
    hasUpstreamTracking: mock(async () => false),
    ensureUpstreamTracking: mock(async () => ({ tracked: false })),
    rebaseBranch: mock(async () => ({ ok: true })),
    mergeBranchFF: mock(async () => ({ ok: true })),
    pushBranch: mock(async () => ({ ok: true, commits: 0 })),
    getCommitsAhead: mock(async () => 0),
    getCommitsBehind: mock(async () => 0),
    stashPush: mock(async () => ({ ok: true })),
    stashPop: mock(async () => ({ ok: true })),
    hasAutoStash: mock(async () => false),
    isFetchStale: mock(async () => false),
    getWorktreeStatus: mock(async () => ({ dirty: false, ahead: 0, behind: 0 })),
    ...overrides,
  }
}

/**
 * Returns a complete mock of packages/core/src/paths.ts exports.
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
    NOTES_DIR: `${testHome}/.config/git-stacks/notes`,
    PORTS_LOCK_FILE: `${testHome}/.config/git-stacks/.ports.lock`,
    getMainDir: mock((wsRoot: string) => `${wsRoot}/main`),
    getTasksDir: mock((wsRoot: string) => `${wsRoot}/tasks`),
    expandHome: mock((p: string) => p.startsWith("~/") ? `${testHome}/${p.slice(2)}` : p),
    ...overrides,
  }
}

/**
 * Returns a complete mock of packages/core/src/lifecycle.ts exports.
 * Includes the _exec injectable object and all function stubs.
 */
export function makeLifecycleMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _exec: {
      spawn: mock(() => ({ exited: Promise.resolve(0), stdout: null, stderr: null })),
    },
    runHooks: mock(async () => {}),
    runHooksCaptured: mock(async () => {}),
    runShellSequence: mock(async () => ({ ok: true })),
    runShellSequenceCaptured: mock(async () => ({ ok: true, lines: [] })),
    ...overrides,
  }
}

/**
 * Returns a complete mock of packages/core/src/tmux.ts exports.
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
// Captured when helpers.ts is loaded, before the importing test file applies
// mock.module. Vitest isolates files, so these references only need to remain
// stable against replacements made later in the same file.
//
// Destructured named exports are STABLE references — they are not updated when
// mock.module replaces the module later. This allows test files to access real
// implementations after the importing test file has mocked those modules.
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
  listWorkspacesUncached: realListWorkspacesUncached,
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
  invalidateConfigCache: realInvalidateConfigCache,
  _cache: realCache,
  deleteWorkspace: realDeleteWorkspace,
  deleteTemplate: realDeleteTemplate,
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
} = await import("@/lib/workspace-ops") as any

export const {
  editTemplateYaml: realEditTemplateYaml,
  editGlobalConfigYaml: realEditGlobalConfigYaml,
  editRegistryYaml: realEditRegistryYaml,
} = await import("@/lib/workspace-yaml") as any
