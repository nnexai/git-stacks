import { existsSync } from "fs"
import {
  fetchOrigin,
  pushBranch,
  getCommitsAhead,
  rebaseBranch,
  mergeBranchFF,
  getCommitsBehind,
  getMergeConflicts,
  isRepoDirty,
  stashPush,
  stashPop,
  hasAutoStash,
  pullFFOnly,
} from "./git"
import {
  readWorkspace,
  workspaceExists,
  getRepoPath,
  isGitRepo,
  isWorktreeRepo,
  type Workspace,
} from "./config"

// ─── Injectable executor ──────────────────────────────────────────────────────
// Forward-compatible seam — git ops currently route through git.ts.
// Present per EXTR-07 convention for future direct-spawn needs.
export const _exec = {
  // No direct spawn in this phase; git operations go through git.ts helpers.
}

// ─── Sync types ───────────────────────────────────────────────────────────────

export type SyncResult = {
  ok: boolean
  synced: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  stashPopFailures?: Array<{ repo: string; error: string; repoPath: string }>
  error?: string
}

export type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed" | "stashing" | "popping"
  detail: string
  conflicts: string[]
}

// ─── Push types ───────────────────────────────────────────────────────────────

export type PushResult = {
  ok: boolean
  pushed: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  failed: Array<{ repo: string; reason: string }>
  error?: string
}

export type PushRow = {
  repo: string
  status: "pending" | "pushing" | "pushed" | "skipped" | "failed"
  detail: string
}

// ─── Pull types ───────────────────────────────────────────────────────────────

export type PullRow = {
  repo: string
  status: "pending" | "fetching" | "pulling" | "pulled" | "skipped" | "failed"
  detail: string
}

export type PullResult = {
  ok: boolean
  pulled: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  failed: Array<{ repo: string; reason: string }>
  error?: string
}

// ─── pushWorkspace ────────────────────────────────────────────────────────────

export async function pushWorkspace(
  name: string,
  opts: {
    force?: boolean
    forceWithLease?: boolean
    dryRun?: boolean
    setUpstream?: boolean
  },
  onProgress?: (row: PushRow) => void
): Promise<PushResult> {
  if (!workspaceExists(name)) {
    return { ok: false, pushed: [], skipped: [], failed: [], error: `Workspace '${name}' not found.` }
  }

  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter(isWorktreeRepo)
  const trunkRepos = workspace.repos.filter(r => r.mode === "trunk")
  const dirRepos = workspace.repos.filter(r => r.mode === "dir")

  const pushed: PushResult["pushed"] = []
  const skipped: PushResult["skipped"] = [
    ...trunkRepos.map(r => ({ repo: r.name, reason: "trunk" })),
    ...dirRepos.map(r => ({ repo: r.name, reason: "dir" })),
  ]
  const failed: PushResult["failed"] = []

  for (const repo of trunkRepos) {
    onProgress?.({ repo: repo.name, status: "skipped", detail: "trunk" })
  }
  for (const repo of dirRepos) {
    onProgress?.({ repo: repo.name, status: "skipped", detail: "dir" })
  }

  if (worktreeRepos.length === 0) {
    return { ok: true, pushed, skipped, failed }
  }

  if (opts.dryRun) {
    await Promise.all(
      worktreeRepos.map(async (repo) => {
        if (!existsSync(repo.task_path)) {
          skipped.push({ repo: repo.name, reason: "task_path missing" })
          onProgress?.({ repo: repo.name, status: "skipped", detail: "task_path missing" })
          return
        }

        const commits = await getCommitsAhead(repo.task_path, `origin/${workspace.branch}`, "HEAD")
        pushed.push({ repo: repo.name, commits })
        onProgress?.({
          repo: repo.name,
          status: "pushed",
          detail: commits > 0 ? `would push ${commits} commit${commits === 1 ? "" : "s"}` : "would push 0 commits",
        })
      })
    )
    return { ok: true, pushed, skipped, failed }
  }

  await Promise.all(
    worktreeRepos.map(async (repo) => {
      if (!existsSync(repo.task_path)) {
        skipped.push({ repo: repo.name, reason: "task_path missing" })
        onProgress?.({ repo: repo.name, status: "skipped", detail: "task_path missing" })
        return
      }

      onProgress?.({ repo: repo.name, status: "pushing", detail: "" })

      const result = await pushBranch(repo.task_path, workspace.branch, {
        force: opts.force,
        forceWithLease: opts.forceWithLease,
        setUpstream: opts.setUpstream,
      })

      if (result.ok) {
        const detail = result.commits > 0 ? `${result.commits} commit${result.commits === 1 ? "" : "s"}` : "up to date"
        pushed.push({ repo: repo.name, commits: result.commits })
        onProgress?.({ repo: repo.name, status: "pushed", detail })
        return
      }

      failed.push({ repo: repo.name, reason: result.reason })
      onProgress?.({ repo: repo.name, status: "failed", detail: result.reason })
    })
  )

  return {
    ok: failed.length === 0,
    pushed,
    skipped,
    failed,
    ...(failed.length > 0 ? { error: "One or more repos failed to push." } : {}),
  }
}

// ─── syncWorkspace ────────────────────────────────────────────────────────────

export async function syncWorkspace(
  name: string,
  opts: {
    strategy?: "rebase" | "merge"
    bestEffort?: boolean
    stash?: boolean
  },
  onProgress?: (update: SyncRow) => void
): Promise<SyncResult> {
  if (!workspaceExists(name)) {
    return { ok: false, synced: [], skipped: [], error: `Workspace '${name}' not found.` }
  }

  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter(isWorktreeRepo)

  if (worktreeRepos.length === 0) {
    return { ok: true, synced: [], skipped: [] }
  }

  const settledRows = new Map<string, SyncRow>()
  const emitSettled = (row: SyncRow) => {
    settledRows.set(row.repo, row)
    onProgress?.(row)
  }
  const stashedRepos: Array<{ name: string; taskPath: string }> = []
  let baseResult: SyncResult = { ok: true, synced: [], skipped: [] }
  let stashPopFailures: SyncResult["stashPopFailures"]

  // Resolve base branches from workspace repo data (registry model)
  const repoInfos = worktreeRepos.map((repo) => {
    const baseBranch = repo.base_branch ?? "main"
    return { repo, baseBranch, strategy: opts.strategy ?? "rebase" }
  })

  const restoreStashes = async (): Promise<SyncResult["stashPopFailures"]> => {
    if (!opts.stash || stashedRepos.length === 0) return undefined

    const failures: NonNullable<SyncResult["stashPopFailures"]> = []
    for (const repo of [...stashedRepos].reverse()) {
      onProgress?.({ repo: repo.name, status: "popping", detail: "", conflicts: [] })
      const popResult = await stashPop(repo.taskPath)
      if (!popResult.ok) {
        failures.push({ repo: repo.name, error: popResult.error, repoPath: repo.taskPath })
        const prior = settledRows.get(repo.name)
        emitSettled({
          repo: repo.name,
          status: "failed",
          detail: prior?.detail ? `${prior.detail}; stash pop failed` : "stash pop failed",
          conflicts: prior?.conflicts ?? [],
        })
        continue
      }

      const prior = settledRows.get(repo.name)
      emitSettled(
        prior
          ? {
              ...prior,
              detail: prior.detail ? `${prior.detail}; stash restored` : "stash restored",
            }
          : { repo: repo.name, status: "synced", detail: "stash restored", conflicts: [] }
      )
    }

    return failures.length > 0 ? failures : undefined
  }

  try {
    let shouldContinue = true

    if (opts.stash) {
      for (const repo of worktreeRepos) {
        if (!existsSync(repo.task_path)) continue
        if (await hasAutoStash(repo.task_path)) {
          baseResult = {
            ok: false,
            synced: [],
            skipped: [],
            error: `Repo '${repo.name}' already has a git-stacks auto-stash entry. Resolve it first: git -C ${repo.task_path} stash pop`,
          }
          shouldContinue = false
          break
        }
      }

      if (shouldContinue) {
        for (const repo of worktreeRepos) {
          if (!existsSync(repo.task_path)) continue
          if (!(await isRepoDirty(repo.task_path))) continue
          onProgress?.({ repo: repo.name, status: "stashing", detail: "", conflicts: [] })
          const stashResult = await stashPush(repo.task_path, "git-stacks auto-stash (sync)")
          if (!stashResult.ok) {
            baseResult = {
              ok: false,
              synced: [],
              skipped: [],
              error: `Stash failed for ${repo.name}: ${stashResult.error}`,
            }
            shouldContinue = false
            break
          }
          stashedRepos.push({ name: repo.name, taskPath: repo.task_path })
        }
      }
    }

    if (shouldContinue) {
      // Fetch all repos in parallel — track failures instead of swallowing them
      const fetchFailures = new Map<string, string>()
      await Promise.all(
        repoInfos
          .filter(({ repo }) => existsSync(repo.task_path))
          .map(async ({ repo }) => {
            onProgress?.({ repo: repo.name, status: "fetching", detail: "", conflicts: [] })
            try {
              await fetchOrigin(repo.task_path)
            } catch (e) {
              const msg = e instanceof Error ? e.message : "fetch failed"
              const detail = msg.includes("timeout") ? "fetch failed (timeout)" : "fetch failed"
              fetchFailures.set(repo.name, detail)
              emitSettled({ repo: repo.name, status: "failed", detail, conflicts: [] })
            }
          })
      )

      // Dry-run conflict check in parallel
      const conflictResults = await Promise.all(
        repoInfos
          .filter(({ repo }) => existsSync(repo.task_path))
          .map(async ({ repo, baseBranch }) => ({
            repo: repo.name,
            files: await getMergeConflicts(repo.task_path, `origin/${baseBranch}`, workspace.branch),
          }))
      )
      const conflicts = conflictResults.filter((r) => r.files.length > 0)

      // In strict mode, abort if any conflicts
      if (!opts.bestEffort && conflicts.length > 0) {
        const detail = conflicts
          .map(c => `  ${c.repo} (${c.files.join(", ")})`)
          .join("\n")
        baseResult = {
          ok: false,
          synced: [],
          skipped: conflicts.map(c => ({ repo: c.repo, reason: `conflict in ${c.files.join(", ")}` })),
          error: `Conflicts detected:\n${detail}\n\nUse --best-effort to skip conflicting repos.`,
        }
      } else {
        const conflictRepos = new Set(conflicts.map(c => c.repo))
        const synced: SyncResult["synced"] = []
        const skipped: SyncResult["skipped"] = []

        for (const { repo, baseBranch, strategy } of repoInfos) {
          if (!existsSync(repo.task_path)) {
            skipped.push({ repo: repo.name, reason: "task_path missing" })
            continue
          }

          if (fetchFailures.has(repo.name)) {
            skipped.push({ repo: repo.name, reason: fetchFailures.get(repo.name)! })
            continue
          }

          if (conflictRepos.has(repo.name)) {
            const c = conflicts.find(c => c.repo === repo.name)!
            skipped.push({ repo: repo.name, reason: `conflict in ${c.files.join(", ")}` })
            emitSettled({ repo: repo.name, status: "skipped", detail: `conflict: ${c.files[0]}`, conflicts: c.files.slice(1) })
            continue
          }

          const commitsBefore = await getCommitsBehind(repo.task_path, `origin/${baseBranch}`, "HEAD")

          onProgress?.({ repo: repo.name, status: "rebasing", detail: "", conflicts: [] })

          let result: { ok: boolean; error?: string }
          if (strategy === "merge") {
            result = await mergeBranchFF(repo.task_path, `origin/${baseBranch}`)
          } else {
            result = await rebaseBranch(repo.task_path, `origin/${baseBranch}`)
          }

          if (!result.ok) {
            skipped.push({ repo: repo.name, reason: result.error ?? "sync failed" })
            emitSettled({ repo: repo.name, status: "failed", detail: result.error ?? "sync failed", conflicts: [] })
            continue
          }

          synced.push({ repo: repo.name, commits: commitsBefore })
          emitSettled({ repo: repo.name, status: "synced", detail: `+${commitsBefore} commits`, conflicts: [] })
        }

        baseResult = { ok: skipped.length === 0 || opts.bestEffort === true, synced, skipped }
      }
    }
  } finally {
    stashPopFailures = await restoreStashes()
  }

  if ((stashPopFailures?.length ?? 0) > 0) {
    return {
      ...baseResult,
      ok: false,
      stashPopFailures,
    }
  }

  return baseResult
}

// ─── pullWorkspace ────────────────────────────────────────────────────────────

export async function pullWorkspace(
  nameOrWorkspace: string | Workspace,
  onProgress?: (update: PullRow) => void
): Promise<PullResult> {
  let workspace: Workspace
  if (typeof nameOrWorkspace === "string") {
    if (!workspaceExists(nameOrWorkspace)) {
      return { ok: false, pulled: [], skipped: [], failed: [], error: `Workspace '${nameOrWorkspace}' not found.` }
    }
    workspace = readWorkspace(nameOrWorkspace)
  } else {
    workspace = nameOrWorkspace
  }

  const repos = workspace.repos.filter(isGitRepo)

  if (repos.length === 0) {
    return { ok: true, pulled: [], skipped: [], failed: [] }
  }

  // Phase 1: Parallel fetch, deduplicated by main_path
  const fetchGroups = new Map<string, typeof repos>()
  for (const repo of repos) {
    const key = repo.main_path
    if (!fetchGroups.has(key)) fetchGroups.set(key, [])
    fetchGroups.get(key)!.push(repo)
  }

  const fetchFailures = new Map<string, string>()
  await Promise.all(
    Array.from(fetchGroups.entries()).map(async ([mainPath, groupRepos]) => {
      for (const r of groupRepos) {
        onProgress?.({ repo: r.name, status: "fetching", detail: "" })
      }
      try {
        await fetchOrigin(mainPath)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "fetch failed"
        const detail = msg.includes("timeout") ? "fetch failed (timeout)" : "fetch failed"
        for (const r of groupRepos) {
          fetchFailures.set(r.name, detail)
          onProgress?.({ repo: r.name, status: "failed", detail })
        }
      }
    })
  )

  // Phase 2: Sequential pull per repo
  const pulled: PullResult["pulled"] = []
  const skipped: PullResult["skipped"] = []
  const failed: PullResult["failed"] = []

  for (const repo of repos) {
    const repoPath = getRepoPath(repo)
    const pullBranch = repo.mode === "worktree"
      ? workspace.branch
      : (repo.base_branch ?? "main")

    if (!existsSync(repoPath)) {
      skipped.push({ repo: repo.name, reason: "path missing" })
      onProgress?.({ repo: repo.name, status: "skipped", detail: "path missing" })
      continue
    }

    if (fetchFailures.has(repo.name)) {
      failed.push({ repo: repo.name, reason: fetchFailures.get(repo.name)! })
      onProgress?.({ repo: repo.name, status: "failed", detail: fetchFailures.get(repo.name)! })
      continue
    }

    if (await isRepoDirty(repoPath)) {
      skipped.push({ repo: repo.name, reason: "dirty" })
      onProgress?.({ repo: repo.name, status: "skipped", detail: "dirty" })
      continue
    }

    onProgress?.({ repo: repo.name, status: "pulling", detail: "" })
    const pullResult = await pullFFOnly(repoPath, pullBranch)

    if (!pullResult.ok) {
      failed.push({ repo: repo.name, reason: pullResult.reason })
      onProgress?.({ repo: repo.name, status: "failed", detail: pullResult.reason })
      continue
    }

    const detail = pullResult.commits === 0
      ? "already up to date"
      : `${pullResult.commits} commit${pullResult.commits === 1 ? "" : "s"}`
    pulled.push({ repo: repo.name, commits: pullResult.commits })
    onProgress?.({ repo: repo.name, status: "pulled", detail })
  }

  return {
    ok: skipped.length === 0 && failed.length === 0,
    pulled,
    skipped,
    failed,
  }
}
