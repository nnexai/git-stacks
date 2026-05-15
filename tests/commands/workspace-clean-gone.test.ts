import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import {
  applyTestGitEnv,
  cleanup,
  formatCliFailure,
  gitExecOptions,
  makeRepoWithRemote,
  makeTmpDir,
  makeWorkspaceFixture,
  runCli,
} from "../helpers"

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function workspaceYaml(configDir: string, name: string) {
  return join(configDir, "workspaces", `${name}.yml`)
}

function setupWorkspace(tmpDir: string, configDir: string, wsName: string, repoName: string, pushBranch: boolean) {
  const branch = `feat/${wsName}`
  const repo = makeRepoWithRemote(tmpDir, repoName, branch)
  if (pushBranch) {
    execSync(`git push -u origin ${branch}`, gitExecOptions(repo.taskPath, tmpDir))
  }
  makeWorkspaceFixture(configDir, wsName, [
    { name: repoName, mainPath: repo.mainPath, taskPath: repo.taskPath },
  ], { branch, wsRoot: join(tmpDir, "workspaces") })
  return { branch, repo, yaml: workspaceYaml(configDir, wsName), wsName }
}

describe("workspace clean --gone", () => {
  let tmpDir: string
  let configDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-clean-gone-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-clean-gone")
    configDir = join(tmpDir, "config")
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  test("detects gone upstream branches using local bare remotes", () => {
    const gone = setupWorkspace(tmpDir, configDir, "gone-ws", "api", false)
    const active = setupWorkspace(tmpDir, configDir, "active-ws", "web", true)

    const result = runCli(["clean", "--gone", "--dry-run"], { baseDir: tmpDir, configDir })

    expectSuccessful(result)
    expect(result.stdout).toContain("Gone workspaces:")
    expect(result.stdout).toContain(gone.wsName)
    expect(result.stdout).not.toContain(active.wsName)
  })

  test("clean --gone --dry-run reports cleanup without deleting YAML or worktrees", () => {
    const gone = setupWorkspace(tmpDir, configDir, "gone-ws", "api", false)
    const beforeYaml = readFileSync(gone.yaml, "utf8")

    const result = runCli(["clean", "--gone", "--dry-run"], { baseDir: tmpDir, configDir })

    expectSuccessful(result)
    expect(result.stdout).toContain("[dry-run]")
    expect(result.stdout).toContain("would remove")
    expect(readFileSync(gone.yaml, "utf8")).toBe(beforeYaml)
    expect(existsSync(gone.yaml)).toBe(true)
    expect(existsSync(gone.repo.taskPath)).toBe(true)
  })

  test("dirty gone worktrees fail before deleting YAML or worktrees", () => {
    const gone = setupWorkspace(tmpDir, configDir, "dirty-gone", "api", false)
    writeFileSync(join(gone.repo.taskPath, "dirty.txt"), "dirty\n")
    const beforeYaml = readFileSync(gone.yaml, "utf8")

    const result = runCli(["clean", "--gone"], { baseDir: tmpDir, configDir })

    expect(result.exitCode, formatCliFailure(result)).toBe(1)
    expect(result.stderr).toContain("Dirty worktrees found")
    expect(result.stderr).toContain(gone.wsName)
    expect(readFileSync(gone.yaml, "utf8")).toBe(beforeYaml)
    expect(existsSync(gone.repo.taskPath)).toBe(true)
  })

  test("clean --gone --force removes multiple gone workspaces and leaves active workspaces intact", () => {
    const firstGone = setupWorkspace(tmpDir, configDir, "gone-one", "api", false)
    const secondGone = setupWorkspace(tmpDir, configDir, "gone-two", "web", false)
    const active = setupWorkspace(tmpDir, configDir, "active-ws", "docs", true)

    const result = runCli(["clean", "--gone", "--force"], { baseDir: tmpDir, configDir })

    expectSuccessful(result)
    expect(result.stdout).toContain("removed  gone-one")
    expect(result.stdout).toContain("removed  gone-two")
    expect(existsSync(firstGone.yaml)).toBe(false)
    expect(existsSync(secondGone.yaml)).toBe(false)
    expect(existsSync(firstGone.repo.taskPath)).toBe(false)
    expect(existsSync(secondGone.repo.taskPath)).toBe(false)
    expect(existsSync(active.yaml)).toBe(true)
    expect(existsSync(active.repo.taskPath)).toBe(true)
  })
})
