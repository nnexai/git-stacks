import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { execSync } from "child_process"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import {
  applyHostileGlobalGitEnv,
  cleanup,
  createConfigFixture,
  formatCliFailure,
  gitExecOptions,
  makeGitRepo,
  makeTmpDir,
  runCli,
  writeRegistryFixture,
  writeTemplateFixture,
} from "../helpers"

function setupWorkspaceSourceFixture(baseDir: string, configDir: string): string {
  const apiRepo = makeGitRepo(join(baseDir, "repos"), "api")
  writeRegistryFixture(configDir, `- schema_version: "1"
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
  writeTemplateFixture(configDir, "review.yml", `schema_version: "1"
name: review
repos:
  - repo: api
    mode: worktree
labels:
  - template:review
`)
  return apiRepo
}

describe("workspace source command contracts", () => {
  let baseDir: string
  let configDir: string

  beforeEach(() => {
    baseDir = makeTmpDir("workspace-source-cmd")
    configDir = createConfigFixture(baseDir)
    setupWorkspaceSourceFixture(baseDir, configDir)
  })

  afterEach(() => cleanup(baseDir))

  test("source fixture commits ignore hostile global signing and hooks", () => {
    const fixtureBase = makeTmpDir("workspace-source-hostile")
    const fixtureConfig = createConfigFixture(fixtureBase)
    const restoreHostileEnv = applyHostileGlobalGitEnv(fixtureBase)

    try {
      const apiRepo = setupWorkspaceSourceFixture(fixtureBase, fixtureConfig)
      writeFileSync(join(apiRepo, "source.txt"), "source fixture\n")
      const opts = gitExecOptions(apiRepo, fixtureBase)
      execSync("git add source.txt", opts)
      execSync('git commit -m "source fixture commit"', opts)

      expect(execSync("git log -1 --format=%s", opts).toString().trim()).toBe(
        "source fixture commit"
      )
    } finally {
      restoreHostileEnv()
      cleanup(fixtureBase)
    }
  })

  test("--source requires --template", () => {
    const result = runCli(["new", "src-ws", "--source", "https://gitlab.example.com/org/api/-/merge_requests/1", "--non-interactive"], { baseDir, configDir })
    expect(result.exitCode, formatCliFailure(result)).toBe(1)
    expect(result.stderr).toContain("--source requires --template")
  })

  test("--source rejects --from combination", () => {
    const result = runCli(
      ["new", "src-ws", "--source", "https://gitlab.example.com/org/api/-/merge_requests/1", "--from", "review", "--non-interactive"],
      { baseDir, configDir },
    )
    expect(result.exitCode, formatCliFailure(result)).toBe(1)
    expect(result.stderr).toContain("--from and --source")
  })

  test("--dry-run previews source creation and does not write workspace yaml", () => {
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
    expect(result.exitCode, formatCliFailure(result)).toBe(0)
    expect(result.stdout).toContain("source: https://gitlab.example.com/org/api/-/merge_requests/42")
    expect(result.stdout).toContain("matched repo:")
    expect(result.stdout).toContain("source branch:")
    expect(result.stdout).toContain("source ref:")
    expect(existsSync(join(configDir, "workspaces", "review-42.yml"))).toBe(false)
  })

  test("source metadata stored in workspace source block and no source auto labels", () => {
    const mainPath = join(baseDir, "repos", "api")
    writeFileSync(join(mainPath, ".git", "HEAD"), "ref: refs/heads/main\n")
    const result = runCli(
      [
        "new",
        "review-42",
        "--non-interactive",
        "--template",
        "review",
        "--source",
        "https://gitlab.example.com/org/api/-/merge_requests/42",
        "--label",
        "manual",
      ],
      {
        baseDir,
        configDir,
        env: { GS_TEST_SKIP_SOURCE_FETCH: "1" },
      },
    )
    expect(result.exitCode, formatCliFailure(result)).toBe(0)
    const yaml = readFileSync(join(configDir, "workspaces", "review-42.yml"), "utf8")
    expect(yaml).toContain("source:")
    expect(yaml).toContain("forge: gitlab")
    expect(yaml).toContain("change_number: 42")
    expect(yaml).toContain("template:review")
    expect(yaml).toContain("manual")
    expect(yaml).not.toContain("\n- review\n")
    expect(yaml).not.toContain("\n- gitlab\n")
    expect(yaml).not.toContain("settings:\n  integrations:\n    gitlab:\n      source:")
  })
})
