import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { runProcessSync } from "../process"
import { mkdirSync, writeFileSync, rmSync, readFileSync, mkdtempSync } from "fs"
import { join } from "path"

const PROJECT_ROOT = join(import.meta.dirname, "../..")

function makeTmpDir(prefix = "label-test"): string {
  return mkdtempSync(join("/tmp", `${prefix}-`))
}

function setupFixture(tmpDir: string): string {
  const cfgDir = join(tmpDir, "config")
  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  writeFileSync(join(cfgDir, "config.yml"), "workspace_root: /tmp/workspaces\n")
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")
  writeFileSync(join(cfgDir, "workspaces", "alpha.yml"), `schema_version: "1"
name: alpha
branch: feature/alpha
created: "2024-01-01"
labels:
  - backend
repos: []
`)
  return cfgDir
}

function runLabel(cfgDir: string, args: string[]) {
  const result = runProcessSync(["node", "packages/cli/dist/index.js", "label", ...args], {
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

describe("label command", () => {
  let tmpDir: string
  let cfgDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cfgDir = setupFixture(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("add deduplicates labels", () => {
    const result = runLabel(cfgDir, ["add", "alpha", "backend", "sprint:14"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Labels: backend, sprint:14")

    const saved = readFileSync(join(cfgDir, "workspaces", "alpha.yml"), "utf8")
    expect(saved).toContain("backend")
    expect(saved).toContain("sprint:14")
  })

  test("list prints one label per line", () => {
    const result = runLabel(cfgDir, ["list", "alpha"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim().split("\n")).toEqual(["backend"])
  })

  test("remove clears labels when last one removed", () => {
    const result = runLabel(cfgDir, ["remove", "alpha", "backend"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("No labels remaining.")

    const saved = readFileSync(join(cfgDir, "workspaces", "alpha.yml"), "utf8")
    expect(saved).not.toContain("labels:")
  })

  test("remove reports remaining labels and clear removes the labels field", () => {
    const addResult = runLabel(cfgDir, ["add", "alpha", "sprint:82", "urgent"])
    expect(addResult.exitCode).toBe(0)
    expect(addResult.stdout).toContain("Labels: backend, sprint:82, urgent")

    const removeResult = runLabel(cfgDir, ["remove", "alpha", "backend"])
    expect(removeResult.exitCode).toBe(0)
    expect(removeResult.stdout).toContain("Labels: sprint:82, urgent")

    const listResult = runLabel(cfgDir, ["list", "alpha"])
    expect(listResult.exitCode).toBe(0)
    expect(listResult.stdout.trim().split("\n")).toEqual(["sprint:82", "urgent"])

    const clearResult = runLabel(cfgDir, ["clear", "alpha"])
    expect(clearResult.exitCode).toBe(0)
    expect(clearResult.stdout).toContain("Labels cleared.")

    const saved = readFileSync(join(cfgDir, "workspaces", "alpha.yml"), "utf8")
    expect(saved).not.toContain("labels:")

    const emptyList = runLabel(cfgDir, ["list", "alpha"])
    expect(emptyList.exitCode).toBe(0)
    expect(emptyList.stdout).toContain("No labels.")
  })

  test("rejects invalid labels", () => {
    const result = runLabel(cfgDir, ["add", "alpha", "bad label"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Invalid label "bad label"')
  })
})
