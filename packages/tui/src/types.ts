import type { Workspace } from "@git-stacks/core/config"

import type { WorkspaceFileStatusView } from "@git-stacks/core/workspace-file-status"
import type { ArchivedWorkspaceSummary } from "@git-stacks/protocol"

export type RepoStatus = {
  name: string
  exists: boolean
  dirty: boolean
  branch: string
  mode: "trunk" | "worktree" | "dir"
  ahead: number
  behind: number
}

export type WorkspaceStatus =
  | { state: "pending" }
  | { state: "loading" }
  | { state: "loaded"; repos: RepoStatus[]; hasDirty: boolean; hasMissing: boolean; aheadBehindStale: boolean }
  | { state: "error"; message: string }

export type WorkspaceEntry = {
  workspace: Workspace
  workspaceId: string
  activityAt: string
  status: WorkspaceStatus
}

export type WorkspaceGroupingMode = "none" | "label" | "state" | "template"

export type GroupedWorkspaceItem =
  | { kind: "header"; label: string }
  | { kind: "entry"; entry: WorkspaceEntry; originalIndex: number }

export type WorkspaceFileStatusState =
  | { state: "idle" }
  | { state: "loading"; workspaceName: string }
  | { state: "loaded"; workspaceName: string; view: WorkspaceFileStatusView }
  | { state: "error"; workspaceName?: string; message: string }

export type Tab = "workspaces" | "templates" | "repos"

export type Action = "open" | "close" | "edit" | "rename" | "clean" | "archive" | "remove" | "merge" | "sync" | "push" | "create-workspace" | "issue" | "commands"

export type WorkspaceLifecycleTarget = {
  id: string
  name: string
  expectedRevision: string
}

export type DirtyRemovalContext = {
  kind: "workspace_dirty"
  blockingRepositories: string[]
  terminalsStopped: true
  forceAllowed: true
}

export type IssueCandidate = {
  tracker: "github" | "gitlab" | "gitea" | "jira"
  label: string
  issueId: string
}

export type UIView =
  | { view: "list" }
  | { view: "action-menu"; index: number }
  | { view: "archived-workspaces"; rows: ArchivedWorkspaceSummary[] }
  | { view: "archive-undo"; target: WorkspaceLifecycleTarget }
  | { view: "remove-confirm"; target: WorkspaceLifecycleTarget }
  | { view: "dirty-remove-blocked"; target: WorkspaceLifecycleTarget; details: DirtyRemovalContext }
  | { view: "force-remove-name"; target: WorkspaceLifecycleTarget; details: DirtyRemovalContext }
  | { view: "lifecycle-progress"; target: WorkspaceLifecycleTarget; action: LifecycleAction; message: string }
  | { view: "lifecycle-failure"; target: WorkspaceLifecycleTarget; action: LifecycleAction; message: string }
  | { view: "workspace-operation" }
  | { view: "confirm"; index: number; action: Action; batch?: boolean }
  | { view: "progress"; message: string }
  | { view: "sync-progress"; message: string }
  | { view: "push-progress"; message: string }
  | { view: "inline-input"; index: number; purpose: "rename" | "clone-template" | "add-label"; prefill: string }
  | { view: "issue-picker"; index: number; candidates: IssueCandidate[] }
  | { view: "command-picker"; index: number; commands: string[] }
  | { view: "messages"; workspaceName: string }
  | { view: "wizard-create"; source: "template"; templateIndex: number }
  | { view: "wizard-create-adhoc"; source: "repos"; repoNames: string[] }
  | { view: "create-progress"; workspaceName: string }
  | { view: "wizard-create-template"; source: "repos"; repoNames: string[] }
  | { view: "repo-action-menu"; index: number }
  | { view: "repo-remove-blocked"; repoName: string }

export type LifecycleAction = "archive" | "unarchive" | "remove" | "force-remove"
