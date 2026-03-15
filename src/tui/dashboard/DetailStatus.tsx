import { For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { WorkspaceEntry } from "./types"

type Props = {
  entry: WorkspaceEntry
  onBack: () => void
}

export function DetailStatus(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      props.onBack()
    }
  })

  const ws = () => props.entry.workspace

  return (
    <box border title={`Status: ${ws().name}`} flexDirection="column" width="80%">
      <text fg="white">  Branch: {ws().branch}</text>
      <text fg="gray">  Created: {ws().created}</text>
      <text fg="white">{"\n"}  Repos:</text>
      <Show
        when={props.entry.status.state === "loaded"}
        fallback={<text fg="gray">  Loading...</text>}
      >
        <For each={(props.entry.status as any).repos}>
          {(repo: any) => {
            const icon = !repo.exists ? "✗" : repo.dirty ? "~" : "✓"
            const fg = !repo.exists ? "red" : repo.dirty ? "yellow" : "green"
            const modeLabel = repo.mode === "worktree" ? `[${repo.branch}]` : "[trunk]"
            return (
              <text fg={fg}>    {icon}  {repo.name.padEnd(28)} {modeLabel}</text>
            )
          }}
        </For>
      </Show>
      <text fg="gray">{"\n"}  [Esc/q] Back</text>
    </box>
  )
}
