import { createMemo, type Accessor } from "solid-js"
import type { CoreRepository } from "../../../lib/service/core-contract"
import { useCoreState } from "../core-store"

export type RepoEntry = Omit<CoreRepository, "disk_exists"> & { diskExists: boolean }

export function useRepos(): { entries: Accessor<RepoEntry[]>; reload: () => Promise<void> } {
  const core = useCoreState()
  return {
    entries: createMemo(() => (core.state()?.repositories ?? []).map(({ disk_exists, ...repository }) => ({ ...repository, diskExists: disk_exists }))),
    reload: core.reload,
  }
}
