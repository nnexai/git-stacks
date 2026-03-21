/** @jsxImportSource @opentui/solid */
import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Action } from "./types"
import { CenteredDialog } from "./CenteredDialog"

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
  { key: "s", action: "sync", label: "Sync" },
]

export function ActionMenu(props: Props) {
  const fullActions = props.onRun
    ? [...actions, { key: "u", action: "run" as const, label: "Run" }]
    : [...actions]

  const [cursor, setCursor] = createSignal(0)

  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down") { setCursor(c => Math.min(c + 1, fullActions.length - 1)); return }
    if (key.name === "up") { setCursor(c => Math.max(c - 1, 0)); return }
    if (key.name === "return") {
      const item = fullActions[cursor()]
      if (item.action === "run" && props.onRun) { props.onRun(); return }
      props.onAction(item.action as Action)
      return
    }
    // Letter-key shortcuts (backward compatible)
    if (key.name === "u" && props.onRun) { props.onRun(); return }
    const match = actions.find((a) => a.key === key.name)
    if (match) props.onAction(match.action)
  })

  return (
    <CenteredDialog title={props.workspaceName} size="small">
      <For each={fullActions}>
        {(item, i) => (
          <text fg={i() === cursor() ? "cyan" : "white"}>
            {i() === cursor() ? "> " : "  "}[{item.key}] {item.label}
          </text>
        )}
      </For>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </CenteredDialog>
  )
}
