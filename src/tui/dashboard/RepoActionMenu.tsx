/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"

type Props = {
  repoName: string
  selectionCount: number
  onAction: (action: "create-workspace" | "create-template" | "remove") => void
  onCancel: () => void
}

export function RepoActionMenu(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "w") { props.onAction("create-workspace"); return }
    if (key.name === "t") { props.onAction("create-template"); return }
    if (key.name === "r") { props.onAction("remove"); return }
  })

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

  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <text fg="white">  {wsLabel()}</text>
      <text fg="white">  {tplLabel()}</text>
      <text fg="white">  {removeLabel()}</text>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </box>
  )
}
