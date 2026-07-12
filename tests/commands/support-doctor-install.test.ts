import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeGitRepo,
  makeTmpDir,
  runCli,
  writeWorkspaceFixture,
} from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function setupInstallFixture(baseDir: string) {
  const wsRoot = join(baseDir, "workspaces")
  const configDir = createConfigFixture(baseDir, wsRoot)
  const taskRoot = join(wsRoot, "tasks", "install-ws")
  const repoPath = makeGitRepo(taskRoot, "api")

  writeWorkspaceFixture(
    configDir,
    "install-ws.yml",
    [
      'schema_version: "1"',
      "name: install-ws",
      "branch: feat/install",
      'created: "2024-01-01"',
      "repos:",
      "  - name: api",
      "    repo: api",
      "    type: other",
      "    mode: worktree",
      `    main_path: ${repoPath}`,
      `    task_path: ${repoPath}`,
      "    base_branch: main",
      "",
    ].join("\n"),
    )

  return { configDir, repoPath }
}

describe("doctor and install support commands", () => {
  test("doctor human output stays local-only with forge integrations disabled", () => {
    const baseDir = makeTmpDir("support-doctor")
    try {
      const configDir = createConfigFixture(baseDir)
      const result = runCli(["doctor"], { baseDir, configDir })

      expectSuccess(result)
      expect(result.stdout).toContain("Runtime dependencies:")
      expect(result.stdout).toContain("git")
      expect(result.stdout).not.toContain("gh (GitHub CLI)")
      expect(result.stdout).not.toContain("glab (GitLab CLI)")
      expect(result.stdout).not.toContain("tea (Gitea CLI)")
      expect(result.stdout).not.toContain("jira (Jira CLI)")
      expect(result.stderr).toBe("")
    } finally {
      cleanup(baseDir)
    }
  })

  test("install --hooks --claude writes Claude settings without prompting", () => {
    const baseDir = makeTmpDir("support-install-claude")
    try {
      const { configDir, repoPath } = setupInstallFixture(baseDir)
      const result = runCli(["install", "--hooks", "--claude"], {
        baseDir,
        configDir,
        cwd: repoPath,
      })

      expectSuccess(result)
      expect(result.stdout).not.toContain("Select agent frameworks")
      const settingsPath = join(repoPath, ".claude", "settings.json")
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as { hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>> }
      expect(settings.hooks.Stop[0].hooks[0].command).toContain('--workspace "install-ws"')
      expect(settings.hooks.Stop[0].hooks[0].command).toContain("--source claude")
      expect(settings.hooks.PreToolUse[0].matcher).toBe("AskUserQuestion")
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("--source claude")
    } finally {
      cleanup(baseDir)
    }
  })

  test("install --hooks --copilot writes Copilot hooks without prompting", () => {
    const baseDir = makeTmpDir("support-install-copilot")
    try {
      const { configDir, repoPath } = setupInstallFixture(baseDir)
      const result = runCli(["install", "--hooks", "--copilot"], {
        baseDir,
        configDir,
        cwd: repoPath,
      })

      expectSuccess(result)
      expect(result.stdout).not.toContain("Select agent frameworks")
      const hooksPath = join(repoPath, ".github", "hooks", "git-stacks.json")
      const hooks = JSON.parse(readFileSync(hooksPath, "utf8")) as { version: number; hooks: Record<string, Array<{ bash: string; env: Record<string, string> }>> }
      expect(hooks.version).toBe(1)
      expect(hooks.hooks.sessionEnd[0].bash).toContain('--workspace "install-ws"')
      expect(hooks.hooks.sessionEnd[0].env.GS_WORKSPACE_NAME).toBe("install-ws")
      expect(hooks.hooks.sessionEnd[0].env.GS_FROM).toBe("copilot")
    } finally {
      cleanup(baseDir)
    }
  })

  test("install --hooks --remove --claude removes only Claude hook settings", () => {
    const baseDir = makeTmpDir("support-install-remove")
    try {
      const { configDir, repoPath } = setupInstallFixture(baseDir)
      const installed = runCli(["install", "--hooks", "--claude"], {
        baseDir,
        configDir,
        cwd: repoPath,
      })
      expectSuccess(installed)

      const removed = runCli(["install", "--hooks", "--remove", "--claude"], {
        baseDir,
        configDir,
        cwd: repoPath,
      })
      expectSuccess(removed)
      expect(removed.stdout).not.toContain("Select agent frameworks")

      const settingsPath = join(repoPath, ".claude", "settings.json")
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>
      expect(settings.hooks).toBeUndefined()
      expect(existsSync(settingsPath)).toBe(true)
    } finally {
      cleanup(baseDir)
    }
  })
})
