import { z } from "zod"

import type { CommandLike as Command } from "./types"
import { resolveEnabled, type ArtifactBag, type HasCommands, type Integration, type IntegrationContext } from "./types"
import { linkIssue, unlinkIssue, resolveIssueRef, formatIssueError, resolveWorkspaceArg } from "./issue-utils"
import { workspaceExists, readGlobalConfig, readWorkspace } from "../config"
import { prompts as p } from "../prompt-capability"
import { spawn } from "../node-runtime"

// --- Config Schema ---

const jiraConfigSchema = z.object({
  enabled: z.boolean().optional(),
  open_cmd: z.string().optional(), // configurable template, default: "jira open $ISSUE_ID"
})

// --- Exec ---

export const _exec = {
  /** Run a shell command template with env vars. Uses sh -c for $ISSUE_ID substitution (per Pitfall 5). */
  runShell: async (cmd: string, env: Record<string, string>): Promise<{ exitCode: number }> => {
    const proc = spawn(["sh", "-c", cmd], {
      env: { ...process.env, ...env } as Record<string, string>,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    return { exitCode: await proc.exited }
  },
}

// --- Integration ---

export const jiraIntegration: Integration & HasCommands = {
  id: "jira",
  label: "Jira",
  hint: "link and open Jira issues via jira-cli or configurable command",
  enabledByDefault: false,
  order: 53, // tier 5 — after gitea (52). Avoids collision with gitlab (51).

  isEnabled: (ctx) => resolveEnabled("jira", false, ctx),

  async open(_ctx: IntegrationContext, _artifactPath: string | null, _bag: ArtifactBag): Promise<null> {
    return null // Jira is not a session integration
  },

  async configurePrompt(current: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const parsed = jiraConfigSchema.safeParse(current)
    const currentCmd = parsed.success ? parsed.data.open_cmd : undefined
    const openCmd = await p.text({
      message: "Jira issue open command (use $ISSUE_ID as placeholder)",
      initialValue: currentCmd ?? "jira open $ISSUE_ID",
    })
    if (p.isCancel(openCmd)) return null
    return { ...current, enabled: true, open_cmd: (openCmd as string) || "jira open $ISSUE_ID" }
  },

  commands(parent: Command): void {
    const issue = parent.command("issue").description("Link and open Jira issues")

    // Both positionals are optional to allow: link PROJ-123 (CWD detect) or link my-ws PROJ-123 (explicit)
    issue.command("link [workspace-or-issue] [issue-id]")
      .description("Link a Jira issue to a workspace (e.g. PROJ-123)")
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
            console.error(`Missing issue ID. Usage: git-stacks integration jira issue link [workspace] <issue-id>`)
            process.exit(1)
          }
          // It's an issue ID — detect workspace from CWD
          issueId = firstArg
          workspaceName = resolveWorkspaceArg(undefined, "jira", "link")
        } else {
          // No args at all
          console.error(`Missing issue ID. Usage: git-stacks integration jira issue link [workspace] <issue-id>`)
          process.exit(1)
        }

        linkIssue(workspaceName, "jira", issueId)
        console.log(`Linked Jira issue ${issueId} to workspace '${workspaceName}'.`)
      })

    issue.command("unlink [workspace]")
      .description("Remove Jira issue link from a workspace")
      .action(async (workspaceName: string | undefined) => {
        const resolved = resolveWorkspaceArg(workspaceName, "jira", "unlink")
        unlinkIssue(resolved, "jira")
        console.log(`Unlinked Jira issue from workspace '${resolved}'.`)
      })

    issue.command("open [workspace]")
      .description("Open linked Jira issue in browser")
      .action(async (workspaceName: string | undefined) => {
        const resolved = resolveWorkspaceArg(workspaceName, "jira", "open")
        const resolution = resolveIssueRef(resolved, "jira")
        if (!resolution.ok) {
          console.error(formatIssueError(resolution))
          process.exit(1)
        }
        const { issueId } = resolution

        // Field-level cascade: workspace config overrides global only when it
        // supplies open_cmd; enabled state remains resolved independently.
        const config = readGlobalConfig()
        const globalJiraConfig = jiraConfigSchema.safeParse(config.integrations["jira"])
        const workspaceJiraConfig = jiraConfigSchema.safeParse(
          readWorkspace(resolved).settings?.integrations?.["jira"]
        )
        const openCmdTemplate = (workspaceJiraConfig.success && workspaceJiraConfig.data.open_cmd)
          ? workspaceJiraConfig.data.open_cmd
          : (globalJiraConfig.success && globalJiraConfig.data.open_cmd)
          ? globalJiraConfig.data.open_cmd
          : "jira open $ISSUE_ID"

        // Use sh -c with ISSUE_ID as env var (per Pitfall 5 — no string interpolation)
        const result = await _exec.runShell(openCmdTemplate, { ISSUE_ID: issueId })
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })
  },
}
