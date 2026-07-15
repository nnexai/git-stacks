import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { existsSync, mkdirSync, writeFileSync } from "fs"
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

function parseJsonPayload<T>(stdout: string): T {
  const start = stdout.search(/[\[{]/)
  expect(start, stdout).toBeGreaterThanOrEqual(0)
  return JSON.parse(stdout.slice(start)) as T
}

function commitFile(repoPath: string, baseDir: string, fileName: string, content: string, message: string) {
  writeFileSync(join(repoPath, fileName), content)
  const opts = gitExecOptions(repoPath, baseDir)
  execSync("git add .", opts)
  execSync(`git commit -m ${JSON.stringify(message)}`, opts)
}

function setupWorkspace(tmpDir: string, configDir: string) {
  const wsName = "wrapper-ws"
  const api = makeRepoWithRemote(tmpDir, "api", `feat/${wsName}`)
  const web = makeRepoWithRemote(tmpDir, "web", `feat/${wsName}`)
  makeWorkspaceFixture(configDir, wsName, [
    { name: "api", mainPath: api.mainPath, taskPath: api.taskPath },
    { name: "web", mainPath: web.mainPath, taskPath: web.taskPath },
  ], {
    branch: `feat/${wsName}`,
    wsRoot: join(tmpDir, "workspaces"),
    env: { API_URL: "https://wrapper.test" },
  })
  return { wsName, api, web }
}

function workspaceRoot(tmpDir: string, wsName: string): string {
  return join(tmpDir, "workspaces", "tasks", wsName)
}

describe("workspace wrapper command edges", () => {
  let tmpDir: string
  let configDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-wrapper-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-wrapper")
    configDir = join(tmpDir, "config")
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  test("run rejects --json without --parallel before executing a command", () => {
    const { wsName, api } = setupWorkspace(tmpDir, configDir)

    const result = runCli(["run", "--json", wsName, "api", "--", "touch", "SHOULD_NOT_EXIST"], {
      baseDir: tmpDir,
      configDir,
    })

    expect(result.exitCode, formatCliFailure(result)).toBe(1)
    expect(result.stderr).toContain("Cannot use --json without --parallel")
    expect(existsSync(join(api.taskPath, "SHOULD_NOT_EXIST"))).toBe(false)
  })

  test("run --parallel --json emits parseable mixed success and failure results", () => {
    const { wsName, api } = setupWorkspace(tmpDir, configDir)
    writeFileSync(join(api.taskPath, "PASS_MARKER"), "ok\n")

    const result = runCli(["run", "--parallel", "--json", wsName, "--", "test", "-f", "PASS_MARKER"], {
      baseDir: tmpDir,
      configDir,
    })

    expect(result.stderr, formatCliFailure(result)).toBe("")
    expect(result.exitCode).toBe(1)
    const parsed = parseJsonPayload<Array<{ repo: string; exit_code: number; stdout: string; stderr: string }>>(result.stdout)
    expect(parsed).toContainEqual(expect.objectContaining({ repo: "api", exit_code: 0 }))
    expect(parsed).toContainEqual(expect.objectContaining({ repo: "web", exit_code: 1 }))
  })

  test("paths detects workspace from repo cwd and reports filter-empty branches", () => {
    const { api } = setupWorkspace(tmpDir, configDir)

    const detected = runCli(["paths"], { baseDir: tmpDir, configDir, cwd: api.taskPath })
    expectSuccessful(detected)
    expect(detected.stdout).toContain(api.taskPath)

    const filtered = runCli(["paths", "--filter", "trunk"], { baseDir: tmpDir, configDir, cwd: api.taskPath })
    expect(filtered.exitCode, formatCliFailure(filtered)).toBe(1)
    expect(filtered.stderr).toContain("No paths to output")
  })

  test("paths detects workspace from workspace root and non-repo subdirectory", () => {
    const { wsName, api, web } = setupWorkspace(tmpDir, configDir)
    const root = workspaceRoot(tmpDir, wsName)
    const scratch = join(root, "scratch", "notes")
    mkdirSync(scratch, { recursive: true })

    const fromRoot = runCli(["paths"], { baseDir: tmpDir, configDir, cwd: root })
    expectSuccessful(fromRoot)
    expect(fromRoot.stdout).toContain(api.taskPath)
    expect(fromRoot.stdout).toContain(web.taskPath)

    const fromSubdir = runCli(["paths"], { baseDir: tmpDir, configDir, cwd: scratch })
    expectSuccessful(fromSubdir)
    expect(fromSubdir.stdout).toContain(api.taskPath)
    expect(fromSubdir.stdout).toContain(web.taskPath)
  })

  test("paths outside a workspace fails with bounded cwd-detection guidance", () => {
    setupWorkspace(tmpDir, configDir)

    const result = runCli(["paths"], { baseDir: tmpDir, configDir, cwd: tmpDir })

    expect(result.exitCode, formatCliFailure(result)).toBe(1)
    expect(result.stderr).toContain("Could not detect workspace from current directory")
    expect(result.stderr).toContain("git-stacks paths <workspace>")
  })

  test("env detects workspace and repo from cwd and supports explicit --repo JSON output", () => {
    const { wsName, api, web } = setupWorkspace(tmpDir, configDir)

    const detected = runCli(["env", "--format", "json"], { baseDir: tmpDir, configDir, cwd: api.taskPath })
    expectSuccessful(detected)
    const detectedJson = JSON.parse(detected.stdout.trim())
    expect(detectedJson.GS_WORKSPACE_NAME).toBe(wsName)
    expect(detectedJson.GS_REPO_NAME).toBe("api")
    expect(detectedJson.GS_REPO_PATH).toBe(api.taskPath)

    const explicit = runCli(["env", wsName, "--repo", "web", "--format", "json"], { baseDir: tmpDir, configDir })
    expectSuccessful(explicit)
    const explicitJson = JSON.parse(explicit.stdout.trim())
    expect(explicitJson.GS_REPO_NAME).toBe("web")
    expect(explicitJson.GS_REPO_PATH).toBe(web.taskPath)
  })

  test("env detects workspace from root cwd without repo overlay until repo cwd or explicit repo", () => {
    const { wsName, api } = setupWorkspace(tmpDir, configDir)
    const root = workspaceRoot(tmpDir, wsName)
    const scratch = join(root, "scratch")
    mkdirSync(scratch, { recursive: true })

    const fromRoot = runCli(["env", "--format", "json"], { baseDir: tmpDir, configDir, cwd: root })
    expectSuccessful(fromRoot)
    const rootJson = JSON.parse(fromRoot.stdout.trim())
    expect(rootJson.GS_WORKSPACE_NAME).toBe(wsName)
    expect(rootJson.GS_REPO_NAME).toBeUndefined()
    expect(rootJson.GS_REPO_PATH).toBeUndefined()

    const fromSubdir = runCli(["env", "--format", "json"], { baseDir: tmpDir, configDir, cwd: scratch })
    expectSuccessful(fromSubdir)
    const subdirJson = JSON.parse(fromSubdir.stdout.trim())
    expect(subdirJson.GS_WORKSPACE_NAME).toBe(wsName)
    expect(subdirJson.GS_REPO_NAME).toBeUndefined()

    const fromRepo = runCli(["env", "--format", "json"], { baseDir: tmpDir, configDir, cwd: api.taskPath })
    expectSuccessful(fromRepo)
    expect(JSON.parse(fromRepo.stdout.trim()).GS_REPO_NAME).toBe("api")

    const explicitRepo = runCli(["env", "--format", "json", "--repo", "web"], { baseDir: tmpDir, configDir, cwd: root })
    expectSuccessful(explicitRepo)
    expect(JSON.parse(explicitRepo.stdout.trim()).GS_REPO_NAME).toBe("web")
  })

  test("status --fetch keeps JSON parseable after progress output", () => {
    const { wsName, api } = setupWorkspace(tmpDir, configDir)
    const peerPath = join(tmpDir, "peer-api")
    execSync(`git clone ${api.originDir} ${peerPath}`, gitExecOptions(tmpDir, tmpDir))
    commitFile(peerPath, tmpDir, "remote.txt", "remote\n", "remote update")
    execSync("git push origin main", gitExecOptions(peerPath, tmpDir))

    const result = runCli(["status", wsName, "--fetch", "--json"], { baseDir: tmpDir, configDir })

    expectSuccessful(result)
    expect(result.stdout).toContain("Fetching origin")
    const parsed = parseJsonPayload<Array<{ repos: Array<{ name: string; behind: number }> }>>(result.stdout)
    expect(parsed[0].repos.find((repo) => repo.name === "api")?.behind).toBe(1)
  })

  test("sync, push, and pull report no-op or representative error branches", () => {
    const { wsName } = setupWorkspace(tmpDir, configDir)

    const sync = runCli(["sync", wsName, "--json"], { baseDir: tmpDir, configDir })
    expectSuccessful(sync)
    expect(parseJsonPayload<{ ok: boolean; repos: Array<{ result: string }> }>(sync.stdout).repos)
      .toEqual(expect.arrayContaining([expect.objectContaining({ result: "up-to-date" })]))

    const push = runCli(["push", wsName, "--json"], { baseDir: tmpDir, configDir })
    expectSuccessful(push)
    expect(parseJsonPayload<{ ok: boolean; repos: Array<{ status: string; commits: number }> }>(push.stdout).repos)
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: "pushed", commits: 0 })]))

    const pull = runCli(["pull", wsName], { baseDir: tmpDir, configDir })
    expectSuccessful(pull)
    expect(pull.stdout).toContain("already up to date")
  })
})
