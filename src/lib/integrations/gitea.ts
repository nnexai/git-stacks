import type { Command } from "commander"
import { resolveEnabled, type Integration, type IntegrationContext, type ArtifactBag } from "./types"
import { resolveForgeRepo, resolveForgeRepoAnyMode, formatForgeError } from "./forge-utils"
import { workspaceExists } from "../config"
import { linkIssue, unlinkIssue, resolveIssueRef, formatIssueError } from "./issue-utils"

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
  hint: "create and manage Gitea PRs and issues via tea CLI",
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
    parent.command("open <workspace> [repo]")
      .description("Open repository on Gitea (--web opens in browser)")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string, repoArg: string | undefined, opts: { web?: boolean }) => {
        const resolution = resolveForgeRepoAnyMode(workspaceName, repoArg, "gitea")
        if (!resolution.ok) {
          console.error(formatForgeError(resolution))
          process.exit(1)
        }
        const { repoPath } = resolution

        // tea has no direct "open repo" command — fetch repo list scoped to the git CWD
        const capture = await _exec.runCapture(
          ["repos", "ls", "--output", "json", "--limit", "1"],
          repoPath
        )
        if (capture.exitCode !== 0) {
          process.exit(capture.exitCode)
        }

        let repos: Array<Record<string, unknown>>
        try {
          repos = JSON.parse(capture.stdout)
        } catch {
          console.error("Failed to parse repo list from tea output")
          process.exit(1)
        }

        if (!repos.length) {
          console.error("No Gitea repo found for this workspace")
          process.exit(1)
        }

        const url = String(repos[0].html_url ?? repos[0].url ?? "")
        if (!url) {
          console.error("Could not determine repo URL from tea output")
          process.exit(1)
        }

        console.log(url)
        if (opts.web) {
          await _exec.openUrl(url)
        }
      })

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

    // --- Issue commands (Phase 28) ---
    const issue = parent.command("issue").description("Link and open Gitea issues")

    issue.command("link <workspace> <issue-id>")
      .description("Link a Gitea issue to a workspace")
      .action(async (workspaceName: string, issueId: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        linkIssue(workspaceName, "gitea", issueId)
        console.log(`Linked Gitea issue #${issueId} to workspace '${workspaceName}'.`)
      })

    issue.command("unlink <workspace>")
      .description("Remove Gitea issue link from a workspace")
      .action(async (workspaceName: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        unlinkIssue(workspaceName, "gitea")
        console.log(`Unlinked Gitea issue from workspace '${workspaceName}'.`)
      })

    issue.command("open <workspace> [repo]")
      .description("Open linked Gitea issue (--web opens in browser)")
      .option("--web", "Open in browser")
      .action(async (workspaceName: string, repoArg: string | undefined, opts: { web?: boolean }) => {
        const issueRes = resolveIssueRef(workspaceName, "gitea")
        if (!issueRes.ok) {
          console.error(formatIssueError(issueRes))
          process.exit(1)
        }
        // tea requires git repo CWD to resolve Gitea project
        const forgeRes = resolveForgeRepo(workspaceName, repoArg, "gitea")
        if (!forgeRes.ok) {
          console.error(formatForgeError(forgeRes))
          process.exit(1)
        }

        // tea has no `issue view` command — extract URL from JSON listing
        const capture = await _exec.runCapture(
          ["issues", "ls", "--output", "json", "--fields", "index,url", "--state", "all"],
          forgeRes.repoPath
        )
        if (capture.exitCode !== 0) {
          process.exit(capture.exitCode)
        }

        let issues: Array<Record<string, unknown>>
        try {
          issues = JSON.parse(capture.stdout)
        } catch {
          console.error("Failed to parse issue list from tea output")
          process.exit(1)
        }

        const found = issues.find((i) => String(i.index) === issueRes.issueId)
        if (!found) {
          console.error(`Issue #${issueRes.issueId} not found in Gitea repo.`)
          process.exit(1)
        }

        // tea JSON may use html_url or url depending on version (per Pitfall 4)
        const url = String(found.html_url ?? found.url)
        console.log(url)
        if (opts.web) {
          await _exec.openUrl(url)
        }
      })
  },
}
