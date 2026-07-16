import type { RepoRegistryEntry } from "@git-stacks/core/config"
import { cleanupReviewedWorkspaceSourceRefs } from "@git-stacks/core/workspace-source"

type RecoveryRepository = Pick<RepoRegistryEntry, "name" | "local_path" | "is_dir">

export interface ReviewedSourceRecoveryInput {
  repositories: readonly RecoveryRepository[]
  cleanupRepository?: (repoPath: string) => Promise<number>
}

export async function recoverReviewedSourceRefs(input: ReviewedSourceRecoveryInput): Promise<{
  repositories: number
  refs: number
}> {
  const paths = [...new Set(input.repositories
    .filter((repository) => repository.is_dir !== true)
    .map((repository) => repository.local_path))]
  const cleanup = input.cleanupRepository ?? cleanupReviewedWorkspaceSourceRefs
  let refs = 0
  try {
    for (const path of paths) refs += await cleanup(path)
  } catch {
    throw Object.assign(new Error("Reviewed source recovery failed"), { code: "operation_failed" })
  }
  return { repositories: paths.length, refs }
}

export async function initializeOperationRecovery(input: {
  initializeOperations: () => Promise<unknown>
  recoverReviewedSources: () => Promise<unknown>
}): Promise<void> {
  await input.initializeOperations()
  await input.recoverReviewedSources()
}
