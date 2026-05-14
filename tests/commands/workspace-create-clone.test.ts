import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import {
  applyTestGitEnv,
  cleanup,
  formatCliFailure,
  gitExecOptions,
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

function readWorkspaceYaml(cfgDir: string, wsName: string): string {
  return readFileSync(join(cfgDir, "workspaces", `${wsName}.yml`), "utf8")
}

describe("workspace create/clone side-effect fixtures", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-create-clone-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-create-clone")
    cfgDir = join(tmpDir, "config")
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  describe("create side effects", () => {
    test("workspace YAML contains correct schema_version, name, branch, repos", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/test-ws")
      makeWorkspaceFixture(cfgDir, "test-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ])

      const yaml = readWorkspaceYaml(cfgDir, "test-ws")

      expect(yaml).toContain('schema_version: "1"')
      expect(yaml).toContain("name: test-ws")
      expect(yaml).toContain("branch: feat/test-ws")
      expect(yaml).toContain("repos:")
      expect(yaml).toContain("  - name: api")
      expect(yaml).toContain(`    main_path: ${repo.mainPath}`)
      expect(yaml).toContain(`    task_path: ${repo.taskPath}`)
      expect(yaml).toContain("    base_branch: main")
    })

    test("task_path points to real worktree directory on disk", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/test-ws")
      makeWorkspaceFixture(cfgDir, "test-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ])

      expect(existsSync(repo.taskPath), `missing worktree task path: ${repo.taskPath}`).toBe(true)
      expect(existsSync(join(repo.taskPath, ".git")), `missing worktree .git marker: ${repo.taskPath}`).toBe(true)
    })

    test("main_path points to real clone directory", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/test-ws")
      makeWorkspaceFixture(cfgDir, "test-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ])

      expect(existsSync(repo.mainPath), `missing clone path: ${repo.mainPath}`).toBe(true)
      expect(existsSync(join(repo.mainPath, ".git")), `missing clone .git dir: ${repo.mainPath}`).toBe(true)
    })

    test("workspace branch starts from correct base branch", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/test-ws")
      makeWorkspaceFixture(cfgDir, "test-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ])

      const subjects = execSync("git log --oneline --format=%s", gitExecOptions(repo.taskPath, tmpDir)).toString()
      expect(subjects, `git log for ${repo.taskPath}`).toContain("init")
    })

    test("status command reads pre-built workspace correctly", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/test-ws")
      makeWorkspaceFixture(cfgDir, "test-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ])

      const result = runCli(["status", "test-ws", "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0]).toMatchObject({ name: "test-ws", branch: "feat/test-ws" })
      expect(parsed[0].repos[0]).toMatchObject({
        name: "api",
        mode: "worktree",
        dirty: false,
        task_path: repo.taskPath,
      })
    })

    test("list command shows pre-built workspace", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/test-ws")
      makeWorkspaceFixture(cfgDir, "test-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ])

      const result = runCli(["list"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)
      expect(result.stdout).toContain("test-ws")
    })
  })

  describe("clone side effects", () => {
    test("cloned workspace has distinct branch name but same repo structure", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/ws-1")
      const cloneTaskPath = join(tmpDir, "task-api-ws-2")
      execSync("git worktree add ../task-api-ws-2 -b feat/ws-2", gitExecOptions(repo.mainPath, tmpDir))

      makeWorkspaceFixture(cfgDir, "ws-1", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ], { branch: "feat/ws-1" })
      makeWorkspaceFixture(cfgDir, "ws-2", [
        { name: "api", mainPath: repo.mainPath, taskPath: cloneTaskPath },
      ], { branch: "feat/ws-2" })

      const result = runCli(["list", "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed.map((ws: { name: string }) => ws.name).sort()).toEqual(["ws-1", "ws-2"])
      expect(parsed.find((ws: { name: string }) => ws.name === "ws-1")?.branch).toBe("feat/ws-1")
      expect(parsed.find((ws: { name: string }) => ws.name === "ws-2")?.branch).toBe("feat/ws-2")
    })

    test("cloned workspace task_path is distinct from original", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/ws-1")
      const cloneTaskPath = join(tmpDir, "task-api-ws-2")
      execSync("git worktree add ../task-api-ws-2 -b feat/ws-2", gitExecOptions(repo.mainPath, tmpDir))

      makeWorkspaceFixture(cfgDir, "ws-1", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ], { branch: "feat/ws-1" })
      makeWorkspaceFixture(cfgDir, "ws-2", [
        { name: "api", mainPath: repo.mainPath, taskPath: cloneTaskPath },
      ], { branch: "feat/ws-2" })

      const originalYaml = readWorkspaceYaml(cfgDir, "ws-1")
      const cloneYaml = readWorkspaceYaml(cfgDir, "ws-2")

      expect(originalYaml).toContain(`task_path: ${repo.taskPath}`)
      expect(cloneYaml).toContain(`task_path: ${cloneTaskPath}`)
      expect(repo.taskPath).not.toBe(cloneTaskPath)
    })
  })

  describe("worktree vs trunk mode", () => {
    test("trunk mode repo references main_path directly as task_path", () => {
      const mainPath = makeGitRepo(tmpDir, "api-trunk")
      makeWorkspaceFixture(cfgDir, "trunk-ws", [
        { name: "api", mode: "trunk", mainPath, taskPath: mainPath },
      ])

      const result = runCli(["status", "trunk-ws", "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed[0].repos[0]).toMatchObject({
        name: "api",
        mode: "trunk",
        task_path: mainPath,
      })
    })

    test("worktree mode repo has separate task_path and main_path", () => {
      const repo = makeRepoWithRemote(tmpDir, "api", "feat/test-ws")
      makeWorkspaceFixture(cfgDir, "test-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ])

      const yaml = readWorkspaceYaml(cfgDir, "test-ws")
      const result = runCli(["status", "test-ws", "--json"], { baseDir: tmpDir, configDir: cfgDir })
      expectSuccessful(result)

      const parsed = JSON.parse(result.stdout.trim())
      expect(repo.taskPath).not.toBe(repo.mainPath)
      expect(yaml).toContain(`main_path: ${repo.mainPath}`)
      expect(yaml).toContain(`task_path: ${repo.taskPath}`)
      expect(parsed[0].repos[0]).toMatchObject({
        mode: "worktree",
        task_path: repo.taskPath,
      })
    })
  })
})
