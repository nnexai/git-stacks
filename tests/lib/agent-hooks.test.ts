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

  it("install creates .claude/settings.json with nested hooks format", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    claudeCodePlugin.install(tmpDir, "test-ws")

    const settingsPath = join(tmpDir, ".claude", "settings.json")
    expect(existsSync(settingsPath)).toBe(true)

    const data = JSON.parse(readFileSync(settingsPath, "utf-8"))
    // hooks should be an object keyed by event name
    expect(typeof data.hooks).toBe("object")
    expect(Array.isArray(data.hooks)).toBe(false)

    // Check event keys exist
    expect(data.hooks.Stop).toBeDefined()
    expect(data.hooks.PreToolUse).toBeDefined()
    expect(data.hooks.UserPromptSubmit).toBeDefined()
    expect(data.hooks.PostToolUse).toBeDefined()

    // Each event has matcher groups with nested hooks
    expect(data.hooks.Stop).toHaveLength(1)
    expect(data.hooks.Stop[0].hooks[0].type).toBe("command")
    expect(data.hooks.Stop[0].hooks[0].command).toContain("git-stacks")

    // PreToolUse has a matcher
    expect(data.hooks.PreToolUse[0].matcher).toBe("AskUserQuestion")
    expect(data.hooks.PreToolUse[0].hooks[0].type).toBe("command")
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
    expect(typeof data.hooks).toBe("object")
    expect(data.hooks.Stop).toBeDefined()
  })

  it("install preserves existing non-git-stacks hooks in the same event", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    const claudeDir = join(tmpDir, ".claude")
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo custom-hook" }] }],
        },
      }, null, 2)
    )

    claudeCodePlugin.install(tmpDir, "test-ws")

    const data = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"))
    // Should have the custom hook + git-stacks hook
    expect(data.hooks.Stop).toHaveLength(2)
    expect(data.hooks.Stop[0].hooks[0].command).toBe("echo custom-hook")
    expect(data.hooks.Stop[1].hooks[0].command).toContain("git-stacks")
  })

  it("install is idempotent — running twice produces exactly one git-stacks entry per event", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    claudeCodePlugin.install(tmpDir, "test-ws")
    claudeCodePlugin.install(tmpDir, "test-ws")

    const data = JSON.parse(readFileSync(join(tmpDir, ".claude", "settings.json"), "utf-8"))
    // Each event should have exactly 1 matcher group (git-stacks)
    expect(data.hooks.Stop).toHaveLength(1)
    expect(data.hooks.PreToolUse).toHaveLength(1)
    expect(data.hooks.UserPromptSubmit).toHaveLength(1)
    expect(data.hooks.PostToolUse).toHaveLength(1)
  })

  it("remove strips git-stacks entries, preserves non-git-stacks hooks", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    const claudeDir = join(tmpDir, ".claude")
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        permissions: { allow: ["Read"] },
        hooks: {
          Stop: [
            { hooks: [{ type: "command", command: "git-stacks message send 'done' --workspace foo --from claude" }] },
            { hooks: [{ type: "command", command: "echo custom-hook" }] },
          ],
        },
      }, null, 2)
    )

    claudeCodePlugin.remove(tmpDir)

    const data = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8"))
    expect(data.permissions).toEqual({ allow: ["Read"] })
    expect(data.hooks.Stop).toHaveLength(1)
    expect(data.hooks.Stop[0].hooks[0].command).toBe("echo custom-hook")
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
    const found = agentHookPlugins.find((p: { id: string }) => p.id === "claude-code")
    expect(found).toBeDefined()
    expect(found).toBe(claudeCodePlugin)
  })
})
