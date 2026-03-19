/** @jsxImportSource @opentui/solid */
import { For } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Action } from "./types"

type Props = {
  workspaceName: string
  onAction: (action: Action) => void
  onCancel: () => void
  onRun?: () => void
}

const actions: { key: string; action: Action; label: string }[] = [
  { key: "o", action: "open", label: "Open" },
  { key: "n", action: "rename", label: "Rename" },
  { key: "e", action: "edit", label: "Edit ($EDITOR)" },
  { key: "c", action: "clean", label: "Clean" },
  { key: "r", action: "remove", label: "Remove" },
  { key: "m", action: "merge", label: "Merge" },
]

export function ActionMenu(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") {
      props.onCancel()
      return
    }
    if (key.name === "u" && props.onRun) {
      props.onRun()
      return
    }
    const match = actions.find((a) => a.key === key.name)
    if (match) props.onAction(match.action)
  })

  return (
    <box border title={`Actions: ${props.workspaceName}`} flexDirection="column" width="50%">
      <For each={actions}>
        {(item) => (
          <text fg="white">  [{item.key}] {item.label}</text>
        )}
      </For>
      <text fg="white">  [u] Run</text>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </box>
  )
}
