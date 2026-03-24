import {
  workspaceExists,
  readWorkspace,
  writeWorkspace,
  type Workspace,
} from "../config"
import { detectWorkspaceFromCwd } from "../workspace-ops"

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
  const workspace = readWorkspace(workspaceName)
  const settings = workspace.settings ?? {}
  const integrations = (settings.integrations ?? {}) as Record<string, Record<string, unknown>>
  const existing = (integrations[trackerId] ?? {}) as Record<string, unknown>
  integrations[trackerId] = { ...existing, issue: issueId }
  const updated: Workspace = {
    ...workspace,
    settings: { ...settings, integrations },
  }
  writeWorkspace(updated)
}

export function unlinkIssue(
  workspaceName: string,
  trackerId: string
): void {
  const workspace = readWorkspace(workspaceName)
  const settings = workspace.settings ?? {}
  const integrations = (settings.integrations ?? {}) as Record<string, Record<string, unknown>>
  const existing = (integrations[trackerId] ?? {}) as Record<string, unknown>
  const { issue: _, ...rest } = existing
  integrations[trackerId] = rest
  const updated: Workspace = {
    ...workspace,
    settings: { ...settings, integrations },
  }
  writeWorkspace(updated)
}

// --- Error formatting ---

export function formatIssueError(err: IssueRefResolutionError): string {
  switch (err.error) {
    case "workspace_not_found":
      return `Workspace '${err.name}' not found.`
    case "no_issue_linked":
      return (
        `No issue linked to workspace '${err.workspace}' for ${err.tracker}. ` +
        `Run: git-stacks integration ${err.tracker} issue link <issue-id> (from inside a worktree) ` +
        `or: git-stacks integration ${err.tracker} issue link ${err.workspace} <issue-id>`
      )
  }
}

// --- Workspace argument resolution ---

/** Injectable deps for test isolation (same pattern as _exec in niri/tmux/cmux) */
export const _resolveWorkspaceDeps = {
  workspaceExists: (name: string) => workspaceExists(name),
  detectWorkspaceFromCwd: () => detectWorkspaceFromCwd(),
}

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
  if (workspaceName) {
    if (!_resolveWorkspaceDeps.workspaceExists(workspaceName)) {
      console.error(`Workspace '${workspaceName}' not found.`)
      process.exit(1)
    }
    return workspaceName
  }
  const detection = _resolveWorkspaceDeps.detectWorkspaceFromCwd()
  if (!detection.ok) {
    console.error(
      `Could not detect workspace from current directory. ` +
      `Run from inside a worktree or specify: ` +
      `git-stacks integration ${tracker} issue ${action} <workspace> ...`
    )
    process.exit(1)
  }
  return detection.workspace.name
}
