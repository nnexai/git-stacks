import { describe, test, expect, afterAll } from "@test/api"
import { join } from "path"
import { pathToFileURL } from "url"
import { makeTmpDir, cleanup } from "../helpers"
import { readFileSync } from "fs"
import { spawnSync } from "child_process"

const tmp = makeTmpDir("paths-test")

afterAll(() => {
  cleanup(tmp)
})

describe("paths.ts GIT_STACKS_CONFIG_DIR override", () => {
  const pathsModule = pathToFileURL(join(import.meta.dirname, "../../packages/core/src/paths.ts")).href
  function readFreshPath(exportName: string): string {
    const script = `const { ${exportName} } = await import(${JSON.stringify(pathsModule)}); console.log(${exportName})`
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: tmp },
      encoding: "utf-8",
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }

  // Verify the source contains the env override pattern
  test("paths.ts source contains GIT_STACKS_CONFIG_DIR env override", () => {
    const src = readFileSync(join(import.meta.dirname, "../../packages/core/src/paths.ts"), "utf-8")
    expect(src).toContain("process.env.GIT_STACKS_CONFIG_DIR")
  })

  // Spawn a fresh Node process to evaluate paths.ts in isolation, verifying
  // that the env var is read at module load time and overrides all derived paths.
  test("WS_CONFIG_DIR equals GIT_STACKS_CONFIG_DIR in a fresh process", () => {
    expect(readFreshPath("WS_CONFIG_DIR")).toBe(tmp)
  })

  test("WORKSPACES_DIR derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    expect(readFreshPath("WORKSPACES_DIR")).toBe(join(tmp, "workspaces"))
  })

  test("REGISTRY_FILE derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    expect(readFreshPath("REGISTRY_FILE")).toBe(join(tmp, "registry.yml"))
  })

  test("TEMPLATES_DIR derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    expect(readFreshPath("TEMPLATES_DIR")).toBe(join(tmp, "templates"))
  })

  test("NOTES_DIR derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    expect(readFreshPath("NOTES_DIR")).toBe(join(tmp, "notes"))
  })

  test("GLOBAL_CONFIG_FILE derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    expect(readFreshPath("GLOBAL_CONFIG_FILE")).toBe(join(tmp, "config.yml"))
  })
})
