import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { join } from "path"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"

const PROJECT_ROOT = join(import.meta.dir, "../..")

function makeTmpDir(prefix = "template-label-test"): string {
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
`
  )
  return cfgDir
}

function runTemplateLabel(cfgDir: string, args: string[]) {
  const result = Bun.spawnSync(["bun", "run", "src/index.ts", "template", "label", ...args], {
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

describe("template label command", () => {
  let tmpDir: string
  let cfgDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cfgDir = setupFixture(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("add writes deduplicated labels and reports merged output", () => {
    const result = runTemplateLabel(cfgDir, ["add", "api", "backend", "release:1"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Labels: backend, release:1")

    const saved = readFileSync(join(cfgDir, "templates", "api.yml"), "utf8")
    expect(saved).toContain("backend")
    expect(saved).toContain("release:1")
  })

  test("list prints one label per line and clear removes the labels field", () => {
    const listResult = runTemplateLabel(cfgDir, ["list", "api"])

    expect(listResult.exitCode).toBe(0)
    expect(listResult.stdout.trim().split("\n")).toEqual(["backend"])

    const clearResult = runTemplateLabel(cfgDir, ["clear", "api"])

    expect(clearResult.exitCode).toBe(0)
    expect(clearResult.stdout).toContain("Labels cleared.")

    const saved = readFileSync(join(cfgDir, "templates", "api.yml"), "utf8")
    expect(saved).not.toContain("labels:")

    const emptyListResult = runTemplateLabel(cfgDir, ["list", "api"])

    expect(emptyListResult.exitCode).toBe(0)
    expect(emptyListResult.stdout).toContain("No labels.")
  })

  test("remove reports no labels remaining when the last label is removed", () => {
    const result = runTemplateLabel(cfgDir, ["remove", "api", "backend"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("No labels remaining.")

    const saved = readFileSync(join(cfgDir, "templates", "api.yml"), "utf8")
    expect(saved).not.toContain("labels:")
  })

  test("rejects invalid labels", () => {
    const result = runTemplateLabel(cfgDir, ["add", "api", "bad label"])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Invalid label "bad label"')
  })
})
