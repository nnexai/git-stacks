/** @jsxImportSource @opentui/solid */

import { For, Show, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ArchivedWorkspaceSummary } from "@git-stacks/protocol"

import { CenteredDialog } from "./CenteredDialog"
import type { WorkspaceLifecycleTarget } from "./types"

type Props = {
  rows: ArchivedWorkspaceSummary[]
  onUnarchive: (row: ArchivedWorkspaceSummary) => void
  onCancel: () => void
}

export function ArchivedWorkspacesDialog(props: Props) {
  const [cursor, setCursor] = createSignal(0)

  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down" || key.name === "j") {
      setCursor(current => Math.min(current + 1, Math.max(0, props.rows.length - 1)))
      return
    }
    if (key.name === "up" || key.name === "k") {
      setCursor(current => Math.max(0, current - 1))
      return
    }
    if (key.name === "return" || key.name === "u") {
      const row = props.rows[cursor()]
      if (row) props.onUnarchive(row)
    }
  })

  return (
    <CenteredDialog title="Archived Workspaces" size="medium">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <Show
          when={props.rows.length > 0}
          fallback={<text fg="gray">  No archived workspaces.</text>}
        >
          <For each={props.rows}>
            {(row, index) => (
              <text fg={index() === cursor() ? "cyan" : "white"}>
                {index() === cursor() ? "> " : "  "}{row.name}  {row.activity_at}  [u] Unarchive
              </text>
            )}
          </For>
        </Show>
        <text fg="gray">{"\n"}  [Enter/u] Unarchive  [Esc] Close</text>
      </box>
    </CenteredDialog>
  )
}

export function ArchivedWorkspaceUndoDialog(props: {
  target: WorkspaceLifecycleTarget
  onUndo: () => void
  onClose: () => void
}) {
  useKeyboard((key) => {
    if (key.name === "u") { props.onUndo(); return }
    if (key.name === "escape" || key.name === "return") props.onClose()
  })

  return (
    <CenteredDialog title={`Archived ${props.target.name}`} size="small">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="green">  {props.target.name} was archived and its terminals were stopped.</text>
        <text fg="cyan">{"\n"}  [u] Undo  [Enter/Esc] Close</text>
      </box>
    </CenteredDialog>
  )
}
