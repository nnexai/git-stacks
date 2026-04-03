/** @jsxImportSource @opentui/solid */
import "opentui-spinner/solid"
import { For, Show } from "solid-js"
import { CenteredDialog } from "./CenteredDialog"

export type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed" | "stashing" | "popping"
  detail: string
  conflicts: string[]
}

function glyphFor(status: SyncRow["status"]): string {
  if (status === "pending") return "·"
  if (status === "synced") return "✓"
  if (status === "skipped") return "⚠"
  if (status === "failed") return "✗"
  return "" // fetching/rebasing/stashing/popping use spinner
}

function colorFor(status: SyncRow["status"]): string {
  if (status === "pending") return "gray"
  if (status === "synced") return "green"
  if (status === "skipped") return "yellow"
  if (status === "failed") return "red"
  return "cyan" // fetching/rebasing/stashing/popping
}

type Props = {
  rows: SyncRow[]
  done: boolean
  summary: { text: string; color: "green" | "yellow" | "red" }
  title?: string
}

export function SyncProgressView(props: Props) {
  return (
    <CenteredDialog title={props.title ?? "Sync Progress"} size="medium">
      <box flexDirection="column">
      <Show when={!props.done}>
        <box flexDirection="row" height={1}>
          <spinner name="dots" color="cyan" />
          <text fg="white"> Syncing...</text>
        </box>
      </Show>
      <For each={props.rows}>
        {(row) => (
          <>
            <box flexDirection="row" height={1} paddingLeft={2}>
              <Show
                when={row.status === "fetching" || row.status === "rebasing" || row.status === "stashing" || row.status === "popping"}
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
            <For each={row.conflicts}>
              {(file) => <text fg="gray">{"     "}{file}</text>}
            </For>
          </>
        )}
      </For>
      <Show when={props.done && !!props.summary.text}>
        <text fg={props.summary.color}>{"\n"}  {props.summary.text}</text>
      </Show>
      </box>
    </CenteredDialog>
  )
}
