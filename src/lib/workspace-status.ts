import { existsSync } from "fs"
import { resolve } from "path"
import { isRepoDirty, getCurrentBranch, getCommitsAhead, getCommitsBehind, isFetchStale } from "./git"
import { listWorkspaces, readGlobalConfig, getRepoPath, isGitRepo, isWorktreeRepo, type Workspace } from "./config"
import { logDebug, timeOperation } from "./observability"
import { expandHome, getTasksDir } from "./paths"

const OBS_CATEGORY = "workspace-status"

export type WorkspaceListInfo = {
  name: string
  branch: string
  description: string
  created: string
  age: string // human-readable: "2h", "3d", "1w", "2mo", "1y"
  lastOpened: string   // human-readable age from last_opened, falls back to created
  dirty: boolean | null // null = not checked
  dirtyRepos: string[] // names of dirty repos (empty if not checked)
  worktreeCount: number
  trunkCount: number
  repoCount: number    // worktreeCount + trunkCount
  ahead: number              // sum of ahead counts across worktree repos
  behind: number             // max behind count across worktree repos
  aheadBehindStale: boolean  // true if ANY worktree repo has stale FETCH_HEAD
}

function formatAge(created: string): string {
  const createdDate = new Date(created)
  const now = new Date()
  const diffMs = now.getTime() - createdDate.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffHours < 1) return "now"
  if (diffDays < 1) return `${Math.floor(diffHours)}h`
  if (diffDays < 7) return `${Math.floor(diffDays)}d`
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w`
  if (diffDays < 365) return `${Math.round(diffDays / 30)}mo`
  return `${Math.round(diffDays / 365)}y`
}

export async function getWorkspaceListInfo(
  workspace: Workspace,
  _checkStatus = true   // kept for backward compat; dirty checks always run now
): Promise<WorkspaceListInfo> {
  return timeOperation(OBS_CATEGORY, "getWorkspaceListInfo", async () => {
    const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
    const trunkRepos = workspace.repos.filter((r) => r.mode === "trunk")
    const gitRepos = workspace.repos.filter(isGitRepo)
    const existingGitRepos = gitRepos
      .map((repo) => {
        const repoPath = getRepoPath(repo)
        return { repo, repoPath, exists: existsSync(repoPath) }
      })
      .filter((entry) => entry.exists)

    logDebug(OBS_CATEGORY, `getWorkspaceListInfo.dirtyScan: ${existingGitRepos.length} repos`)
    const results = await timeOperation(
      OBS_CATEGORY,
      "getWorkspaceListInfo.dirtyScan",
      async () =>
        Promise.all(
          existingGitRepos.map(async ({ repo, repoPath }) => ({
            name: repo.name,
            dirty: await isRepoDirty(repoPath),
          }))
        )
    )
    const dirtyRepos: string[] = results.filter((r) => r.dirty).map((r) => r.name)
    const dirty: boolean = dirtyRepos.length > 0

    logDebug(OBS_CATEGORY, `getWorkspaceListInfo.aheadBehindAggregation: ${existingGitRepos.length} repos`)
    const abResults = await timeOperation(
      OBS_CATEGORY,
      "getWorkspaceListInfo.aheadBehindAggregation",
      async () =>
        Promise.all(
          existingGitRepos.map(async ({ repo, repoPath }) => {
            let baseRef: string
            if (repo.mode === "worktree") {
              const baseBranch = repo.base_branch ?? "main"
              baseRef = `origin/${baseBranch}`
            } else {
              // Trunk repos compare against origin/<currentBranch>
              const currentBranch = await getCurrentBranch(repoPath)
              baseRef = `origin/${currentBranch}`
            }
            const [ahead, behind, stale] = await Promise.all([
              getCommitsAhead(repoPath, baseRef, "HEAD"),
              getCommitsBehind(repoPath, baseRef, "HEAD"),
              isFetchStale(repoPath),
            ])
            return { ahead, behind, stale }
          })
        )
    )

    let totalAhead = 0
    let maxBehind = 0
    let anyStale = false

    for (const r of abResults) {
      totalAhead += r.ahead
      if (r.behind > maxBehind) maxBehind = r.behind
      if (r.stale) anyStale = true
    }

    return {
      name: workspace.name,
      branch: workspace.branch,
      description: workspace.description ?? "",
      created: workspace.created,
      age: formatAge(workspace.created),
      lastOpened: formatAge(workspace.last_opened ?? workspace.created),
      dirty,
      dirtyRepos,
      worktreeCount: worktreeRepos.length,
      trunkCount: trunkRepos.length,
      repoCount: workspace.repos.length,
      ahead: totalAhead,
      behind: maxBehind,
      aheadBehindStale: anyStale,
    }
  })
}

export type RepoStatus = {
  name: string
  exists: boolean
  dirty: boolean
  branch: string
  mode: "trunk" | "worktree" | "dir"
  ahead: number
  behind: number
}

export async function getWorkspaceStatus(workspace: Workspace): Promise<RepoStatus[]> {
  return timeOperation(
    OBS_CATEGORY,
    "getWorkspaceStatus",
    async () =>
      Promise.all(
        workspace.repos.map(async (repo) => {
          const repoPath = getRepoPath(repo)
          const exists = existsSync(repoPath)

          let dirty = false
          let branch = "—"
          let ahead = 0
          let behind = 0

          if (exists && isGitRepo(repo)) {
            [dirty, branch] = await Promise.all([isRepoDirty(repoPath), getCurrentBranch(repoPath)])

            let baseRef: string
            if (repo.mode === "worktree") {
              const baseBranch = repo.base_branch ?? "main"
              baseRef = `origin/${baseBranch}`
            } else {
              // Trunk repos compare against origin/<currentBranch>
              baseRef = `origin/${branch}`
            };
            [ahead, behind] = await Promise.all([
              getCommitsAhead(repoPath, baseRef, "HEAD"),
              getCommitsBehind(repoPath, baseRef, "HEAD"),
            ])
          }

          return { name: repo.name, exists, dirty, branch, mode: repo.mode, ahead, behind }
        })
      )
  )
}

export async function getDirtyWorktrees(workspace: Workspace): Promise<string[]> {
  return timeOperation(OBS_CATEGORY, "getDirtyWorktrees", async () => {
    const results = await Promise.all(
      workspace.repos
        .filter(isWorktreeRepo)
        .filter((r) => existsSync(r.task_path))
        .map(async (repo) => ({ name: repo.name, dirty: await isRepoDirty(repo.task_path) }))
    )
    return results.filter((r) => r.dirty).map((r) => r.name)
  })
}

export type CwdDetectionResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: "no_match" }

/**
 * Detect the current workspace by matching the working directory against the
 * workspace root or stored worktree task_path values. Worktree paths can win
 * over the broader workspace-root candidate by being more specific.
 *
 * @param cwd - Directory to match against (defaults to process.cwd())
 * @returns The workspace whose worktree task_path contains cwd, or no_match
 */
export function detectWorkspaceFromCwd(cwd?: string): CwdDetectionResult {
  return timeOperation<CwdDetectionResult>(OBS_CATEGORY, "detectWorkspaceFromCwd", () => {
    const currentDir = resolve(expandHome(cwd ?? process.cwd()))
    const workspaces = listWorkspaces()
    const config = readGlobalConfig()

    let bestMatch: Workspace | null = null
    let bestPathLen = 0

    function consider(ws: Workspace, candidatePath: string) {
      const resolvedPath = resolve(expandHome(candidatePath))
      if (
        currentDir === resolvedPath ||
        currentDir.startsWith(resolvedPath + "/")
      ) {
        if (resolvedPath.length > bestPathLen) {
          bestMatch = ws
          bestPathLen = resolvedPath.length
        }
      }
    }

    for (const ws of workspaces) {
      consider(ws, `${getTasksDir(config.workspace_root)}/${ws.name}`)
      for (const repo of ws.repos) {
        if (!isWorktreeRepo(repo)) continue
        consider(ws, repo.task_path)
      }
    }

    if (!bestMatch) return { ok: false as const, error: "no_match" as const }
    return { ok: true as const, workspace: bestMatch }
  })
}
