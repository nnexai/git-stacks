import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { readFileSync, statSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeGitRepo,
  makeTmpDir,
  runCli,
  writeTemplateFixture,
  writeWorkspaceFixture,
} from "../helpers"

describe("e2e harness", () => {
  let baseDir: string
  let configDir: string

  beforeEach(() => {
    baseDir = makeTmpDir("e2e-harness")
    configDir = createConfigFixture(baseDir)
  })

  afterEach(() => {
    cleanup(baseDir)
  })

  test("captures decoded command result and allowlisted env preview", () => {
    const result = runCli(["label", "list", "missing"], { baseDir })

    expect(result.argv).toEqual(["label", "list", "missing"])
    expect(result.cwd).toBe(join(import.meta.dir, "../.."))
    expect(typeof result.exitCode).toBe("number")
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Workspace 'missing' not found")
    expect(result.envPreview.GIT_STACKS_CONFIG_DIR).toBe(configDir)
    expect(result.envPreview.HOME).toStartWith(baseDir)
    expect(result.envPreview.PATH).toBeDefined()
  })

  test("does not leak unallowlisted env keys in formatted failures", () => {
    const result = runCli(["label", "list", "missing"], {
      baseDir,
      env: {
        GS_SCENARIO_ID: "redaction-proof",
        SECRET_TOKEN: "do-not-print",
      },
      envAllowlistExtras: ["GS_SCENARIO_ID"],
      artifactPaths: [join(configDir, "workspaces", "missing.yml")],
    })

    const failure = formatCliFailure(result)

    expect(failure).toContain("argv")
    expect(failure).toContain("cwd")
    expect(failure).toContain("exitCode")
    expect(failure).toContain("stdout")
    expect(failure).toContain("stderr")
    expect(failure).toContain("artifactPaths")
    expect(failure).toContain("GS_SCENARIO_ID")
    expect(failure).toContain("redaction-proof")
    expect(failure).not.toContain("SECRET_TOKEN")
    expect(failure).not.toContain("do-not-print")
  })

  test("forces isolated git and app config paths into env preview", () => {
    const result = runCli(["label", "list", "missing"], { baseDir })

    expect(result.envPreview.HOME).toBe(join(baseDir, ".git-test-home"))
    expect(result.envPreview.XDG_CONFIG_HOME).toBe(join(baseDir, ".git-test-home", ".config"))
    expect(result.envPreview.GNUPGHOME).toBe(join(baseDir, ".git-test-home", ".gnupg"))
    expect(result.envPreview.GIT_CONFIG_GLOBAL).toBe(join(baseDir, ".git-test-home", "gitconfig"))
    expect(result.envPreview.GIT_CONFIG_NOSYSTEM).toBe("1")
    expect(result.envPreview.GIT_TERMINAL_PROMPT).toBe("0")
    expect(result.envPreview.GIT_STACKS_CONFIG_DIR).toBe(configDir)
  })

  test("createConfigFixture creates the expected isolated config tree", () => {
    expect(readFileSync(join(configDir, "config.yml"), "utf8")).toContain(`workspace_root: ${join(baseDir, "ws-root")}`)
    expect(readFileSync(join(configDir, "registry.yml"), "utf8")).toBe("[]\n")
    expect(statSync(join(configDir, "workspaces")).isDirectory()).toBe(true)
    expect(statSync(join(configDir, "templates")).isDirectory()).toBe(true)
  })

  test("label add writes to the isolated workspace yaml", () => {
    const repoPath = makeGitRepo(baseDir, "demo-repo")
    const workspacePath = writeWorkspaceFixture(
      configDir,
      "demo.yml",
      `schema_version: "1"
name: demo
branch: feat/demo
created: "2024-01-01"
repos:
  - name: demo-repo
    repo: demo-repo
    type: other
    mode: worktree
    main_path: ${join(baseDir, "ws-root", "main", "demo-repo")}
    task_path: ${repoPath}
    base_branch: main
`
    )

    const result = runCli(["label", "add", "demo", "backend"], {
      baseDir,
      artifactPaths: [workspacePath],
    })

    expect(result.exitCode, formatCliFailure(result)).toBe(0)
    expect(result.stdout).toContain("Labels: backend")
    expect(readFileSync(workspacePath, "utf8")).toContain("backend")
  })

  test("template list reads templates from the isolated config fixture", () => {
    writeTemplateFixture(
      configDir,
      "api.yml",
      `schema_version: "1"
name: api
repos: []
labels:
  - backend
`
    )

    const result = runCli(["template", "list"], { baseDir })

    expect(result.exitCode, formatCliFailure(result)).toBe(0)
    expect(result.stdout).toContain("api")
  })

  test("formatCliFailure includes exact artifact paths", () => {
    const artifactPath = join(configDir, "templates", "api.yml")
    const result = runCli(["template", "show", "missing"], {
      baseDir,
      artifactPaths: [artifactPath],
    })

    expect(formatCliFailure(result)).toContain(artifactPath)
  })
})
