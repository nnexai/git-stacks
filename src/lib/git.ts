import { $ } from "bun"
import { join } from "path"

export async function checkBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} rev-parse --verify ${branch}`.quiet().nothrow()
  return result.exitCode === 0
}

export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  const exists = await checkBranchExists(repoPath, branch)
  if (exists) {
    await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`.quiet()
  } else {
    // Branch from current HEAD of the main clone, not a fixed base branch
    await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`.quiet()
  }
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await $`git -C ${repoPath} worktree remove ${worktreePath} --force`
}

export async function isWorktreeRegistered(repoPath: string, worktreePath: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} worktree list --porcelain`.text()
  return result.includes(worktreePath)
}

export async function isRepoDirty(repoPath: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} status --porcelain`.text()
  return result.trim().length > 0
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  const result = await $`git -C ${repoPath} rev-parse --abbrev-ref HEAD`.text()
  return result.trim()
}

export async function isBranchGoneOnRemote(mainPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${mainPath} ls-remote --exit-code --heads origin ${branch}`
    .quiet()
    .nothrow()
  return result.exitCode !== 0
}

export async function getMergeConflicts(
  repoPath: string,
  baseBranch: string,
  branch: string
): Promise<string[]> {
  const result = await $`git -C ${repoPath} merge-tree --write-tree ${baseBranch} ${branch}`
    .quiet()
    .nothrow()
  if (result.exitCode === 0) return []
  // Parse conflict file paths from stdout (lines starting with "CONFLICT")
  return result.stdout
    .toString()
    .split("\n")
    .filter((l) => l.startsWith("CONFLICT"))
    .map((l) => l.replace(/^CONFLICT \([^)]+\): /, "").trim())
    .filter(Boolean)
}

export async function mergeNoFF(
  repoPath: string,
  baseBranch: string,
  branch: string
): Promise<{ ok: boolean; error?: string }> {
  // Resolve base branch SHA for detached HEAD
  const shaResult = await $`git -C ${repoPath} rev-parse ${baseBranch}`.quiet().nothrow()
  if (shaResult.exitCode !== 0) {
    return { ok: false, error: `Cannot resolve ${baseBranch}: ${shaResult.stderr.toString().trim()}` }
  }
  const baseSha = shaResult.stdout.toString().trim()

  // Temp worktree path as sibling of repo dir
  const tmpPath = join(repoPath, `../.gs-merge-${Date.now()}`)

  // Add detached worktree at base SHA
  const addResult = await $`git -C ${repoPath} worktree add --detach ${tmpPath} ${baseSha}`.quiet().nothrow()
  if (addResult.exitCode !== 0) {
    return { ok: false, error: `Cannot create temp worktree: ${addResult.stderr.toString().trim()}` }
  }

  try {
    // Perform the merge in the temp worktree
    const mergeResult = await $`git -C ${tmpPath} merge --no-ff ${branch}`.quiet().nothrow()
    if (mergeResult.exitCode !== 0) {
      await $`git -C ${tmpPath} merge --abort`.quiet().nothrow()
      return { ok: false, error: mergeResult.stderr.toString().trim() }
    }

    // Update the base branch ref to point to the merge commit
    const newHead = (await $`git -C ${tmpPath} rev-parse HEAD`.quiet()).stdout.toString().trim()
    await $`git -C ${repoPath} update-ref refs/heads/${baseBranch} ${newHead}`.quiet()

    return { ok: true }
  } finally {
    // Always clean up temp worktree (--force handles dirty state from failed merge)
    await $`git -C ${repoPath} worktree remove ${tmpPath} --force`.quiet().nothrow()
  }
}

export async function deleteLocalBranch(repoPath: string, branch: string): Promise<void> {
  await $`git -C ${repoPath} branch -d ${branch}`.quiet().nothrow()
}

export async function fetchOrigin(repoPath: string): Promise<void> {
  await $`git -C ${repoPath} -c fetch.timeout=30 fetch origin`.quiet()
}

// --- Upstream tracking ---

/** Returns true when origin/<branch> remote-tracking ref exists in local refs (e.g. after a fetch). */
export async function checkRemoteTrackingRef(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} rev-parse --verify ${"origin/" + branch}`.quiet().nothrow()
  return result.exitCode === 0
}

/** Returns true when <branch> exists on the remote origin (network call with 10s timeout). */
export async function checkBranchExistsOnRemote(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} -c fetch.timeout=10 ls-remote --exit-code --heads origin ${branch}`
    .quiet()
    .nothrow()
  return result.exitCode === 0
}

/** Returns true when branch.<name>.remote git config is set (branch has upstream configured). */
export async function hasUpstreamTracking(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} config ${"branch." + branch + ".remote"}`.quiet().nothrow()
  return result.exitCode === 0
}

/**
 * Ensures the given branch has upstream tracking configured.
 *
 * - If already tracked: returns `{ tracked: false }` immediately (skip path)
 * - If local remote-tracking ref exists: sets tracking, returns `{ tracked: true, source: "local" }`
 * - If local ref missing but branch exists on remote: sets tracking, returns `{ tracked: true, source: "remote" }`
 * - If branch not on remote: returns `{ tracked: false }` (brand-new branch, no upstream)
 * - If network fails: returns `{ tracked: false }` (non-fatal)
 */
export async function ensureUpstreamTracking(
  repoPath: string,
  branch: string
): Promise<{ tracked: boolean; source?: "local" | "remote" }> {
  // Early return: branch already has upstream configured
  if (await hasUpstreamTracking(repoPath, branch)) {
    return { tracked: false }
  }

  // Check local remote-tracking ref first (fast, no network)
  if (await checkRemoteTrackingRef(repoPath, branch)) {
    await $`git -C ${repoPath} branch ${"--set-upstream-to=origin/" + branch} ${branch}`.quiet().nothrow()
    return { tracked: true, source: "local" }
  }

  // Fall back to ls-remote (network call, non-fatal on failure)
  const onRemote = await checkBranchExistsOnRemote(repoPath, branch)
  if (!onRemote) {
    return { tracked: false }
  }

  await $`git -C ${repoPath} branch ${"--set-upstream-to=origin/" + branch} ${branch}`.quiet().nothrow()
  return { tracked: true, source: "remote" }
}

export async function rebaseBranch(
  repoPath: string,
  upstream: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await $`git -C ${repoPath} rebase ${upstream}`.quiet().nothrow()
  if (result.exitCode === 0) return { ok: true }
  // Abort failed rebase
  await $`git -C ${repoPath} rebase --abort`.quiet().nothrow()
  return { ok: false, error: result.stderr.toString().trim() }
}

export async function mergeBranchFF(
  repoPath: string,
  branch: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await $`git -C ${repoPath} merge --no-ff ${branch}`.quiet().nothrow()
  if (result.exitCode === 0) return { ok: true }
  // Abort failed merge
  await $`git -C ${repoPath} merge --abort`.quiet().nothrow()
  return { ok: false, error: result.stderr.toString().trim() }
}

export async function getCommitsBehind(
  repoPath: string,
  base: string,
  head: string
): Promise<number> {
  const result = await $`git -C ${repoPath} rev-list --count ${head}..${base}`.quiet().nothrow()
  if (result.exitCode !== 0) return 0
  return parseInt(result.stdout.toString().trim(), 10) || 0
}
