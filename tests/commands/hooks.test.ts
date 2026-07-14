import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { cleanup, createConfigFixture, formatCliFailure, makeTmpDir, runCli } from "../helpers"

function runIntegration(baseDir: string, args: string[]) {
  return runCli(["hooks", ...args], {
    baseDir,
    configDir: createConfigFixture(baseDir),
  })
}

describe("coding-agent hooks", () => {
  test("status is read-only and install/uninstall require provider selection", () => {
    const baseDir = makeTmpDir("service-signal-integrations")
    const home = join(baseDir, ".git-test-home")
    try {
      const status = runIntegration(baseDir, ["status"])
      expect(status.exitCode, formatCliFailure(status)).toBe(0)
      expect(JSON.parse(status.stdout).providers.every((entry: { state: string }) => entry.state === "not-installed")).toBe(true)
      expect(existsSync(join(home, ".codex"))).toBe(false)
      expect(existsSync(join(home, ".claude"))).toBe(false)
      expect(existsSync(join(home, ".copilot"))).toBe(false)

      const installed = runIntegration(baseDir, ["install", "codex", "copilot"])
      expect(installed.exitCode, formatCliFailure(installed)).toBe(0)
      expect(existsSync(join(home, ".codex/hooks.json"))).toBe(true)
      expect(existsSync(join(home, ".copilot/hooks/git-stacks.json"))).toBe(true)
      expect(existsSync(join(home, ".claude"))).toBe(false)
      expect(existsSync(join(home, ".config/opencode"))).toBe(false)

      const removed = runIntegration(baseDir, ["uninstall", "codex"])
      expect(removed.exitCode, formatCliFailure(removed)).toBe(0)
      expect(readFileSync(join(home, ".codex/hooks.json"), "utf8")).not.toContain("git-stacks-managed-signal-v1")
      expect(existsSync(join(home, ".copilot/hooks/git-stacks.json"))).toBe(true)
    } finally { cleanup(baseDir) }
  })

  test("update repairs owned integrations but never installs missing providers", () => {
    const baseDir = makeTmpDir("service-signal-integrations-update")
    const home = join(baseDir, ".git-test-home")
    try {
      const installed = runIntegration(baseDir, ["install", "copilot"])
      expect(installed.exitCode, formatCliFailure(installed)).toBe(0)
      const copilotPath = join(home, ".copilot/hooks/git-stacks.json")
      writeFileSync(copilotPath, `${readFileSync(copilotPath, "utf8")}\n`)

      const updated = runIntegration(baseDir, ["update"])
      expect(updated.exitCode, formatCliFailure(updated)).toBe(0)
      const report = JSON.parse(updated.stdout) as { providers: Array<{ provider: string; state: string }> }
      expect(report.providers.find((entry) => entry.provider === "copilot")?.state).toBe("installed")
      expect(report.providers.filter((entry) => entry.provider !== "copilot").every((entry) => entry.state === "not-installed")).toBe(true)
      expect(existsSync(join(home, ".codex"))).toBe(false)
      expect(existsSync(join(home, ".claude"))).toBe(false)
      expect(existsSync(join(home, ".config/opencode"))).toBe(false)
    } finally { cleanup(baseDir) }
  })

  test("rejects unknown providers before touching agent configuration", () => {
    const baseDir = makeTmpDir("service-signal-integrations-invalid")
    const home = join(baseDir, ".git-test-home")
    try {
      const result = runIntegration(baseDir, ["install", "codex", "unknown-agent"])
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("unknown coding-agent integration")
      expect(existsSync(join(home, ".codex"))).toBe(false)
    } finally { cleanup(baseDir) }
  })
})
