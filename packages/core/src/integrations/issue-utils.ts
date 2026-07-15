import {

  readWorkspace,
  updateWorkspace,
  type Workspace,
  workspaceExists,
} from "../config"
import { resolveOptionalWorkspace } from "../workspace-resolution"

// --- Types ---

export type IssueRefResolution =
  | { ok: true; issueId: string; workspace: Workspace }
  | IssueRefResolutionError

export type IssueRefResolutionError =
  | { ok: false; error: "workspace_not_found"; name: string }
  | { ok: false; error: "no_issue_linked"; tracker: string; workspace: string }

// --- Resolution ---

export function resolveIssueRef(
  workspaceName: string,
  trackerId: string
): IssueRefResolution {
  if (!workspaceExists(workspaceName)) {
    return { ok: false, error: "workspace_not_found", name: workspaceName }
  }
  const workspace = readWorkspace(workspaceName)
  const integrations = workspace.settings?.integrations as Record<string, unknown> | undefined
  const trackerConfig = integrations?.[trackerId] as Record<string, unknown> | undefined
  const issueId = trackerConfig?.issue
  if (issueId === undefined || issueId === null) {
    return { ok: false, error: "no_issue_linked", tracker: trackerId, workspace: workspaceName }
  }
  return { ok: true, issueId: String(issueId), workspace }
}

// --- Link / Unlink ---

export function linkIssue(
  workspaceName: string,
  trackerId: string,
  issueId: string
): void {
  updateWorkspace(workspaceName, (workspace) => {
    const settings = workspace.settings ?? {}
    const integrations = { ...((settings.integrations ?? {}) as Record<string, Record<string, unknown>>) }
    integrations[trackerId] = { ...(integrations[trackerId] ?? {}), issue: issueId }
    return { ...workspace, settings: { ...settings, integrations } }
  })
}

export function unlinkIssue(
  workspaceName: string,
  trackerId: string
): void {
  updateWorkspace(workspaceName, (workspace) => {
    const settings = workspace.settings ?? {}
    const integrations = { ...((settings.integrations ?? {}) as Record<string, Record<string, unknown>>) }
    const { issue: _, ...rest } = integrations[trackerId] ?? {}
    integrations[trackerId] = rest
    return { ...workspace, settings: { ...settings, integrations } }
  })
}

// --- Error formatting ---

export function formatIssueError(err: IssueRefResolutionError): string {
  switch (err.error) {
    case "workspace_not_found":
      return `Workspace '${err.name}' not found.`
    case "no_issue_linked":
      return (
        `No issue linked to workspace '${err.workspace}' for ${err.tracker}. ` +
        `Run: git-stacks integration ${err.tracker} issue link <issue-id> (from a workspace root or worktree) ` +
        `or: git-stacks integration ${err.tracker} issue link ${err.workspace} <issue-id>`
      )
  }
}

// --- Workspace argument resolution ---

/**
 * Resolve workspace name from an explicit argument or CWD detection.
 * Returns workspace name on success, calls process.exit(1) on failure.
 *
 * @param workspaceName - Explicitly provided workspace name (or undefined for CWD detection)
 * @param tracker - Tracker integration ID (e.g. "jira", "github") — used in error messages
 * @param action - Command action name (e.g. "link", "unlink", "open") — used in error messages
 */
export function resolveWorkspaceArg(
  workspaceName: string | undefined,
  tracker: string,
  action: string
): string {
  const resolution = resolveOptionalWorkspace(workspaceName)
  if (resolution.ok) return resolution.workspace.name

  if (resolution.error === "workspace_not_found") {
    console.error(`Workspace '${resolution.name}' not found.`)
    process.exit(1)
  } else {
    console.error(
      `Could not detect workspace from current directory. ` +
      `Run from a workspace root or worktree, or specify: ` +
      `git-stacks integration ${tracker} issue ${action} <workspace> ...`
    )
    process.exit(1)
  }
}
