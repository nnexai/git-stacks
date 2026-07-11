import { describe, expect, test } from "bun:test"
import { claudeCodePlugin } from "../../../src/lib/agent-hooks/claude-code"
import { copilotPlugin } from "../../../src/lib/agent-hooks/copilot"

describe("structured lifecycle attention hooks", () => {
  test("Claude and Copilot emit typed identity-addressed lifecycle commands", () => {
    for (const [plugin, source] of [[claudeCodePlugin, "claude"], [copilotPlugin, "copilot"]] as const) {
      const commands = plugin.generateHookEntries("alpha").map((entry) => entry.command)
      expect(commands.join("\n")).toContain("service attention publish")
      expect(commands.join("\n")).toContain(`--source ${source}`)
      expect(commands.join("\n")).toContain("$GS_WORKSPACE_ID")
      expect(commands.join("\n")).toContain("$GS_REPOSITORY_ID")
      expect(commands.join("\n")).toContain("$GS_SURFACE_ID")
      expect(commands).toEqual(expect.arrayContaining([
        expect.stringContaining("--state working"), expect.stringContaining("--state waiting"),
        expect.stringContaining("--state completed"), expect.stringContaining("--state idle"),
        expect.stringContaining("--state failed"),
      ]))
    }
  })
})
