import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { execSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeTmpDir,
  mkdir,
  runCli,
  write,
  writeRegistryFixture,
  writeTemplateFixture,
  writeWorkspaceFixture,
} from "../helpers"

function repoRoot(): string {
  const marker = `${join(".coverage", "runtime-root")}`
  const markerIndex = import.meta.dir.indexOf(marker)
  if (markerIndex >= 0) return import.meta.dir.slice(0, markerIndex - 1)
  return join(import.meta.dir, "..", "..")
}

const ROOT = repoRoot()
const README = readFileSync(join(ROOT, "README.md"), "utf8")
const CHANGELOG = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8")

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function squish(value: string): string {
  return value.replace(/\s+/g, " ")
}

function setupFilesWorkspace(tmpDir: string, cfgDir: string, wsName = "rc-files") {
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

  writeWorkspaceFixture(cfgDir, `${wsName}.yml`, [
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

  return { wsName, root }
}

function setupForgeSourceFixture(baseDir: string, cfgDir: string) {
  const apiRepo = join(baseDir, "repos", "api")
  mkdirSync(apiRepo, { recursive: true })
  execSync("git init -q", { cwd: apiRepo })
  execSync("git config user.name 'Test User'", { cwd: apiRepo })
  execSync("git config user.email test@example.com", { cwd: apiRepo })
  writeFileSync(join(apiRepo, "README.md"), "seed\n")
  execSync("git add README.md", { cwd: apiRepo })
  execSync("git commit -q -m init", { cwd: apiRepo })
  execSync("git branch -M main", { cwd: apiRepo })

  writeRegistryFixture(cfgDir, `- schema_version: "1"
  name: api
  local_path: ${apiRepo}
  default_branch: main
  type: typescript
  forge: gitlab
  forge_metadata:
    forge: gitlab
    base_url: https://gitlab.example.com
    repo_path: org/api
`)
  writeTemplateFixture(cfgDir, "review.yml", `schema_version: "1"
name: review
repos:
  - repo: api
    mode: worktree
`)
}

describe("v0.18.0 release candidate smoke", () => {
  let baseDir: string
  let configDir: string

  beforeEach(() => {
    baseDir = makeTmpDir("release-rc")
    configDir = createConfigFixture(baseDir, join(baseDir, "workspaces"))
  })

  afterEach(() => cleanup(baseDir))

  test("README and changelog describe the RC workflows and safety boundaries", () => {
    expect(README).toContain("git-stacks new review-123 --template full-stack --source https://gitlab.example.com/org/repo/-/merge_requests/123")
    expect(README).toContain("files.sync")
    expect(README).toContain("git_exclude: true")
    expect(README).toContain("Normal `git-stacks open` does not auto-pull or refresh existing sync targets")
    expect(README).toContain("files push")
    expect(README).toContain("--repo <name>")
    expect(README).toContain("early support")

    expect(CHANGELOG).toContain("## [0.18.0-rc.1]")
    expect(CHANGELOG).toContain("Workspace file sync for private project context")
    expect(CHANGELOG).toContain("Forge-source workspace creation")
    expect(CHANGELOG).toContain("explicit sync-back path")
    expect(CHANGELOG).toContain("provider authentication, self-hosted instances, and fork refs")
  })

  test("help text exposes the documented sync and forge-source contracts", () => {
    const filesHelp = runCli(["files", "--help"], { baseDir, configDir })
    const pullHelp = runCli(["files", "pull", "--help"], { baseDir, configDir })
    const pushHelp = runCli(["files", "push", "--help"], { baseDir, configDir })
    const newHelp = runCli(["new", "--help"], { baseDir, configDir })

    expectSuccessful(filesHelp)
    expectSuccessful(pullHelp)
    expectSuccessful(pushHelp)
    expectSuccessful(newHelp)

    expect(squish(filesHelp.stdout)).toContain("Inspect and explicitly sync workspace files")
    expect(squish(pullHelp.stdout)).toContain("Mirror source to target, including overwrites and destination deletes")
    expect(squish(pushHelp.stdout)).toContain("Explicitly copy workspace target changes back to sync sources")
    expect(squish(pushHelp.stdout)).toContain("Mirror target to source, including overwrites and destination deletes")
    expect(squish(newHelp.stdout)).toContain("Create workspace from full forge change URL (requires --template)")
    expect(squish(newHelp.stdout)).toContain("Resolve --source ambiguity by selecting a template repo name")
    expect(squish(newHelp.stdout)).toContain("Preview source resolution and planned workspace creation without writing config/worktrees")
  })

  test("files status, pull, and push preserve conservative explicit sync behavior", () => {
    const { wsName, root } = setupFilesWorkspace(baseDir, configDir)

    const status = runCli(["files", "status", wsName], { baseDir, configDir })
    expectSuccessful(status)
    expect(status.stdout).toContain("source-only=1")
    expect(status.stdout).toContain("target-only=1")
    expect(status.stdout).toContain("differing=1")

    const pullPreview = runCli(["files", "pull", wsName, "--dry-run"], { baseDir, configDir })
    expect(pullPreview.exitCode).toBe(1)
    expect(pullPreview.stdout).toContain("would write")
    expect(pullPreview.stdout).toContain("refused")
    expect(existsSync(join(root, "target/source-only.txt"))).toBe(false)

    const pushPreviewJson = runCli(["files", "push", wsName, "--json", "--dry-run"], { baseDir, configDir })
    expectSuccessful(pushPreviewJson)
    const parsed = JSON.parse(pushPreviewJson.stdout)
    expect(parsed).toMatchObject({ workspace: wsName, operation: "push", dryRun: true, force: false })
    expect(parsed.summary.refusals).toBeGreaterThan(0)
    expect(existsSync(join(root, "source/target-only.txt"))).toBe(false)
  })

  test("forge-source dry-run previews creation without writing workspace state", () => {
    setupForgeSourceFixture(baseDir, configDir)

    const result = runCli(
      [
        "new",
        "review-42",
        "--non-interactive",
        "--template",
        "review",
        "--source",
        "https://gitlab.example.com/org/api/-/merge_requests/42",
        "--dry-run",
      ],
      { baseDir, configDir },
    )

    expectSuccessful(result)
    expect(result.stdout).toContain("source: https://gitlab.example.com/org/api/-/merge_requests/42")
    expect(result.stdout).toContain("matched repo:")
    expect(result.stdout).toContain("source branch:")
    expect(result.stdout).toContain("source ref:")
    expect(existsSync(join(configDir, "workspaces", "review-42.yml"))).toBe(false)
    expect(existsSync(join(baseDir, "workspaces", "tasks", "review-42"))).toBe(false)
  })
})
