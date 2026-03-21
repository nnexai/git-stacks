/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { Template } from "../../lib/config"

type Props = {
  entries: Template[]
  cursor: number
  filter: string
  height: number
  selected?: Set<number>   // NEW — per D-11, D-13
}

export function TemplateList(props: Props) {
  const viewportHeight = createMemo(() => Math.max(3, props.height))
  const dims = useTerminalDimensions()

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
        fallback={<text fg="gray">{"  No templates found. Run `git-stacks template new` to create one."}</text>}
      >
        <For each={visibleEntries()}>
          {(entry, visibleIndex) => {
            const absoluteIndex = () => scrollOffset() + visibleIndex()
            const focused = () => absoluteIndex() === props.cursor
            const isSelected = () => props.selected?.has(absoluteIndex()) ?? false
            const prefix = () => {
              const sel = isSelected() ? "x" : " "
              const focus = focused() ? ">" : " "
              return `${focus}[${sel}]`
            }
            const nameWidth = () => {
              // Fixed: prefix(5) + space(1) = 6
              // Right side: " N repos" ~10 + description variable
              const fixed = 6 + 12
              return Math.min(24, Math.max(10, Math.floor((dims().width - fixed) * 0.35)))
            }
            return (
              <box height={1} flexDirection="row" backgroundColor={focused() ? "#333333" : undefined}>
                <text fg={focused() ? "white" : "gray"}>{prefix()} </text>
                <text fg="white">{(() => {
                  const nw = nameWidth()
                  return entry.name.length > nw ? entry.name.slice(0, nw - 1) + "\u2026" : entry.name.padEnd(nw)
                })()}</text>
                <text fg="cyan">{` ${entry.repos.length} repos`}</text>
                <text fg="gray">{entry.description ? `  ${entry.description}` : ""}</text>
              </box>
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
