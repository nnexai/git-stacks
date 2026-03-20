/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import { WorkspaceRow } from "./WorkspaceRow"
import type { WorkspaceEntry } from "./types"
import type { MessageRecord } from "../../lib/messages"

type Props = {
  entries: WorkspaceEntry[]
  cursor: number
  selected: Set<number>
  filter: string
  height: number
  allMessages: Map<string, MessageRecord[]>
  tick: number
}

export function WorkspaceList(props: Props) {
  const viewportHeight = createMemo(() => Math.max(3, props.height))

  const scrollOffset = createMemo(() => {
    const vh = viewportHeight()
    if (props.cursor < vh) return 0
    return Math.min(props.cursor - vh + 1, Math.max(0, props.entries.length - vh))
  })

  const visibleEntries = createMemo(() =>
    props.entries.slice(scrollOffset(), scrollOffset() + viewportHeight())
  )

  return (
    <box flexDirection="column">
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
                messages={props.allMessages.get(entry.workspace.name) ?? []}
                tick={props.tick}
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
