import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { runProcessSync } from "../process"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { applyTestGitEnv, gitExecOptions } from "../helpers"

const PROJECT_ROOT = join(import.meta.dirname, "../..")

function makeTmpDir(prefix = "env-test"): string {
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
  const taskPath = join(wsRoot, "tasks", "env-ws", "api")

  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  makeGitRepo(taskPath)

  writeFileSync(
    join(cfgDir, "config.yml"),
    `workspace_root: ${wsRoot}
secrets:
  resolvers:
    - env
`
  )
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")

  const wsYaml = `schema_version: "1"
name: env-ws
branch: feat/env
created: "2024-01-01"
env:
  API_URL: https://example.test
  SECRET_TOKEN: \${{ env:GS_SECRET_TEST_VALUE }}
ports:
  API_PORT: 12400
repos:
  - name: api
    repo: api
    type: other
    mode: worktree
    main_path: ${join(wsRoot, "main", "api")}
    task_path: ${taskPath}
    base_branch: main
`
  writeFileSync(join(cfgDir, "workspaces", "env-ws.yml"), wsYaml)

  return { cfgDir, taskPath }
}

function runEnv(
  cfgDir: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  cwd = PROJECT_ROOT
): { stdout: string; stderr: string; exitCode: number } {
  const result = runProcessSync(
    ["node", "packages/cli/dist/index.js", "env", ...args],
    {
      env: {
        ...process.env,
        ...extraEnv,
        GIT_STACKS_CONFIG_DIR: cfgDir,
      },
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }
  )
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

describe("env command", () => {
  let tmpDir: string
  let cfgDir: string
  let taskPath: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("env-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    ;({ cfgDir, taskPath } = setupFixture(tmpDir))
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("resolves secrets with the same runtime env pipeline used by open", () => {
    const { stdout, stderr, exitCode } = runEnv(
      cfgDir,
      ["env-ws", "--format", "json"],
      { GS_SECRET_TEST_VALUE: "resolved-from-env" }
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")

    const parsed = JSON.parse(stdout.trim())
    expect(parsed).toMatchObject({
      API_PORT: "12400",
      API_URL: "https://example.test",
      GS_TRIGGERED_BY: "env",
      GS_WORKSPACE_BRANCH: "feat/env",
      GS_WORKSPACE_NAME: "env-ws",
      SECRET_TOKEN: "resolved-from-env",
    })
  })

  test("adds repo-specific vars after resolving the workspace env", () => {
    const { stdout, exitCode } = runEnv(
      cfgDir,
      ["env-ws", "--repo", "api", "--format", "json"],
      { GS_SECRET_TEST_VALUE: "resolved-from-env" }
    )

    expect(exitCode).toBe(0)

    const parsed = JSON.parse(stdout.trim())
    expect(parsed.GS_REPO_NAME).toBe("api")
    expect(parsed.GS_REPO_PATH).toBe(taskPath)
    expect(parsed.GS_REPO_CLONE_PATH).toBe(join(tmpDir, "workspaces", "main", "api"))
    expect(parsed.SECRET_TOKEN).toBe("resolved-from-env")
  })
})
