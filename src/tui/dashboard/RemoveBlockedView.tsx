/** @jsxImportSource @opentui/solid */
import { For } from "solid-js"
import { useKeyboard } from "@opentui/solid"

type Props = {
  repoName: string
  refTemplates: { name: string }[]
  refWorkspaces: { name: string }[]
  onBack: () => void
}

export function RemoveBlockedView(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") props.onBack()
  })

  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <text fg="yellow">  Cannot remove "{props.repoName}" — referenced by:</text>
      <For each={props.refTemplates}>
        {(t) => <text fg="gray">    template: {t.name}</text>}
      </For>
      <For each={props.refWorkspaces}>
        {(ws) => <text fg="gray">    workspace: {ws.name}</text>}
      </For>
      <text fg="gray">{"\n"}  Remove these references first, then retry.</text>
      <text fg="gray">  [Esc] Back</text>
    </box>
  )
}
