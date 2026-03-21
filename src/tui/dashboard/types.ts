import type { Workspace } from "../../lib/config"

export type RepoStatus = {
  name: string
  exists: boolean
  dirty: boolean
  branch: string
  mode: "trunk" | "worktree"
}

export type WorkspaceStatus =
  | { state: "pending" }
  | { state: "loading" }
  | { state: "loaded"; repos: RepoStatus[]; hasDirty: boolean; hasMissing: boolean }
  | { state: "error"; message: string }

export type WorkspaceEntry = {
  workspace: Workspace
  status: WorkspaceStatus
}

export type Tab = "workspaces" | "templates" | "repos"

export type Action = "open" | "edit" | "rename" | "clean" | "remove" | "merge" | "sync" | "create-workspace"

export type UIView =
  | { view: "list" }
  | { view: "action-menu"; index: number }
  | { view: "confirm"; index: number; action: Action; batch?: boolean }
  | { view: "progress"; message: string }
  | { view: "sync-progress"; message: string }
  | { view: "inline-input"; index: number; purpose: "rename" | "clone-template"; prefill: string }
  | { view: "messages"; workspaceName: string }
  | { view: "wizard-create"; source: "template"; templateIndex: number }
  | { view: "wizard-create-adhoc"; source: "repos"; repoNames: string[] }
  | { view: "create-progress"; workspaceName: string }
  | { view: "wizard-create-template"; source: "repos"; repoNames: string[] }
  | { view: "repo-action-menu"; index: number }
  | { view: "repo-remove-blocked"; repoName: string }
