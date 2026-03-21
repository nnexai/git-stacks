/** @jsxImportSource @opentui/solid */
import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  templateName: string
  onAction: (action: "edit" | "clone" | "remove" | "create-workspace") => void
  onCancel: () => void
}

export function TemplateActionMenu(props: Props) {
  const items = [
    { key: "w", action: "create-workspace" as const, label: "Create workspace" },
    { key: "e", action: "edit" as const, label: "Edit ($EDITOR)" },
    { key: "c", action: "clone" as const, label: "Clone" },
    { key: "r", action: "remove" as const, label: "Remove" },
  ]

  const [cursor, setCursor] = createSignal(0)

  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down") { setCursor(c => Math.min(c + 1, items.length - 1)); return }
    if (key.name === "up") { setCursor(c => Math.max(c - 1, 0)); return }
    if (key.name === "return") { props.onAction(items[cursor()].action); return }
    if (key.name === "w") { props.onAction("create-workspace"); return }
    if (key.name === "e") { props.onAction("edit"); return }
    if (key.name === "c") { props.onAction("clone"); return }
    if (key.name === "r") { props.onAction("remove"); return }
  })

  return (
    <CenteredDialog title={props.templateName} size="small">
      <For each={items}>
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
