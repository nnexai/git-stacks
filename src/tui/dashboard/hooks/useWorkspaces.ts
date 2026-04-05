import { createSignal, onCleanup } from "solid-js"
import { listWorkspaces, isWorktreeRepo, type Workspace } from "../../../lib/config"
import { getWorkspaceStatus } from "../../../lib/workspace-ops"
import { isFetchStale } from "../../../lib/git"
import type { WorkspaceEntry, WorkspaceStatus } from "../types"

const CONCURRENCY = 5

export function useWorkspaces() {
  const [entries, setEntries] = createSignal<WorkspaceEntry[]>([])
  const [loading, setLoading] = createSignal(true)

  let cancelled = false
  onCleanup(() => { cancelled = true })

  // Initial load
  const workspaces = listWorkspaces()
  const initial: WorkspaceEntry[] = workspaces.map((ws) => ({
    workspace: ws,
    status: { state: "pending" as const },
  }))
  setEntries(initial)
  setLoading(workspaces.length > 0)

  // Staggered async status fetching
  if (workspaces.length > 0) {
    fetchStatuses(workspaces, setEntries, () => cancelled).then(() => {
      if (!cancelled) setLoading(false)
    })
  } else {
    setLoading(false)
  }

  function reload(): Promise<void> {
    const workspaces = listWorkspaces()
    const fresh: WorkspaceEntry[] = workspaces.map((ws) => ({
      workspace: ws,
      status: { state: "pending" as const },
    }))
    setEntries(fresh)
    setLoading(true)
    return fetchStatuses(workspaces, setEntries, () => cancelled).then(() => {
      if (!cancelled) setLoading(false)
    })
  }

  return { entries, loading, reload }
}

async function fetchStatuses(
  workspaces: Workspace[],
  setEntries: (fn: (prev: WorkspaceEntry[]) => WorkspaceEntry[]) => void,
  isCancelled: () => boolean
) {
  // Process in batches of CONCURRENCY
  for (let i = 0; i < workspaces.length; i += CONCURRENCY) {
    if (isCancelled()) return
    const batch = workspaces.slice(i, i + CONCURRENCY)

    // Mark batch as loading
    const batchNames = new Set(batch.map((w) => w.name))
    setEntries((prev) =>
      prev.map((e) =>
        batchNames.has(e.workspace.name)
          ? { ...e, status: { state: "loading" as const } }
          : e
      )
    )

    // Fetch in parallel within batch
    const results = await Promise.allSettled(
      batch.map(async (ws) => {
        const repos = await getWorkspaceStatus(ws)

        // Compute staleness: any worktree repo with stale FETCH_HEAD
        const worktreeRepos = ws.repos
          .filter(isWorktreeRepo)
          .filter(r => repos.some(rs => rs.name === r.name && rs.exists))
        const staleChecks = await Promise.all(
          worktreeRepos.map(r => isFetchStale(r.task_path))
        )
        const aheadBehindStale = staleChecks.some(s => s)

        return {
          name: ws.name,
          status: {
            state: "loaded" as const,
            repos,
            hasDirty: repos.some((r) => r.dirty),
            hasMissing: repos.some((r) => !r.exists && r.mode === "worktree"),
            aheadBehindStale,
          } satisfies WorkspaceStatus,
        }
      })
    )

    if (isCancelled()) return

    setEntries((prev) =>
      prev.map((e) => {
        const result = results.find(
          (r) =>
            r.status === "fulfilled" && r.value.name === e.workspace.name
        )
        if (result && result.status === "fulfilled") {
          return { ...e, status: result.value.status }
        }
        const failed = results.find(
          (r) =>
            r.status === "rejected" &&
            batch.some((b) => b.name === e.workspace.name)
        )
        if (failed && failed.status === "rejected") {
          return {
            ...e,
            status: { state: "error" as const, message: String(failed.reason) },
          }
        }
        return e
      })
    )
  }
}
