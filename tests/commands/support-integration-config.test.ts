import { describe, expect, test } from "bun:test"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeTmpDir,
  runCli,
  write,
  writeWorkspaceFixture,
} from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function setupIntegrationFixture(baseDir: string) {
  const wsRoot = join(baseDir, "workspaces")
  const configDir = createConfigFixture(baseDir, wsRoot)
  write(
    configDir,
    "config.yml",
    [
      `workspace_root: ${wsRoot}`,
      "integrations:",
      "  vscode:",
      "    enabled: true",
      "    cmd: code",
      "  github:",
      "    enabled: false",
      "",
    ].join("\n")
  )
  writeWorkspaceFixture(
    configDir,
    "integration-ws.yml",
    [
      'schema_version: "1"',
      "name: integration-ws",
      "branch: feat/integration",
      'created: "2024-01-01"',
      "settings:",
      "  integrations:",
      "    vscode:",
      "      enabled: false",
      "      cmd: code-insiders",
      "repos: []",
      "",
    ].join("\n")
  )
  return { configDir }
}

describe("integration config support commands", () => {
  test("integration list table output shows enabled and configured columns", () => {
    const baseDir = makeTmpDir("support-integration-list")
    try {
      const { configDir } = setupIntegrationFixture(baseDir)
      const result = runCli(["integration", "list"], { baseDir, configDir })

      expectSuccess(result)
      expect(result.stderr).toBe("")
      expect(result.stdout).toContain("ID")
      expect(result.stdout).toContain("Enabled")
      expect(result.stdout).toContain("Configured")
      expect(result.stdout).toContain("vscode")
      expect(result.stdout).toContain("VSCode")
      expect(result.stdout).toContain("yes")
    } finally {
      cleanup(baseDir)
    }
  })

  test("integration list --json emits stable row shape", () => {
    const baseDir = makeTmpDir("support-integration-list-json")
    try {
      const { configDir } = setupIntegrationFixture(baseDir)
      const result = runCli(["integration", "list", "--json"], { baseDir, configDir })

      expectSuccess(result)
      const rows = JSON.parse(result.stdout) as Array<{ id: string; label: string; enabled: boolean; configured: boolean }>
      const vscode = rows.find((row) => row.id === "vscode")
      expect(vscode).toEqual({
        id: "vscode",
        label: "VSCode",
        enabled: true,
        configured: true,
      })
    } finally {
      cleanup(baseDir)
    }
  })

  test("integration vscode config example prints committed YAML example", () => {
    const baseDir = makeTmpDir("support-integration-example")
    try {
      const { configDir } = setupIntegrationFixture(baseDir)
      const result = runCli(["integration", "vscode", "config", "example"], { baseDir, configDir })

      expectSuccess(result)
      expect(result.stdout).toContain("integrations:")
      expect(result.stdout).toContain("vscode:")
      expect(result.stdout).toContain("cmd: code-insiders")
    } finally {
      cleanup(baseDir)
    }
  })

  test("integration github config example prints fallback message", () => {
    const baseDir = makeTmpDir("support-integration-fallback")
    try {
      const { configDir } = setupIntegrationFixture(baseDir)
      const result = runCli(["integration", "github", "config", "example"], { baseDir, configDir })

      expectSuccess(result)
      expect(result.stdout).toContain("No configuration example available for github.")
      expect(result.stdout).toContain("git-stacks integration github config show")
    } finally {
      cleanup(baseDir)
    }
  })

  test("integration vscode config show prints global config", () => {
    const baseDir = makeTmpDir("support-integration-show")
    try {
      const { configDir } = setupIntegrationFixture(baseDir)
      const result = runCli(["integration", "vscode", "config", "show"], { baseDir, configDir })

      expectSuccess(result)
      expect(result.stdout).toContain("Integration: vscode")
      expect(result.stdout).toContain("Enabled:     true")
      expect(result.stdout).toContain("cmd: code")
    } finally {
      cleanup(baseDir)
    }
  })

  test("integration vscode config show <workspace> --json includes global and workspace config", () => {
    const baseDir = makeTmpDir("support-integration-show-json")
    try {
      const { configDir } = setupIntegrationFixture(baseDir)
      const result = runCli(["integration", "vscode", "config", "show", "integration-ws", "--json"], {
        baseDir,
        configDir,
      })

      expectSuccess(result)
      const parsed = JSON.parse(result.stdout) as {
        id: string
        enabled: boolean
        global: Record<string, unknown>
        workspace: Record<string, unknown>
      }
      expect(parsed).toEqual({
        id: "vscode",
        enabled: false,
        global: { enabled: true, cmd: "code" },
        workspace: { enabled: false, cmd: "code-insiders" },
      })
    } finally {
      cleanup(baseDir)
    }
  })

  test("integration config show reports missing workspace before rendering config", () => {
    const baseDir = makeTmpDir("support-integration-missing-ws")
    try {
      const { configDir } = setupIntegrationFixture(baseDir)
      const result = runCli(["integration", "vscode", "config", "show", "missing-ws"], {
        baseDir,
        configDir,
      })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Workspace 'missing-ws' not found.")
      expect(result.stdout).toBe("")
    } finally {
      cleanup(baseDir)
    }
  })
})
