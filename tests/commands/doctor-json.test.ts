import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"

const PROJECT_ROOT = join(import.meta.dir, "../..")

function makeTmpHome(prefix = "dr-json-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeConfigDir(tmpHome: string): string {
  const cfgDir = join(tmpHome, "config")
  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  // Minimal global config
  writeFileSync(
    join(cfgDir, "config.yml"),
    "workspace_root: /tmp/test-ws-root\n"
  )
  // Empty registry
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")
  return cfgDir
}

function runDoctor(cfgDir: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "doctor", ...args],
    {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    }
  )
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

describe("doctor --json", () => {
  let tmpHome: string
  let cfgDir: string

  beforeEach(() => {
    tmpHome = makeTmpHome()
    cfgDir = makeConfigDir(tmpHome)
  })

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
  })

  test("emits pure JSON with { healthy, issues } shape", () => {
    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    expect(parsed).toHaveProperty("healthy")
    expect(parsed).toHaveProperty("issues")
    expect(Array.isArray(parsed.issues)).toBe(true)
  })

  test("healthy is true when issues array is empty", () => {
    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    // With an empty registry and no workspaces, only binary checks may run.
    // We check that if issues is empty, healthy must be true.
    if (parsed.issues.length === 0) {
      expect(parsed.healthy).toBe(true)
    }
    // The key assertion: healthy === (issues.length === 0)
    expect(parsed.healthy).toBe(parsed.issues.length === 0)
  })

  test("healthy is false when issues exist", () => {
    // Add a workspace referencing a task_path that doesn't exist
    const wsYaml = `schema_version: "1"
name: broken-ws
branch: feat/broken
created: "2024-01-01"
repos:
  - name: api
    repo: api
    type: other
    mode: worktree
    main_path: /nonexistent/main/api
    task_path: /nonexistent/tasks/broken-ws/api
    base_branch: main
`
    writeFileSync(join(cfgDir, "workspaces", "broken-ws.yml"), wsYaml)
    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    expect(parsed.healthy).toBe(false)
    expect(parsed.issues.length).toBeGreaterThan(0)
  })

  test("issues array mirrors Issue interface: icon, entity, message, fix?", () => {
    // Add a workspace with bad paths so issues are generated
    const wsYaml = `schema_version: "1"
name: issue-ws
branch: feat/issue
created: "2024-01-01"
repos:
  - name: api
    repo: api
    type: other
    mode: worktree
    main_path: /nonexistent/main/api
    task_path: /nonexistent/tasks/issue-ws/api
    base_branch: main
`
    writeFileSync(join(cfgDir, "workspaces", "issue-ws.yml"), wsYaml)
    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    expect(parsed.issues.length).toBeGreaterThan(0)
    for (const issue of parsed.issues) {
      expect(issue).toHaveProperty("icon")
      expect(issue).toHaveProperty("entity")
      expect(issue).toHaveProperty("message")
      expect(["pass", "fail", "warn"]).toContain(issue.icon)
      // fix is optional — now a structured FixOperation object, not a plain string
      if ("fix" in issue) {
        expect(typeof issue.fix).toBe("object")
        expect(issue.fix).not.toBeNull()
        expect(typeof issue.fix.action).toBe("string")
      }
    }
  })

  test("no human-readable text mixed with JSON output", () => {
    const { stdout } = runDoctor(cfgDir, ["--json"])
    // Must be valid JSON (parsing would throw if not)
    const parsed = JSON.parse(stdout.trim())
    // The entire stdout must be a single JSON object — no extra text before or after
    expect(typeof parsed).toBe("object")
    // Check there is exactly one parseable unit — no extra lines with human text
    const trimmed = stdout.trim()
    // Should start with { and end with }
    expect(trimmed.startsWith("{")).toBe(true)
    expect(trimmed.endsWith("}")).toBe(true)
  })
})

describe("dir repo health checks", () => {
  let tmpHome: string
  let cfgDir: string

  beforeEach(() => {
    tmpHome = makeTmpHome("dr-dir-test")
    cfgDir = makeConfigDir(tmpHome)
  })

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
  })

  function makeDirWorkspaceYaml(mainPath: string): string {
    return `schema_version: "1"
name: dir-test-ws
branch: feat/dir-test
template: test-tmpl
created: "2024-01-01"
repos:
  - name: config-dir
    repo: config-dir
    type: other
    mode: dir
    main_path: ${mainPath}
`
  }

  test("healthy dir repo produces no dir-path issues", () => {
    const dirPath = join(tmpHome, "real-dir")
    mkdirSync(dirPath, { recursive: true })
    writeFileSync(join(cfgDir, "workspaces", "dir-test-ws.yml"), makeDirWorkspaceYaml(dirPath))

    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    // Should produce no issues about dir repo path validity (missing or not-a-directory)
    const dirPathIssues = parsed.issues.filter(
      (i: { entity: string; message: string }) =>
        i.entity === "dir-test-ws" &&
        (i.message.includes("dir repo") || i.message.includes("not a directory"))
    )
    expect(dirPathIssues.length).toBe(0)
  })

  test("missing dir path reported with dir-specific message", () => {
    const missingPath = `/tmp/nonexistent-dir-${Date.now()}`
    writeFileSync(join(cfgDir, "workspaces", "dir-test-ws.yml"), makeDirWorkspaceYaml(missingPath))

    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    const issue = parsed.issues.find(
      (i: { message: string }) => i.message.includes("dir repo") && i.message.includes("path missing")
    )
    expect(issue).toBeDefined()
    expect(issue.icon).toBe("fail")
  })

  test("dir path that is a file reports not-a-directory", () => {
    const filePath = join(tmpHome, "not-a-dir.txt")
    writeFileSync(filePath, "I am a file")
    writeFileSync(join(cfgDir, "workspaces", "dir-test-ws.yml"), makeDirWorkspaceYaml(filePath))

    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    const issue = parsed.issues.find(
      (i: { message: string }) => i.message.includes("not a directory")
    )
    expect(issue).toBeDefined()
    expect(issue.icon).toBe("fail")
  })

  test("dir repo does not trigger findMissingMainClones", () => {
    const missingPath = `/tmp/nonexistent-dir-${Date.now()}`
    writeFileSync(join(cfgDir, "workspaces", "dir-test-ws.yml"), makeDirWorkspaceYaml(missingPath))

    const { stdout } = runDoctor(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    const genericCloneIssue = parsed.issues.find(
      (i: { entity: string; message: string }) =>
        i.entity === "dir-test-ws" && i.message.includes("main_path missing")
    )
    expect(genericCloneIssue).toBeUndefined()
  })
})
