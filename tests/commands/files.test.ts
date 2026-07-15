import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { getWorkspaceFileStatusView } from "../../packages/core/src/workspace-file-status"
import type { Workspace } from "../../packages/core/src/config"
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
  write(root, "copy-present.txt", "copy\n")
  symlinkSync(join(root, "copy-present.txt"), join(root, "link-present"))
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
    "  copy:",
    "    - copy-present.txt",
    "  symlink:",
    "    - link-present",
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

  const workspace = {
    name: wsName,
    branch: `feat/${wsName}`,
    created: "2024-01-01",
    files: {
      copy: ["copy-present.txt"],
      symlink: ["link-present"],
      sync: [{ source: "source", target: "target" }],
    },
    repos: [
      {
        name: "api",
        repo: "api",
        type: "other",
        mode: "worktree",
        main_path: repoMain,
        task_path: repoTask,
      },
    ],
  } as Workspace

  return { wsName, wsRoot, root, repoTask, workspace }
}

describe("files command", () => {
  let tmpDir: string
  let cfgDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir("files-command")
    cfgDir = createConfigFixture(tmpDir, join(tmpDir, "workspaces"))
  })

  afterEach(() => cleanup(tmpDir))

  test("files help exposes subcommands", () => {
    const result = runCli(["files", "--help"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    expect(result.stdout).toContain("status")
    expect(result.stdout).toContain("pull")
    expect(result.stdout).toContain("push")
  })

  test("files status help exposes JSON and verbose flags", () => {
    const result = runCli(["files", "status", "--help"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    expect(result.stdout).toContain("--json")
    expect(result.stdout).toContain("--verbose")
  })

  test("files pull and push help expose JSON dry-run and force flags", () => {
    const pull = runCli(["files", "pull", "--help"], { baseDir: tmpDir, configDir: cfgDir })
    const push = runCli(["files", "push", "--help"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(pull)
    expectSuccessful(push)
    for (const result of [pull, push]) {
      expect(result.stdout).toContain("--json")
      expect(result.stdout).toContain("--dry-run")
      expect(result.stdout).toContain("--force")
    }
  })

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

  test("D-03: grouped helper matches files status --json states and targets", () => {
    const { wsName, root, workspace } = setupFilesWorkspace(tmpDir, cfgDir)

    const result = runCli(["files", "status", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    const parsed = JSON.parse(result.stdout)
    const view = getWorkspaceFileStatusView(workspace, root)
    const groupedEntries = [view.workspace, ...view.repos].flatMap((section) => section.entries)

    const cliRows = parsed.entries.map((entry: any) => ({
      scope: entry.scope,
      repo: entry.repo,
      type: entry.type,
      target: entry.target,
      state: entry.state,
    }))
    const groupedRows = groupedEntries.map((entry) => ({
      scope: entry.scope,
      repo: entry.repo,
      type: entry.type,
      target: entry.target,
      state: entry.state,
    }))

    expect(groupedRows).toEqual(cliRows)
    expect(groupedRows).toContainEqual(expect.objectContaining({ type: "copy", target: "copy-present.txt", state: "materialized" }))
    expect(groupedRows).toContainEqual(expect.objectContaining({ type: "symlink", target: "link-present", state: "materialized" }))
    expect(groupedRows).toContainEqual(expect.objectContaining({ type: "sync", target: "target", state: "diverged" }))
  })

  test("D-03: grouped summary counts match files status --json summary", () => {
    const { wsName, root, workspace } = setupFilesWorkspace(tmpDir, cfgDir)
    const result = runCli(["files", "status", wsName, "--json"], { baseDir: tmpDir, configDir: cfgDir })
    expectSuccessful(result)
    const parsed = JSON.parse(result.stdout)

    const view = getWorkspaceFileStatusView(workspace, root)
    expect({ total: view.summary.total, ...view.summary.byState }).toMatchObject(parsed.summary)
    expect(view.summary.total).toBe(parsed.summary.total)
    expect(view.summary.byState.diverged).toBe(1)
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
