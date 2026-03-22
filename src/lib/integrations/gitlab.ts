import type { Command } from "commander"
import { resolveEnabled, type Integration, type IntegrationContext, type ArtifactBag } from "./types"
import { resolveForgeRepo, resolveForgeRepoAnyMode, resolveRepoCwd, formatForgeError } from "./forge-utils"
import { workspaceExists } from "../config"
import { linkIssue, unlinkIssue, resolveIssueRef, formatIssueError } from "./issue-utils"

// --- Exec ---

export const _exec = {
  run: async (args: string[], cwd: string): Promise<{ exitCode: number }> => {
    const proc = Bun.spawn(["glab", ...args], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    return { exitCode: await proc.exited }
  },
}

// --- Integration ---

export const gitlabIntegration: Integration = {
  /** Unique key — used as the key in config.integrations */
  id: "gitlab",
  label: "GitLab",
  hint: "create and manage GitLab MRs and issues via glab CLI",
  enabledByDefault: false,
  order: 51,

  isEnabled: (ctx) => resolveEnabled("gitlab", false, ctx),

  async open(_ctx: IntegrationContext, _artifactPath: string | null, _bag: ArtifactBag): Promise<null> {
    return null // Forge integrations are not session integrations
  },

  async configurePrompt(_current: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return { enabled: true }
  },

  commands(parent: Command): void {
    parent.command("open [workspace] [repo]")
      .description("Open repository on GitLab (--web opens in browser). Omit workspace to use CWD.")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string | undefined, repoArg: string | undefined, opts: { web?: boolean }) => {
        let repoPath: string
        if (workspaceName) {
          const resolution = resolveForgeRepoAnyMode(workspaceName, repoArg, "gitlab")
          if (!resolution.ok) {
            console.error(formatForgeError(resolution))
            process.exit(1)
          }
          repoPath = resolution.repoPath
        } else {
          const cwd = await resolveRepoCwd()
          if (!cwd) {
            console.error("Not inside a git repository. Specify a workspace or run from a git repo.")
            process.exit(1)
          }
          repoPath = cwd
        }
        if (opts.web) {
          const result = await _exec.run(["repo", "view", "--web"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        } else {
          const result = await _exec.run(["repo", "view", "--output", "json"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        }
      })

    const pr = parent.command("pr").description("Manage GitLab merge requests")

    // Note: pr -> mr translation (D-11): glab uses "mr" subcommands
    pr.command("create <workspace> [repo]")
      .description("Create a GitLab MR for the workspace branch")
      .action(async (workspaceName: string, repoArg?: string) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "gitlab")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath, baseBranch } = resolution
        const result = await _exec.run(["mr", "create", "--target-branch", baseBranch], repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })

    pr.command("open <workspace> [repo]")
      .description("Open MR in browser")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string, repoArg: string | undefined, opts: { web?: boolean }) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "gitlab")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath } = resolution
        if (opts.web) {
          const result = await _exec.run(["mr", "view", "--web"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        } else {
          const result = await _exec.run(["mr", "view", "--output", "json"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        }
      })

    pr.command("status <workspace> [repo]")
      .description("Show MR status (open MRs for current project)")
      .action(async (workspaceName: string, repoArg?: string) => {
        const resolution = resolveForgeRepo(workspaceName, repoArg, "gitlab")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath } = resolution
        // Use "mr list" — "glab mr status" does not exist (verified via official docs)
        const result = await _exec.run(["mr", "list"], repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })

    // --- Issue commands (Phase 28) ---
    const issue = parent.command("issue").description("Link and open GitLab issues")

    issue.command("link <workspace> <issue-id>")
      .description("Link a GitLab issue to a workspace")
      .action(async (workspaceName: string, issueId: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        linkIssue(workspaceName, "gitlab", issueId)
        console.log(`Linked GitLab issue #${issueId} to workspace '${workspaceName}'.`)
      })

    issue.command("unlink <workspace>")
      .description("Remove GitLab issue link from a workspace")
      .action(async (workspaceName: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        unlinkIssue(workspaceName, "gitlab")
        console.log(`Unlinked GitLab issue from workspace '${workspaceName}'.`)
      })

    issue.command("open <workspace> [repo]")
      .description("Open linked GitLab issue (--web opens in browser)")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string, repoArg: string | undefined, opts: { web?: boolean }) => {
        const issueRes = resolveIssueRef(workspaceName, "gitlab")
        if (!issueRes.ok) {
          console.error(formatIssueError(issueRes))
          process.exit(1)
        }
        // glab issue view requires git repo CWD to resolve project (per Pitfall 1)
        const forgeRes = resolveForgeRepo(workspaceName, repoArg, "gitlab")
        if (!forgeRes.ok) {
          console.error(formatForgeError(forgeRes))
          process.exit(1)
        }
        if (opts.web) {
          const result = await _exec.run(["issue", "view", issueRes.issueId, "--web"], forgeRes.repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        } else {
          const result = await _exec.run(["issue", "view", issueRes.issueId, "--output", "json"], forgeRes.repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        }
      })
  },
}
