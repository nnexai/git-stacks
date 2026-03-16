/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { WorkspaceRow } from "./WorkspaceRow"
import type { WorkspaceEntry } from "./types"

type Props = {
  entries: WorkspaceEntry[]
  cursor: number
  selected: Set<number>
  filter: string
}

export function WorkspaceList(props: Props) {
  const dims = useTerminalDimensions()
  // Reserve lines for header (3) + help bar (2) + batch bar (2) + border (2)
  const viewportHeight = createMemo(() => Math.max(3, dims().height - 9))

  const scrollOffset = createMemo(() => {
    const vh = viewportHeight()
    if (props.cursor < vh) return 0
    return Math.min(props.cursor - vh + 1, Math.max(0, props.entries.length - vh))
  })

  const visibleEntries = createMemo(() =>
    props.entries.slice(scrollOffset(), scrollOffset() + viewportHeight())
  )

  return (
    <box border title="Workspaces" flexDirection="column" flexGrow={1}>
      <Show when={props.filter}>
        <text fg="cyan">  filter: {props.filter}</text>
      </Show>
      <Show
        when={props.entries.length > 0}
        fallback={<text fg="gray">  No workspaces found. Run `ws new` to create one.</text>}
      >
        <For each={visibleEntries()}>
          {(entry) => {
            const realIndex = () => props.entries.indexOf(entry)
            return (
              <WorkspaceRow
                entry={entry}
                focused={realIndex() === props.cursor}
                selected={props.selected.has(realIndex())}
              />
            )
          }}
        </For>
        <Show when={props.entries.length > viewportHeight()}>
          <text fg="gray">
            {`  ${scrollOffset() + 1}-${Math.min(scrollOffset() + viewportHeight(), props.entries.length)} of ${props.entries.length}`}
          </text>
        </Show>
      </Show>
    </box>
  )
}
