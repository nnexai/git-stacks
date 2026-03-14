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
