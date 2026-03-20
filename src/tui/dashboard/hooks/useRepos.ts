import { createSignal, type Accessor } from "solid-js"
import { existsSync } from "fs"
import { listRegistryEntries, type RepoRegistryEntry } from "../../../lib/config"

export type RepoEntry = RepoRegistryEntry & { diskExists: boolean }

export function useRepos(): { entries: Accessor<RepoEntry[]>; reload: () => void } {
  const [entries, setEntries] = createSignal<RepoEntry[]>([])

  function reload() {
    try {
      const raw = listRegistryEntries()
      setEntries(raw.map(e => ({ ...e, diskExists: existsSync(e.local_path) })))
    } catch {
      setEntries([])
    }
  }

  reload() // synchronous initial load

  return { entries, reload }
}
