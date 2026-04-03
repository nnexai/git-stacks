/** @jsxImportSource @opentui/solid */
import "opentui-spinner/solid"
import { For, Show } from "solid-js"
import { CenteredDialog } from "./CenteredDialog"

export type PushRowDisplay = {
  repo: string
  status: "pending" | "pushing" | "pushed" | "skipped" | "failed"
  detail: string
}

function glyphFor(status: PushRowDisplay["status"]): string {
  if (status === "pending") return "·"
  if (status === "pushed") return "✓"
  if (status === "skipped") return "⚠"
  if (status === "failed") return "✗"
  return ""
}

function colorFor(status: PushRowDisplay["status"]): string {
  if (status === "pending") return "gray"
  if (status === "pushed") return "green"
  if (status === "skipped") return "yellow"
  if (status === "failed") return "red"
  return "cyan"
}

type Props = {
  rows: PushRowDisplay[]
  done: boolean
  summary: { text: string; color: "green" | "yellow" | "red" }
  title?: string
}

export function PushProgressView(props: Props) {
  return (
    <CenteredDialog title={props.title ?? "Push Progress"} size="medium">
      <box flexDirection="column">
      <Show when={!props.done}>
        <box flexDirection="row" height={1}>
          <spinner name="dots" color="cyan" />
          <text fg="white"> Pushing...</text>
        </box>
      </Show>
      <For each={props.rows}>
        {(row) => (
          <box flexDirection="row" height={1} paddingLeft={2}>
            <Show
              when={row.status === "pushing"}
              fallback={
                <text fg={colorFor(row.status)}>{glyphFor(row.status)} </text>
              }
            >
              <spinner name="dots" color="cyan" />
              <text fg="white"> </text>
            </Show>
            <text fg="white">{row.repo}</text>
            <text fg="gray">  {row.detail}</text>
          </box>
        )}
      </For>
      <Show when={props.done && !!props.summary.text}>
        <text fg={props.summary.color}>{"\n"}  {props.summary.text}</text>
      </Show>
      </box>
    </CenteredDialog>
  )
}
