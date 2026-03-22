import type { Command } from "commander"
import { resolveEnabled, type Integration, type IntegrationContext, type ArtifactBag } from "./types"
import { resolveForgeRepo, formatForgeError } from "./forge-utils"

// --- Exec ---

export const _exec = {
  run: async (args: string[], cwd: string): Promise<{ exitCode: number }> => {
    const proc = Bun.spawn(["tea", ...args], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    return { exitCode: await proc.exited }
  },
  runCapture: async (args: string[], cwd: string): Promise<{ exitCode: number; stdout: string }> => {
    const proc = Bun.spawn(["tea", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "inherit",
    })
    const stdout = await new Response(proc.stdout).text()
    return { exitCode: await proc.exited, stdout }
  },
  openUrl: async (url: string): Promise<{ exitCode: number }> => {
    const opener = process.platform === "darwin" ? "open" : "xdg-open"
    const proc = Bun.spawn([opener, url], { stdio: ["ignore", "ignore", "ignore"] })
    return { exitCode: await proc.exited }
  },
}

// --- Integration ---

export const giteaIntegration: Integration = {
  /** Unique key — used as the key in config.integrations */
  id: "gitea",
  label: "Gitea",
  hint: "create and manage Gitea PRs via tea CLI",
  enabledByDefault: false,
  order: 52,

  isEnabled: (ctx) => resolveEnabled("gitea", false, ctx),

  async open(_ctx: IntegrationContext, _artifactPath: string | null, _bag: ArtifactBag): Promise<null> {
    return null // Forge integrations are not session integrations
  },

  async configurePrompt(_current: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return { enabled: true }
  },

  commands(parent: Command): void {
    const pr = parent.command("pr").description("Manage Gitea pull requests")

    pr.command("create <workspace> [repo]")
      .description("Create a Gitea PR for the workspace branch")
      .action(async (workspaceName: string, repoArg?: string) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "gitea")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath, baseBranch } = resolution
        const result = await _exec.run(["pulls", "create", "--base", baseBranch], repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })

    pr.command("open <workspace> [repo]")
      .description("Open PR in browser")
      .option("--web", "Open PR URL in browser")
      .action(async (workspaceName: string, repoArg: string | undefined, opts: { web?: boolean }) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "gitea")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath, workspace } = resolution

        // Fetch PR list as JSON to find the PR for this branch
        const capture = await _exec.runCapture(["pulls", "ls", "--output", "json", "--state", "all"], repoPath)
        if (capture.exitCode !== 0) {
          process.exit(capture.exitCode)
        }

        let prs: Array<{ head: { ref: string; label: string }; html_url: string }>
        try {
          prs = JSON.parse(capture.stdout)
        } catch {
          console.error("Failed to parse PR list from tea output")
          process.exit(1)
        }

        const branch = workspace.branch ?? ""
        const found = prs.find((p) => p.head.ref === branch || p.head.label?.endsWith(`:${branch}`))

        if (!found) {
          console.error(`No PR found for branch '${branch}'`)
          process.exit(1)
        }

        if (opts.web) {
          await _exec.openUrl(found.html_url)
        } else {
          console.log(found.html_url)
        }
      })

    pr.command("status <workspace> [repo]")
      .description("Show open PRs")
      .action(async (workspaceName: string, repoArg?: string) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "gitea")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath } = resolution
        const result = await _exec.run(["pulls", "ls", "--state", "open"], repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })
  },
}
