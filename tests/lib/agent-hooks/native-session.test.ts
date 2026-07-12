import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { ensureNativeAgentAttention } from "../../../src/lib/agent-hooks/native-session"

describe("native agent attention setup", () => {
  test("prefers a provider-neutral ACP adapter when one claims the session", () => {
    const calls: string[] = []
    const result = ensureNativeAgentAttention("/repo", "alpha", [{
      id: "codex-acp",
      prepare(path, workspace) { calls.push(`${path}:${workspace}`); return true },
    }])
    expect(result).toEqual({ transport: "acp", provider: "codex-acp" })
    expect(calls).toEqual(["/repo:alpha"])
  })

  test("falls back to merge-safe project-local hooks for terminal Codex", () => {
    const repo = mkdtempSync(join(tmpdir(), "git-stacks-native-agent-"))
    const result = ensureNativeAgentAttention(repo, "alpha")
    expect(result).toEqual({ transport: "hooks", provider: "codex" })
    const document = JSON.parse(readFileSync(join(repo, ".codex", "hooks.json"), "utf8"))
    expect(document.hooks.PermissionRequest).toHaveLength(1)
  })
})
