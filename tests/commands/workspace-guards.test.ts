import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import {
  applyTestGitEnv,
  cleanup,
  formatCliFailure,
  makeGitRepo,
  makeRepoWithRemote,
  makeTmpDir,
  makeWorkspaceFixture,
  runCli,
} from "../helpers"

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function wsYaml(cfgDir: string, wsName: string) {
  return join(cfgDir, "workspaces", `${wsName}.yml`)
}

function setupWorktree(tmpDir: string, cfgDir: string, wsName = "guard-ws") {
  const repo = makeRepoWithRemote(tmpDir, "api", `feat/${wsName}`)
  makeWorkspaceFixture(cfgDir, wsName, [
    { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
  ], { wsRoot: join(tmpDir, "workspaces") })
  return { wsName, repo }
}

function setupMissingTaskPath(tmpDir: string, cfgDir: string, wsName = "missing-ws") {
  const mainPath = makeGitRepo(tmpDir, "api-main")
  const taskPath = join(tmpDir, "missing-task-path")
  makeWorkspaceFixture(cfgDir, wsName, [
    { name: "api", mainPath, taskPath },
  ], { wsRoot: join(tmpDir, "workspaces") })
  return { wsName, mainPath, taskPath }
}

function setupTrunk(tmpDir: string, cfgDir: string, wsName = "trunk-ws") {
  const mainPath = makeGitRepo(tmpDir, "api-trunk")
  makeWorkspaceFixture(cfgDir, wsName, [
    { name: "api", mode: "trunk", mainPath, taskPath: mainPath },
  ], { wsRoot: join(tmpDir, "workspaces") })
  return { wsName, mainPath }
}

describe("workspace guard CLI behavior", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-guards-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-guards")
    cfgDir = join(tmpDir, "config")
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  describe("dirty repo guards", () => {
    test("clean without --force does not remove a dirty worktree", () => {
      const { wsName, repo } = setupWorktree(tmpDir, cfgDir)
      writeFileSync(join(repo.taskPath, "dirty.txt"), "uncommitted")

      const result = runCli(["clean", wsName], { baseDir: tmpDir, configDir: cfgDir })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`Remove all worktrees for '${wsName}'`)
      expect(existsSync(repo.taskPath)).toBe(true)
    })

    test("clean --force overrides dirty check", () => {
      const { wsName, repo } = setupWorktree(tmpDir, cfgDir)
      writeFileSync(join(repo.taskPath, "dirty.txt"), "uncommitted")

      const result = runCli(["clean", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
      expect(existsSync(repo.taskPath)).toBe(false)
    })

    test("remove without --force does not remove a dirty workspace", () => {
      const { wsName, repo } = setupWorktree(tmpDir, cfgDir)
      writeFileSync(join(repo.taskPath, "dirty.txt"), "uncommitted")

      const result = runCli(["remove", wsName], { baseDir: tmpDir, configDir: cfgDir })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`Permanently remove workspace '${wsName}'`)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(true)
    })

    test("remove --force overrides dirty check", () => {
      const { wsName, repo } = setupWorktree(tmpDir, cfgDir)
      writeFileSync(join(repo.taskPath, "dirty.txt"), "uncommitted")

      const result = runCli(["remove", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(false)
    })
  })

  describe("missing task_path guards", () => {
    test("status handles missing task_path without crashing", () => {
      const { wsName } = setupMissingTaskPath(tmpDir, cfgDir)

      const result = runCli(["status", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0].repos[0]).toMatchObject({ name: "api", exists: false })
    })

    test("clean --force handles missing task_path gracefully", () => {
      const { wsName } = setupMissingTaskPath(tmpDir, cfgDir)

      const result = runCli(["clean", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(true)
    })

    test("remove --force handles missing task_path gracefully", () => {
      const { wsName } = setupMissingTaskPath(tmpDir, cfgDir)

      const result = runCli(["remove", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
      expect(existsSync(wsYaml(cfgDir, wsName))).toBe(false)
    })
  })

  describe("trunk repo behavior", () => {
    test("status shows trunk repo with mode trunk", () => {
      const { wsName } = setupTrunk(tmpDir, cfgDir)

      const result = runCli(["status", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0].repos[0]).toMatchObject({ name: "api", mode: "trunk" })
    })

    test("clean --force skips trunk-mode repos", () => {
      const { wsName, mainPath } = setupTrunk(tmpDir, cfgDir)

      const result = runCli(["clean", wsName, "--force"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
      expect(existsSync(mainPath)).toBe(true)
    })
  })

  describe("non-existent workspace guards", () => {
    beforeEach(() => {
      mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
      writeFileSync(join(cfgDir, "config.yml"), `workspace_root: ${join(tmpDir, "workspaces")}\n`)
      writeFileSync(join(cfgDir, "registry.yml"), "[]\n")
    })

    test("status for non-existent workspace returns error", () => {
      const result = runCli(["status", "ghost-ws", "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("ghost-ws")
    })

    test("close for non-existent workspace returns error", () => {
      const result = runCli(["close", "ghost-ws"], { baseDir: tmpDir, configDir: cfgDir })
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("ghost-ws")
    })

    test("remove for non-existent workspace returns error", () => {
      const result = runCli(["remove", "ghost-ws"], { baseDir: tmpDir, configDir: cfgDir })
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("ghost-ws")
    })
  })
})
