import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { prepareTerminalAgentEnvironment } from "../../../src/lib/agent-hooks/terminal-session"

describe("terminal agent signal setup", () => {
  test("prepares zero-preparation wrappers without dirtying a workspace", () => {
    const repo = mkdtempSync(join(tmpdir(), "git-stacks-terminal-agent-"))
    const wrappers = join(repo, ".wrappers")
    const resolved: Record<string, string> = { codex: "/usr/bin/codex-real", "copilot-cli": "/usr/bin/copilot-real", opencode: "/usr/bin/opencode-real" }
    const environment = prepareTerminalAgentEnvironment(repo, "alpha", "/usr/bin", wrappers, (command) => resolved[command] ?? null)
    expect(environment.PATH.startsWith(`${wrappers}:`)).toBe(true)
    expect(existsSync(join(repo, ".codex", "hooks.json"))).toBe(false)
    expect(existsSync(join(repo, ".claude", "settings.json"))).toBe(false)
    expect(existsSync(join(repo, ".github", "hooks", "git-stacks.json"))).toBe(false)
    const codex = readFileSync(join(wrappers, "codex"), "utf8")
    expect(codex).toContain("--state working --source codex")
    expect(codex).toContain("'/usr/bin/codex-real' \"$@\"")
    expect(codex).toContain("--state completed --source codex")
    expect(readFileSync(join(wrappers, "copilot-cli"), "utf8")).toContain("--source copilot")
    expect(readFileSync(join(wrappers, "opencode"), "utf8")).toContain("--source opencode")
  })

  test("deduplicates a long developer PATH without dropping lookup order", () => {
    const repo = mkdtempSync(join(tmpdir(), "git-stacks-terminal-path-"))
    const wrappers = join(repo, ".wrappers")
    const entries = Array.from({ length: 90 }, (_, index) => `/opt/toolchains/tool-${index}`)
    const duplicateRich = [...entries, ...entries, ...entries].join(":")
    expect(duplicateRich.length).toBeGreaterThan(4096)
    const environment = prepareTerminalAgentEnvironment(repo, "alpha", duplicateRich, wrappers, () => null)
    expect(environment.PATH).toBe(`${wrappers}:${entries.join(":")}`)
    expect(environment.PATH.length).toBeGreaterThan(512)
    expect(environment.PATH.length).toBeLessThan(4096)
  })
})

