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

  it("generateHookEntries returns all five attention states with workspace name interpolated", async () => {
    const { claudeCodePlugin } = await import("../../src/lib/agent-hooks/claude-code")
    const entries = claudeCodePlugin.generateHookEntries("my-workspace")
    expect(entries).toHaveLength(5)

    expect(entries[0].event).toBe("Stop")
    expect(entries[0].matcher).toBeUndefined()
    expect(entries[0].command).toContain("my-workspace")
    expect(entries.map((entry) => entry.event)).toEqual(["Stop", "PostToolUseFailure", "PreToolUse", "UserPromptSubmit", "PostToolUse"])
    expect(entries.map((entry) => entry.command.match(/--state (\w+)/)?.[1])).toEqual(["completed", "failed", "waiting", "working", "idle"])
    for (const entry of entries) expect(entry.command).toContain("git-stacks service attention publish")
    expect(entries[2].matcher).toBe("AskUserQuestion")
    expect(entries[4].matcher).toBe("AskUserQuestion")
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

describe("codexPlugin", () => {
  it("merges idempotently and removes only Codex publisher commands", async () => {
    const { codexPlugin } = await import("../../src/lib/agent-hooks/codex")
    const dir = join(tmpDir, ".codex")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "hooks.json"), JSON.stringify({ custom: true, hooks: {
      Stop: [{ hooks: [
        { type: "command", command: "echo user" },
        { type: "command", command: "git-stacks service attention publish --source claude" },
        { type: "command", command: "git-stacks service attention publish --source codex --state idle" },
      ] }],
      SessionStart: [{ hooks: [{ type: "command", command: "echo gsd" }] }],
    } }, null, 2))
    codexPlugin.install(tmpDir, "alpha")
    codexPlugin.install(tmpDir, "alpha")
    let data = JSON.parse(readFileSync(join(dir, "hooks.json"), "utf-8"))
    expect(data.custom).toBe(true)
    expect(data.hooks.SessionStart).toHaveLength(1)
    expect(data.hooks.Stop.flatMap((g: any) => g.hooks).filter((h: any) => h.command.includes("--source codex"))).toHaveLength(1)
    expect(data.hooks.Stop.flatMap((g: any) => g.hooks).some((h: any) => h.command.includes("--source claude"))).toBe(true)
    codexPlugin.remove(tmpDir)
    data = JSON.parse(readFileSync(join(dir, "hooks.json"), "utf-8"))
    expect(data.hooks.Stop.flatMap((g: any) => g.hooks).map((h: any) => h.command)).toEqual(["echo user", "git-stacks service attention publish --source claude"])
  })

  it("creates missing files, tolerates remove-before-install, and preserves malformed bytes", async () => {
    const { codexPlugin } = await import("../../src/lib/agent-hooks/codex")
    expect(() => codexPlugin.remove(tmpDir)).not.toThrow()
    codexPlugin.install(tmpDir, "alpha")
    expect(existsSync(join(tmpDir, ".codex", "hooks.json"))).toBe(true)
    const malformed = "{ definitely-not-json\n"
    writeFileSync(join(tmpDir, ".codex", "hooks.json"), malformed)
    expect(() => codexPlugin.install(tmpDir, "alpha")).toThrow(".codex/hooks.json")
    expect(readFileSync(join(tmpDir, ".codex", "hooks.json"), "utf-8")).toBe(malformed)
  })
})

describe("copilotPlugin", () => {
  it("has correct id and label", async () => {
    const { copilotPlugin } = await import("../../src/lib/agent-hooks/copilot")
    expect(copilotPlugin.id).toBe("copilot")
    expect(copilotPlugin.label).toBe("GitHub Copilot")
  })

  it("generateHookEntries returns all five attention states with workspace name interpolated", async () => {
    const { copilotPlugin } = await import("../../src/lib/agent-hooks/copilot")
    const entries = copilotPlugin.generateHookEntries("my-workspace")
    expect(entries).toHaveLength(5)

    expect(entries[0].event).toBe("Stop")
    expect(entries[0].matcher).toBeUndefined()
    expect(entries[0].command).toContain("my-workspace")
    expect(entries[0].command).toContain("copilot")

    expect(entries.map((entry) => entry.event)).toEqual(["Stop", "PostToolUseFailure", "PreToolUse", "UserPromptSubmit", "PostToolUse"])
    expect(entries.map((entry) => entry.command.match(/--state (\w+)/)?.[1])).toEqual(["completed", "failed", "waiting", "working", "idle"])
    for (const entry of entries) expect(entry.command).toContain("--source copilot")
    expect(entries[2].matcher).toBe("AskUserQuestion")
    expect(entries[4].matcher).toBe("AskUserQuestion")
  })

  it("install creates .github/hooks/git-stacks.json with Copilot format", async () => {
    const { copilotPlugin } = await import("../../src/lib/agent-hooks/copilot")
    copilotPlugin.install(tmpDir, "test-ws")

    const hooksPath = join(tmpDir, ".github", "hooks", "git-stacks.json")
    expect(existsSync(hooksPath)).toBe(true)

    const data = JSON.parse(readFileSync(hooksPath, "utf-8"))
    expect(data.version).toBe(1)
    expect(typeof data.hooks).toBe("object")
    expect(Array.isArray(data.hooks)).toBe(false)

    expect(Array.isArray(data.hooks.sessionEnd)).toBe(true)
    expect(data.hooks.sessionEnd.length).toBeGreaterThanOrEqual(1)

    expect(Array.isArray(data.hooks.userPromptSubmitted)).toBe(true)
    expect(data.hooks.userPromptSubmitted.length).toBeGreaterThanOrEqual(1)

    expect(Array.isArray(data.hooks.preToolUse)).toBe(true)

    // All entries have required shape
    const allEntries = [
      ...data.hooks.sessionEnd,
      ...(data.hooks.userPromptSubmitted ?? []),
      ...(data.hooks.preToolUse ?? []),
      ...(data.hooks.postToolUse ?? []),
    ]
    for (const entry of allEntries) {
      expect(entry.type).toBe("command")
      expect(typeof entry.bash).toBe("string")
      expect(entry.env?.GS_WORKSPACE_NAME).toBe("test-ws")
      expect(entry.env?.GS_FROM).toBe("copilot")
      expect(entry.timeoutSec).toBe(10)
    }
  })

  it("preToolUse entries filter by toolName from stdin", async () => {
    const { copilotPlugin } = await import("../../src/lib/agent-hooks/copilot")
    copilotPlugin.install(tmpDir, "test-ws")

    const hooksPath = join(tmpDir, ".github", "hooks", "git-stacks.json")
    const data = JSON.parse(readFileSync(hooksPath, "utf-8"))
    const preToolUseEntries = data.hooks.preToolUse ?? []
    expect(preToolUseEntries.length).toBeGreaterThanOrEqual(1)

    // At least one entry should contain toolName filtering logic
    const hasToolNameFilter = preToolUseEntries.some((e: { bash: string }) => e.bash.includes("toolName"))
    expect(hasToolNameFilter).toBe(true)
  })

  it("install is idempotent — running twice produces same output", async () => {
    const { copilotPlugin } = await import("../../src/lib/agent-hooks/copilot")
    copilotPlugin.install(tmpDir, "test-ws")
    copilotPlugin.install(tmpDir, "test-ws")

    const hooksPath = join(tmpDir, ".github", "hooks", "git-stacks.json")
    const data = JSON.parse(readFileSync(hooksPath, "utf-8"))
    // Each event should have exactly 1 entry (not duplicated)
    expect(data.hooks.sessionEnd).toHaveLength(1)
  })

  it("remove deletes git-stacks.json", async () => {
    const { copilotPlugin } = await import("../../src/lib/agent-hooks/copilot")
    copilotPlugin.install(tmpDir, "test-ws")
    copilotPlugin.remove(tmpDir)

    const hooksPath = join(tmpDir, ".github", "hooks", "git-stacks.json")
    expect(existsSync(hooksPath)).toBe(false)
  })

  it("remove is no-op on missing file", async () => {
    const { copilotPlugin } = await import("../../src/lib/agent-hooks/copilot")
    // Should not throw
    expect(() => copilotPlugin.remove(tmpDir)).not.toThrow()
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

  it("exports exactly one registered plugin for each supported provider", async () => {
    const { agentHookPlugins, claudeCodePlugin, copilotPlugin, codexPlugin } = await import("../../src/lib/agent-hooks/index")
    expect(agentHookPlugins).toHaveLength(3)

    const foundCopilot = agentHookPlugins.find((p: { id: string }) => p.id === "copilot")
    expect(foundCopilot).toBeDefined()
    expect(foundCopilot).toBe(copilotPlugin)

    const foundClaude = agentHookPlugins.find((p: { id: string }) => p.id === "claude-code")
    expect(foundClaude).toBe(claudeCodePlugin)
    expect(agentHookPlugins).toContain(codexPlugin)
    expect(agentHookPlugins.filter((plugin) => plugin.id === "codex")).toHaveLength(1)
  })
})
