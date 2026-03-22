import {
  workspaceExists,
  readWorkspace,
  writeWorkspace,
  type Workspace,
} from "../config"

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
      return `No issue linked to workspace '${err.workspace}' for ${err.tracker}. Run: git-stacks integration ${err.tracker} issue link ${err.workspace} <issue-id>`
  }
}
