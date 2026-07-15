import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { applyTestGitEnv, gitExecOptions } from "../helpers"

const PROJECT_ROOT = join(import.meta.dir, "../..")

function makeTmpDir(prefix = "sync-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Create a bare "origin" repo plus a local clone, and a worktree branch.
 * Returns { mainPath (clone), taskPath (worktree) }.
 */
function makeRepoWithWorktree(
  baseDir: string,
  repoName: string,
  wsBranch: string
): { mainPath: string; taskPath: string } {
  const originDir = join(baseDir, `${repoName}-origin`)
  const mainPath = join(baseDir, `main-${repoName}`)
  const taskPath = join(baseDir, `task-${repoName}`)

  // Create bare origin
  mkdirSync(originDir, { recursive: true })
  execSync("git init --bare -b main", gitExecOptions(originDir, baseDir))

  // Clone origin to mainPath
  execSync(`git clone ${originDir} ${mainPath}`, gitExecOptions(baseDir, baseDir))
  const opts = gitExecOptions(mainPath, baseDir)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test"', opts)
  execSync("git config commit.gpgsign false", opts)
  writeFileSync(join(mainPath, "README.md"), "init")
  execSync("git add .", opts)
  execSync('git commit -m "init"', opts)
  execSync("git push origin main", opts)

  // Create worktree for the workspace branch
  execSync(`git worktree add ${taskPath} -b ${wsBranch}`, opts)
  const taskOpts = gitExecOptions(taskPath, baseDir)
  execSync('git config user.email "test@example.com"', taskOpts)
  execSync('git config user.name "Test"', taskOpts)
  execSync("git config commit.gpgsign false", taskOpts)

  return { mainPath, taskPath }
}

function setupFixture(
  tmpDir: string,
  wsName: string
): { cfgDir: string; mainPath: string; taskPath: string } {
  const cfgDir = join(tmpDir, "config")
  const wsRoot = join(tmpDir, "workspaces")
  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })

  const { mainPath, taskPath } = makeRepoWithWorktree(tmpDir, "api", `feat/${wsName}`)

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
    main_path: ${mainPath}
    task_path: ${taskPath}
    base_branch: main
`
  writeFileSync(join(cfgDir, "workspaces", `${wsName}.yml`), wsYaml)

  return { cfgDir, mainPath, taskPath }
}

function runSync(cfgDir: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(
    ["node", "packages/cli/dist/index.js", "sync", ...args],
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

describe("sync --json", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("sync-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    ;({ cfgDir } = setupFixture(tmpDir, "test-ws"))
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("emits per-repo sync result JSON", () => {
    const { stdout } = runSync(cfgDir, ["test-ws", "--json"])
    const parsed = JSON.parse(stdout.trim())
    expect(parsed).toHaveProperty("workspace", "test-ws")
    expect(parsed).toHaveProperty("repos")
    expect(Array.isArray(parsed.repos)).toBe(true)
  })

  test("per-repo objects include name, strategy, result, commits_behind_before, error", () => {
    const { stdout } = runSync(cfgDir, ["test-ws", "--json"])
    const parsed = JSON.parse(stdout.trim())
    expect(parsed.repos.length).toBeGreaterThan(0)
    const repo = parsed.repos[0]
    expect(repo).toHaveProperty("name")
    expect(repo).toHaveProperty("strategy")
    expect(repo).toHaveProperty("result")
    expect(repo).toHaveProperty("commits_behind_before")
    expect(repo).toHaveProperty("error")
  })

  test("result values match: up-to-date | rebased | merged | failed", () => {
    // When already up-to-date (no commits behind), result should be "up-to-date"
    const { stdout } = runSync(cfgDir, ["test-ws", "--json"])
    const parsed = JSON.parse(stdout.trim())
    const validResults = ["up-to-date", "rebased", "merged", "failed"]
    for (const repo of parsed.repos) {
      expect(validResults).toContain(repo.result)
    }
    // Since branch is up to date with origin, first repo should be "up-to-date"
    const apiRepo = parsed.repos.find((r: { name: string }) => r.name === "api")
    expect(apiRepo?.result).toBe("up-to-date")
  })

  test("--all --json emits array of per-workspace results", () => {
    // Add a second workspace to test --all
    const secondTmpDir = makeTmpDir("sync-second")
    try {
      const { mainPath, taskPath } = makeRepoWithWorktree(secondTmpDir, "svc", "feat/ws2")
      const ws2Yaml = `schema_version: "1"
name: ws2
branch: feat/ws2
created: "2024-01-01"
repos:
  - name: svc
    repo: svc
    type: other
    mode: worktree
    main_path: ${mainPath}
    task_path: ${taskPath}
    base_branch: main
`
      writeFileSync(join(cfgDir, "workspaces", "ws2.yml"), ws2Yaml)

      const { stdout } = runSync(cfgDir, ["--all", "--json"])
      const parsed = JSON.parse(stdout.trim())
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBe(2)
      for (const item of parsed) {
        expect(item).toHaveProperty("workspace")
        expect(item).toHaveProperty("repos")
      }
    } finally {
      rmSync(secondTmpDir, { recursive: true, force: true })
    }
  })
})
