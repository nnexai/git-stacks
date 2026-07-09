/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import { WorkspaceRow } from "./WorkspaceRow"
import type { GroupedWorkspaceItem, WorkspaceEntry } from "./types"
import type { MessageRecord } from "../../lib/messages"

type Props = {
  entries: WorkspaceEntry[]
  grouped: GroupedWorkspaceItem[]
  isGrouped: boolean
  cursor: number
  selected: Set<string>
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

  const navigableItems = createMemo(() => {
    if (!props.isGrouped) return [] as { item: Extract<GroupedWorkspaceItem, { kind: "entry" }>; groupIdx: number }[]
    return props.grouped
      .map((item, groupIdx) => ({ item, groupIdx }))
      .filter((row): row is { item: Extract<GroupedWorkspaceItem, { kind: "entry" }>; groupIdx: number } => row.item.kind === "entry")
  })

  const cursorToGroupIdx = createMemo(() => {
    const nav = navigableItems()
    if (props.cursor >= 0 && props.cursor < nav.length) return nav[props.cursor].groupIdx
    return -1
  })

  const groupedScrollOffset = createMemo(() => {
    if (!props.isGrouped) return 0
    const targetGroupIdx = cursorToGroupIdx()
    if (targetGroupIdx < 0) return 0
    const vh = viewportHeight()
    if (targetGroupIdx < vh) return 0
    return Math.min(targetGroupIdx - vh + 1, Math.max(0, props.grouped.length - vh))
  })

  const groupedVisible = createMemo(() => {
    if (!props.isGrouped) return [] as GroupedWorkspaceItem[]
    return props.grouped.slice(groupedScrollOffset(), groupedScrollOffset() + viewportHeight())
  })

  return (
    <box flexDirection="column">
      <Show when={!props.isGrouped}>
        <Show
          when={props.entries.length > 0}
          fallback={<text fg="gray">  No workspaces found. Run `git-stacks new` to create one.</text>}
        >
          <For each={visibleEntries()}>
            {(entry) => {
              const realIndex = () => props.entries.indexOf(entry)
              return (
                <WorkspaceRow
                  entry={entry}
                  focused={realIndex() === props.cursor}
                  selected={props.selected.has(entry.workspace.name)}
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
      </Show>

      <Show when={props.isGrouped}>
        <Show
          when={props.grouped.length > 0}
          fallback={<text fg="gray">  No workspaces found.</text>}
        >
          <For each={groupedVisible()}>
            {(item, idx) => {
              if (item.kind === "header") {
                return <text fg="yellow">{`  ${item.label}`}</text>
              }
              const navIdx = () =>
                navigableItems().findIndex(row => row.groupIdx === groupedScrollOffset() + idx())
              const isLastInGroup = () => {
                const next = props.grouped[groupedScrollOffset() + idx() + 1]
                return !next || next.kind === "header"
              }
              return (
                <WorkspaceRow
                  entry={item.entry}
                  focused={navIdx() === props.cursor}
                  selected={props.selected.has(item.entry.workspace.name)}
                  messages={props.allMessages.get(item.entry.workspace.name) ?? []}
                  tick={props.tick}
                  groupPrefix={isLastInGroup() ? "  └─ " : "  ├─ "}
                />
              )
            }}
          </For>
          <Show when={props.grouped.length > viewportHeight()}>
            <text fg="gray">
              {`  Showing ${navigableItems().length} workspaces in ${props.grouped.filter(item => item.kind === "header").length} groups`}
            </text>
          </Show>
        </Show>
      </Show>
    </box>
  )
}
