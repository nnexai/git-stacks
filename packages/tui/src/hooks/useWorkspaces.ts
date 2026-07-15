import { createMemo } from "solid-js"

import { useCoreState } from "../core-store"
import type { WorkspaceEntry } from "../types"
import { workspacePriorityOrder } from "@git-stacks/client"

export function useWorkspaces() {
  const core = useCoreState()
  const entries = createMemo<WorkspaceEntry[]>(() => (core.state()?.workspaces ?? []).map(({ definition, projection }) => {
    const repos = (projection.status ?? []).map(({ name, exists, dirty, branch, mode, ahead, behind }) => ({
      name, exists, dirty, branch, mode, ahead, behind,
    }))
    return {
      workspace: definition,
      status: {
        state: "loaded" as const,
        repos,
        hasDirty: repos.some((repo) => repo.dirty),
        hasMissing: repos.some((repo) => !repo.exists && repo.mode === "worktree"),
        aheadBehindStale: (projection.status ?? []).some((repo) => repo.fetch_stale === true),
      },
    }
  }).sort((left, right) => workspacePriorityOrder(left.workspace, right.workspace)))
  return { entries, loading: core.loading, reload: core.reload }
}
