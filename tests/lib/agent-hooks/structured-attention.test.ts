import { describe, expect, test } from "bun:test"
import { claudeCodePlugin } from "../../../src/lib/agent-hooks/claude-code"
import { copilotPlugin } from "../../../src/lib/agent-hooks/copilot"
import { codexPlugin } from "../../../src/lib/agent-hooks/codex"

describe("structured lifecycle attention hooks", () => {
  test("Claude and Copilot emit typed identity-addressed lifecycle commands", () => {
    for (const [plugin, source] of [[claudeCodePlugin, "claude"], [copilotPlugin, "copilot"]] as const) {
      const commands = plugin.generateHookEntries("alpha").map((entry) => entry.command)
      expect(commands.join("\n")).toContain("service attention publish")
      expect(commands.join("\n")).toContain(`--source ${source}`)
      expect(commands.join("\n")).toContain("$GIT_STACKS_WORKSPACE_ID")
      expect(commands.join("\n")).toContain("$GIT_STACKS_REPOSITORY_ID")
      expect(commands.join("\n")).toContain("$GIT_STACKS_SURFACE_ID")
      expect(commands).toEqual(expect.arrayContaining([
        expect.stringContaining("--state working"), expect.stringContaining("--state waiting"),
        expect.stringContaining("--state completed"), expect.stringContaining("--state idle"),
        expect.stringContaining("--state failed"),
      ]))
    }
  })

  test("Codex emits only its supported lifecycle mappings in best-effort mode", () => {
    const entries = codexPlugin.generateHookEntries("alpha")
    expect(entries.map(({ event, command }) => [event, command.match(/--state (\w+)/)?.[1]])).toEqual([
      ["UserPromptSubmit", "working"],
      ["PermissionRequest", "waiting"],
      ["PostToolUse", "working"],
      ["Stop", "completed"],
    ])
    for (const { command } of entries) {
      expect(command).toContain("--source codex")
      expect(command).toContain("--best-effort")
      expect(command).toContain("--workspace \"alpha\"")
      expect(command).toContain("$GIT_STACKS_WORKSPACE_ID")
      expect(command).toContain("$GIT_STACKS_REPOSITORY_ID")
      expect(command).toContain("$GIT_STACKS_SURFACE_ID")
    }
    expect(entries.map((entry) => entry.event)).not.toContain("PostToolUseFailure")
  })
})
