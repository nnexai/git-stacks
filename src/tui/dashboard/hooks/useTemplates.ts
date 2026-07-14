import { createMemo, type Accessor } from "solid-js"
import type { Template } from "../../../lib/config"
import { useCoreState } from "../core-store"

export function useTemplates(): { entries: Accessor<Template[]>; reload: () => Promise<void> } {
  const core = useCoreState()
  return { entries: createMemo(() => core.state()?.templates ?? []), reload: core.reload }
}
