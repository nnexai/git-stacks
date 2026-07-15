/** @jsxImportSource @opentui/solid */

import { For, Show } from "solid-js"
import { CenteredDialog } from "./CenteredDialog"
import { Spinner } from "./Spinner"

export type CreateRow = {
  repo: string
  status: "pending" | "creating-worktree" | "running-hooks" | "done" | "failed" | "skipped"
  detail: string
}

function glyphFor(status: CreateRow["status"]): string {
  if (status === "pending") return "·"
  if (status === "done") return "✓"
  if (status === "skipped") return "⚠"
  if (status === "failed") return "✗"
  return "" // creating-worktree/running-hooks use spinner
}

function colorFor(status: CreateRow["status"]): string {
  if (status === "pending") return "gray"
  if (status === "done") return "green"
  if (status === "skipped") return "yellow"
  if (status === "failed") return "red"
  return "cyan" // creating-worktree/running-hooks
}

type Props = {
  rows: CreateRow[]
  done: boolean
  summary: { text: string; color: "green" | "yellow" | "red" }
  title?: string
}

export function CreateProgressView(props: Props) {
  return (
    <CenteredDialog title={props.title ?? "Creating..."} size="medium">
      <box flexDirection="column">
        <Show when={!props.done}>
          <box flexDirection="row" height={1}>
            <Spinner />
            <text fg="white"> Creating...</text>
          </box>
        </Show>
        <For each={props.rows}>
          {(row) => (
            <box flexDirection="row" height={1} paddingLeft={2}>
              <Show
                when={row.status === "creating-worktree" || row.status === "running-hooks"}
                fallback={
                  <text fg={colorFor(row.status)}>{glyphFor(row.status)} </text>
                }
              >
                <Spinner />
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
