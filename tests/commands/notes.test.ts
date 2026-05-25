import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { cleanup, createConfigFixture, formatCliFailure, makeTmpDir, runCli, writeWorkspaceFixture } from "../helpers"

const PROJECT_ROOT = join(import.meta.dir, "../..")

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function noteFile(configDir: string, workspace: string): string {
  return join(configDir, "notes", `${workspace}.jsonl`)
}

function parseListedTexts(stdout: string): string[] {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(22).trim())
}

function writeWorkspace(configDir: string, workspace: string, taskPath: string): void {
  const yaml = `schema_version: "1"
name: ${workspace}
branch: feat/${workspace}
created: "2026-05-17T00:00:00.000Z"
repos:
  - name: app
    repo: app
    type: other
    mode: worktree
    main_path: ${join(taskPath, "..", "main", "app")}
    task_path: ${join(taskPath, "app")}
`
  writeWorkspaceFixture(configDir, `${workspace}.yml`, yaml)
}

function runNotesWithInput(
  cfgDir: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  stdinInput = ""
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", "src/index.ts", "notes", ...args], {
    env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir, ...env },
    cwd,
    stdin: stdinInput ? Buffer.from(stdinInput) : "pipe",
    stdio: ["pipe", "pipe", "pipe"],
  })
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

describe("notes command subprocess contracts", () => {
  let baseDir: string
  let configDir: string
  let cwdRoot: string

  beforeEach(() => {
    baseDir = makeTmpDir("notes-cmd-test")
    cwdRoot = join(baseDir, "cwd")
    mkdirSync(cwdRoot, { recursive: true })
    configDir = createConfigFixture(baseDir)
  })

  afterEach(() => {
    cleanup(baseDir)
  })

  test("explicit workspace arg overrides cwd detection and GS_WORKSPACE_NAME", () => {
    const taskRoot = join(baseDir, "ws-root", "tasks")
    const alphaTask = join(taskRoot, "alpha")
    const betaTask = join(taskRoot, "beta")
    mkdirSync(join(alphaTask, "app"), { recursive: true })
    mkdirSync(join(betaTask, "app"), { recursive: true })
    writeWorkspace(configDir, "alpha", alphaTask)
    writeWorkspace(configDir, "beta", betaTask)

    const env = { GS_WORKSPACE_NAME: "beta" }
    const added = runCli(["notes", "add", "alpha", "from-explicit"], {
      baseDir,
      configDir,
      cwd: join(betaTask, "app"),
      env,
    })
    expectSuccess(added)
    expect(existsSync(noteFile(configDir, "alpha"))).toBe(true)
    expect(existsSync(noteFile(configDir, "beta"))).toBe(false)
  })

  test("cwd detection takes precedence over GS_WORKSPACE_NAME when no explicit workspace is passed", () => {
    const taskRoot = join(baseDir, "ws-root", "tasks")
    const alphaTask = join(taskRoot, "alpha")
    const betaTask = join(taskRoot, "beta")
    mkdirSync(join(alphaTask, "app"), { recursive: true })
    mkdirSync(join(betaTask, "app"), { recursive: true })
    writeWorkspace(configDir, "alpha", alphaTask)
    writeWorkspace(configDir, "beta", betaTask)

    const added = runCli(["notes", "add", "from-cwd"], {
      baseDir,
      configDir,
      cwd: join(alphaTask, "app"),
      env: { GS_WORKSPACE_NAME: "beta" },
    })
    expectSuccess(added)
    expect(existsSync(noteFile(configDir, "alpha"))).toBe(true)
    expect(existsSync(noteFile(configDir, "beta"))).toBe(false)
  })

  test("GS_WORKSPACE_NAME fallback is used when explicit arg and cwd detection are unavailable", () => {
    const taskRoot = join(baseDir, "ws-root", "tasks")
    const betaTask = join(taskRoot, "beta")
    mkdirSync(join(betaTask, "app"), { recursive: true })
    writeWorkspace(configDir, "beta", betaTask)

    const added = runCli(["notes", "add", "from-env"], {
      baseDir,
      configDir,
      cwd: cwdRoot,
      env: { GS_WORKSPACE_NAME: "beta" },
    })
    expectSuccess(added)
    expect(existsSync(noteFile(configDir, "beta"))).toBe(true)
  })

  test("list is newest-first with default limit 10, supports --limit and --all", () => {
    const taskRoot = join(baseDir, "ws-root", "tasks")
    const alphaTask = join(taskRoot, "alpha")
    mkdirSync(join(alphaTask, "app"), { recursive: true })
    writeWorkspace(configDir, "alpha", alphaTask)

    for (let i = 1; i <= 12; i++) {
      expectSuccess(
        runCli(["notes", "add", "alpha", `note-${i}`], {
          baseDir,
          configDir,
          cwd: cwdRoot,
        })
      )
    }

    const listedDefault = runCli(["notes", "list", "alpha"], { baseDir, configDir, cwd: cwdRoot })
    expectSuccess(listedDefault)
    expect(parseListedTexts(listedDefault.stdout)).toEqual([
      "note-12",
      "note-11",
      "note-10",
      "note-9",
      "note-8",
      "note-7",
      "note-6",
      "note-5",
      "note-4",
      "note-3",
    ])

    const listedLimit = runCli(["notes", "list", "alpha", "--limit", "2"], { baseDir, configDir, cwd: cwdRoot })
    expectSuccess(listedLimit)
    expect(listedLimit.stdout).toContain("note-12")
    expect(listedLimit.stdout).toContain("note-11")
    expect(listedLimit.stdout).not.toContain("note-10")

    const listedAll = runCli(["notes", "list", "alpha", "--all"], { baseDir, configDir, cwd: cwdRoot })
    expectSuccess(listedAll)
    expect(listedAll.stdout).toContain("note-12")
    expect(listedAll.stdout).toContain("note-1")
  }, 15000)

  test("clear prompts by default and honors declined confirmation", () => {
    const taskRoot = join(baseDir, "ws-root", "tasks")
    const alphaTask = join(taskRoot, "alpha")
    mkdirSync(join(alphaTask, "app"), { recursive: true })
    writeWorkspace(configDir, "alpha", alphaTask)
    expectSuccess(runCli(["notes", "add", "alpha", "keep-me"], { baseDir, configDir, cwd: cwdRoot }))

    const declined = runNotesWithInput(configDir, ["clear", "alpha"], cwdRoot, {}, "n\n")
    expect([0, 1]).toContain(declined.exitCode)
    expect(readFileSync(noteFile(configDir, "alpha"), "utf8")).toContain("keep-me")
  })

  test("clear --force deletes the note file", () => {
    const taskRoot = join(baseDir, "ws-root", "tasks")
    const alphaTask = join(taskRoot, "alpha")
    mkdirSync(join(alphaTask, "app"), { recursive: true })
    writeWorkspace(configDir, "alpha", alphaTask)
    expectSuccess(runCli(["notes", "add", "alpha", "delete-me"], { baseDir, configDir, cwd: cwdRoot }))

    const cleared = runCli(["notes", "clear", "alpha", "--force"], { baseDir, configDir, cwd: cwdRoot })
    expectSuccess(cleared)
    expect(existsSync(noteFile(configDir, "alpha"))).toBe(false)
  })

  test("malformed note store fails closed for add/list/clear", () => {
    const taskRoot = join(baseDir, "ws-root", "tasks")
    const alphaTask = join(taskRoot, "alpha")
    mkdirSync(join(alphaTask, "app"), { recursive: true })
    writeWorkspace(configDir, "alpha", alphaTask)
    mkdirSync(join(configDir, "notes"), { recursive: true })
    writeFileSync(noteFile(configDir, "alpha"), "{\"text\":\"ok\",\"created\":\"2026-01-01T00:00:00.000Z\"}\n{bad-json}\n", "utf8")
    const before = readFileSync(noteFile(configDir, "alpha"), "utf8")

    const addFail = runCli(["notes", "add", "alpha", "later"], { baseDir, configDir, cwd: cwdRoot })
    expect(addFail.exitCode).toBe(1)

    const listFail = runCli(["notes", "list", "alpha"], { baseDir, configDir, cwd: cwdRoot })
    expect(listFail.exitCode).toBe(1)

    const clearFail = runCli(["notes", "clear", "alpha", "--force"], { baseDir, configDir, cwd: cwdRoot })
    expect(clearFail.exitCode).toBe(1)

    expect(readFileSync(noteFile(configDir, "alpha"), "utf8")).toBe(before)
  })

  test("command surface exposes add, list, and clear only", () => {
    const help = runCli(["notes", "--help"], { baseDir, configDir, cwd: PROJECT_ROOT })
    expectSuccess(help)
    expect(help.stdout).toContain("add")
    expect(help.stdout).toContain("list")
    expect(help.stdout).toContain("clear")
    expect(help.stdout).not.toContain("show")
    expect(help.stdout).not.toContain("--json")
  })
})
