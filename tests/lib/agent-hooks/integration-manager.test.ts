import { describe, expect, test } from "@test/api"
import { hasCommand, runProcess } from "../../process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { installAgentIntegrations, integrationStatus, OWNERSHIP_MARKER, uninstallAgentIntegrations, updateAgentIntegrations } from "../../../packages/core/src/agent-hooks/integration-manager"

describe("user-level terminal agent integrations", () => {
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
    expect(readFileSync(join(home, ".config/opencode/plugins/git-stacks-signal.js"), "utf8")).toContain("session.idle")
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toContain(`hooks = true # ${OWNERSHIP_MARKER}`)
    expect(integrationStatus({ home }).providers.every((entry) => entry.state === "installed")).toBe(true)
  })

  test("is inert outside a managed terminal surface and uninstalls only owned entries", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-uninstall-"))
    installAgentIntegrations({ home })
    const codexPath = join(home, ".codex/hooks.json")
    const installed = readFileSync(codexPath, "utf8")
    expect(installed).toContain('GIT_STACKS_SIGNAL_TOKEN:-')
    expect(installed).toContain('GIT_STACKS_SURFACE_ID:-')
    const codex = JSON.parse(installed)
    codex.hooks.Stop.push({ hooks: [{ type: "command", command: "echo foreign" }] })
    writeFileSync(codexPath, JSON.stringify(codex))

    uninstallAgentIntegrations({ home })
    expect(readFileSync(codexPath, "utf8")).toContain("echo foreign")
    expect(readFileSync(codexPath, "utf8")).not.toContain(OWNERSHIP_MARKER)
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).not.toContain(OWNERSHIP_MARKER)
    expect(existsSync(join(home, ".copilot/hooks/git-stacks.json"))).toBe(false)
    expect(existsSync(join(home, ".config/opencode/plugins/git-stacks-signal.js"))).toBe(false)
  })

  test("installs and uninstalls only explicitly selected providers", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-selected-"))

    const installed = installAgentIntegrations({ home, providers: ["codex", "copilot"] })
    expect(installed.providers.find((entry) => entry.provider === "codex")?.state).toBe("installed")
    expect(installed.providers.find((entry) => entry.provider === "copilot")?.state).toBe("installed")
    expect(installed.providers.find((entry) => entry.provider === "claude")?.state).toBe("not-installed")
    expect(existsSync(join(home, ".claude"))).toBe(false)
    expect(existsSync(join(home, ".config/opencode"))).toBe(false)

    uninstallAgentIntegrations({ home, providers: ["codex"] })
    expect(integrationStatus({ home }).providers.find((entry) => entry.provider === "codex")?.state).toBe("not-installed")
    expect(integrationStatus({ home }).providers.find((entry) => entry.provider === "copilot")?.state).toBe("installed")
  })

  test("uninstall is inert for unowned shared files and restores a changed Codex feature flag", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-ownership-"))
    mkdirSync(join(home, ".codex"), { recursive: true })
    mkdirSync(join(home, ".claude"), { recursive: true })
    const codexHooks = '{"custom":true,"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo mine"}]}]}}\n'
    const claudeSettings = '{"model":"sonnet","hooks":{}}\n'
    const codexConfig = "[features]\nhooks = false # deliberately disabled\n"
    writeFileSync(join(home, ".codex/hooks.json"), codexHooks)
    writeFileSync(join(home, ".codex/config.toml"), codexConfig)
    writeFileSync(join(home, ".claude/settings.json"), claudeSettings)

    uninstallAgentIntegrations({ home, providers: ["codex", "claude"] })
    expect(readFileSync(join(home, ".codex/hooks.json"), "utf8")).toBe(codexHooks)
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toBe(codexConfig)
    expect(readFileSync(join(home, ".claude/settings.json"), "utf8")).toBe(claudeSettings)

    installAgentIntegrations({ home, providers: ["codex"] })
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toContain(OWNERSHIP_MARKER)
    uninstallAgentIntegrations({ home, providers: ["codex"] })
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toBe(codexConfig)
  })

  test("updates every owned integration without installing absent providers", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-update-"))
    installAgentIntegrations({ home, providers: ["copilot"] })
    const copilotPath = join(home, ".copilot/hooks/git-stacks.json")
    writeFileSync(copilotPath, `${readFileSync(copilotPath, "utf8")}\n`)
    expect(integrationStatus({ home }).providers.find((entry) => entry.provider === "copilot")?.state).toBe("outdated")

    const report = updateAgentIntegrations({ home })

    expect(report.providers.find((entry) => entry.provider === "copilot")?.state).toBe("installed")
    expect(report.providers.filter((entry) => entry.provider !== "copilot").every((entry) => entry.state === "not-installed")).toBe(true)
    expect(existsSync(join(home, ".codex"))).toBe(false)
    expect(existsSync(join(home, ".claude"))).toBe(false)
    expect(existsSync(join(home, ".config/opencode"))).toBe(false)
  })

  test("migrates legacy attention integrations and uses one stable session per terminal surface", () => {
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-migrate-"))
    mkdirSync(join(home, ".codex"), { recursive: true })
    mkdirSync(join(home, ".copilot", "hooks"), { recursive: true })
    mkdirSync(join(home, ".config", "opencode", "plugins"), { recursive: true })
    writeFileSync(join(home, ".codex", "hooks.json"), JSON.stringify({ hooks: {
      Stop: [{ hooks: [{ type: "command", command: "echo foreign" }] }, { hooks: [{ type: "command", command: "echo old # git-stacks-managed-attention-v1" }] }],
    } }))
    writeFileSync(join(home, ".copilot", "hooks", "git-stacks.json"), JSON.stringify({ version: 1, _git_stacks: "git-stacks-managed-attention-v1", hooks: {} }))
    const oldOpenCode = join(home, ".config", "opencode", "plugins", "git-stacks-attention.js")
    writeFileSync(oldOpenCode, "// git-stacks-managed-attention-v1\n")

    const report = installAgentIntegrations({ home })

    expect(report.version).toBe(2)
    expect(report.providers.every((entry) => entry.state === "installed")).toBe(true)
    const codex = readFileSync(join(home, ".codex", "hooks.json"), "utf8")
    expect(codex).toContain("echo foreign")
    expect(codex).not.toContain("git-stacks-managed-attention-v1")
    expect(codex).toContain("${GIT_STACKS_AGENT_SESSION_ID:-codex-$GIT_STACKS_SURFACE_ID}")
    const copilot = readFileSync(join(home, ".copilot", "hooks", "git-stacks.json"), "utf8")
    expect(copilot).toContain("${GIT_STACKS_AGENT_SESSION_ID:-copilot-$GIT_STACKS_SURFACE_ID}")
    expect(copilot).toContain('"agentStop"')
    expect(existsSync(oldOpenCode)).toBe(false)
  })

  test("ordinary inherited hook context emits authenticated OSC to its parent tty", async () => {
    if (!hasCommand("script")) return
    const home = mkdtempSync(join(tmpdir(), "git-stacks-agent-tty-"))
    installAgentIntegrations({ home })
    const codex = JSON.parse(readFileSync(join(home, ".codex/hooks.json"), "utf8"))
    const hook = codex.hooks.UserPromptSubmit[0].hooks[0].command as string
    const token = "0123456789abcdef0123456789abcdef"
    const child = runProcess(["script", "-qec", hook, "/dev/null"], {
      env: { ...process.env, GIT_STACKS_SIGNAL_TOKEN: token, GIT_STACKS_SURFACE_ID: "surface-test", GIT_STACKS_AGENT_SESSION_ID: "codex-session" },
      stdout: "pipe", stderr: "pipe",
    })
    const output = await new Response(child.stdout).text()
    expect(await child.exited).toBe(0)
    expect(output).toContain(`]9;git-stacks-signal:${token}:codex:codex-session:working`)
  })
})
