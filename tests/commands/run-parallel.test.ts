import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { runProcessSync } from "../process"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { applyTestGitEnv, gitExecOptions } from "../helpers"

const PROJECT_ROOT = join(import.meta.dirname, "../..")

function makeTmpDir(prefix = "run-par-test"): string {
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

function setupFixture(tmpDir: string, wsName = "my-ws"): string {
  const cfgDir = join(tmpDir, "config")
  const wsRoot = join(tmpDir, "workspaces")
  const taskPath1 = join(wsRoot, "tasks", wsName, "api")
  const taskPath2 = join(wsRoot, "tasks", wsName, "svc")

  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  makeGitRepo(taskPath1)
  makeGitRepo(taskPath2)

  writeFileSync(join(cfgDir, "config.yml"), `workspace_root: ${wsRoot}\n`)
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")

  const wsYaml = `schema_version: "1"
name: ${wsName}
branch: feat/${wsName}
created: "2024-01-01"
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
`
  writeFileSync(join(cfgDir, "workspaces", `${wsName}.yml`), wsYaml)

  return cfgDir
}

function runParallel(
  cfgDir: string,
  wsName: string,
  extraArgs: string[],
  cmd: string[]
): { stdout: string; stderr: string; exitCode: number } {
  // IMPORTANT: Due to passThroughOptions(), flags must come BEFORE the positional <name> arg.
  // Otherwise commander treats "--parallel" as the optional [repo] argument.
  const result = runProcessSync(
    ["node", "packages/cli/dist/index.js", "run", "--parallel", ...extraArgs, wsName, "--", ...cmd],
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

describe("run --parallel", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("run-par-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    cfgDir = setupFixture(tmpDir)
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("executes command in all worktree repos simultaneously", () => {
    const { stdout, exitCode } = runParallel(cfgDir, "my-ws", ["--json"], ["echo", "hello"])
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout.trim())
    // Both repos should appear in output
    const repoNames = parsed.map((r: { repo: string }) => r.repo)
    expect(repoNames).toContain("api")
    expect(repoNames).toContain("svc")
  })

  test("shows per-repo result with checkmark or cross", () => {
    // Human mode (no --json): successful command shows checkmark
    const { stdout } = runParallel(cfgDir, "my-ws", [], ["echo", "hello"])
    // Checkmark \u2713 should appear for successful repos
    expect(stdout).toContain("\u2713")
  })

  test("flushes failed repo output after all complete", () => {
    // Write a script that outputs to stdout then fails
    const scriptPath = join(tmpDir, "failscript.sh")
    writeFileSync(scriptPath, "#!/bin/sh\necho failoutput\nexit 1\n")
    execSync(`chmod +x ${scriptPath}`)

    const { stdout } = runParallel(cfgDir, "my-ws", [], [scriptPath])
    // Failed output should be flushed after the summary lines
    // The "———" separator appears before each failed repo's output
    expect(stdout).toContain("\u2014\u2014\u2014")
    // The stdout from the failing command should appear in the flush section
    expect(stdout).toContain("failoutput")
  })

  test("exits 1 if any repo fails, 0 if all pass", () => {
    // All passing: exit 0 (use "true" which exits 0)
    const passing = runParallel(cfgDir, "my-ws", [], ["true"])
    expect(passing.exitCode).toBe(0)

    // Any failing: exit 1 (use "false" which exits 1)
    const failing = runParallel(cfgDir, "my-ws", [], ["false"])
    expect(failing.exitCode).toBe(1)
  })

  test("--parallel --json emits per-repo JSON array", () => {
    const { stdout, exitCode } = runParallel(cfgDir, "my-ws", ["--json"], ["echo", "hello"])
    expect(exitCode).toBe(0)
    const trimmed = stdout.trim()
    expect(trimmed.startsWith("[")).toBe(true)
    expect(trimmed.endsWith("]")).toBe(true)
    const parsed = JSON.parse(trimmed)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(2)
  })

  test("--parallel --json includes repo, exit_code, stdout, stderr per entry", () => {
    const { stdout } = runParallel(cfgDir, "my-ws", ["--json"], ["echo", "hello"])
    const parsed = JSON.parse(stdout.trim())
    for (const entry of parsed) {
      expect(entry).toHaveProperty("repo")
      expect(entry).toHaveProperty("exit_code")
      expect(entry).toHaveProperty("stdout")
      expect(entry).toHaveProperty("stderr")
      expect(typeof entry.repo).toBe("string")
      expect(typeof entry.exit_code).toBe("number")
      expect(typeof entry.stdout).toBe("string")
      expect(typeof entry.stderr).toBe("string")
    }
    // Verify echo hello appears in stdout
    const apiEntry = parsed.find((e: { repo: string }) => e.repo === "api")
    expect(apiEntry?.stdout.trim()).toBe("hello")
    expect(apiEntry?.exit_code).toBe(0)
  })
})
