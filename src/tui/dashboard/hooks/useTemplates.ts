import { createSignal, type Accessor } from "solid-js"
import { listTemplates, type Template } from "../../../lib/config"

export function useTemplates(): { entries: Accessor<Template[]>; reload: () => Promise<void> } {
  const [entries, setEntries] = createSignal<Template[]>([])

  async function reload(): Promise<void> {
    try {
      setEntries(listTemplates())
    } catch {
      setEntries([])
    }
  }

  reload() // initial load

  return { entries, reload }
}
