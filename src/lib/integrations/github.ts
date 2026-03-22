import type { Command } from "commander"
import { resolveEnabled, type Integration, type IntegrationContext, type ArtifactBag } from "./types"
import { resolveForgeRepo, formatForgeError } from "./forge-utils"

// --- Exec ---

export const _exec = {
  run: async (args: string[], cwd: string): Promise<{ exitCode: number }> => {
    const proc = Bun.spawn(["gh", ...args], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    return { exitCode: await proc.exited }
  },
}

// --- Integration ---

export const githubIntegration: Integration = {
  /** Unique key — used as the key in config.integrations */
  id: "github",
  label: "GitHub",
  hint: "create and manage GitHub PRs via gh CLI",
  enabledByDefault: false,
  order: 50,

  isEnabled: (ctx) => resolveEnabled("github", false, ctx),

  async open(_ctx: IntegrationContext, _artifactPath: string | null, _bag: ArtifactBag): Promise<null> {
    return null // Forge integrations are not session integrations
  },

  async configurePrompt(_current: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return { enabled: true }
  },

  commands(parent: Command): void {
    const pr = parent.command("pr").description("Manage GitHub pull requests")

    pr.command("create <workspace> [repo]")
      .description("Create a GitHub PR for the workspace branch")
      .action(async (workspaceName: string, repoArg?: string) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "github")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath, baseBranch } = resolution
        const result = await _exec.run(["pr", "create", "--base", baseBranch], repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })

    pr.command("open <workspace> [repo]")
      .description("Open PR in browser")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string, repoArg: string | undefined, opts: { web?: boolean }) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "github")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath } = resolution
        if (opts.web) {
          const result = await _exec.run(["pr", "view", "--web"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        } else {
          const result = await _exec.run(["pr", "view", "--json", "url", "--jq", ".url"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        }
      })

    pr.command("status <workspace> [repo]")
      .description("Show PR status")
      .action(async (workspaceName: string, repoArg?: string) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "github")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath } = resolution
        const result = await _exec.run(["pr", "status"], repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })
  },
}
