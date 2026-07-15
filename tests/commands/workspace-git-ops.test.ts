import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { existsSync, writeFileSync } from "fs"
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

type RepoFixture = ReturnType<typeof makeRepoWithRemote>

function commitFile(repoPath: string, baseDir: string, fileName: string, content: string, message: string) {
  writeFileSync(join(repoPath, fileName), content)
  const opts = gitExecOptions(repoPath, baseDir)
  execSync("git add .", opts)
  execSync(`git commit -m ${JSON.stringify(message)}`, opts)
}

function setupWorkspace(
  tmpDir: string,
  wsName = "test-ws",
  repoName = "api"
): RepoFixture & { cfgDir: string; wsName: string; branch: string; wsYaml: string } {
  const cfgDir = join(tmpDir, "config")
  const branch = `feat/${wsName}`
  const repo = makeRepoWithRemote(tmpDir, repoName, branch)
  const wsYaml = join(cfgDir, "workspaces", `${wsName}.yml`)

  makeWorkspaceFixture(cfgDir, wsName, [
    {
      name: repoName,
      mainPath: repo.mainPath,
      taskPath: repo.taskPath,
    },
  ], { branch })

  return { ...repo, cfgDir, wsName, branch, wsYaml }
}

function runWorkspaceCli(tmpDir: string, cfgDir: string, argv: string[]) {
  return runCli(argv, { baseDir: tmpDir, configDir: cfgDir })
}

function expectOk(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout.slice(stdout.indexOf("{")).trim()) as T
}

function parseJsonArray<T>(stdout: string): T {
  return JSON.parse(stdout.slice(stdout.indexOf("[")).trim()) as T
}

function pushMainCommit(fixture: RepoFixture, baseDir: string, fileName: string, message: string) {
  execSync("git checkout main", gitExecOptions(fixture.mainPath, baseDir))
  commitFile(fixture.mainPath, baseDir, fileName, `${message}\n`, message)
  execSync("git push origin main", gitExecOptions(fixture.mainPath, baseDir))
}

function cloneAndPushBranchCommit(
  fixture: RepoFixture,
  baseDir: string,
  branch: string,
  fileName: string,
  message: string
) {
  const peerPath = join(baseDir, `peer-${fileName.replace(/[^a-z0-9]/gi, "-")}`)
  execSync(`git clone ${fixture.originDir} ${peerPath}`, gitExecOptions(baseDir, baseDir))
  const opts = gitExecOptions(peerPath, baseDir)
  execSync(`git checkout ${branch}`, opts)
  commitFile(peerPath, baseDir, fileName, `${message}\n`, message)
  execSync(`git push origin ${branch}`, opts)
}

describe("workspace git operations against bare remotes", () => {
  let tmpDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    tmpDir = makeTmpDir("workspace-git-ops")
    restoreGitEnv = applyTestGitEnv(tmpDir)
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(tmpDir)
  })

  describe("sync", () => {
    test("sync detects up-to-date when no new commits exist on base", () => {
      const fixture = setupWorkspace(tmpDir)
      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["sync", fixture.wsName, "--json"])

      expectOk(result)
      const parsed = parseJson<{ ok: boolean; repos: Array<{ name: string; result: string; commits_behind_before: number }> }>(result.stdout)
      expect(parsed.ok).toBe(true)
      expect(parsed.repos).toContainEqual(expect.objectContaining({
        name: "api",
        result: "up-to-date",
        commits_behind_before: 0,
      }))
    })

    test("sync rebases workspace branch when base has new commits", () => {
      const fixture = setupWorkspace(tmpDir)
      pushMainCommit(fixture, tmpDir, "base-sync.txt", "base sync update")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["sync", fixture.wsName, "--json"])

      expectOk(result)
      const parsed = parseJson<{ repos: Array<{ name: string; result: string; commits_behind_before: number }> }>(result.stdout)
      expect(parsed.repos).toContainEqual(expect.objectContaining({
        name: "api",
        result: "rebased",
        commits_behind_before: 1,
      }))
      const log = execSync("git log --oneline -1", gitExecOptions(fixture.taskPath, tmpDir)).toString()
      expect(log).toContain("base sync update")
    })

    test("sync --all --json covers every workspace", () => {
      const first = setupWorkspace(tmpDir, "ws-one", "api")
      setupWorkspace(tmpDir, "ws-two", "web")

      const result = runWorkspaceCli(tmpDir, first.cfgDir, ["sync", "--all", "--json"])

      expectOk(result)
      const parsed = parseJsonArray<Array<{ workspace: string; ok: boolean }>>(result.stdout)
      expect(parsed.map(item => item.workspace).sort()).toEqual(["ws-one", "ws-two"])
      expect(parsed.every(item => item.ok)).toBe(true)
    })
  })

  describe("push", () => {
    test("push sends workspace branch to origin", () => {
      const fixture = setupWorkspace(tmpDir)
      commitFile(fixture.taskPath, tmpDir, "feature.txt", "feature\n", "feature commit")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["push", fixture.wsName, "--set-upstream", "--json"])

      expectOk(result)
      const parsed = parseJson<{ ok: boolean; repos: Array<{ name: string; status: string; commits: number }> }>(result.stdout)
      expect(parsed.ok).toBe(true)
      expect(parsed.repos).toContainEqual(expect.objectContaining({
        name: "api",
        status: "pushed",
      }))
      expect(parsed.repos[0].commits).toBeGreaterThanOrEqual(0)
      const remoteBranch = execSync(`git --git-dir=${fixture.originDir} rev-parse ${fixture.branch}`, gitExecOptions(tmpDir, tmpDir)).toString().trim()
      expect(remoteBranch.length).toBeGreaterThan(0)
      const remoteLog = execSync(`git --git-dir=${fixture.originDir} log --oneline ${fixture.branch} -1`, gitExecOptions(tmpDir, tmpDir)).toString()
      expect(remoteLog).toContain("feature commit")
    })

    test("push reports up-to-date when there are no new commits", () => {
      const fixture = setupWorkspace(tmpDir)
      execSync(`git push -u origin ${fixture.branch}`, gitExecOptions(fixture.taskPath, tmpDir))

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["push", fixture.wsName, "--json"])

      expectOk(result)
      const parsed = parseJson<{ repos: Array<{ name: string; status: string; commits: number }> }>(result.stdout)
      expect(parsed.repos).toContainEqual(expect.objectContaining({
        name: "api",
        status: "pushed",
        commits: 0,
      }))
    })

    test("push fails gracefully when remote is not configured", () => {
      const cfgDir = join(tmpDir, "config")
      const mainPath = makeGitRepo(tmpDir, "local-main")
      const taskPath = join(tmpDir, "local-task")
      execSync(`git worktree add ${taskPath} -b feat/no-remote`, gitExecOptions(mainPath, tmpDir))
      makeWorkspaceFixture(cfgDir, "no-remote", [
        { name: "api", mainPath, taskPath },
      ], { branch: "feat/no-remote" })

      const result = runWorkspaceCli(tmpDir, cfgDir, ["push", "no-remote", "--json"])

      expect(result.exitCode).toBe(1)
      const parsed = parseJson<{ ok: boolean; repos: Array<{ status: string; reason: string }> }>(result.stdout)
      expect(parsed.ok).toBe(false)
      expect(parsed.repos).toContainEqual(expect.objectContaining({
        status: "failed",
        reason: "network error",
      }))
    })
  })

  describe("pull", () => {
    test("pull fast-forwards workspace branch from remote", () => {
      const fixture = setupWorkspace(tmpDir)
      execSync(`git push -u origin ${fixture.branch}`, gitExecOptions(fixture.taskPath, tmpDir))
      cloneAndPushBranchCommit(fixture, tmpDir, fixture.branch, "peer.txt", "peer update")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["pull", fixture.wsName])

      expectOk(result)
      expect(result.stdout).toContain("pulled")
      const log = execSync("git log --oneline -1", gitExecOptions(fixture.taskPath, tmpDir)).toString()
      expect(log).toContain("peer update")
    })

    test("pull reports missing remote branch failures", () => {
      const fixture = setupWorkspace(tmpDir)

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["pull", fixture.wsName])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("no remote branch")
    })
  })

  describe("merge", () => {
    test("merge integrates workspace branch into base and removes workspace files", () => {
      const fixture = setupWorkspace(tmpDir)
      commitFile(fixture.taskPath, tmpDir, "merge-me.txt", "merge me\n", "merge feature")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["merge", fixture.wsName, "--force"])

      expectOk(result)
      const log = execSync("git log --oneline main", gitExecOptions(fixture.mainPath, tmpDir)).toString()
      expect(log).toContain("merge feature")
      expect(existsSync(fixture.wsYaml)).toBe(false)
      expect(existsSync(fixture.taskPath)).toBe(false)
    })

    test("merge --dry-run previews without removing the worktree", () => {
      const fixture = setupWorkspace(tmpDir)
      commitFile(fixture.taskPath, tmpDir, "dry-run.txt", "dry run\n", "dry run feature")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["merge", fixture.wsName, "--dry-run"])

      expectOk(result)
      expect(result.stdout).toContain("[dry-run] would merge")
      expect(existsSync(fixture.wsYaml)).toBe(true)
      expect(existsSync(fixture.taskPath)).toBe(true)
    })

    test("merge prompts instead of mutating without --force in non-interactive runs", () => {
      const fixture = setupWorkspace(tmpDir)
      writeFileSync(join(fixture.taskPath, "dirty.txt"), "dirty\n")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["merge", fixture.wsName])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Merge and clean workspace")
      expect(existsSync(fixture.wsYaml)).toBe(true)
      expect(existsSync(fixture.taskPath)).toBe(true)
    })

    test("merge --force overrides dirty worktree guard", () => {
      const fixture = setupWorkspace(tmpDir)
      writeFileSync(join(fixture.taskPath, "dirty.txt"), "dirty\n")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["merge", fixture.wsName, "--force"])

      expectOk(result)
      expect(existsSync(fixture.wsYaml)).toBe(false)
      expect(existsSync(fixture.taskPath)).toBe(false)
    })
  })

  describe("sync guards", () => {
    test("sync handles missing origin gracefully", () => {
      const cfgDir = join(tmpDir, "config")
      const mainPath = makeGitRepo(tmpDir, "sync-local-main")
      const taskPath = join(tmpDir, "sync-local-task")
      execSync(`git worktree add ${taskPath} -b feat/sync-no-origin`, gitExecOptions(mainPath, tmpDir))
      makeWorkspaceFixture(cfgDir, "sync-no-origin", [
        { name: "api", mainPath, taskPath },
      ], { branch: "feat/sync-no-origin" })

      const result = runWorkspaceCli(tmpDir, cfgDir, ["sync", "sync-no-origin", "--json"])

      expect(result.exitCode).toBe(1)
      const parsed = parseJson<{ ok: boolean; repos: Array<{ result: string; error: string }> }>(result.stdout)
      expect(parsed.ok).toBe(false)
      expect(parsed.repos).toContainEqual(expect.objectContaining({
        result: "failed",
        error: "fetch failed",
      }))
    })

    test("pull skips dirty repos without changing local files", () => {
      const fixture = setupWorkspace(tmpDir)
      execSync(`git push -u origin ${fixture.branch}`, gitExecOptions(fixture.taskPath, tmpDir))
      cloneAndPushBranchCommit(fixture, tmpDir, fixture.branch, "dirty-peer.txt", "dirty peer update")
      writeFileSync(join(fixture.taskPath, "dirty-local.txt"), "dirty\n")

      const result = runWorkspaceCli(tmpDir, fixture.cfgDir, ["pull", fixture.wsName])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("dirty")
      const log = execSync("git log --oneline -1", gitExecOptions(fixture.taskPath, tmpDir)).toString()
      expect(log).not.toContain("dirty peer update")
    })

    test("pull updates trunk repos against their base branch", () => {
      const fixture = makeRepoWithRemote(tmpDir, "trunk-api", "feat/unused")
      const cfgDir = join(tmpDir, "config")
      makeWorkspaceFixture(cfgDir, "trunk-ws", [
        { name: "api", mode: "trunk", mainPath: fixture.mainPath, baseBranch: "main" },
      ], { branch: "feat/trunk-ws" })
      const peerPath = join(tmpDir, "peer-trunk")
      execSync(`git clone ${fixture.originDir} ${peerPath}`, gitExecOptions(tmpDir, tmpDir))
      commitFile(peerPath, tmpDir, "trunk-remote.txt", "remote\n", "trunk remote update")
      execSync("git push origin main", gitExecOptions(peerPath, tmpDir))

      const result = runWorkspaceCli(tmpDir, cfgDir, ["pull", "trunk-ws"])

      expectOk(result)
      expect(result.stdout).toContain("pulled")
      const log = execSync("git log --oneline -1", gitExecOptions(fixture.mainPath, tmpDir)).toString()
      expect(log).toContain("trunk remote update")
    })
  })
})
