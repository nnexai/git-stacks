/** @jsxImportSource @opentui/solid */
import "opentui-spinner/solid"
import { For, Show } from "solid-js"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  title: string
  lines: string[]
  done: boolean
}

export function ProgressView(props: Props) {
  return (
    <CenteredDialog title={props.title} size="medium">
      <box flexDirection="column">
        <Show when={!props.done}>
          <box flexDirection="row" height={1}>
            <spinner name="dots" color="cyan" />
            <text fg="white"> Working...</text>
          </box>
        </Show>
        <For each={props.lines}>
          {(line) => <text fg="gray">  {line}</text>}
        </For>
        <Show when={props.done}>
          <text fg="green">{"\n"}  Done. Press any key to continue.</text>
        </Show>
      </box>
    </CenteredDialog>
  )
}
