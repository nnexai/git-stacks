/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import type { RepoEntry } from "./hooks/useRepos"

type Props = {
  entries: RepoEntry[]
  cursor: number
  filter: string
  height: number
}

export function RepoList(props: Props) {
  const viewportHeight = createMemo(() => Math.max(3, props.height))

  const scrollOffset = createMemo(() => {
    const vh = viewportHeight()
    if (props.cursor < vh) return 0
    return Math.min(props.cursor - vh + 1, Math.max(0, props.entries.length - vh))
  })

  const visibleEntries = createMemo(() =>
    props.entries.slice(scrollOffset(), scrollOffset() + viewportHeight())
  )

  function truncatePath(p: string): string {
    if (p.length <= 40) return p
    return "..." + p.slice(p.length - 40)
  }

  return (
    <box border title="Repos" flexDirection="column" flexGrow={1}>
      <Show when={props.filter}>
        <text fg="cyan">  filter: {props.filter}</text>
      </Show>
      <Show
        when={props.entries.length > 0}
        fallback={<text fg="gray">  No repos in registry. Run `git-stacks repo add` to register one.</text>}
      >
        <For each={visibleEntries()}>
          {(entry, visibleIndex) => {
            const absoluteIndex = () => scrollOffset() + visibleIndex()
            const focused = () => absoluteIndex() === props.cursor
            const indicator = entry.diskExists ? "✓" : "✗"
            const indicatorFg = entry.diskExists ? "green" : "red"
            const truncated = truncatePath(entry.local_path)
            return (
              <Show
                when={focused()}
                fallback={
                  <text fg="white">
                    {"   "}
                    <text fg={indicatorFg}>{indicator}</text>
                    {"  "}{entry.name.padEnd(24)}{"  "}{entry.type.padEnd(12)}{"  "}{truncated}
                  </text>
                }
              >
                <text fg="cyan">
                  {"  > "}
                  <text fg={indicatorFg}>{indicator}</text>
                  {"  "}{entry.name.padEnd(24)}{"  "}{entry.type.padEnd(12)}{"  "}{truncated}
                </text>
              </Show>
            )
          }}
        </For>
        <Show when={props.entries.length > viewportHeight()}>
          {(() => {
            const vh = viewportHeight()
            const above = scrollOffset()
            const below = props.entries.length - scrollOffset() - vh
            return (
              <>
                <Show when={above > 0}>
                  <text fg="gray">  ↑↑ {above} above</text>
                </Show>
                <Show when={below > 0}>
                  <text fg="gray">  ↓↓ {below} below</text>
                </Show>
              </>
            )
          })()}
        </Show>
      </Show>
    </box>
  )
}
