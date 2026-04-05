import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { applyTestGitEnv, gitExecOptions } from "../helpers"

const PROJECT_ROOT = join(import.meta.dir, "../..")

function makeTmpDir(prefix = "list-test"): string {
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

function setupFixture(tmpDir: string): string {
  const cfgDir = join(tmpDir, "config")
  const wsRoot = join(tmpDir, "workspaces")
  // Create 3 repos: 2 worktree + 1 trunk
  const taskPath1 = join(wsRoot, "tasks", "my-ws", "api")
  const taskPath2 = join(wsRoot, "tasks", "my-ws", "svc")
  const trunkPath = join(tmpDir, "main-db")

  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  // Create real git repos so dirty checks work without errors
  makeGitRepo(taskPath1)
  makeGitRepo(taskPath2)
  makeGitRepo(trunkPath)

  writeFileSync(join(cfgDir, "config.yml"), `workspace_root: ${wsRoot}\n`)
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")

  // Set last_opened to a known recent time so "1h" shows up
  const lastOpened = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago

  const wsYaml = `schema_version: "1"
name: my-ws
branch: feat/thing
created: "2024-01-01"
last_opened: "${lastOpened}"
labels:
  - backend
  - sprint:14
repos:
  - name: api
    repo: api
    type: other
    mode: worktree
    main_path: /nonexistent/main/api
    task_path: ${taskPath1}
    base_branch: main
  - name: svc
    repo: svc
    type: other
    mode: worktree
    main_path: /nonexistent/main/svc
    task_path: ${taskPath2}
    base_branch: main
  - name: db
    repo: db
    type: other
    mode: trunk
    main_path: ${trunkPath}
    task_path: ${trunkPath}
    base_branch: main
`
  writeFileSync(join(cfgDir, "workspaces", "my-ws.yml"), wsYaml)

  return cfgDir
}

function runList(cfgDir: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "list", ...args],
    {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
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

describe("list default columns", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("list-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    cfgDir = setupFixture(tmpDir)
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("default output includes branch column", () => {
    const { stdout } = runList(cfgDir, [])
    expect(stdout).toContain("feat/thing")
  })

  test("default output includes repo count", () => {
    const { stdout } = runList(cfgDir, [])
    // 3 repos total (2 worktree + 1 trunk)
    expect(stdout).toContain("3 repos")
  })

  test("default output includes last-opened age", () => {
    const { stdout } = runList(cfgDir, [])
    // last_opened is set to 1 hour ago, so it should display "1h"
    expect(stdout).toContain("1h")
  })

  test("default output includes dirty indicator", () => {
    // Add a modified file to one of the worktree repos to make it dirty
    // Re-read the config to get the actual task path
    const { readFileSync } = require("fs")
    const yaml = readFileSync(join(cfgDir, "workspaces", "my-ws.yml"), "utf8")
    // Extract task_path from first repo entry
    const match = yaml.match(/task_path: (.+)$\s*base_branch: main/m)
    if (match) {
      const actualTaskPath = match[1].trim()
      // Write a dirty file to make the repo dirty
      writeFileSync(join(actualTaskPath, "dirty.txt"), "dirty")
    }

    const { stdout } = runList(cfgDir, [])
    // With a dirty repo, the dirty indicator "~" should appear
    expect(stdout).toContain("~")
  })

  test("--status flag still accepted for backward compat", () => {
    const { stdout, exitCode } = runList(cfgDir, ["--status"])
    // Should not error — same output as without --status
    expect(exitCode).toBe(0)
    expect(stdout).toContain("feat/thing")
  })

  test("--label filters workspaces with AND logic", () => {
    const { stdout, exitCode } = runList(cfgDir, ["--label", "backend", "--label", "sprint:14"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("my-ws")
  })

  test("--label reports no matches cleanly", () => {
    const { stdout, exitCode } = runList(cfgDir, ["--label", "frontend"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("No workspaces match labels: frontend")
  })
})
