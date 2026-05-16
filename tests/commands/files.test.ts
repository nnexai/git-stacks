import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeTmpDir,
  mkdir,
  runCli,
  write,
} from "../helpers"

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function setupFilesWorkspace(tmpDir: string, cfgDir: string, wsName = "files-ws") {
  const wsRoot = join(tmpDir, "workspaces")
  const root = join(wsRoot, "tasks", wsName)
  const repoMain = join(tmpDir, "main-api")
  const repoTask = join(root, "api")
  mkdir(tmpDir, "workspaces", "tasks", wsName, "api")
  mkdir(tmpDir, "main-api")
  write(root, "source/equal.txt", "same\n")
  write(root, "target/equal.txt", "same\n")
  write(root, "source/source-only.txt", "source\n")
  write(root, "target/target-only.txt", "target\n")
  write(root, "source/differing.txt", "source\n")
  write(root, "target/differing.txt", "target\n")

  writeFileSync(join(cfgDir, "workspaces", `${wsName}.yml`), [
    'schema_version: "1"',
    `name: ${wsName}`,
    `branch: feat/${wsName}`,
    'created: "2024-01-01"',
    "files:",
    "  sync:",
    "    - source: source",
    "      target: target",
    "repos:",
    "  - name: api",
    "    repo: api",
    "    type: other",
    "    mode: worktree",
    `    main_path: ${repoMain}`,
    `    task_path: ${repoTask}`,
    "",
  ].join("\n"))

  return { wsName, wsRoot, root, repoTask }
}

describe("files command", () => {
  let tmpDir: string
  let cfgDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir("files-command")
    cfgDir = createConfigFixture(tmpDir, join(tmpDir, "workspaces"))
  })

  afterEach(() => cleanup(tmpDir))

  test("files status prints current sync count labels", () => {
    const { wsName } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "status", wsName], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    expect(result.stdout).toContain(`Workspace: ${wsName}`)
    expect(result.stdout).toContain("source-only=1")
    expect(result.stdout).toContain("target-only=1")
    expect(result.stdout).toContain("differing=1")
  })

  test("files status --verbose prints capped representative paths", () => {
    const { wsName, root } = setupFilesWorkspace(tmpDir, cfgDir)
    for (let i = 0; i < 55; i += 1) {
      write(root, `source/many-${i}.txt`, `${i}\n`)
    }

    const result = runCli(["files", "status", wsName, "--verbose"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    expect(result.stdout).toContain("sourceOnly: many-0.txt")
    expect(result.stdout).toContain("omitted")
  })

  test("files status --json emits machine-readable sync entries", () => {
    const { wsName } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "status", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.workspace).toBe(wsName)
    expect(Array.isArray(parsed.entries)).toBe(true)
    expect(parsed.summary).toHaveProperty("total")
    expect(Array.isArray(parsed.warnings)).toBe(true)

    const syncEntry = parsed.entries.find((entry: any) => entry.type === "sync")
    expect(syncEntry).toMatchObject({
      scope: "workspace",
      repo: null,
      type: "sync",
      target: "target",
      state: "diverged",
    })
    expect(typeof syncEntry.counts.sourceOnly).toBe("number")
    expect(typeof syncEntry.counts.targetOnly).toBe("number")
    expect(typeof syncEntry.counts.differing).toBe("number")
    expect(typeof syncEntry.counts.equal).toBe("number")
  })

  test("files status --json --verbose caps details with truncation metadata", () => {
    const { wsName, root } = setupFilesWorkspace(tmpDir, cfgDir)
    for (let i = 0; i < 55; i += 1) {
      write(root, `source/many-${i}.txt`, `${i}\n`)
    }

    const result = runCli(["files", "status", wsName, "--json", "--verbose"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    const parsed = JSON.parse(result.stdout)
    const syncEntry = parsed.entries.find((entry: any) => entry.type === "sync")
    expect(syncEntry.details.sourceOnly.paths.length).toBeLessThanOrEqual(50)
    expect(syncEntry.details.sourceOnly.truncated).toBe(true)
    expect(syncEntry.details.sourceOnly.omitted).toBeGreaterThan(0)
  })

  test("files pull --dry-run reports planned writes without changing targets", () => {
    const { wsName, root } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "pull", wsName, "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("would write")
    expect(result.stdout).toContain("refused")
    expect(existsSync(join(root, "target/source-only.txt"))).toBe(false)
    expect(readFileSync(join(root, "target/differing.txt"), "utf-8")).toBe("target\n")
  })

  test("files pull --json --dry-run emits operation results and exits zero for preview refusals", () => {
    const { wsName, root } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "pull", wsName, "--json", "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
    expect(result.stderr, formatCliFailure(result)).toBe("")
    expect(result.exitCode, formatCliFailure(result)).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toMatchObject({
      workspace: wsName,
      operation: "pull",
      mode: "pull",
      dryRun: true,
      force: false,
    })
    expect(Array.isArray(parsed.results)).toBe(true)
    expect(typeof parsed.summary.writes).toBe("number")
    expect(typeof parsed.summary.deletes).toBe("number")
    expect(typeof parsed.summary.refusals).toBe("number")
    expect(parsed.summary.refusals).toBeGreaterThan(0)
    expect(existsSync(join(root, "target/source-only.txt"))).toBe(false)
  })

  test("files push --dry-run reports planned writes without changing sources", () => {
    const { wsName, root } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "push", wsName, "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("would write")
    expect(result.stdout).toContain("refused")
    expect(existsSync(join(root, "source/target-only.txt"))).toBe(false)
    expect(readFileSync(join(root, "source/differing.txt"), "utf-8")).toBe("source\n")
  })

  test("files push --json --dry-run emits operation results and exits zero for preview refusals", () => {
    const { wsName, root } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "push", wsName, "--json", "--dry-run"], { baseDir: tmpDir, configDir: cfgDir })
    expect(result.stderr, formatCliFailure(result)).toBe("")
    expect(result.exitCode, formatCliFailure(result)).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toMatchObject({
      workspace: wsName,
      operation: "push",
      mode: "push",
      dryRun: true,
      force: false,
    })
    expect(Array.isArray(parsed.results)).toBe(true)
    expect(typeof parsed.summary.writes).toBe("number")
    expect(typeof parsed.summary.deletes).toBe("number")
    expect(typeof parsed.summary.refusals).toBe("number")
    expect(parsed.summary.refusals).toBeGreaterThan(0)
    expect(existsSync(join(root, "source/target-only.txt"))).toBe(false)
  })

  test("omitted workspace resolves from cwd inside a workspace repo task path", () => {
    const { wsName, repoTask } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "status"], { baseDir: tmpDir, configDir: cfgDir, cwd: repoTask })
    expectSuccessful(result)
    expect(result.stdout).toContain(`Workspace: ${wsName}`)
  })

  test("default push exits nonzero on source-only and differing conflicts", () => {
    const { wsName } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "push", wsName], { baseDir: tmpDir, configDir: cfgDir })
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("source-only")
    expect(result.stdout).toContain("differing")
  })

  test("files pull --json exits nonzero with parseable refusal output when applying", () => {
    const { wsName } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "pull", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir })
    expect(result.stderr, formatCliFailure(result)).toBe("")
    expect(result.exitCode).toBe(1)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.ok).toBe(false)
    expect(parsed.summary.refusals).toBeGreaterThan(0)
    expect(Array.isArray(parsed.errors)).toBe(true)
  })
})
