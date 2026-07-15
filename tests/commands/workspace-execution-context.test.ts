import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { existsSync, mkdirSync, readFileSync, realpathSync } from "fs"
import { join } from "path"
import {
  applyTestGitEnv,
  cleanup,
  formatCliFailure,
  makeRepoWithRemote,
  makeTmpDir,
  makeWorkspaceFixture,
  runCli,
  writeProbeScript,
} from "../helpers"

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function setupWorkspace(
  tmpDir: string,
  cfgDir: string,
  options: {
    wsName?: string
    hooks?: Record<string, string[]>
    repoHooks?: Record<string, string[]>
    env?: Record<string, string>
    envFile?: string
  } = {}
) {
  const wsName = options.wsName ?? "ctx-ws"
  const repo = makeRepoWithRemote(tmpDir, "api", `feat/${wsName}`)
  const wsRoot = join(tmpDir, "workspaces")
  mkdirSync(join(wsRoot, "tasks", wsName), { recursive: true })
  makeWorkspaceFixture(cfgDir, wsName, [
    {
      name: "api",
      mainPath: repo.mainPath,
      taskPath: repo.taskPath,
      hooks: options.repoHooks,
    },
  ], {
    wsRoot,
    env: options.env,
    envFile: options.envFile,
    hooks: options.hooks,
  })
  return { wsName, repo, wsRoot }
}

describe("workspace execution context", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-context-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-context")
    cfgDir = join(tmpDir, "config")
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  describe("hook env injection", () => {
    test("post_open hook receives GS_WORKSPACE_NAME and GS_WORKSPACE_BRANCH", () => {
      const probeFile = join(tmpDir, "post-open-probe.txt")
      const scriptPath = writeProbeScript(tmpDir, "probe-open.sh", probeFile, [
        "GS_WORKSPACE_NAME",
        "GS_WORKSPACE_BRANCH",
        "GS_TRIGGERED_BY",
      ])
      const { wsName } = setupWorkspace(tmpDir, cfgDir, { hooks: { post_open: [scriptPath] } })

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const artifact = readFileSync(probeFile, "utf8")
      expect(artifact).toContain(`GS_WORKSPACE_NAME=${wsName}`)
      expect(artifact).toContain(`GS_WORKSPACE_BRANCH=feat/${wsName}`)
      expect(artifact).toContain("GS_TRIGGERED_BY=open")
    })

    test("repo pre_open hook receives GS_REPO_NAME and GS_REPO_PATH per repo", () => {
      const probeFile = join(tmpDir, "repo-probe.txt")
      const scriptPath = writeProbeScript(tmpDir, "probe-repo.sh", probeFile, [
        "GS_REPO_NAME",
        "GS_REPO_PATH",
      ])
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir, {
        repoHooks: { pre_open: [scriptPath] },
      })

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const artifact = readFileSync(probeFile, "utf8")
      expect(artifact).toContain("GS_REPO_NAME=api")
      expect(artifact).toContain(`GS_REPO_PATH=${repo.taskPath}`)
    })

    test("pre_close hook fires during close command", () => {
      const probeFile = join(tmpDir, "close-probe.txt")
      const scriptPath = writeProbeScript(tmpDir, "probe-close.sh", probeFile, ["GS_WORKSPACE_NAME"])
      const { wsName } = setupWorkspace(tmpDir, cfgDir, { hooks: { pre_close: [scriptPath] } })

      const result = runCli(["close", wsName], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(existsSync(probeFile), `missing close probe artifact: ${probeFile}`).toBe(true)
      expect(readFileSync(probeFile, "utf8")).toContain(`GS_WORKSPACE_NAME=${wsName}`)
    })
  })

  describe("hook cwd correctness", () => {
    test("repo hook runs with cwd set to repo task_path", () => {
      const probeFile = join(tmpDir, "repo-cwd-probe.txt")
      const scriptPath = writeProbeScript(tmpDir, "probe-cwd.sh", probeFile, [])
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir, {
        repoHooks: { pre_open: [scriptPath] },
      })

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(readFileSync(probeFile, "utf8")).toContain(`PROBE_PWD=${realpathSync(repo.taskPath)}`)
    })

    test("repo hook cwd is absolute, not relative", () => {
      const probeFile = join(tmpDir, "repo-absolute-cwd-probe.txt")
      const scriptPath = writeProbeScript(tmpDir, "probe-absolute-cwd.sh", probeFile, [])
      const { wsName } = setupWorkspace(tmpDir, cfgDir, {
        repoHooks: { pre_open: [scriptPath] },
      })

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const pwdLine = readFileSync(probeFile, "utf8").split("\n").find((line) => line.startsWith("PROBE_PWD="))
      expect(pwdLine?.startsWith("PROBE_PWD=/"), readFileSync(probeFile, "utf8")).toBe(true)
    })
  })

  describe("explicit cwd/path handling", () => {
    test("status command produces correct results when invoked from /tmp", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["status", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir, cwd: "/tmp" })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0].name).toBe(wsName)
      expect(parsed[0].repos[0].task_path).toBe(repo.taskPath)
    })

    test("env command produces correct results when invoked from a different directory", () => {
      const { wsName } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["env", wsName, "--format", "json"], { baseDir: tmpDir, configDir: cfgDir, cwd: "/tmp" })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed.GS_WORKSPACE_NAME).toBe(wsName)
      expect(parsed.GS_WORKSPACE_BRANCH).toBe(`feat/${wsName}`)
    })

    test("run command executes in repo cwd regardless of CLI invocation directory", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["run", wsName, "api", "--", "pwd"], { baseDir: tmpDir, configDir: cfgDir, cwd: "/tmp" })
      expectSuccessful(result)
      expect(result.stdout.trim()).toBe(realpathSync(repo.taskPath))
    })

    test("paths command returns absolute paths regardless of CLI cwd", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["paths", wsName], { baseDir: tmpDir, configDir: cfgDir, cwd: "/tmp" })
      expectSuccessful(result)
      expect(result.stdout.trim()).toBe(repo.taskPath)
      expect(result.stdout.trim().startsWith("/")).toBe(true)
    })
  })

  describe("env file generation", () => {
    test("open writes env file to repo when env_file configured", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir, {
        env: { MY_VAR: "hello" },
        envFile: ".env",
      })

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const envFile = join(repo.taskPath, ".env")
      expect(existsSync(envFile), `missing env file: ${envFile}`).toBe(true)
      expect(readFileSync(envFile, "utf8")).toContain("MY_VAR=hello")
    })
  })
})
