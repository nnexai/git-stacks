import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { join } from "path"
import { cleanup, createConfigFixture, formatCliFailure, makeTmpDir, mkdir, runCli, writeWorkspaceFixture } from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function setupWorkspace(tmpDir: string, cfgDir: string, name = "cmd-ws") {
  const wsRoot = join(tmpDir, "workspaces")
  const taskRoot = join(wsRoot, "tasks", name)
  const repoTask = join(taskRoot, "api")
  mkdir(tmpDir, "workspaces", "tasks", name, "api")
  writeWorkspaceFixture(cfgDir, `${name}.yml`, [
    'schema_version: "1"',
    `name: ${name}`,
    `branch: feature/${name}`,
    'created: "2026-01-01"',
    "env:",
    '  HELLO: "world"',
    "commands:",
    '  preverify: "echo WS_PRE"',
    '  verify: "echo WS_MAIN"',
    '  postverify: "echo WS_POST"',
    "repos:",
    "  - name: api",
    "    repo: api",
    "    type: other",
    "    mode: worktree",
    `    main_path: ${join(tmpDir, "main-api")}`,
    `    task_path: ${repoTask}`,
    "    commands:",
    '      preverify: "echo API_PRE"',
    '      verify: "echo API_MAIN"',
    '      postverify: "echo API_POST"',
    "",
  ].join("\n"))
  return { name, repoTask }
}

describe("command command family", () => {
  let tmpDir: string
  let cfgDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir("command-command")
    cfgDir = createConfigFixture(tmpDir, join(tmpDir, "workspaces"))
  })

  afterEach(() => cleanup(tmpDir))

  test("command list hides pre/post by default and --all reveals them", () => {
    const { name } = setupWorkspace(tmpDir, cfgDir)
    const listed = runCli(["command", "list", name], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccess(listed)
    expect(listed.stdout).toContain("verify")
    expect(listed.stdout).not.toContain("preverify")
    expect(listed.stdout).not.toContain("postverify")

    const listedAll = runCli(["command", "list", name, "--all"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccess(listedAll)
    expect(listedAll.stdout).toContain("preverify")
    expect(listedAll.stdout).toContain("verify")
    expect(listedAll.stdout).toContain("postverify")
  })

  test("command run --dry-run prints bucket, scope, cwd, command", () => {
    const { name, repoTask } = setupWorkspace(tmpDir, cfgDir)
    const dry = runCli(["command", "run", name, "verify", "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccess(dry)
    expect(dry.stdout).toContain(`pre  workspace`)
    expect(dry.stdout).toContain(`pre  repo:api`)
    expect(dry.stdout).toContain(repoTask)
    expect(dry.stdout).toContain("echo WS_MAIN")
  })

  test("command run resolves workspace from cwd when omitted", () => {
    const { repoTask } = setupWorkspace(tmpDir, cfgDir)
    const result = runCli(["command", "run", "verify", "--dry-run"], {
      baseDir: tmpDir,
      configDir: cfgDir,
      cwd: repoTask,
    })
    expectSuccess(result)
    expect(result.stdout).toContain("echo WS_MAIN")
  })

  test("real run streams output and exits with first failing status", () => {
    const { name } = setupWorkspace(tmpDir, cfgDir)
    writeWorkspaceFixture(cfgDir, `${name}.yml`, [
      'schema_version: "1"',
      `name: ${name}`,
      `branch: feature/${name}`,
      'created: "2026-01-01"',
      "commands:",
      '  preverify: "echo WS_PRE"',
      '  verify: "echo WS_MAIN && exit 7"',
      '  postverify: "echo WS_POST"',
      "repos: []",
      "",
    ].join("\n"))
    const result = runCli(["command", "run", name, "verify", "--skip-secrets"], { baseDir: tmpDir, configDir: cfgDir })
    expect(result.exitCode).toBe(7)
    expect(result.stdout).toContain("WS_PRE")
    expect(result.stdout).toContain("WS_MAIN")
    expect(result.stdout).not.toContain("WS_POST")
  })
})

