import { createSignal, type Accessor } from "solid-js"
import { listTemplates, type Template } from "../../../lib/config"

export function useTemplates(): { entries: Accessor<Template[]>; reload: () => void } {
  const [entries, setEntries] = createSignal<Template[]>([])

  function reload() {
    try {
      setEntries(listTemplates())
    } catch {
      setEntries([])
    }
  }

  reload() // synchronous initial load

  return { entries, reload }
}
