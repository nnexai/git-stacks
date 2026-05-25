/** @jsxImportSource @opentui/solid */
import "opentui-spinner/solid"
import { For, Show } from "solid-js"
import { CenteredDialog } from "./CenteredDialog"
import type { CommandOutputState } from "./command-output"

type Props = {
  title: string
  output: CommandOutputState
}

export function ProgressView(props: Props) {
  return (
    <CenteredDialog title={props.title} size="medium">
      <box flexDirection="column">
        <Show when={props.output.status === "running"}>
          <box flexDirection="row" height={1}>
            <spinner name="dots" color="cyan" />
            <text fg="white"> Working...</text>
          </box>
        </Show>
        <Show when={props.output.status === "failed"}>
          <text fg="red">  Command failed. Review stderr lines, then close and retry from the action menu.</text>
        </Show>
        <Show when={props.output.status === "cancelled"}>
          <text fg="yellow">  Command cancelled. Press any key to continue.</text>
        </Show>
        <Show when={props.output.omittedCount > 0}>
          <text fg="gray">  ... {props.output.omittedCount} earlier lines omitted ...</text>
        </Show>
        <Show when={props.output.lines.length === 0}>
          <text fg="gray">  No command output yet</text>
        </Show>
        <For each={props.output.lines}>
          {(line) => <text fg={line.stream === "stderr" ? "red" : line.stream === "system" ? "gray" : "white"}>  {line.text}</text>}
        </For>
        <Show when={props.output.status === "success"}>
          <text fg="green">{"\n"}  Done. Press any key to continue.</text>
        </Show>
        <Show when={props.output.status === "failed"}>
          <text fg="red">{"\n"}  Press any key to continue.</text>
        </Show>
      </box>
    </CenteredDialog>
  )
}
