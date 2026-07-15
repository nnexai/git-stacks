import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { prepareTerminalAgentEnvironment } from "../../../packages/core/src/agent-hooks/terminal-session"
import { installAgentIntegrations } from "../../../packages/core/src/agent-hooks/integration-manager"

describe("terminal agent signal setup", () => {
  test("prepares zero-preparation wrappers without dirtying a workspace", () => {
    const repo = mkdtempSync(join(tmpdir(), "git-stacks-terminal-agent-"))
    const home = mkdtempSync(join(tmpdir(), "git-stacks-terminal-home-"))
    const wrappers = join(repo, ".wrappers")
    const resolved: Record<string, string> = { codex: "/usr/bin/codex-real", "copilot-cli": "/usr/bin/copilot-real", opencode: "/usr/bin/opencode-real" }
    const environment = prepareTerminalAgentEnvironment(repo, "alpha", "/usr/bin", wrappers, (command) => resolved[command] ?? null, { integrationHome: home })
    expect(environment.PATH.startsWith(`${wrappers}:`)).toBe(true)
    expect(environment.GIT_STACKS_AGENT_SIGNALS).toBe("process")
    expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false)
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false)
    expect(existsSync(join(home, ".copilot", "hooks", "git-stacks.json"))).toBe(false)
    expect(existsSync(join(home, ".config", "opencode", "plugins", "git-stacks-signal.js"))).toBe(false)
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
    const home = mkdtempSync(join(tmpdir(), "git-stacks-terminal-path-home-"))
    const entries = Array.from({ length: 90 }, (_, index) => `/opt/toolchains/tool-${index}`)
    const duplicateRich = [...entries, ...entries, ...entries].join(":")
    expect(duplicateRich.length).toBeGreaterThan(4096)
    const environment = prepareTerminalAgentEnvironment(repo, "alpha", duplicateRich, wrappers, () => null, { integrationHome: home })
    expect(environment.PATH).toBe(`${wrappers}:${entries.join(":")}`)
    expect(environment.PATH.length).toBeGreaterThan(512)
    expect(environment.PATH.length).toBeLessThan(4096)
  })

  test("reads installed hook health without updating provider configuration", () => {
    const repo = mkdtempSync(join(tmpdir(), "git-stacks-terminal-installed-"))
    const home = mkdtempSync(join(tmpdir(), "git-stacks-terminal-installed-home-"))
    const wrappers = join(repo, ".wrappers")
    installAgentIntegrations({ home, providers: ["codex"] })
    const hooksPath = join(home, ".codex/hooks.json")
    const configPath = join(home, ".codex/config.toml")
    const hooksBefore = readFileSync(hooksPath, "utf8")
    const configBefore = readFileSync(configPath, "utf8")

    const environment = prepareTerminalAgentEnvironment(
      repo,
      "alpha",
      "/usr/bin",
      wrappers,
      (command) => command === "codex" || command === "copilot" ? `/usr/bin/${command}` : null,
      { integrationHome: home },
    )

    expect(environment.GIT_STACKS_AGENT_SIGNALS).toBe("hooks+process-fallback")
    expect(existsSync(join(wrappers, "codex"))).toBe(false)
    expect(existsSync(join(wrappers, "copilot"))).toBe(true)
    expect(readFileSync(hooksPath, "utf8")).toBe(hooksBefore)
    expect(readFileSync(configPath, "utf8")).toBe(configBefore)
  })
})
