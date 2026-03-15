import { $ } from "bun"

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
    await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`
  } else {
    // Branch from current HEAD of the main clone, not a fixed base branch
    await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`
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
): Promise<void> {
  await $`git -C ${repoPath} checkout ${baseBranch}`
  await $`git -C ${repoPath} merge --no-ff ${branch}`
}

export async function deleteLocalBranch(repoPath: string, branch: string): Promise<void> {
  await $`git -C ${repoPath} branch -d ${branch}`.quiet().nothrow()
}

export async function fetchOrigin(repoPath: string): Promise<void> {
  await $`git -C ${repoPath} fetch origin`.quiet()
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
