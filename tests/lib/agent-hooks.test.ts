import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { makeTmpDir, cleanup } from "../helpers"

let tmpDir: string

beforeEach(() => {
  tmpDir = makeTmpDir("agent-hooks-test")
})

afterEach(() => {
  cleanup(tmpDir)
})

describe("claudeCodePlugin", () => {
  it("has correct id and label", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    expect(claudeCodePlugin.id).toBe("claude-code")
    expect(claudeCodePlugin.label).toBe("Claude Code")
  })

  it("generateHookEntries returns 4 entries with workspace name interpolated", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    const entries = claudeCodePlugin.generateHookEntries("my-workspace")
    expect(entries).toHaveLength(4)

    expect(entries[0].event).toBe("Stop")
    expect(entries[0].matcher).toBeUndefined()
    expect(entries[0].command).toContain("my-workspace")
    expect(entries[0].command).toContain("git-stacks message send")

    expect(entries[1].event).toBe("PreToolUse")
    expect(entries[1].matcher).toBe("AskUserQuestion")
    expect(entries[1].command).toContain("my-workspace")
    expect(entries[1].command).toContain("git-stacks message send")

    expect(entries[2].event).toBe("UserPromptSubmit")
    expect(entries[2].matcher).toBeUndefined()
    expect(entries[2].command).toContain("my-workspace")
    expect(entries[2].command).toContain("git-stacks message clear")

    expect(entries[3].event).toBe("PostToolUse")
    expect(entries[3].matcher).toBe("AskUserQuestion")
    expect(entries[3].command).toContain("my-workspace")
    expect(entries[3].command).toContain("git-stacks message clear")
  })

  it("install creates .claude/settings.json with hooks", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    claudeCodePlugin.install(tmpDir, "test-ws")

    const settingsPath = join(tmpDir, ".claude", "settings.json")
    expect(existsSync(settingsPath)).toBe(true)

    const data = JSON.parse(readFileSync(settingsPath, "utf-8"))
    expect(Array.isArray(data.hooks)).toBe(true)
    expect(data.hooks).toHaveLength(4)
    expect(data.hooks[0].event).toBe("Stop")
  })

  it("install merges with existing settings without losing other keys", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    const claudeDir = join(tmpDir, ".claude")
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({ permissions: { allow: ["Read"] } }, null, 2)
    )

    claudeCodePlugin.install(tmpDir, "test-ws")

    const data = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"))
    expect(data.permissions).toEqual({ allow: ["Read"] })
    expect(Array.isArray(data.hooks)).toBe(true)
    expect(data.hooks).toHaveLength(4)
  })

  it("install is idempotent — running twice produces exactly 4 git-stacks hook entries", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    claudeCodePlugin.install(tmpDir, "test-ws")
    claudeCodePlugin.install(tmpDir, "test-ws")

    const data = JSON.parse(readFileSync(join(tmpDir, ".claude", "settings.json"), "utf-8"))
    const gsHooks = data.hooks.filter((h: { command: string }) => h.command.includes("git-stacks"))
    expect(gsHooks).toHaveLength(4)
  })

  it("remove strips git-stacks entries, preserves non-git-stacks hooks", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    const claudeDir = join(tmpDir, ".claude")
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        permissions: { allow: ["Read"] },
        hooks: [
          { event: "Stop", command: "git-stacks message send 'done' --workspace foo --from claude" },
          { event: "Stop", command: "echo custom-hook" },
        ],
      }, null, 2)
    )

    claudeCodePlugin.remove(tmpDir)

    const data = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"))
    expect(data.permissions).toEqual({ allow: ["Read"] })
    expect(data.hooks).toHaveLength(1)
    expect(data.hooks[0].command).toBe("echo custom-hook")
  })

  it("remove deletes hooks key when no hooks remain", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    claudeCodePlugin.install(tmpDir, "test-ws")
    claudeCodePlugin.remove(tmpDir)

    const data = JSON.parse(readFileSync(join(tmpDir, ".claude", "settings.json"), "utf-8"))
    expect(data.hooks).toBeUndefined()
  })

  it("remove is no-op on missing settings.json", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    // Should not throw
    expect(() => claudeCodePlugin.remove(tmpDir)).not.toThrow()
  })
})

describe("agentHookPlugins registry", () => {
  it("exports array containing claudeCodePlugin", async () => {
    const { agentHookPlugins, claudeCodePlugin } = await import("../../src/lib/agent-hooks/index")
    expect(Array.isArray(agentHookPlugins)).toBe(true)
    const found = agentHookPlugins.find((p) => p.id === "claude-code")
    expect(found).toBeDefined()
    expect(found).toBe(claudeCodePlugin)
  })
})
