import { describe, test, expect, afterAll } from "bun:test"
import { join } from "path"
import { makeTmpDir, cleanup } from "../helpers"

// Set env BEFORE importing paths (module constants evaluate at import time)
const tmp = makeTmpDir("paths-test")
process.env.GIT_STACKS_CONFIG_DIR = tmp

// Now import — WS_CONFIG_DIR will pick up the env var
const { WS_CONFIG_DIR, WORKSPACES_DIR, REGISTRY_FILE, TEMPLATES_DIR, MESSAGES_DIR, GLOBAL_CONFIG_FILE } = await import("../../src/lib/paths")

afterAll(() => {
  delete process.env.GIT_STACKS_CONFIG_DIR
  cleanup(tmp)
})

describe("paths.ts GIT_STACKS_CONFIG_DIR override", () => {
  test("WS_CONFIG_DIR equals the env var value", () => {
    expect(WS_CONFIG_DIR).toBe(tmp)
  })

  test("WORKSPACES_DIR derives from overridden WS_CONFIG_DIR", () => {
    expect(WORKSPACES_DIR).toBe(join(tmp, "workspaces"))
  })

  test("REGISTRY_FILE derives from overridden WS_CONFIG_DIR", () => {
    expect(REGISTRY_FILE).toBe(join(tmp, "registry.yml"))
  })

  test("TEMPLATES_DIR derives from overridden WS_CONFIG_DIR", () => {
    expect(TEMPLATES_DIR).toBe(join(tmp, "templates"))
  })

  test("MESSAGES_DIR derives from overridden WS_CONFIG_DIR", () => {
    expect(MESSAGES_DIR).toBe(join(tmp, "messages"))
  })

  test("GLOBAL_CONFIG_FILE derives from overridden WS_CONFIG_DIR", () => {
    expect(GLOBAL_CONFIG_FILE).toBe(join(tmp, "config.yml"))
  })
})
