import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { writeFileSync } from "fs"
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

type RepoFixture = ReturnType<typeof makeRepoWithRemote>

type StatusRepo = {
  name: string
  ahead: number
  behind: number
}

type StatusWorkspace = {
  name: string
  repos: StatusRepo[]
}

function commitFile(repoPath: string, baseDir: string, fileName: string, content: string, message: string) {
  writeFileSync(join(repoPath, fileName), content)
  const opts = gitExecOptions(repoPath, baseDir)
  execSync("git add .", opts)
  execSync(`git commit -m ${JSON.stringify(message)}`, opts)
}

function setupWorkspace(
  tmpDir: string,
  repos: Array<{ fixture: RepoFixture; name: string }>,
  wsName = "fetch-ws"
): { cfgDir: string; wsName: string } {
  const cfgDir = join(tmpDir, "config")
  makeWorkspaceFixture(cfgDir, wsName, repos.map(({ fixture, name }) => ({
    name,
    mainPath: fixture.mainPath,
    taskPath: fixture.taskPath,
  })), { branch: `feat/${wsName}` })
  return { cfgDir, wsName }
}

function runStatus(tmpDir: string, cfgDir: string, wsName: string, fetch = false) {
  const args = ["status", wsName, "--json"]
  if (fetch) args.push("--fetch")
  return runCli(args, { baseDir: tmpDir, configDir: cfgDir })
}

function expectOk(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function parseStatus(stdout: string): StatusWorkspace {
  const parsed = JSON.parse(stdout.slice(stdout.indexOf("[")).trim()) as StatusWorkspace[]
  return parsed[0]
}

function pushRemoteMainCommit(fixture: RepoFixture, baseDir: string, fileName: string, message: string) {
  const peerPath = join(baseDir, `peer-${fileName.replace(/[^a-z0-9]/gi, "-")}`)
  execSync(`git clone ${fixture.originDir} ${peerPath}`, gitExecOptions(baseDir, baseDir))
  commitFile(peerPath, baseDir, fileName, `${message}\n`, message)
  execSync("git push origin main", gitExecOptions(peerPath, baseDir))
}

describe("workspace status --fetch", () => {
  let tmpDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    tmpDir = makeTmpDir("workspace-status-fetch")
    restoreGitEnv = applyTestGitEnv(tmpDir)
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(tmpDir)
  })

  test("status --fetch updates behind count after remote gets new commits", () => {
    const fixture = makeRepoWithRemote(tmpDir, "api", "feat/fetch-ws")
    const { cfgDir, wsName } = setupWorkspace(tmpDir, [{ fixture, name: "api" }])
    const initial = runStatus(tmpDir, cfgDir, wsName)
    expectOk(initial)
    expect(parseStatus(initial.stdout).repos[0].behind).toBe(0)

    pushRemoteMainCommit(fixture, tmpDir, "remote-behind.txt", "remote behind update")
    const refreshed = runStatus(tmpDir, cfgDir, wsName, true)

    expectOk(refreshed)
    expect(refreshed.stdout).toContain("Fetching origin")
    expect(parseStatus(refreshed.stdout).repos[0].behind).toBe(1)
  })

  test("status without --fetch leaves behind count stale until refs are fetched", () => {
    const fixture = makeRepoWithRemote(tmpDir, "api", "feat/fetch-ws")
    const { cfgDir, wsName } = setupWorkspace(tmpDir, [{ fixture, name: "api" }])
    pushRemoteMainCommit(fixture, tmpDir, "stale-behind.txt", "stale behind update")

    const stale = runStatus(tmpDir, cfgDir, wsName)
    expectOk(stale)
    expect(parseStatus(stale.stdout).repos[0].behind).toBe(0)

    const refreshed = runStatus(tmpDir, cfgDir, wsName, true)
    expectOk(refreshed)
    expect(parseStatus(refreshed.stdout).repos[0].behind).toBe(1)
  })

  test("status --fetch succeeds when remote has no changes", () => {
    const fixture = makeRepoWithRemote(tmpDir, "api", "feat/fetch-ws")
    const { cfgDir, wsName } = setupWorkspace(tmpDir, [{ fixture, name: "api" }])

    const result = runStatus(tmpDir, cfgDir, wsName, true)

    expectOk(result)
    const repo = parseStatus(result.stdout).repos[0]
    expect(repo.ahead).toBe(0)
    expect(repo.behind).toBe(0)
  })

  test("status --fetch reports local unpushed commits as ahead", () => {
    const fixture = makeRepoWithRemote(tmpDir, "api", "feat/fetch-ws")
    const { cfgDir, wsName } = setupWorkspace(tmpDir, [{ fixture, name: "api" }])
    commitFile(fixture.taskPath, tmpDir, "local-ahead.txt", "ahead\n", "local ahead update")

    const result = runStatus(tmpDir, cfgDir, wsName, true)

    expectOk(result)
    const repo = parseStatus(result.stdout).repos[0]
    expect(repo.ahead).toBe(1)
    expect(repo.behind).toBe(0)
  })

  test("status --fetch handles multiple repos with different behind counts", () => {
    const api = makeRepoWithRemote(tmpDir, "api", "feat/fetch-ws")
    const web = makeRepoWithRemote(tmpDir, "web", "feat/fetch-ws")
    const { cfgDir, wsName } = setupWorkspace(tmpDir, [
      { fixture: api, name: "api" },
      { fixture: web, name: "web" },
    ])
    pushRemoteMainCommit(api, tmpDir, "api-remote.txt", "api remote update")

    const result = runStatus(tmpDir, cfgDir, wsName, true)

    expectOk(result)
    const repos = parseStatus(result.stdout).repos
    const apiStatus = repos.find(repo => repo.name === "api")
    const webStatus = repos.find(repo => repo.name === "web")
    expect(apiStatus?.behind).toBe(1)
    expect(webStatus?.behind).toBe(0)
  })
})
