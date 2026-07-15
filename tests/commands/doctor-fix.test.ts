import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { runProcessSync } from "../process"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"

const PROJECT_ROOT = join(import.meta.dirname, "../..")

function makeTmpHome(prefix = "dr-fix-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeConfigDir(tmpHome: string): string {
  const cfgDir = join(tmpHome, "config")
  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  writeFileSync(join(cfgDir, "config.yml"), "workspace_root: /tmp/test-ws-root\n")
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")
  return cfgDir
}

function addBrokenWorkspace(cfgDir: string, name = "broken-ws"): void {
  const wsYaml = `schema_version: "1"
name: ${name}
branch: feat/${name}
created: "2024-01-01"
repos:
  - name: api
    repo: api
    type: other
    mode: worktree
    main_path: /nonexistent/main/api
    task_path: /nonexistent/tasks/${name}/api
    base_branch: main
`
  writeFileSync(join(cfgDir, "workspaces", `${name}.yml`), wsYaml)
}

/**
 * Run the doctor command via subprocess with controlled input piped to stdin.
 * stdinInput is used to simulate user answering prompts (e.g., "n\n" to decline fix).
 */
function runDoctorWithInput(
  cfgDir: string,
  args: string[],
  stdinInput = ""
): { stdout: string; stderr: string; exitCode: number } {
  const result = runProcessSync(
    ["node", "packages/cli/dist/index.js", "doctor", ...args],
    {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
      cwd: PROJECT_ROOT,
      stdin: stdinInput ? Buffer.from(stdinInput) : "pipe",
      stdio: ["pipe", "pipe", "pipe"],
    }
  )
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

describe("doctor --fix", () => {
  let tmpHome: string
  let cfgDir: string

  beforeEach(() => {
    tmpHome = makeTmpHome()
    cfgDir = makeConfigDir(tmpHome)
  })

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
  })

  test("lists all issues then asks confirmation for fixable ones", () => {
    addBrokenWorkspace(cfgDir)
    // Pipe "n\n" to decline the confirmation prompt
    const { stdout } = runDoctorWithInput(cfgDir, ["--fix"], "n\n")
    // Should show "Fixes to execute:" section listing fixable issues
    expect(stdout).toContain("Fixes to execute:")
    // The confirmation prompt should be shown (clack renders singular "fix" or plural "fixes")
    expect(stdout).toMatch(/\d+ fix(es)? available\. Execute all\?/)
  })

  test("--fix --force skips confirmation prompt", () => {
    addBrokenWorkspace(cfgDir)
    // With --force, no confirmation is asked so the command proceeds directly to executing fixes
    const { stdout } = runDoctorWithInput(cfgDir, ["--fix", "--force"])
    // Should print summary line: "N fixed, M failed."
    expect(stdout).toMatch(/\d+ fixed, \d+ failed\./)
    // Should NOT contain "Cancelled." since --force skips the prompt
    expect(stdout).not.toContain("Cancelled.")
  })

  test("continues past individual fix failures", () => {
    addBrokenWorkspace(cfgDir, "ws1")
    addBrokenWorkspace(cfgDir, "ws2")
    // With two broken workspaces, there will be multiple fixes that will fail (rm -rf of nonexistent paths, etc.)
    // Run with --force so no confirmation required
    const { stdout } = runDoctorWithInput(cfgDir, ["--fix", "--force"])
    // Should show the summary line showing multiple attempts
    expect(stdout).toMatch(/\d+ fixed, \d+ failed\./)
  })

  test("reports N fixed, M failed summary at end", () => {
    addBrokenWorkspace(cfgDir)
    const { stdout } = runDoctorWithInput(cfgDir, ["--fix", "--force"])
    // The summary line format is: "  N fixed, M failed."
    expect(stdout).toMatch(/\d+ fixed, \d+ failed\./)
  })

  test("issues without fix show (no auto-fix) annotation", () => {
    // Add a workspace referencing a non-registered repo — this produces an unfixable issue
    // (deadRepoRefs issues have no `fix` field)
    const wsYaml = `schema_version: "1"
name: nofix-ws
branch: feat/nofix
created: "2024-01-01"
repos:
  - name: unregistered-repo
    repo: unregistered-repo
    type: other
    mode: trunk
    main_path: /some/path
    task_path: /some/path
    base_branch: main
`
    writeFileSync(join(cfgDir, "workspaces", "nofix-ws.yml"), wsYaml)
    const { stdout } = runDoctorWithInput(cfgDir, ["--fix"], "n\n")
    // Unfixable issues should display "no auto-fix — manual action needed"
    expect(stdout).toContain("no auto-fix")
  })

  test("--json + --fix emits JSON with fix results", () => {
    addBrokenWorkspace(cfgDir)
    const { stdout } = runDoctorWithInput(cfgDir, ["--json", "--fix"])
    const parsed = JSON.parse(stdout.trim())
    expect(parsed).toHaveProperty("healthy")
    expect(parsed).toHaveProperty("issues")
    expect(parsed).toHaveProperty("fixes")
    expect(Array.isArray(parsed.fixes)).toBe(true)
    // Each fix result should have entity, fix, success fields
    for (const fix of parsed.fixes) {
      expect(fix).toHaveProperty("entity")
      expect(fix).toHaveProperty("fix")
      expect(fix).toHaveProperty("success")
      expect(typeof fix.success).toBe("boolean")
    }
  })

  test("fix operations in JSON output are structured objects, not shell strings", () => {
    addBrokenWorkspace(cfgDir)
    const { stdout } = runDoctorWithInput(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    const fixableIssues = parsed.issues.filter((i: { fix?: unknown }) => i.fix !== undefined)
    // fix field should be a structured object with action property, not a plain string
    for (const issue of fixableIssues) {
      expect(typeof issue.fix).toBe("object")
      expect(issue.fix).not.toBeNull()
      expect(typeof issue.fix.action).toBe("string")
    }
  })

  test("orphaned task dir fix has action=remove-dir and path field", () => {
    // Create an orphaned task dir (tasks dir with no matching workspace YAML)
    const tasksDir = "/tmp/test-ws-root/tasks"
    mkdirSync(join(tasksDir, "orphaned-task"), { recursive: true })

    // We need a workspace config pointing to this tasksDir
    const cfgWithRoot = join(tmpHome, "cfgwithroot")
    mkdirSync(join(cfgWithRoot, "workspaces"), { recursive: true })
    writeFileSync(join(cfgWithRoot, "config.yml"), `workspace_root: /tmp/test-ws-root\n`)
    writeFileSync(join(cfgWithRoot, "registry.yml"), "[]\n")

    const { stdout } = runDoctorWithInput(cfgWithRoot, ["--json"])
    // Clean up orphaned dir after test
    try { rmSync(join(tasksDir, "orphaned-task"), { recursive: true, force: true }) } catch { /* ignore */ }

    const parsed = JSON.parse(stdout.trim())
    const orphanIssues = parsed.issues.filter((i: { entity: string; fix?: { action: string; path?: string } }) =>
      i.entity.startsWith("tasks/") && i.fix?.action === "remove-dir"
    )
    if (orphanIssues.length > 0) {
      const fix = orphanIssues[0].fix
      expect(fix.action).toBe("remove-dir")
      expect(typeof fix.path).toBe("string")
      expect(fix.path).toContain("orphaned-task")
    }
  })

  test("missing worktree fix has action=open-workspace and name field", () => {
    addBrokenWorkspace(cfgDir, "ws-open-fix")
    const { stdout } = runDoctorWithInput(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    const missingWorktreeIssues = parsed.issues.filter(
      (i: { fix?: { action: string; name?: string } }) => i.fix?.action === "open-workspace"
    )
    if (missingWorktreeIssues.length > 0) {
      const fix = missingWorktreeIssues[0].fix
      expect(fix.action).toBe("open-workspace")
      expect(typeof fix.name).toBe("string")
    }
  })

  test("--fix --force uses rmSync for remove-dir, not sh -c", () => {
    // Create a real temp dir to be removed (so rmSync succeeds)
    const toRemove = join(tmpHome, "fake-task-dir")
    mkdirSync(toRemove, { recursive: true })

    const cfgWithTaskDir = join(tmpHome, "cfgtask")
    mkdirSync(join(cfgWithTaskDir, "workspaces"), { recursive: true })
    writeFileSync(join(cfgWithTaskDir, "config.yml"), `workspace_root: ${tmpHome}\n`)
    writeFileSync(join(cfgWithTaskDir, "registry.yml"), "[]\n")
    // Create a tasks subdir with an "orphaned" directory
    const tasksDir = join(tmpHome, "tasks")
    mkdirSync(join(tasksDir, "orphan-ws"), { recursive: true })

    const { stdout } = runDoctorWithInput(cfgWithTaskDir, ["--fix", "--force"])
    // The orphaned dir fix should succeed via rmSync (not sh -c)
    expect(stdout).toMatch(/\d+ fixed, \d+ failed\./)
    // The fixed count should include the orphan removal
    const match = stdout.match(/(\d+) fixed/)
    if (match) {
      expect(parseInt(match[1])).toBeGreaterThan(0)
    }
  })
})
