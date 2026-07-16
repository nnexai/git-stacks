/** @jsxImportSource @opentui/solid */

import { For } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { WebFileEntry, WebFileStatusResponse } from "@git-stacks/protocol"

import { CenteredDialog } from "./CenteredDialog"

type Props = {
  workspaceName: string
  response?: WebFileStatusResponse
  loading?: boolean
  error?: string
  onRetry: () => unknown | Promise<unknown>
  onBack: () => void
}

function marker(entry: WebFileEntry): { glyph: string; color: "green" | "yellow" | "red" } {
  return entry.severity === "ok"
    ? { glyph: "✓", color: "green" }
    : entry.severity === "warning"
      ? { glyph: "!", color: "yellow" }
      : { glyph: "×", color: "red" }
}

export function WorkspaceFileStatusDialog(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") { props.onBack(); return }
    if (key.name === "r" && props.error) void props.onRetry()
  })

  return (
    <CenteredDialog title={`Workspace file status — ${props.workspaceName}`} size="large" height={22}>
      {props.loading ? <text fg="gray">  Loading workspace file status…</text> : null}
      {props.error ? <text fg="red">  Workspace file status could not be loaded. Retry without changing workspace files.{"\n"}  [r] Retry</text> : null}
      {props.response ? (
        <>
          <text fg="gray">  {props.response.summary.total} entries, {props.response.summary.attention} need attention</text>
          <scrollbox flexGrow={1} scrollY scrollX={false} viewportCulling>
            <For each={props.response.groups}>
              {(group) => (
                <box flexDirection="column">
                  <text fg="cyan">  {group.name} — {group.summary.total} entries, {group.summary.attention} attention</text>
                  {group.entries.length === 0 ? <text fg="gray">    No configured file entries.</text> : null}
                  <For each={group.entries}>
                    {(entry) => {
                      const icon = marker(entry)
                      const counts = entry.counts
                        ? ` (${entry.counts.equal} equal, ${entry.counts.source_only} source-only, ${entry.counts.target_only} target-only, ${entry.counts.differing} differing, ${entry.counts.errors} errors)`
                        : ""
                      return <text fg={icon.color}>    {icon.glyph} {entry.state} · {entry.type} · {entry.target} — {entry.message}{counts}</text>
                    }}
                  </For>
                </box>
              )}
            </For>
          </scrollbox>
        </>
      ) : null}
      <text fg="gray">  [Esc] Back{props.error ? "  [r] Retry" : ""}</text>
    </CenteredDialog>
  )
}
