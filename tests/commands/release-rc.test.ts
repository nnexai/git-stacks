import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  applyHostileGlobalGitEnv,
  cleanup,
  createConfigFixture,
  formatCliFailure,
  gitExecOptions,
  makeGitRepo,
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
  const markerIndex = import.meta.dirname.indexOf(marker)
  if (markerIndex >= 0) return import.meta.dirname.slice(0, markerIndex - 1)
  return join(import.meta.dirname, "..", "..")
}

const ROOT = repoRoot()
const README = readFileSync(join(ROOT, "README.md"), "utf8")
const CHANGELOG = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8")
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string; bin: Record<string, string> }

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

function setupForgeSourceFixture(baseDir: string, cfgDir: string): string {
  const apiRepo = makeGitRepo(join(baseDir, "repos"), "api")

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
  return apiRepo
}

describe("v0.21.0 release candidate smoke", () => {
  test("package, changelog, and README describe the Node package boundary", () => {
    const rcEntry = changelogEntry("0.21.0-rc.3")
    const architectureEntry = changelogEntry("0.21.0-rc.1")

    expect(PACKAGE_JSON.version).toBe("0.21.0-rc.3")
    expect(PACKAGE_JSON.bin["git-stacks"]).toBe("bin/git-stacks.js")
    expect(CHANGELOG.indexOf("## [0.21.0-rc.3]")).toBeLessThan(CHANGELOG.indexOf("## [0.21.0-rc.2]"))
    expect(rcEntry).toContain("follow-up release candidate")
    expect(rcEntry).toContain("projected as degraded")
    expect(architectureEntry).toContain("v0.21.0")
    expect(architectureEntry).toContain("Node.js 24")
    expect(architectureEntry).toContain("@git-stacks/protocol")
    expect(architectureEntry).toContain("node-pty@1.2.0-beta.14")
    expect(architectureEntry).toContain("separately installed `@git-stacks/tui`")
    expect(architectureEntry).toContain("first release candidate for v0.21.0")

    expect(README).toContain("## Shared Service Architecture")
    expect(README).toContain("git-stacks hooks install codex")
    expect(README).toContain("Exiting an ordinary shell removes its tab")
    expect(README).toContain("git-stacks command list [workspace]")
    expect(README).toContain("Node.js 24 or newer")
  })

  test("release smoke retains established workflow coverage surfaces", () => {
    const managerFrame = readFileSync(join(ROOT, "tests/tui/dashboard/integ-action-menu.test.tsx"), "utf8")
    const config = readFileSync(join(ROOT, "tests/lib/config.test.ts"), "utf8")
    const lifecycle = readFileSync(join(ROOT, "tests/lib/lifecycle.test.ts"), "utf8")
    const completionGenerator = readFileSync(join(ROOT, "tests/lib/completion-generator.test.ts"), "utf8")
    const supportReadonly = readFileSync(join(ROOT, "tests/commands/support-readonly.test.ts"), "utf8")
    const verifyGates = readFileSync(join(ROOT, "scripts/verify-gates.ts"), "utf8")
    const workspaceWrapper = readFileSync(join(ROOT, "tests/commands/workspace-wrapper-edges.test.ts"), "utf8")
    const notes = readFileSync(join(ROOT, "tests/commands/notes.test.ts"), "utf8")
    const cwdResolver = readFileSync(join(ROOT, "tests/lib/detect-workspace-cwd.test.ts"), "utf8")

    expect(managerFrame).toContain("noisy manual command output stays bounded inside progress frame")
    expect(managerFrame).toContain("... 21 earlier lines omitted ...")
    expect(config).toContain("invalidateConfigCache forces workspace and template reads to see external file edits")
    expect(config).toContain("invalidateConfigCache removes externally deleted entries from list reloads")
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
    const releaseScript = readFileSync(join(ROOT, "scripts/release-rc-check.mjs"), "utf8")
    const packScript = readFileSync(join(ROOT, "scripts/pack-release.mjs"), "utf8")
    const releaseWorkflow = readFileSync(join(ROOT, ".github/workflows/release-artifacts.yml"), "utf8")

    expect(releaseScript).toContain("const rcVersion = packageVersion()")
    expect(releaseScript).toContain("const rcTag = `v${rcVersion}`")
    expect(releaseScript).toContain("process.argv.includes(\"--tag\")")
    expect(releaseScript).toContain("npm\", [\"run\", \"check:packages\"]")
    expect(releaseScript).toContain("publishing is a separate manual action")
    expect(packScript).toContain('npm_dist_tag: "next"')
    expect(packScript).toContain('"packages/tui"')
    expect(packScript).toContain("artifacts.length")
    expect(releaseWorkflow).toContain("npm run release:check")
    expect(releaseWorkflow).toContain("node scripts/pack-release.mjs")
    expect(releaseWorkflow).not.toContain("npm publish")
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

  test("release fixture tags ignore hostile global signing and hooks", () => {
    const restoreHostileEnv = applyHostileGlobalGitEnv(baseDir)

    try {
      const apiRepo = setupForgeSourceFixture(baseDir, configDir)
      const opts = gitExecOptions(apiRepo, baseDir)
      execSync('git tag -a v-fixture -m "release fixture tag"', opts)

      expect(execSync("git tag --list v-fixture", opts).toString().trim()).toBe("v-fixture")
    } finally {
      restoreHostileEnv()
    }
  })

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
