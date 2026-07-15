import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { runProcessSync } from "../process"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { applyTestGitEnv, gitExecOptions } from "../helpers"

const PROJECT_ROOT = join(import.meta.dirname, "../..")

function makeTmpDir(prefix = "status-test"): string {
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

function setupFixture(tmpDir: string): { cfgDir: string; taskPath: string } {
  const cfgDir = join(tmpDir, "config")
  const wsRoot = join(tmpDir, "workspaces")
  const taskPath = join(wsRoot, "tasks", "test-ws", "api")

  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  // Create a real git repo at task_path so isRepoDirty works
  makeGitRepo(taskPath)

  writeFileSync(
    join(cfgDir, "config.yml"),
    `workspace_root: ${wsRoot}\n`
  )
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

  return { cfgDir, taskPath }
}

function runStatus(
  cfgDir: string,
  args: string[],
  extraEnv: Record<string, string> = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = runProcessSync(
    ["node", "packages/cli/dist/index.js", "status", ...args],
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

describe("status --json", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("status-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    ;({ cfgDir } = setupFixture(tmpDir))
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("emits JSON array of workspace objects", () => {
    const { stdout } = runStatus(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
    const ws = parsed[0]
    expect(ws).toHaveProperty("name", "test-ws")
    expect(ws).toHaveProperty("branch", "feat/test")
    expect(ws).toHaveProperty("template", "my-tmpl")
  })

  test("each workspace includes repos array with per-repo detail", () => {
    const { stdout } = runStatus(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    const ws = parsed[0]
    expect(ws).toHaveProperty("repos")
    expect(Array.isArray(ws.repos)).toBe(true)
    expect(ws.repos.length).toBeGreaterThan(0)
    const repo = ws.repos[0]
    expect(repo).toHaveProperty("name", "api")
    expect(repo).toHaveProperty("mode", "worktree")
    expect(repo).toHaveProperty("branch")
    expect(repo).toHaveProperty("exists")
    expect(repo).toHaveProperty("dirty")
  })

  test("per-repo objects include task_path field", () => {
    const { stdout } = runStatus(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    const ws = parsed[0]
    const repo = ws.repos[0]
    expect(repo).toHaveProperty("task_path")
    // task_path should be a non-empty string
    expect(typeof repo.task_path).toBe("string")
    expect(repo.task_path.length).toBeGreaterThan(0)
  })

  test("no human-readable text mixed with JSON output", () => {
    const { stdout } = runStatus(cfgDir, ["--json"])
    const trimmed = stdout.trim()
    // Must be valid JSON
    const parsed = JSON.parse(trimmed)
    expect(Array.isArray(parsed)).toBe(true)
    // Must start with [ and end with ]
    expect(trimmed.startsWith("[")).toBe(true)
    expect(trimmed.endsWith("]")).toBe(true)
  })

  test("keeps JSON stdout parseable when GS_DEBUG=1 is enabled", () => {
    const { stdout, stderr, exitCode } = runStatus(cfgDir, ["--json"], { GS_DEBUG: "1" })
    const trimmed = stdout.trim()

    expect(exitCode).toBe(0)
    expect(() => JSON.parse(trimmed)).not.toThrow()
    expect(trimmed.startsWith("[")).toBe(true)
    expect(trimmed.endsWith("]")).toBe(true)
    expect(stderr).toContain("[workspace-status]")
  })

  test("keeps JSON stdout parseable when GIT_STACKS_DEBUG=1 alias is enabled", () => {
    const { stdout, stderr, exitCode } = runStatus(cfgDir, ["--json"], { GIT_STACKS_DEBUG: "1" })
    const trimmed = stdout.trim()

    expect(exitCode).toBe(0)
    expect(() => JSON.parse(trimmed)).not.toThrow()
    expect(trimmed.startsWith("[")).toBe(true)
    expect(trimmed.endsWith("]")).toBe(true)
    expect(stderr.length).toBeGreaterThan(0)
  })
})
