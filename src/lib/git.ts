import { $ } from "bun"
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "fs"
import { isAbsolute, join, resolve } from "path"

export function isGitTrackedPathSync(repoPath: string, relPath: string): boolean {
  const result = Bun.spawnSync([
    "git",
    "-C",
    repoPath,
    "ls-files",
    "--error-unmatch",
    "--",
    relPath,
  ], {
    stdout: "pipe",
    stderr: "pipe",
  })
  return result.exitCode === 0
}

export async function isGitTrackedPath(repoPath: string, relPath: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} ls-files --error-unmatch -- ${relPath}`.quiet().nothrow()
  return result.exitCode === 0
}

export function resolveCommonGitDirSync(repoPath: string): string {
  const result = Bun.spawnSync([
    "git",
    "-C",
    repoPath,
    "rev-parse",
    "--git-common-dir",
  ], {
    stdout: "pipe",
    stderr: "pipe",
  })

  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr).trim()
    throw new Error(stderr || "git rev-parse --git-common-dir failed")
  }

  const raw = new TextDecoder().decode(result.stdout).trim()
  if (!raw) throw new Error("git rev-parse --git-common-dir returned an empty path")
  const commonGitDir = isAbsolute(raw) ? raw : resolve(repoPath, raw)
  return realpathSync(commonGitDir)
}

export function writeLocalGitExcludesSync(repoPath: string, entries: string[]): string {
  const commonGitDir = resolveCommonGitDirSync(repoPath)
  const infoDir = join(commonGitDir, "info")
  const excludePath = join(infoDir, "exclude")
  mkdirSync(infoDir, { recursive: true })

  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : ""
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : []
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  const seen = new Set(lines)
  for (const entry of entries) {
    if (!seen.has(entry)) {
      lines.push(entry)
      seen.add(entry)
    }
  }

  writeFileSync(excludePath, `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`)
  return excludePath
}

export async function checkBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} rev-parse --verify ${branch}`.quiet().nothrow()
  return result.exitCode === 0
}

export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  // If directory exists and is already a git worktree, skip
  if (existsSync(worktreePath) && existsSync(join(worktreePath, ".git"))) {
    return
  }

  // Prune stale worktree entries that point to missing directories
  await $`git -C ${repoPath} worktree prune`.quiet().nothrow()

  const branchExists = await checkBranchExists(repoPath, branch)
  const remoteRef = "origin/" + branch
  let result: Awaited<ReturnType<typeof $>>

  if (branchExists) {
    result = await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`.quiet().nothrow()
  } else {
    let hasRemoteRef = await checkRemoteTrackingRef(repoPath, branch)
    if (!hasRemoteRef && await checkBranchExistsOnRemote(repoPath, branch)) {
      const fetchRefspec = `refs/heads/${branch}:refs/remotes/origin/${branch}`
      const fetchResult = await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} -c fetch.timeout=30 fetch origin ${fetchRefspec}`
        .quiet()
        .nothrow()
      hasRemoteRef = fetchResult.exitCode === 0 && await checkRemoteTrackingRef(repoPath, branch)
    }

    result = hasRemoteRef
      ? await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath} ${remoteRef}`.quiet().nothrow()
      : await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`.quiet().nothrow()
  }

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    if (stderr.includes("already exists")) {
      // Directory exists but isn't a git worktree — don't clobber it
      throw new Error(
        `Cannot create worktree: '${worktreePath}' already exists but is not a git worktree. ` +
        `Remove the directory manually or check for path conflicts.`
      )
    }
    throw new Error(`Failed to create worktree at '${worktreePath}': ${stderr}`)
  }

  await ensureUpstreamTracking(worktreePath, branch)
}

export async function createWorktreeFromRef(
  repoPath: string,
  worktreePath: string,
  branch: string,
  startRef: string,
): Promise<void> {
  if (existsSync(worktreePath) && existsSync(join(worktreePath, ".git"))) {
    return
  }
  await $`git -C ${repoPath} worktree prune`.quiet().nothrow()
  const result = await $`git -C ${repoPath} worktree add -B ${branch} ${worktreePath} ${startRef}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`Failed to create worktree at '${worktreePath}' from '${startRef}': ${stderr}`)
  }
  await ensureUpstreamTracking(worktreePath, branch)
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

export type RemoteBranchStatus =
  | { status: "present" }
  | { status: "missing" }
  | { status: "error"; error: string }

export async function isBranchGoneOnRemote(
  mainPath: string,
  branch: string
): Promise<RemoteBranchStatus> {
  const result = await $`GIT_TERMINAL_PROMPT=0 git -C ${mainPath} ls-remote --exit-code --heads origin ${branch}`
    .quiet()
    .nothrow()
  if (result.exitCode === 0) return { status: "present" }
  if (result.exitCode === 2) return { status: "missing" }

  const stderr = result.stderr.toString().trim()
  return {
    status: "error",
    error: stderr || `git ls-remote failed with exit code ${result.exitCode}`,
  }
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
  await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} -c fetch.timeout=30 fetch origin`.quiet()
}

export async function fetchSourceRef(
  repoPath: string,
  remote: string,
  sourceRef: string,
  fetchedRef: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const refspec = `${sourceRef}:${fetchedRef}`
  const result = await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} -c fetch.timeout=30 fetch ${remote} ${refspec}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    return { ok: false, error: result.stderr.toString().trim() || "fetch failed" }
  }
  return { ok: true }
}

export async function deleteRef(repoPath: string, ref: string): Promise<void> {
  await $`git -C ${repoPath} update-ref -d ${ref}`.quiet().nothrow()
}

export async function resolveRef(repoPath: string, ref: string): Promise<{ ok: true; sha: string } | { ok: false; error: string }> {
  const result = await $`git -C ${repoPath} rev-parse --verify ${ref}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    return { ok: false, error: result.stderr.toString().trim() || "ref not found" }
  }
  return { ok: true, sha: result.stdout.toString().trim() }
}

/**
 * Pull with --ff-only. Returns ok:true with commit count on success,
 * ok:false with reason on failure (diverged, no upstream, etc.).
 */
export async function pullFFOnly(
  repoPath: string,
  branch: string
): Promise<{ ok: true; commits: number } | { ok: false; reason: string }> {
  // Count commits before pull to report how many were pulled
  const beforeResult = await $`git -C ${repoPath} rev-parse HEAD`.quiet().nothrow()
  if (beforeResult.exitCode !== 0) {
    return { ok: false, reason: "could not resolve HEAD" }
  }
  const beforeSha = beforeResult.stdout.toString().trim()

  const result = await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} pull --ff-only origin ${branch}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString()
    if (stderr.includes("divergent") || stderr.includes("Not possible to fast-forward")) {
      return { ok: false, reason: `diverged: ${branch}` }
    }
    if (stderr.includes("couldn't find remote ref")) {
      return { ok: false, reason: `no remote branch: ${branch}` }
    }
    return { ok: false, reason: stderr.split("\n")[0] || "pull failed" }
  }

  // Count commits pulled
  const afterResult = await $`git -C ${repoPath} rev-parse HEAD`.quiet().nothrow()
  const afterSha = afterResult.exitCode === 0 ? afterResult.stdout.toString().trim() : beforeSha
  if (beforeSha === afterSha) {
    return { ok: true, commits: 0 }
  }
  const countResult = await $`git -C ${repoPath} rev-list --count ${beforeSha}..${afterSha}`.quiet().nothrow()
  const commits = countResult.exitCode === 0 ? parseInt(countResult.stdout.toString().trim(), 10) || 0 : 0
  return { ok: true, commits }
}

export async function pushBranch(
  repoPath: string,
  branch: string,
  opts: { force?: boolean; forceWithLease?: boolean; setUpstream?: boolean } = {}
): Promise<{ ok: true; commits: number } | { ok: false; reason: string }> {
  const countResult = await $`git -C ${repoPath} rev-list --count ${"origin/" + branch + "..HEAD"}`.quiet().nothrow()
  const commitsBefore = countResult.exitCode === 0 ? parseInt(countResult.stdout.toString().trim(), 10) || 0 : 0

  let result: Awaited<ReturnType<typeof $>>
  if (opts.forceWithLease) {
    result = opts.setUpstream
      ? await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} push -u --force-with-lease origin ${branch}`.quiet().nothrow()
      : await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} push --force-with-lease origin ${branch}`.quiet().nothrow()
  } else if (opts.force) {
    result = opts.setUpstream
      ? await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} push -u --force origin ${branch}`.quiet().nothrow()
      : await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} push --force origin ${branch}`.quiet().nothrow()
  } else {
    result = opts.setUpstream
      ? await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} push -u origin ${branch}`.quiet().nothrow()
      : await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} push origin ${branch}`.quiet().nothrow()
  }

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString()
    if (
      stderr.includes("non-fast-forward")
      || stderr.includes("[rejected]")
      || stderr.includes("fetch first")
      || stderr.includes("Updates were rejected")
    ) {
      return { ok: false, reason: "non-fast-forward (use --force-with-lease)" }
    }
    if (stderr.includes("has no upstream branch")) {
      return { ok: false, reason: "no upstream branch (use --set-upstream)" }
    }
    if (stderr.includes("does not match any") || stderr.includes("couldn't find remote ref")) {
      return { ok: false, reason: `no remote branch: ${branch}` }
    }
    if (stderr.includes("Authentication failed") || stderr.includes("could not read Username")) {
      return { ok: false, reason: "authentication failed" }
    }
    if (
      stderr.includes("Could not resolve host")
      || stderr.includes("unable to access")
      || stderr.includes("does not appear to be a git repository")
    ) {
      return { ok: false, reason: "network error" }
    }
    const lastLine = stderr
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .pop()
    return { ok: false, reason: lastLine || "push failed" }
  }

  return { ok: true, commits: commitsBefore }
}

// --- Upstream tracking ---

/** Returns true when origin/<branch> remote-tracking ref exists in local refs (e.g. after a fetch). */
export async function checkRemoteTrackingRef(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} rev-parse --verify ${"origin/" + branch}`.quiet().nothrow()
  return result.exitCode === 0
}

/** Returns true when <branch> exists on the remote origin (network call with 10s timeout). */
export async function checkBranchExistsOnRemote(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`GIT_TERMINAL_PROMPT=0 git -C ${repoPath} -c fetch.timeout=10 ls-remote --exit-code --heads origin ${branch}`
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

export async function getCommitsAhead(
  repoPath: string,
  base: string,
  head: string
): Promise<number> {
  const result = await $`git -C ${repoPath} rev-list --count ${base}..${head}`.quiet().nothrow()
  if (result.exitCode !== 0) return 0
  return parseInt(result.stdout.toString().trim(), 10) || 0
}

export async function stashPush(
  repoPath: string,
  message: string
): Promise<{ ok: true; stashRef: string } | { ok: false; error: string }> {
  const result = await $`git -C ${repoPath} stash push --include-untracked -m ${message}`.quiet().nothrow()
  const stdout = result.stdout.toString().trim()
  const stderr = result.stderr.toString().trim()
  const output = [stdout, stderr].filter(Boolean).join("\n")

  if (result.exitCode !== 0) {
    return { ok: false, error: output || "stash push failed" }
  }
  if (output.includes("No local changes to save")) {
    return { ok: false, error: "nothing to stash" }
  }

  return { ok: true, stashRef: "stash@{0}" }
}

export async function stashPop(
  repoPath: string
): Promise<{ ok: true } | { ok: false; conflict: boolean; error: string }> {
  const result = await $`git -C ${repoPath} stash pop`.quiet().nothrow()
  if (result.exitCode === 0) return { ok: true }

  const stdout = result.stdout.toString().trim()
  const stderr = result.stderr.toString().trim()
  const output = [stdout, stderr].filter(Boolean).join("\n")
  const conflict = output.includes("CONFLICT")

  return { ok: false, conflict, error: output || "stash pop failed" }
}

export async function hasAutoStash(repoPath: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} stash list`.quiet().nothrow()
  if (result.exitCode !== 0) return false
  return result.stdout.toString().includes("git-stacks auto-stash")
}

const DEFAULT_STALE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Check if origin refs are stale by examining FETCH_HEAD mtime.
 * Uses `git rev-parse --git-common-dir` to resolve the correct .git directory
 * (works for both regular repos and worktrees where .git is a file).
 * Returns true if FETCH_HEAD is missing or older than thresholdMs.
 */
export async function isFetchStale(
  repoPath: string,
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS
): Promise<boolean> {
  const result = await $`git -C ${repoPath} rev-parse --git-common-dir`.quiet().nothrow()
  if (result.exitCode !== 0) return true

  const gitCommonDir = result.stdout.toString().trim()
  // --git-common-dir returns a relative path when inside the repo; resolve against repoPath
  const resolvedGitDir = gitCommonDir.startsWith("/")
    ? gitCommonDir
    : join(repoPath, gitCommonDir)
  const fetchHeadPath = join(resolvedGitDir, "FETCH_HEAD")

  if (!existsSync(fetchHeadPath)) return true

  try {
    const stat = statSync(fetchHeadPath)
    const ageMs = Date.now() - stat.mtimeMs
    return ageMs > thresholdMs
  } catch {
    return true
  }
}
