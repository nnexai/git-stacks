import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { cleanup, createConfigFixture, formatCliFailure, makeTmpDir, runCli } from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

describe("support readonly commands", () => {
  test("config show prints stable sections from an isolated config", () => {
    const baseDir = makeTmpDir("support-config-show")
    try {
      const configDir = createConfigFixture(baseDir)
      const result = runCli(["config", "show"], { baseDir, configDir })

      expectSuccess(result)
      expect(result.stderr).toBe("")
      expect(result.stdout).toContain("workspace_root:")
      expect(result.stdout).toContain("Integrations:")
      expect(result.stdout).toContain("Secrets:")
      expect(result.stdout).toContain("Config:")
    } finally {
      cleanup(baseDir)
    }
  })

  test("--version writes only the package version", () => {
    const baseDir = makeTmpDir("support-version")
    try {
      const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "package.json"), "utf8")) as { version: string }
      const result = runCli(["--version"], { baseDir })

      expectSuccess(result)
      expect(result.stderr).toBe("")
      expect(result.stdout).toMatch(new RegExp(`^${pkg.version.replaceAll(".", "\\.")}( \\([0-9a-f]+(-dirty)?\\))?\\n$`))
    } finally {
      cleanup(baseDir)
    }
  })

  test("completion bash exposes wrapper, registration, and current command markers", () => {
    const baseDir = makeTmpDir("support-completion-bash")
    try {
      const result = runCli(["completion", "bash"], { baseDir })

      expectSuccess(result)
      expect(result.stderr).toBe("")
      expect(result.stdout).toContain("_git_stacks_complete()")
      expect(result.stdout).toContain("complete -F _git_stacks_complete git-stacks")
      for (const marker of ["command", "notes", "files", "env", "paths", "integration", "message"]) {
        expect(result.stdout).toContain(marker)
      }
    } finally {
      cleanup(baseDir)
    }
  })

  test("completion zsh exposes wrapper, top commands, and current command markers", () => {
    const baseDir = makeTmpDir("support-completion-zsh")
    try {
      const result = runCli(["completion", "zsh"], { baseDir })

      expectSuccess(result)
      expect(result.stderr).toBe("")
      expect(result.stdout).toContain("#compdef git-stacks")
      expect(result.stdout).toContain("_git_stacks_top_commands")
      for (const marker of ["command", "notes", "files", "env", "paths", "integration", "message"]) {
        expect(result.stdout).toContain(marker)
      }
    } finally {
      cleanup(baseDir)
    }
  })

  test("completion fish exposes wrapper, command registration, and current command markers", () => {
    const baseDir = makeTmpDir("support-completion-fish")
    try {
      const result = runCli(["completion", "fish"], { baseDir })

      expectSuccess(result)
      expect(result.stderr).toBe("")
      expect(result.stdout).toContain("function git-stacks")
      expect(result.stdout).toContain("complete -c git-stacks")
      for (const marker of ["command", "notes", "files", "env", "paths", "integration", "message"]) {
        expect(result.stdout).toContain(marker)
      }
    } finally {
      cleanup(baseDir)
    }
  })
})
