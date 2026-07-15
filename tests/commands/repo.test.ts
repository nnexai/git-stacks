import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { execSync } from "child_process"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import {
  childPathWithPrependedBin,
  cleanup,
  createConfigFixture,
  formatCliFailure,
  gitExecOptions,
  makeTmpDir,
  runCli,
  writeExecutable,
} from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function registryYaml(configDir: string): string {
  return readFileSync(join(configDir, "registry.yml"), "utf8")
}

function initGitRepo(baseDir: string, name: string, branch = "main", remoteUrl?: string): string {
  const repoDir = join(baseDir, "repos", name)
  mkdirSync(repoDir, { recursive: true })
  execSync(`git init -b ${branch}`, gitExecOptions(repoDir, baseDir))
  writeFileSync(join(repoDir, "package.json"), `{"name":"${name}","type":"module"}\n`)
  execSync("git add package.json", gitExecOptions(repoDir, baseDir))
  execSync("git commit -m initial", gitExecOptions(repoDir, baseDir))
  if (remoteUrl) {
    execSync(`git remote add origin ${remoteUrl}`, gitExecOptions(repoDir, baseDir))
  }
  return repoDir
}

function setupForgeBin(baseDir: string, commands: string[]): string {
  const binDir = join(baseDir, "temp-bin")
  mkdirSync(binDir, { recursive: true })
  for (const command of commands) {
    writeExecutable(binDir, command, "#!/usr/bin/env sh\nexit 0\n")
  }
  return binDir
}

describe("repo registry subprocess contracts", () => {
  let baseDir: string
  let configDir: string

  beforeEach(() => {
    baseDir = makeTmpDir("repo-test")
    configDir = createConfigFixture(baseDir)
  })

  afterEach(() => {
    cleanup(baseDir)
  })

  test("current branch auto-detect with no enabled forge stores the checked-out branch", () => {
    const repoDir = initGitRepo(baseDir, "feature-repo", "feature/active", "git@github.com:example/feature-repo.git")
    const binDir = setupForgeBin(baseDir, ["gh", "glab"])

    const added = runCli(["repo", "add", repoDir, "--name", "feature-alias"], {
      baseDir,
      configDir,
      env: childPathWithPrependedBin(binDir),
    })

    expectSuccess(added)
    expect(added.stdout).toContain("Registered 'feature-alias'")
    expect(added.stdout).toContain("[feature/active]")
    expect(added.stdout).not.toContain("[forge:")

    const saved = registryYaml(configDir)
    expect(saved).toContain("name: feature-alias")
    expect(saved).toContain("default_branch: feature/active")
    expect(saved).not.toContain("forge:")
  })

  test("exact one enabled forge match persists github metadata", () => {
    const repoDir = initGitRepo(baseDir, "github-repo", "main", "git@github.com:example/github-repo.git")
    const binDir = setupForgeBin(baseDir, ["gh", "glab"])
    writeFileSync(
      join(configDir, "config.yml"),
      `workspace_root: ${join(baseDir, "ws-root")}
integrations:
  github:
    enabled: true
  gitlab:
    enabled: false
`
    )

    const added = runCli(["repo", "add", repoDir, "--name", "github-alias"], {
      baseDir,
      configDir,
      env: childPathWithPrependedBin(binDir),
    })

    expectSuccess(added)
    expect(added.stdout).toContain("Detected forge: github")
    expect(added.stdout).toContain("Registered 'github-alias'")
    expect(added.stdout).toContain("[forge: github]")

    const saved = registryYaml(configDir)
    expect(saved).toContain("name: github-alias")
    expect(saved).toContain("forge: github")
  })

  test("explicit --branch override wins over current branch", () => {
    const repoDir = initGitRepo(baseDir, "release-repo", "feature/source")

    const added = runCli(["repo", "add", repoDir, "--name", "release-alias", "--branch", "release/test"], {
      baseDir,
      configDir,
    })

    expectSuccess(added)
    expect(added.stdout).toContain("Registered 'release-alias'")
    expect(added.stdout).toContain("[release/test]")

    const saved = registryYaml(configDir)
    expect(saved).toContain("name: release-alias")
    expect(saved).toContain("default_branch: release/test")
    expect(saved).not.toContain("default_branch: feature/source")
  })

  test("dir repo skips forge detection and supports list show rename remove --force", () => {
    const dirRepo = join(baseDir, "dirs", "plain-dir")
    mkdirSync(dirRepo, { recursive: true })
    writeFileSync(join(dirRepo, "README.md"), "dir repo\n")
    const binDir = setupForgeBin(baseDir, ["gh", "glab"])

    const added = runCli(["repo", "add", dirRepo, "--name", "dir-alias"], {
      baseDir,
      configDir,
      env: childPathWithPrependedBin(binDir),
    })
    expectSuccess(added)
    expect(added.stdout).toContain("Registered 'dir-alias'")
    expect(added.stdout).toContain("[main]")
    expect(added.stdout).toContain("[dir]")
    expect(added.stdout).not.toContain("[forge:")

    const list = runCli(["repo", "list"], { baseDir, configDir })
    expectSuccess(list)
    expect(list.stdout).toContain("dir-alias")
    expect(list.stdout).toContain("[dir]")

    const show = runCli(["repo", "show", "dir-alias"], { baseDir, configDir })
    expectSuccess(show)
    expect(show.stdout).toContain("Name:           dir-alias")
    expect(show.stdout).toContain("Default branch: main")
    expect(show.stdout).toContain("Dir mode:       yes")

    const renamed = runCli(["repo", "rename", "dir-alias", "dir-renamed"], { baseDir, configDir })
    expectSuccess(renamed)
    expect(renamed.stdout).toContain("Renamed 'dir-alias'")
    expect(registryYaml(configDir)).toContain("name: dir-renamed")

    const removed = runCli(["repo", "remove", "dir-renamed", "--force"], { baseDir, configDir })
    expectSuccess(removed)
    expect(removed.stdout).toContain("Removed 'dir-renamed' from registry.")
    expect(registryYaml(configDir)).not.toContain("dir-renamed")
  }, 15000)
})
