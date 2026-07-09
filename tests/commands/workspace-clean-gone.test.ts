import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import {
  applyTestGitEnv,
  childPathWithPrependedBin,
  cleanup,
  formatCliFailure,
  gitExecOptions,
  makeRepoWithRemote,
  makeTmpDir,
  makeWorkspaceFixture,
  runCli,
  writeExecutable,
} from "../helpers"

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function workspaceYaml(configDir: string, name: string) {
  return join(configDir, "workspaces", `${name}.yml`)
}

function setupWorkspace(tmpDir: string, configDir: string, wsName: string, repoName: string, pushBranch: boolean) {
  const fixture = setupWorkspaceWithRepos(tmpDir, configDir, wsName, [
    { name: repoName, pushBranch },
  ])
  return { ...fixture, repo: fixture.repos[0].repo }
}

function setupWorkspaceWithRepos(
  tmpDir: string,
  configDir: string,
  wsName: string,
  repoSpecs: Array<{ name: string; pushBranch?: boolean; mode?: "worktree" | "trunk" }>
) {
  const branch = `feat/${wsName}`
  const repos = repoSpecs.map((spec) => {
    const repo = makeRepoWithRemote(tmpDir, spec.name, branch)
    if (spec.pushBranch) {
      execSync(`git push -u origin ${branch}`, gitExecOptions(repo.taskPath, tmpDir))
    }
    return { ...spec, repo }
  })
  makeWorkspaceFixture(configDir, wsName, repos.map(({ name, mode, repo }) => ({
    name,
    mode: mode ?? "worktree",
    mainPath: repo.mainPath,
    taskPath: mode === "trunk" ? undefined : repo.taskPath,
  })), { branch, wsRoot: join(tmpDir, "workspaces") })
  return { branch, repos, yaml: workspaceYaml(configDir, wsName), wsName }
}

function countingGitEnv(tmpDir: string, counterPath: string): Record<string, string> {
  const binDir = join(tmpDir, "counting-git-bin")
  const realGit = execSync("command -v git").toString().trim()
  writeExecutable(
    binDir,
    "git",
    [
      "#!/bin/sh",
      'case " $* " in',
      `  *" ls-remote "*) printf 'ls-remote\\n' >> ${JSON.stringify(counterPath)} ;;`,
      "esac",
      `exec ${JSON.stringify(realGit)} "$@"`,
      "",
    ].join("\n")
  )
  return childPathWithPrependedBin(binDir)
}

function countLines(path: string): number {
  if (!existsSync(path)) return 0
  return readFileSync(path, "utf8").split("\n").filter(Boolean).length
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

  test("keeps a workspace when any unique worktree remote still has the branch", () => {
    const mixed = setupWorkspaceWithRepos(tmpDir, configDir, "mixed-ws", [
      { name: "missing-api" },
      { name: "present-web", pushBranch: true },
    ])

    const result = runCli(["clean", "--gone", "--dry-run"], { baseDir: tmpDir, configDir })

    expectSuccessful(result)
    expect(result.stdout).toContain("No gone workspaces found.")
    expect(result.stdout).not.toContain(mixed.wsName)
    expect(existsSync(mixed.yaml)).toBe(true)
  })

  test("marks a workspace gone only when every unique worktree remote is missing", () => {
    const gone = setupWorkspaceWithRepos(tmpDir, configDir, "all-missing", [
      { name: "api" },
      { name: "web" },
    ])
    const counterPath = join(tmpDir, "all-missing-ls-remote.log")

    const result = runCli(["clean", "--gone", "--dry-run"], {
      baseDir: tmpDir,
      configDir,
      env: countingGitEnv(tmpDir, counterPath),
    })

    expectSuccessful(result)
    expect(result.stdout).toContain("Gone workspaces:")
    expect(result.stdout).toContain(gone.wsName)
    expect(countLines(counterPath)).toBe(2)
  })

  test("workspaces with zero worktree repos are ineligible without remote queries", () => {
    const trunkOnly = setupWorkspaceWithRepos(tmpDir, configDir, "trunk-only", [
      { name: "api", mode: "trunk", pushBranch: true },
    ])
    const counterPath = join(tmpDir, "zero-worktree-ls-remote.log")

    const result = runCli(["clean", "--gone", "--dry-run"], {
      baseDir: tmpDir,
      configDir,
      env: countingGitEnv(tmpDir, counterPath),
    })

    expectSuccessful(result)
    expect(result.stdout).toContain("No gone workspaces found.")
    expect(result.stdout).not.toContain(trunkOnly.wsName)
    expect(countLines(counterPath)).toBe(0)
  })

  test("deduplicates repeated worktree entries by canonical common Git directory", () => {
    const wsName = "deduped-ws"
    const branch = `feat/${wsName}`
    const repo = makeRepoWithRemote(tmpDir, "api", branch)
    makeWorkspaceFixture(configDir, wsName, [
      { name: "api-main", mainPath: repo.mainPath, taskPath: repo.taskPath },
      { name: "api-worktree-alias", mainPath: repo.taskPath, taskPath: repo.taskPath },
    ], { branch, wsRoot: join(tmpDir, "workspaces") })
    const counterPath = join(tmpDir, "dedupe-ls-remote.log")

    const result = runCli(["clean", "--gone", "--dry-run"], {
      baseDir: tmpDir,
      configDir,
      env: countingGitEnv(tmpDir, counterPath),
    })

    expectSuccessful(result)
    expect(result.stdout).toContain(wsName)
    expect(countLines(counterPath)).toBe(1)
  })

  test("unresolvable Git identities make the command indeterminate", () => {
    const wsName = "unresolvable-ws"
    const missingRepo = join(tmpDir, "missing-repo")
    makeWorkspaceFixture(configDir, wsName, [
      { name: "broken-api", mainPath: missingRepo, taskPath: missingRepo },
    ], { branch: `feat/${wsName}`, wsRoot: join(tmpDir, "workspaces") })
    const yaml = workspaceYaml(configDir, wsName)

    const result = runCli(["clean", "--gone", "--force"], { baseDir: tmpDir, configDir })

    expect(result.exitCode, formatCliFailure(result)).toBe(1)
    expect(result.stderr).toContain("Cannot determine remote branch status")
    expect(result.stderr).toContain(wsName)
    expect(result.stderr).toContain("broken-api")
    expect(existsSync(yaml)).toBe(true)
  })

  test("one indeterminate workspace aborts all removals after the complete scan", () => {
    const definitelyGone = setupWorkspace(tmpDir, configDir, "definitely-gone", "gone-api", false)
    const indeterminate = setupWorkspace(tmpDir, configDir, "indeterminate", "broken-origin", false)
    execSync(
      "git remote set-url origin /nonexistent/remote/that/cannot-be-opened",
      gitExecOptions(indeterminate.repo.mainPath, tmpDir)
    )
    writeFileSync(join(definitelyGone.repo.taskPath, "dirty.txt"), "dirty\n")
    const counterPath = join(tmpDir, "fail-closed-ls-remote.log")

    const result = runCli(["clean", "--gone"], {
      baseDir: tmpDir,
      configDir,
      env: countingGitEnv(tmpDir, counterPath),
    })

    expect(result.exitCode, formatCliFailure(result)).toBe(1)
    expect(result.stderr).toContain("Cannot determine remote branch status")
    expect(result.stderr).toContain(indeterminate.wsName)
    expect(result.stderr).toContain("broken-origin")
    expect(result.stderr).toContain("/nonexistent/remote/that/cannot-be-opened")
    expect(result.stderr).not.toContain("Dirty worktrees found")
    expect(countLines(counterPath)).toBe(2)
    expect(existsSync(definitelyGone.yaml)).toBe(true)
    expect(existsSync(definitelyGone.repo.taskPath)).toBe(true)
    expect(existsSync(indeterminate.yaml)).toBe(true)
    expect(existsSync(indeterminate.repo.taskPath)).toBe(true)
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
