import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { applyTestGitEnv, gitExecOptions } from "../helpers"

const PROJECT_ROOT = join(import.meta.dir, "../..")

function makeTmpDir(prefix = "debug-output-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeGitRepo(path: string): void {
  mkdirSync(path, { recursive: true })
  const opts = gitExecOptions(path, path)
  execSync("git init -b main", opts)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test"', opts)
  execSync("git config commit.gpgsign false", opts)
  writeFileSync(join(path, "README.md"), "init")
  execSync("git add .", opts)
  execSync('git commit -m "init"', opts)
}

function setupFixture(tmpDir: string): { cfgDir: string } {
  const cfgDir = join(tmpDir, "config")
  const wsRoot = join(tmpDir, "workspaces")
  const taskPath = join(wsRoot, "tasks", "test-ws", "api")

  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  makeGitRepo(taskPath)

  writeFileSync(join(cfgDir, "config.yml"), `workspace_root: ${wsRoot}\n`)
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")

  const wsYaml = `schema_version: "1"
name: test-ws
branch: feat/test
template: my-tmpl
created: "2024-01-01"
repos:
  - name: api
    repo: api
    type: other
    mode: worktree
    main_path: ${join(wsRoot, "main", "api")}
    task_path: ${taskPath}
    base_branch: main
`
  writeFileSync(join(cfgDir, "workspaces", "test-ws.yml"), wsYaml)

  return { cfgDir }
}

function runStatus(
  cfgDir: string,
  extraEnv: Record<string, string> = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "status"],
    {
      env: { ...process.env, ...extraEnv, GIT_STACKS_CONFIG_DIR: cfgDir },
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    }
  )

  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

function runClose(
  cfgDir: string,
  extraEnv: Record<string, string> = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "close", "test-ws"],
    {
      env: { ...process.env, ...extraEnv, GIT_STACKS_CONFIG_DIR: cfgDir },
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    }
  )

  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

describe("status debug output", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("debug-output-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    ;({ cfgDir } = setupFixture(tmpDir))
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("emits labeled debug lines to stderr when GIT_STACKS_DEBUG=1", () => {
    const { stdout, stderr, exitCode } = runStatus(cfgDir, { GIT_STACKS_DEBUG: "1" })

    expect(exitCode).toBe(0)
    expect(stderr).toContain("[workspace-status]")
    expect(
      stderr.includes("op=getWorkspaceStatus") || stderr.includes("op=getWorkspaceListInfo")
    ).toBe(true)
    expect(stdout).toContain("test-ws")
  })

  test("keeps stderr empty for normal status runs", () => {
    const { stderr, exitCode } = runStatus(cfgDir)

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
  })

  test("preserves human-readable stdout while debug is enabled", () => {
    const { stdout, exitCode } = runStatus(cfgDir, { GIT_STACKS_DEBUG: "1" })

    expect(exitCode).toBe(0)
    expect(stdout).toContain("test-ws")
    expect(stdout).toContain("[feat/test]")
    expect(stdout).toContain("api")
  })

  test("GS_DEBUG=1 emits structured debug fields on stderr", () => {
    const { stdout, stderr, exitCode } = runStatus(cfgDir, { GS_DEBUG: "1" })

    expect(exitCode).toBe(0)
    expect(stderr).toContain("op=")
    expect(stderr).toContain("module=")
    expect(stderr).toContain("msg=")
    expect(stdout).toContain("test-ws")
  })

  test("GS_DEBUG=true emits structured debug fields on stderr", () => {
    const { stdout, stderr, exitCode } = runStatus(cfgDir, { GS_DEBUG: "true" })

    expect(exitCode).toBe(0)
    expect(stderr).toContain("op=")
    expect(stderr).toContain("module=")
    expect(stderr).toContain("msg=")
    expect(stdout).toContain("test-ws")
  })

  test("GIT_STACKS_DEBUG=1 is a compatibility alias that emits debug output", () => {
    const { stdout, stderr, exitCode } = runStatus(cfgDir, { GIT_STACKS_DEBUG: "1" })

    expect(exitCode).toBe(0)
    expect(stderr.length).toBeGreaterThan(0)
    expect(stdout).toContain("test-ws")
  })
})

describe("close debug output with selectors", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("debug-close-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    ;({ cfgDir } = setupFixture(tmpDir))
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("GS_DEBUG=lifecycle emits module=lifecycle and op=closeWorkspace on stderr for close command", () => {
    const { stderr } = runClose(cfgDir, { GS_DEBUG: "lifecycle" })

    expect(stderr).toContain("module=lifecycle")
    expect(stderr).toContain("op=closeWorkspace")
  })

  test("GS_DEBUG=git emits no debug output for close command (lifecycle not in git selector)", () => {
    const { stderr } = runClose(cfgDir, { GS_DEBUG: "git" })

    expect(stderr).toBe("")
  })
})
