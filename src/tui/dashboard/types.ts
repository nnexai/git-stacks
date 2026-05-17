import type { Workspace } from "../../lib/config"
import type { WorkspaceFileStatusView } from "../../lib/workspace-file-status"

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

export type Action = "open" | "close" | "edit" | "rename" | "clean" | "remove" | "merge" | "sync" | "push" | "create-workspace"

export type UIView =
  | { view: "list" }
  | { view: "action-menu"; index: number }
  | { view: "confirm"; index: number; action: Action; batch?: boolean }
  | { view: "progress"; message: string }
  | { view: "sync-progress"; message: string }
  | { view: "push-progress"; message: string }
  | { view: "inline-input"; index: number; purpose: "rename" | "clone-template" | "add-label"; prefill: string }
  | { view: "messages"; workspaceName: string }
  | { view: "wizard-create"; source: "template"; templateIndex: number }
  | { view: "wizard-create-adhoc"; source: "repos"; repoNames: string[] }
  | { view: "create-progress"; workspaceName: string }
  | { view: "wizard-create-template"; source: "repos"; repoNames: string[] }
  | { view: "repo-action-menu"; index: number }
  | { view: "repo-remove-blocked"; repoName: string }
