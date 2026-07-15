import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { join } from "path"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"

const PROJECT_ROOT = join(import.meta.dir, "../..")

function makeTmpDir(prefix = "template-list-test"): string {
  return mkdtempSync(join("/tmp", `${prefix}-`))
}

function setupFixture(tmpDir: string): string {
  const cfgDir = join(tmpDir, "config")
  mkdirSync(join(cfgDir, "templates"), { recursive: true })
  writeFileSync(join(cfgDir, "config.yml"), "workspace_root: /tmp/workspaces\n")
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")
  writeFileSync(
    join(cfgDir, "templates", "api.yml"),
    `schema_version: "1"
name: api
repos: []
labels:
  - backend
  - sprint:14
`
  )
  writeFileSync(
    join(cfgDir, "templates", "web.yml"),
    `schema_version: "1"
name: web
repos: []
labels:
  - frontend
`
  )
  writeFileSync(
    join(cfgDir, "templates", "ops.yml"),
    `schema_version: "1"
name: ops
repos: []
labels:
  - backend
`
  )
  return cfgDir
}

function runTemplateList(cfgDir: string, args: string[]) {
  const result = Bun.spawnSync(["node", "packages/cli/dist/index.js", "template", "list", ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
    stdio: ["pipe", "pipe", "pipe"],
  })

  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

describe("template list --label", () => {
  let tmpDir: string
  let cfgDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cfgDir = setupFixture(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("filters templates with repeatable exact-match AND semantics", () => {
    const result = runTemplateList(cfgDir, ["--label", "backend", "--label", "sprint:14"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("api")
    expect(result.stdout).not.toContain("web")
    expect(result.stdout).not.toContain("ops")
  })

  test("prints the label-specific no-match message", () => {
    const result = runTemplateList(cfgDir, ["--label", "frontend", "--label", "missing"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("No templates match labels: frontend, missing")
  })
})
