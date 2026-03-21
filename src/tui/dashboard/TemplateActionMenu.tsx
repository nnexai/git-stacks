/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"

type Props = {
  templateName: string
  onAction: (action: "edit" | "clone" | "remove" | "create-workspace") => void
  onCancel: () => void
}

export function TemplateActionMenu(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "w") { props.onAction("create-workspace"); return }
    if (key.name === "e") { props.onAction("edit"); return }
    if (key.name === "c") { props.onAction("clone"); return }
    if (key.name === "r") { props.onAction("remove"); return }
  })

  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <text fg="white">  [w] Create workspace</text>
      <text fg="white">  [e] Edit ($EDITOR)</text>
      <text fg="white">  [c] Clone</text>
      <text fg="white">  [r] Remove</text>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </box>
  )
}
