import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { ensureNativeAgentAttention, nativeAgentProviders, normalizeAgentSessionUpdate, prepareNativeAgentEnvironment } from "../../../src/lib/agent-hooks/native-session"

describe("native agent attention setup", () => {
  test("prefers a provider-neutral ACP adapter when one claims the session", () => {
    const calls: string[] = []
    const result = ensureNativeAgentAttention("/repo", "alpha", [{
      id: "codex",
      prepare(path, workspace) { calls.push(`${path}:${workspace}`); return true },
    }])
    expect(result).toEqual({ transport: "acp", provider: "codex" })
    expect(calls).toEqual(["/repo:alpha"])
  })

  test("falls back to merge-safe project-local hooks for terminal Codex", () => {
    const repo = mkdtempSync(join(tmpdir(), "git-stacks-native-agent-"))
    const result = ensureNativeAgentAttention(repo, "alpha")
    expect(result).toEqual({ transport: "hooks", provider: "codex" })
    const document = JSON.parse(readFileSync(join(repo, ".codex", "hooks.json"), "utf8"))
    expect(document.hooks.PermissionRequest).toHaveLength(1)
  })

  test("locks the provider-neutral ACP and hook fallback matrix", () => {
    expect(nativeAgentProviders).toEqual([
      { id: "codex", acp: "adapter", command: "codex-acp", hookFallback: true },
      { id: "claude", acp: "adapter", command: "claude-code-acp", hookFallback: true },
      { id: "copilot", acp: "native", command: "copilot --acp", hookFallback: true },
      { id: "opencode", acp: "native", command: "opencode acp", hookFallback: false },
    ])
    expect(normalizeAgentSessionUpdate("permission_request")).toBe("waiting")
    expect(normalizeAgentSessionUpdate("tool_call")).toBe("working")
    expect(normalizeAgentSessionUpdate("turn_complete")).toBe("completed")
    expect(normalizeAgentSessionUpdate("unknown-extension")).toBeNull()
  })

  test("falls back for Claude and Copilot and reports a missing OpenCode ACP transport", () => {
    const claude = mkdtempSync(join(tmpdir(), "git-stacks-native-claude-"))
    const copilot = mkdtempSync(join(tmpdir(), "git-stacks-native-copilot-"))
    expect(ensureNativeAgentAttention(claude, "alpha", [], "claude").transport).toBe("hooks")
    expect(ensureNativeAgentAttention(copilot, "alpha", [], "copilot").transport).toBe("hooks")
    expect(ensureNativeAgentAttention("/repo", "alpha", [], "opencode")).toEqual({
      transport: "unavailable", provider: "opencode", reason: "No ACP transport or project-hook fallback is available",
    })
  })

  test("prepares hooks and zero-prep wrappers for commands typed in native shells", () => {
    const repo = mkdtempSync(join(tmpdir(), "git-stacks-native-zero-prep-"))
    const wrappers = join(repo, ".wrappers")
    const resolved: Record<string, string> = { codex: "/usr/bin/codex-real", "copilot-cli": "/usr/bin/copilot-real", opencode: "/usr/bin/opencode-real" }
    const environment = prepareNativeAgentEnvironment(repo, "alpha", "/usr/bin", wrappers, (command) => resolved[command] ?? null)
    expect(environment.PATH.startsWith(`${wrappers}:`)).toBe(true)
    expect(existsSync(join(repo, ".codex", "hooks.json"))).toBe(true)
    expect(existsSync(join(repo, ".claude", "settings.json"))).toBe(true)
    expect(existsSync(join(repo, ".github", "hooks", "git-stacks.json"))).toBe(true)
    const codex = readFileSync(join(wrappers, "codex"), "utf8")
    expect(codex).toContain("--state working --source codex")
    expect(codex).toContain("'/usr/bin/codex-real' \"$@\"")
    expect(codex).toContain("--state completed --source codex")
    expect(readFileSync(join(wrappers, "copilot-cli"), "utf8")).toContain("--source copilot")
    expect(readFileSync(join(wrappers, "opencode"), "utf8")).toContain("--source opencode")
  })
})
