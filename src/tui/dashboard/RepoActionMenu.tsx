/** @jsxImportSource @opentui/solid */
import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  repoName: string
  selectionCount: number
  onAction: (action: "create-workspace" | "create-template" | "remove") => void
  onCancel: () => void
}

export function RepoActionMenu(props: Props) {
  const wsLabel = () =>
    props.selectionCount > 0
      ? `[w] Create workspace (${props.selectionCount} repos)`
      : "[w] Create workspace"

  const tplLabel = () =>
    props.selectionCount > 0
      ? `[t] Create template (${props.selectionCount} repos)`
      : "[t] Create template"

  const removeLabel = () =>
    props.selectionCount > 0
      ? `[r] Remove (${props.selectionCount})`
      : "[r] Remove"

  const items = [
    { key: "w", action: "create-workspace" as const, getLabel: () => wsLabel() },
    { key: "t", action: "create-template" as const, getLabel: () => tplLabel() },
    { key: "r", action: "remove" as const, getLabel: () => removeLabel() },
  ]

  const [cursor, setCursor] = createSignal(0)

  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down") { setCursor(c => Math.min(c + 1, items.length - 1)); return }
    if (key.name === "up") { setCursor(c => Math.max(c - 1, 0)); return }
    if (key.name === "return") { props.onAction(items[cursor()].action); return }
    if (key.name === "w") { props.onAction("create-workspace"); return }
    if (key.name === "t") { props.onAction("create-template"); return }
    if (key.name === "r") { props.onAction("remove"); return }
  })

  return (
    <CenteredDialog title={props.repoName} size="small">
      <For each={items}>
        {(item, i) => (
          <text fg={i() === cursor() ? "cyan" : "white"}>
            {i() === cursor() ? "> " : "  "}[{item.key}] {item.getLabel()}
          </text>
        )}
      </For>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </CenteredDialog>
  )
}
