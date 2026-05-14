import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { join } from "path"
import {
  applyTestGitEnv,
  cleanup,
  formatCliFailure,
  makeRepoWithRemote,
  makeTmpDir,
  makeWorkspaceFixture,
  runCli,
} from "../helpers"

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

describe("workspace JSON and text output contracts", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined
  let wsName: string
  let taskPath: string

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-json-contracts-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-json-contracts")
    cfgDir = join(tmpDir, "config")
    wsName = "json-ws"

    const repo = makeRepoWithRemote(tmpDir, "api", `feat/${wsName}`)
    taskPath = repo.taskPath
    makeWorkspaceFixture(cfgDir, wsName, [
      { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
    ], {
      wsRoot: join(tmpDir, "workspaces"),
      template: "base-template",
      env: { API_URL: "https://example.test" },
    })
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  describe("list --json contract", () => {
    test("list --json emits array of workspace objects with name, branch, template, labels-compatible shape", () => {
      const result = runCli(["list", "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0]).toHaveProperty("name", wsName)
      expect(parsed[0]).toHaveProperty("branch", `feat/${wsName}`)
      expect(parsed[0]).toHaveProperty("repoCount")
      expect(parsed[0]).toHaveProperty("dirty")
      if ("labels" in parsed[0]) expect(Array.isArray(parsed[0].labels)).toBe(true)
    })

    test("list --json with --status preserves status fields", () => {
      const result = runCli(["list", "--json", "--status"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0]).toHaveProperty("dirty")
      expect(parsed[0]).toHaveProperty("dirtyRepos")
      expect(parsed[0]).toHaveProperty("ahead")
      expect(parsed[0]).toHaveProperty("behind")
    })
  })

  describe("status --json contract", () => {
    test("status --json includes ahead and behind counts", () => {
      const result = runCli(["status", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0].repos[0]).toHaveProperty("ahead")
      expect(parsed[0].repos[0]).toHaveProperty("behind")
      expect(typeof parsed[0].repos[0].ahead).toBe("number")
      expect(typeof parsed[0].repos[0].behind).toBe("number")
    })

    test("status --json with non-existent workspace returns error", () => {
      const result = runCli(["status", "nonexistent", "--json"], { baseDir: tmpDir, configDir: cfgDir })

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("nonexistent")
    })
  })

  describe("run --json contract", () => {
    test("run --json emits per-repo result objects", () => {
      const result = runCli(["run", "--parallel", "--json", wsName, "--", "echo", "hello"], {
        baseDir: tmpDir,
        configDir: cfgDir,
      })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0]).toMatchObject({
        repo: "api",
        exit_code: 0,
        stdout: "hello\n",
        stderr: "",
      })
    })

    test("run --json captures non-zero exit codes per repo", () => {
      const result = runCli(["run", "--parallel", "--json", wsName, "--", "false"], {
        baseDir: tmpDir,
        configDir: cfgDir,
      })

      expect(result.stderr, formatCliFailure(result)).toBe("")
      expect(result.exitCode).toBe(1)
      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0]).toMatchObject({ repo: "api", exit_code: 1 })
    })
  })

  describe("env format contracts", () => {
    test("env --format json emits flat key-value object", () => {
      const result = runCli(["env", wsName, "--format", "json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed.GS_WORKSPACE_NAME).toBe(wsName)
      expect(parsed.API_URL).toBe("https://example.test")
    })

    test("env --format shell emits export statements", () => {
      const result = runCli(["env", wsName, "--format", "shell"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout).toContain(`export GS_WORKSPACE_NAME=${wsName}`)
      expect(result.stdout).toMatch(/^export [A-Z0-9_]+=.*$/m)
    })

    test("env --format dotenv emits KEY=value lines", () => {
      const result = runCli(["env", wsName, "--format", "dotenv"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout).toContain(`GS_WORKSPACE_NAME=${wsName}`)
      expect(result.stdout).not.toContain("export ")
    })
  })

  describe("paths contract", () => {
    test("paths emits one absolute path per repo line", () => {
      const result = runCli(["paths", wsName], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const lines = result.stdout.trim().split("\n")
      expect(lines).toEqual([taskPath])
      expect(lines.every((line) => line.startsWith("/"))).toBe(true)
    })

    test("paths --prefix prepends the configured prefix string", () => {
      const result = runCli(["paths", wsName, "--prefix", "--add-dir"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout.trim()).toBe(`--add-dir ${taskPath}`)
    })
  })

  describe("cd contract", () => {
    test("cd emits workspace task directory for workspace", () => {
      const result = runCli(["cd", wsName], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout.trim()).toBe(join(tmpDir, "workspaces", "tasks", wsName))
    })

    test("cd with repo emits specific repo task_path", () => {
      const result = runCli(["cd", wsName, "api"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout.trim()).toBe(taskPath)
    })
  })
})
