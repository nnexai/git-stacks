/** @jsxImportSource @opentui/solid */

import { For, Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { RepoEntry } from "./hooks/useRepos"

type Props = {
  entries: RepoEntry[]
  cursor: number
  filter: string
  height: number
  selected?: Set<number>
}

export function RepoList(props: Props) {
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

  function leftTruncate(p: string, maxLen: number): string {
    if (p.length <= maxLen) return p
    return "\u2026" + p.slice(p.length - (maxLen - 1))
  }

  return (
    <box flexDirection="column">
      <Show
        when={props.entries.length > 0}
        fallback={<text fg="gray">{"  No repos in registry. Run `git-stacks repo add` to register one."}</text>}
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
              // Fixed: prefix(5) + space(1) + disk(1) + space(2) = 9
              // type column + spacing ~14
              const fixed = 9 + 14
              return Math.min(26, Math.max(10, Math.floor((dims().width - fixed) * 0.3)))
            }
            const pathWidth = () => {
              const nw = nameWidth()
              const fixed = 9 + 14 + nw + 4 // +4 for spacing
              return Math.max(15, dims().width - fixed)
            }
            return (
              <box height={1} flexDirection="row" backgroundColor={focused() ? "#333333" : undefined}>
                <text fg={focused() ? "white" : "gray"}>{prefix()} </text>
                <text fg={entry.diskExists ? "green" : "red"}>{entry.diskExists ? "✓" : "✗"}</text>
                <text fg="white">{`  ${(() => {
                  const nw = nameWidth()
                  return entry.name.length > nw ? entry.name.slice(0, nw - 1) + "\u2026" : entry.name.padEnd(nw)
                })()}`}</text>
                <text fg="cyan">{`  ${entry.type.padEnd(12)}`}</text>
                <text fg="gray">{`  ${leftTruncate(entry.local_path, pathWidth())}`}</text>
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
