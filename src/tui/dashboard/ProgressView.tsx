/** @jsxImportSource @opentui/solid */
import "opentui-spinner/solid"
import { createMemo, For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { CenteredDialog } from "./CenteredDialog"
import type { CommandOutputLine, CommandOutputState } from "./command-output"

type Props = {
  title: string
  output: CommandOutputState
}

type VisibleOutput = {
  lines: CommandOutputLine[]
  omittedCount: number
}

function trimLine(text: string, width: number): string {
  if (text.length <= width) return text
  if (width <= 3) return ".".repeat(width)
  return `${text.slice(0, width - 3)}...`
}

export function ProgressView(props: Props) {
  const dims = useTerminalDimensions()
  const dialogHeight = createMemo(() => Math.max(8, Math.min(dims().height - 2, Math.floor(dims().height * 0.85))))
  const outputWidth = createMemo(() => {
    const dialogWidth = Math.max(1, Math.min(dims().width - 4, Math.floor(dims().width * 0.9)))
    return Math.max(1, dialogWidth - 6)
  })
  const visibleOutput = createMemo<VisibleOutput>(() => {
    const hasStatus = props.output.status === "running"
      || props.output.status === "failed"
      || props.output.status === "cancelled"
    const hasFooter = props.output.status === "success"
      || props.output.status === "failed"
      || props.output.status === "cancelled"
    const hasEmpty = props.output.lines.length === 0
    const contentHeight = Math.max(1, dialogHeight() - 2)
    const fixedRows = (hasStatus ? 1 : 0)
      + (hasFooter ? 1 : 0)
      + (hasEmpty ? 1 : 0)
    const rawSlots = Math.max(1, contentHeight - fixedRows)
    const needsMarker = props.output.omittedCount > 0 || props.output.lines.length > rawSlots
    const slots = Math.max(1, rawSlots - (needsMarker ? 1 : 0))
    const hiddenBufferedLines = Math.max(0, props.output.lines.length - slots)
    const lines = props.output.lines
      .slice(hiddenBufferedLines)
      .map((line) => ({ ...line, text: trimLine(line.text, outputWidth()) }))
    return {
      lines,
      omittedCount: props.output.omittedCount + hiddenBufferedLines,
    }
  })

  return (
    <CenteredDialog title={props.title} size="large" height={dialogHeight()}>
      <box flexDirection="column" height={Math.max(1, dialogHeight() - 2)}>
        <Show when={props.output.status === "running"}>
          <box flexDirection="row" height={1}>
            <spinner name="dots" color="cyan" />
            <text fg="white"> Working...</text>
          </box>
        </Show>
        <Show when={props.output.status === "failed"}>
          <text fg="red">  Command failed. Review output before retrying.</text>
        </Show>
        <Show when={props.output.status === "cancelled"}>
          <text fg="yellow">  Command cancelled. Press any key to continue.</text>
        </Show>
        <Show when={visibleOutput().omittedCount > 0}>
          <text fg="gray">  ... {visibleOutput().omittedCount} earlier lines omitted ...</text>
        </Show>
        <Show when={props.output.lines.length === 0}>
          <text fg="gray">  No command output yet</text>
        </Show>
        <For each={visibleOutput().lines}>
          {(line) => <text fg={line.stream === "stderr" ? "red" : line.stream === "system" ? "gray" : "white"}>  {line.text}</text>}
        </For>
        <Show when={props.output.status === "success"}>
          <text fg="green">  Done. Press any key to continue.</text>
        </Show>
        <Show when={props.output.status === "failed"}>
          <text fg="red">  Press any key to continue.</text>
        </Show>
      </box>
    </CenteredDialog>
  )
}
