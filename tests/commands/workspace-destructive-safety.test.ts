import { afterEach, beforeEach, describe, expect, test } from "@test/api"
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

function wsYaml(configDir: string, wsName: string) {
  return join(configDir, "workspaces", `${wsName}.yml`)
}

function setupWorkspace(tmpDir: string, configDir: string, wsName = "safe-ws") {
  const branch = `feat/${wsName}`
  const repoName = `api-${wsName}`
  const repo = makeRepoWithRemote(tmpDir, repoName, branch)
  makeWorkspaceFixture(configDir, wsName, [
    { name: repoName, mainPath: repo.mainPath, taskPath: repo.taskPath },
  ], { branch, wsRoot: join(tmpDir, "workspaces") })
  return { branch, repo, wsName, yaml: wsYaml(configDir, wsName) }
}

describe("workspace destructive command safety", () => {
  let tmpDir: string
  let configDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-destructive-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-destructive")
    configDir = join(tmpDir, "config")
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  test("missing-entity destructive commands fail without mutating existing workspace files", () => {
    const existing = setupWorkspace(tmpDir, configDir, "existing-ws")
    const beforeYaml = readFileSync(existing.yaml, "utf8")

    for (const argv of [
      ["clean", "ghost-ws", "--force"],
      ["remove", "ghost-ws", "--force"],
      ["merge", "ghost-ws", "--force"],
    ]) {
      const result = runCli(argv, { baseDir: tmpDir, configDir })
      expect(result.exitCode, `${argv.join(" ")}\n${formatCliFailure(result)}`).toBe(1)
      expect(result.stderr).toContain("ghost-ws")
      expect(readFileSync(existing.yaml, "utf8")).toBe(beforeYaml)
      expect(existsSync(existing.repo.taskPath)).toBe(true)
    }
  })

  test("clean and remove dry-runs preserve workspace YAML and worktree", () => {
    const cleanTarget = setupWorkspace(tmpDir, configDir, "clean-dry")
    const removeTarget = setupWorkspace(tmpDir, configDir, "remove-dry")

    const clean = runCli(["clean", cleanTarget.wsName, "--dry-run"], { baseDir: tmpDir, configDir })
    const remove = runCli(["remove", removeTarget.wsName, "--dry-run"], { baseDir: tmpDir, configDir })

    expectSuccessful(clean)
    expectSuccessful(remove)
    expect(clean.stdout).toContain("[dry-run]")
    expect(remove.stdout).toContain("[dry-run]")
    expect(existsSync(cleanTarget.yaml)).toBe(true)
    expect(existsSync(cleanTarget.repo.taskPath)).toBe(true)
    expect(existsSync(removeTarget.yaml)).toBe(true)
    expect(existsSync(removeTarget.repo.taskPath)).toBe(true)
  })

  test("force variants mutate only the intended workspace state", () => {
    const removeTarget = setupWorkspace(tmpDir, configDir, "remove-force")
    const cleanTarget = setupWorkspace(tmpDir, configDir, "clean-force")
    const untouched = setupWorkspace(tmpDir, configDir, "untouched")

    expectSuccessful(runCli(["remove", removeTarget.wsName, "--force"], { baseDir: tmpDir, configDir }))
    expectSuccessful(runCli(["clean", cleanTarget.wsName, "--force"], { baseDir: tmpDir, configDir }))

    expect(existsSync(removeTarget.yaml)).toBe(false)
    expect(existsSync(removeTarget.repo.taskPath)).toBe(false)
    expect(existsSync(cleanTarget.yaml)).toBe(true)
    expect(existsSync(cleanTarget.repo.taskPath)).toBe(false)
    expect(existsSync(untouched.yaml)).toBe(true)
    expect(existsSync(untouched.repo.taskPath)).toBe(true)
  })

  test("merge dry-run preserves branch, worktree, and workspace YAML", () => {
    const fixture = setupWorkspace(tmpDir, configDir, "merge-dry")
    writeFileSync(join(fixture.repo.taskPath, "feature.txt"), "feature\n")
    execSync("git add . && git commit -m feature", gitExecOptions(fixture.repo.taskPath, tmpDir))

    const result = runCli(["merge", fixture.wsName, "--dry-run"], { baseDir: tmpDir, configDir })

    expectSuccessful(result)
    expect(result.stdout).toContain("[dry-run] would merge")
    expect(existsSync(fixture.yaml)).toBe(true)
    expect(existsSync(fixture.repo.taskPath)).toBe(true)
    const currentBranch = execSync("git branch --show-current", gitExecOptions(fixture.repo.taskPath, tmpDir)).toString().trim()
    expect(currentBranch).toBe(fixture.branch)
  })

  test("rename dry-run preserves existing workspace while force renames only the target", () => {
    const dryRun = setupWorkspace(tmpDir, configDir, "rename-dry")
    const force = setupWorkspace(tmpDir, configDir, "rename-force")
    const untouched = setupWorkspace(tmpDir, configDir, "rename-untouched")

    const dryResult = runCli(["rename", dryRun.wsName, "rename-dry-next", "--dry-run"], { baseDir: tmpDir, configDir })
    const forceResult = runCli(["rename", force.wsName, "rename-force-next", "--force"], { baseDir: tmpDir, configDir })

    expectSuccessful(dryResult)
    expectSuccessful(forceResult)
    expect(existsSync(dryRun.yaml)).toBe(true)
    expect(existsSync(wsYaml(configDir, "rename-dry-next"))).toBe(false)
    expect(existsSync(force.yaml)).toBe(false)
    expect(readFileSync(wsYaml(configDir, "rename-force-next"), "utf8")).toContain("name: rename-force-next")
    expect(existsSync(untouched.yaml)).toBe(true)
  })

  test("non-force destructive commands in non-interactive subprocesses prompt before mutation", () => {
    const cleanTarget = setupWorkspace(tmpDir, configDir, "clean-prompt")
    const removeTarget = setupWorkspace(tmpDir, configDir, "remove-prompt")
    const mergeTarget = setupWorkspace(tmpDir, configDir, "merge-prompt")
    const renameTarget = setupWorkspace(tmpDir, configDir, "rename-prompt")

    const results = [
      runCli(["clean", cleanTarget.wsName], { baseDir: tmpDir, configDir }),
      runCli(["remove", removeTarget.wsName], { baseDir: tmpDir, configDir }),
      runCli(["merge", mergeTarget.wsName], { baseDir: tmpDir, configDir }),
      runCli(["rename", renameTarget.wsName, "rename-prompt-next"], { baseDir: tmpDir, configDir }),
    ]

    for (const result of results) {
      expect(result.exitCode, formatCliFailure(result)).toBe(0)
      expect(result.stdout).toMatch(/Remove|Permanently remove|Merge and clean|Rename/)
    }
    expect(existsSync(cleanTarget.yaml)).toBe(true)
    expect(existsSync(cleanTarget.repo.taskPath)).toBe(true)
    expect(existsSync(removeTarget.yaml)).toBe(true)
    expect(existsSync(removeTarget.repo.taskPath)).toBe(true)
    expect(existsSync(mergeTarget.yaml)).toBe(true)
    expect(existsSync(mergeTarget.repo.taskPath)).toBe(true)
    expect(existsSync(renameTarget.yaml)).toBe(true)
    expect(existsSync(wsYaml(configDir, "rename-prompt-next"))).toBe(false)
  })
})
