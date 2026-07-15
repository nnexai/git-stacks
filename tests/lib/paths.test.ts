import { describe, test, expect, afterAll } from "bun:test"
import { join } from "path"
import { makeTmpDir, cleanup } from "../helpers"
import { readFileSync } from "fs"
import { spawnSync } from "child_process"

const tmp = makeTmpDir("paths-test")

afterAll(() => {
  cleanup(tmp)
})

describe("paths.ts GIT_STACKS_CONFIG_DIR override", () => {
  // Verify the source contains the env override pattern
  test("paths.ts source contains GIT_STACKS_CONFIG_DIR env override", () => {
    const src = readFileSync(join(import.meta.dir, "../../packages/core/src/paths.ts"), "utf-8")
    expect(src).toContain("process.env.GIT_STACKS_CONFIG_DIR")
  })

  // Spawn a fresh Bun process to evaluate paths.ts in isolation, verifying
  // that the env var is read at module load time and overrides all derived paths.
  test("WS_CONFIG_DIR equals GIT_STACKS_CONFIG_DIR in a fresh process", () => {
    const script = `
      const { WS_CONFIG_DIR } = await import("${join(import.meta.dir, "../../packages/core/src/paths")}")
      console.log(WS_CONFIG_DIR)
    `
    const result = spawnSync("bun", ["--eval", script], {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: tmp },
      encoding: "utf-8",
    })
    expect(result.stdout.trim()).toBe(tmp)
  })

  test("WORKSPACES_DIR derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    const script = `
      const { WORKSPACES_DIR } = await import("${join(import.meta.dir, "../../packages/core/src/paths")}")
      console.log(WORKSPACES_DIR)
    `
    const result = spawnSync("bun", ["--eval", script], {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: tmp },
      encoding: "utf-8",
    })
    expect(result.stdout.trim()).toBe(join(tmp, "workspaces"))
  })

  test("REGISTRY_FILE derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    const script = `
      const { REGISTRY_FILE } = await import("${join(import.meta.dir, "../../packages/core/src/paths")}")
      console.log(REGISTRY_FILE)
    `
    const result = spawnSync("bun", ["--eval", script], {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: tmp },
      encoding: "utf-8",
    })
    expect(result.stdout.trim()).toBe(join(tmp, "registry.yml"))
  })

  test("TEMPLATES_DIR derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    const script = `
      const { TEMPLATES_DIR } = await import("${join(import.meta.dir, "../../packages/core/src/paths")}")
      console.log(TEMPLATES_DIR)
    `
    const result = spawnSync("bun", ["--eval", script], {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: tmp },
      encoding: "utf-8",
    })
    expect(result.stdout.trim()).toBe(join(tmp, "templates"))
  })

  test("NOTES_DIR derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    const script = `
      const { NOTES_DIR } = await import("${join(import.meta.dir, "../../packages/core/src/paths")}")
      console.log(NOTES_DIR)
    `
    const result = spawnSync("bun", ["--eval", script], {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: tmp },
      encoding: "utf-8",
    })
    expect(result.stdout.trim()).toBe(join(tmp, "notes"))
  })

  test("GLOBAL_CONFIG_FILE derives from overridden WS_CONFIG_DIR in a fresh process", () => {
    const script = `
      const { GLOBAL_CONFIG_FILE } = await import("${join(import.meta.dir, "../../packages/core/src/paths")}")
      console.log(GLOBAL_CONFIG_FILE)
    `
    const result = spawnSync("bun", ["--eval", script], {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: tmp },
      encoding: "utf-8",
    })
    expect(result.stdout.trim()).toBe(join(tmp, "config.yml"))
  })
})
