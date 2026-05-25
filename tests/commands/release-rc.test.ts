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
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }

function changelogEntry(version: string): string {
  const heading = `## [${version}]`
  const start = CHANGELOG.indexOf(heading)
  expect(start).toBeGreaterThanOrEqual(0)

  const next = CHANGELOG.indexOf("\n---\n\n## [", start + heading.length)
  return CHANGELOG.slice(start, next === -1 ? undefined : next)
}

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

describe("v0.19.0 release candidate smoke", () => {
  test("package, changelog, and README describe the RC.2 follow-up boundary", () => {
    const rcEntry = changelogEntry("0.19.0-rc.2")

    expect(PACKAGE_JSON.version).toBe("0.19.0-rc.2")
    expect(CHANGELOG.indexOf("## [0.19.0-rc.2]")).toBeLessThan(CHANGELOG.indexOf("## [0.19.0-rc.1]"))
    expect(rcEntry).toContain("v0.19.0-rc.2")
    expect(rcEntry).toContain("Manager command-output containment")
    expect(rcEntry).toContain("Completion completeness repair")
    expect(rcEntry).toContain("Workspace-root auto-detection")
    expect(rcEntry.toLowerCase()).toContain("dashboard rollback progress visibility")
    expect(rcEntry).toContain("deferred backlog work")
    expect(rcEntry).not.toContain("Dashboard rollback progress visibility is now")

    expect(README).toContain("git-stacks paths    # same as: git-stacks paths my-feature")
    expect(README).toContain("The current directory may be the workspace root")
    expect(README).toContain("Notes resolve the workspace by explicit argument first")
  })

  test("release smoke names stable Phase 100-102 follow-up coverage surfaces", () => {
    const managerFrame = readFileSync(join(ROOT, "tests/tui/dashboard/integ-action-menu.test.tsx"), "utf8")
    const lifecycle = readFileSync(join(ROOT, "tests/lib/lifecycle.test.ts"), "utf8")
    const completionGenerator = readFileSync(join(ROOT, "tests/lib/completion-generator.test.ts"), "utf8")
    const supportReadonly = readFileSync(join(ROOT, "tests/commands/support-readonly.test.ts"), "utf8")
    const verifyGates = readFileSync(join(ROOT, "scripts/verify-gates.ts"), "utf8")
    const workspaceWrapper = readFileSync(join(ROOT, "tests/commands/workspace-wrapper-edges.test.ts"), "utf8")
    const notes = readFileSync(join(ROOT, "tests/commands/notes.test.ts"), "utf8")
    const cwdResolver = readFileSync(join(ROOT, "tests/lib/detect-workspace-cwd.test.ts"), "utf8")

    expect(managerFrame).toContain("noisy manual command output stays bounded inside progress frame")
    expect(managerFrame).toContain("... 21 earlier lines omitted ...")
    expect(lifecycle).toContain("captures stderr-only output")

    expect(completionGenerator).toContain("completion audit - real program")
    expect(completionGenerator).toContain("real bash output covers files, command, notes, and source-adjacent workspace flags")
    expect(supportReadonly).toContain("completion bash exposes wrapper, registration, and current command markers")
    expect(verifyGates).toContain("auditCompletionCoverage(buildProgram())")
    expect(verifyGates).toContain("for (const shell of [\"bash\", \"zsh\", \"fish\"] as const)")

    expect(cwdResolver).toContain("exact workspace root CWD returns that workspace")
    expect(cwdResolver).toContain("non-repo subdirectory under workspace root returns that workspace")
    expect(workspaceWrapper).toContain("paths detects workspace from workspace root and non-repo subdirectory")
    expect(workspaceWrapper).toContain("env detects workspace from root cwd without repo overlay")
    expect(notes).toContain("workspace root and non-repo subdirectory cwd outrank GS_WORKSPACE_NAME")
  })

  test("RC release script derives tag/version state from package metadata", () => {
    const releaseScript = readFileSync(join(ROOT, "scripts/release-rc-check.ts"), "utf8")

    expect(releaseScript).toContain("const rcVersion = packageVersion()")
    expect(releaseScript).toContain("const rcTag = `v${rcVersion}`")
    expect(releaseScript).toContain("process.argv.includes(\"--skip-tag\")")
    expect(releaseScript).toContain("bun test tests/commands/release-rc.test.ts")
    expect(releaseScript).toContain("bun publish --dry-run")
  })
})

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
