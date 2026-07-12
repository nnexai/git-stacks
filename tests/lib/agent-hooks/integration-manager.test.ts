import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { installAgentIntegrations, integrationStatus, OWNERSHIP_MARKER, uninstallAgentIntegrations } from "../../../src/lib/agent-hooks/integration-manager"

describe("user-level native agent integrations", () => {
  test("merge-installs all providers while preserving foreign settings", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-home-"))
    mkdirSync(join(home, ".codex"), { recursive: true })
    mkdirSync(join(home, ".claude"), { recursive: true })
    writeFileSync(join(home, ".codex/hooks.json"), JSON.stringify({ custom: true, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }))
    writeFileSync(join(home, ".claude/settings.json"), JSON.stringify({ model: "opus", hooks: {} }))

    const report = installAgentIntegrations({ home })
    expect(report.providers.every((entry) => entry.state === "installed")).toBe(true)
    const codex = JSON.parse(readFileSync(join(home, ".codex/hooks.json"), "utf8"))
    expect(codex.custom).toBe(true)
    expect(codex.hooks.Stop.some((group: { hooks: { command: string }[] }) => group.hooks[0]?.command === "echo mine")).toBe(true)
    expect(readFileSync(join(home, ".copilot/hooks/git-stacks.json"), "utf8")).toContain(OWNERSHIP_MARKER)
    expect(readFileSync(join(home, ".config/opencode/plugins/git-stacks-attention.js"), "utf8")).toContain("session.idle")
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toContain(`hooks = true # ${OWNERSHIP_MARKER}`)
    expect(integrationStatus({ home }).providers.every((entry) => entry.state === "installed")).toBe(true)
  })

  test("is inert outside a native surface and uninstalls only owned entries", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-uninstall-"))
    installAgentIntegrations({ home })
    const codexPath = join(home, ".codex/hooks.json")
    const installed = readFileSync(codexPath, "utf8")
    expect(installed).toContain('GIT_STACKS_ATTENTION_TOKEN:-')
    expect(installed).toContain('GIT_STACKS_SURFACE_ID:-')
    const codex = JSON.parse(installed)
    codex.hooks.Stop.push({ hooks: [{ type: "command", command: "echo foreign" }] })
    writeFileSync(codexPath, JSON.stringify(codex))

    uninstallAgentIntegrations({ home })
    expect(readFileSync(codexPath, "utf8")).toContain("echo foreign")
    expect(readFileSync(codexPath, "utf8")).not.toContain(OWNERSHIP_MARKER)
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).not.toContain(OWNERSHIP_MARKER)
    expect(existsSync(join(home, ".copilot/hooks/git-stacks.json"))).toBe(false)
    expect(existsSync(join(home, ".config/opencode/plugins/git-stacks-attention.js"))).toBe(false)
  })

  test("reports opt-out without touching a clean home", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-disabled-"))
    const report = installAgentIntegrations({ home, enabled: false })
    expect(report.providers.every((entry) => entry.state === "disabled")).toBe(true)
    expect(existsSync(join(home, ".codex"))).toBe(false)
  })
})
