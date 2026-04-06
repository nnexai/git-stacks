import type { Command } from "commander"
import { resolveEnabled, type ArtifactBag, type HasCommands, type Integration, type IntegrationContext } from "./types"
import { resolveForgeRepo, resolveForgeRepoAnyMode, resolveRepoCwd, formatForgeError } from "./forge-utils"
import { workspaceExists } from "../config"
import { linkIssue, unlinkIssue, resolveIssueRef, formatIssueError, resolveWorkspaceArg } from "./issue-utils"

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

export const githubIntegration: Integration & HasCommands = {
  /** Unique key — used as the key in config.integrations */
  id: "github",
  label: "GitHub",
  hint: "create and manage GitHub PRs and issues via gh CLI",
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
    parent.command("open [workspace] [repo]")
      .description("Open repository on GitHub (--web opens in browser). Omit workspace to use CWD.")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string | undefined, repoArg: string | undefined, opts: { web?: boolean }) => {
        let repoPath: string
        if (workspaceName) {
          const resolution = resolveForgeRepoAnyMode(workspaceName, repoArg, "github")
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
          const result = await _exec.run(["browse"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        } else {
          const result = await _exec.run(["browse", "--no-browser"], repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        }
      })

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

    // --- Issue commands (Phase 28, updated Phase 31) ---
    const issue = parent.command("issue").description("Link and open GitHub issues")

    // Both positionals optional: link <workspace> <issue-id> OR link <issue-id> (CWD detect)
    issue.command("link [workspace-or-issue] [issue-id]")
      .description("Link a GitHub issue to a workspace")
      .action(async (firstArg: string | undefined, secondArg: string | undefined) => {
        let workspaceName: string
        let issueId: string

        if (secondArg !== undefined) {
          // Two args: link <workspace> <issue-id> (backward compatible)
          workspaceName = firstArg!
          issueId = secondArg
        } else if (firstArg !== undefined) {
          // One arg: is it a workspace name or an issue ID?
          if (workspaceExists(firstArg)) {
            // It's a workspace name but no issue ID provided
            console.error(`Missing issue ID. Usage: git-stacks integration github issue link [workspace] <issue-id>`)
            process.exit(1)
          }
          // It's an issue ID — detect workspace from CWD
          issueId = firstArg
          workspaceName = resolveWorkspaceArg(undefined, "github", "link")
        } else {
          // No args at all
          console.error(`Missing issue ID. Usage: git-stacks integration github issue link [workspace] <issue-id>`)
          process.exit(1)
        }

        linkIssue(workspaceName, "github", issueId)
        console.log(`Linked GitHub issue #${issueId} to workspace '${workspaceName}'.`)
      })

    issue.command("unlink [workspace]")
      .description("Remove GitHub issue link from a workspace")
      .action(async (workspaceName: string | undefined) => {
        const resolved = resolveWorkspaceArg(workspaceName, "github", "unlink")
        unlinkIssue(resolved, "github")
        console.log(`Unlinked GitHub issue from workspace '${resolved}'.`)
      })

    issue.command("open [workspace] [repo]")
      .description("Open linked GitHub issue (--web opens in browser)")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string | undefined, repoArg: string | undefined, opts: { web?: boolean }) => {
        const resolved = resolveWorkspaceArg(workspaceName, "github", "open")
        const issueRes = resolveIssueRef(resolved, "github")
        if (!issueRes.ok) {
          console.error(formatIssueError(issueRes))
          process.exit(1)
        }
        // gh issue view requires git repo CWD to resolve project (per Pitfall 1)
        const forgeRes = resolveForgeRepo(resolved, repoArg, "github")
        if (!forgeRes.ok) {
          console.error(formatForgeError(forgeRes))
          process.exit(1)
        }
        if (opts.web) {
          const result = await _exec.run(["issue", "view", issueRes.issueId, "--web"], forgeRes.repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        } else {
          const result = await _exec.run(["issue", "view", issueRes.issueId, "--json", "url", "--jq", ".url"], forgeRes.repoPath)
          if (result.exitCode !== 0) process.exit(result.exitCode)
        }
      })
  },
}
