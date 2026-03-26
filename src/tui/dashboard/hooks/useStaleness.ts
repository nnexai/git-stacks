import { createSignal, untrack } from "solid-js"
import { fetchOrigin, getCommitsBehind, hasUpstreamTracking, getCurrentBranch } from "../../../lib/git"
import type { Workspace } from "../../../lib/config"

export type StaleInfo = {
  count: number | null   // null = still loading or no tracking
  error: boolean         // true = network failure (show ?)
  fetchedAt: number      // Date.now() timestamp
}

const STALENESS_TTL = 5 * 60 * 1000 // 5 minutes

export function useStaleness() {
  const [staleness, setStaleness] = createSignal<Map<string, StaleInfo>>(new Map())

  function fetchStaleness(workspace: Workspace): void {
    const repos = workspace.repos
    // Deduplicate by main_path
    const seen = new Set<string>()
    const unique: typeof repos = []
    for (const r of repos) {
      if (!seen.has(r.main_path)) {
        seen.add(r.main_path)
        unique.push(r)
      }
    }

    const now = Date.now()
    // untrack: fetchStaleness is called from createEffect — reading staleness()
    // inside a tracked scope would cause infinite re-triggers when setStaleness runs.
    const current = untrack(staleness)

    // Filter to repos that need fetching (TTL expired or not cached)
    const needsFetch: typeof repos = []
    for (const r of unique) {
      const cached = current.get(r.main_path)
      if (cached && now - cached.fetchedAt < STALENESS_TTL) continue
      needsFetch.push(r)
    }

    if (needsFetch.length === 0) return

    // Set loading state for repos needing fetch
    setStaleness(prev => {
      const next = new Map(prev)
      for (const r of needsFetch) {
        next.set(r.main_path, { count: null, error: false, fetchedAt: 0 })
      }
      return next
    })

    // Fetch all concurrently
    Promise.allSettled(
      needsFetch.map(async (repo) => {
        const branch = repo.mode === "worktree"
          ? workspace.branch
          : await getCurrentBranch(repo.main_path)

        const hasTracking = await hasUpstreamTracking(repo.main_path, branch)
        if (!hasTracking) {
          return { mainPath: repo.main_path, info: { count: null, error: false, fetchedAt: Date.now() } satisfies StaleInfo }
        }

        try {
          await fetchOrigin(repo.main_path)
        } catch {
          return { mainPath: repo.main_path, info: { count: null, error: true, fetchedAt: Date.now() } satisfies StaleInfo }
        }

        const count = await getCommitsBehind(repo.main_path, "origin/" + branch, branch)
        return { mainPath: repo.main_path, info: { count, error: false, fetchedAt: Date.now() } satisfies StaleInfo }
      })
    ).then(results => {
      setStaleness(prev => {
        const next = new Map(prev)
        for (const r of results) {
          if (r.status === "fulfilled") {
            next.set(r.value.mainPath, r.value.info)
          }
        }
        return next
      })
    })
  }

  function invalidateCache(): void {
    setStaleness(prev => {
      const next = new Map(prev)
      for (const [key, val] of next) {
        next.set(key, { ...val, fetchedAt: 0 })
      }
      return next
    })
  }

  return { staleness, fetchStaleness, invalidateCache }
}
