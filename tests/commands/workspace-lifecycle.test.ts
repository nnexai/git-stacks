import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { existsSync, mkdirSync, readFileSync } from "fs"
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

function wsYaml(cfgDir: string, wsName: string) {
  return join(cfgDir, "workspaces", `${wsName}.yml`)
}

function setupWorkspace(tmpDir: string, cfgDir: string, wsName = "life-ws", hooks?: Record<string, string[]>) {
  const repo = makeRepoWithRemote(tmpDir, "api", `feat/${wsName}`)
  const wsRoot = join(tmpDir, "workspaces")
  mkdirSync(join(wsRoot, "tasks", wsName), { recursive: true })
  makeWorkspaceFixture(cfgDir, wsName, [
    { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
  ], { wsRoot, hooks })
  return { wsName, repo, wsRoot }
}

describe("workspace lifecycle CLI", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-lifecycle-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-lifecycle")
    cfgDir = join(tmpDir, "config")
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  describe("open --no-ide", () => {
    test("open --no-ide succeeds and worktree exists after open", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(existsSync(repo.taskPath)).toBe(true)
      expect(existsSync(join(repo.taskPath, ".git"))).toBe(true)
    })

    test("open --no-ide runs post_open hooks", () => {
      const probeFile = join(tmpDir, "post-open.txt")
      const script = writeProbeScript(tmpDir, "post-open.sh", probeFile, ["GS_WORKSPACE_NAME"])
      const { wsName } = setupWorkspace(tmpDir, cfgDir, "life-ws", { post_open: [script] })

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(existsSync(probeFile)).toBe(true)
      expect(readFileSync(probeFile, "utf8")).toContain(`GS_WORKSPACE_NAME=${wsName}`)
    })

    test("open --no-ide --no-cmux does not report external integration launch", () => {
      const { wsName } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["open", wsName, "--no-ide", "--no-cmux"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stderr).not.toContain("vscode")
      expect(result.stderr).not.toContain("tmux")
      expect(result.stderr).not.toContain("aerospace")
      expect(result.stderr).not.toContain("niri")
    })
  })

  describe("close", () => {
    test("close preserves worktree directory and workspace YAML", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["close", wsName], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(existsSync(repo.taskPath)).toBe(true)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(true)
    })

    test("close exits 0 when workspace task directory is missing", () => {
      const { wsName, wsRoot } = setupWorkspace(tmpDir, cfgDir)
      cleanup(join(wsRoot, "tasks", wsName))

      const result = runCli(["close", wsName], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
    })
  })

  describe("clean", () => {
    test("clean --force removes worktree directories but preserves workspace YAML", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["clean", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(existsSync(repo.taskPath)).toBe(false)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(true)
    })

    test("clean --dry-run shows what would be removed without removing", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["clean", wsName, "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout).toContain("dry-run")
      expect(result.stdout).toContain(wsName)
      expect(existsSync(repo.taskPath)).toBe(true)
    })
  })

  describe("remove", () => {
    test("remove --force deletes worktrees and workspace YAML", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["remove", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(existsSync(repo.taskPath)).toBe(false)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(false)
    })

    test("remove --dry-run shows what would be removed without removing", () => {
      const { wsName, repo } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["remove", wsName, "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout).toContain("dry-run")
      expect(existsSync(repo.taskPath)).toBe(true)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(true)
    })

    test("workspace no longer appears in list after remove", () => {
      const { wsName } = setupWorkspace(tmpDir, cfgDir)
      expectSuccessful(runCli(["remove", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir }))

      const result = runCli(["list"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
      expect(result.stdout).not.toContain(wsName)
    })
  })

  describe("rename", () => {
    test("rename --force updates workspace name in YAML", () => {
      const { wsName } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["rename", wsName, "new-name", "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(false)
      expect(existsSync(wsYaml(cfgDir, "new-name"))).toBe(true)
      expect(readFileSync(wsYaml(cfgDir, "new-name"), "utf8")).toContain("name: new-name")
    })

    test("renamed workspace appears under new name in list", () => {
      const { wsName } = setupWorkspace(tmpDir, cfgDir)
      expectSuccessful(runCli(["rename", wsName, "new-name", "--force"], { baseDir: tmpDir, configDir: cfgDir }))

      const result = runCli(["list", "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const names = JSON.parse(result.stdout.trim()).map((workspace: { name: string }) => workspace.name)
      expect(names).toContain("new-name")
      expect(names).not.toContain(wsName)
    })

    test("rename --dry-run shows preview without renaming", () => {
      const { wsName } = setupWorkspace(tmpDir, cfgDir)

      const result = runCli(["rename", wsName, "new-name", "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      expect(result.stdout).toContain("dry-run")
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(true)
      expect(existsSync(wsYaml(cfgDir, "new-name"))).toBe(false)
    })
  })
})
