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
    <box flexDirection="column">
      <Show
        when={props.entries.length > 0}
        fallback={<text fg="gray">{"  No repos in registry. Run `git-stacks repo add` to register one."}</text>}
      >
        <For each={visibleEntries()}>
          {(entry, visibleIndex) => {
            const absoluteIndex = () => scrollOffset() + visibleIndex()
            const focused = () => absoluteIndex() === props.cursor
            return (
              <box height={1} flexDirection="row" backgroundColor={focused() ? "#333333" : undefined}>
                <text fg={focused() ? "white" : "gray"}>{focused() ? " > " : "   "}</text>
                <text fg={entry.diskExists ? "green" : "red"}>{entry.diskExists ? "✓" : "✗"}</text>
                <text fg="white">{`  ${entry.name.padEnd(24)}`}</text>
                <text fg="cyan">{`  ${entry.type.padEnd(12)}`}</text>
                <text fg="gray">{`  ${truncatePath(entry.local_path)}`}</text>
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
