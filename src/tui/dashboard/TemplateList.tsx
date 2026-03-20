/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import type { Template } from "../../lib/config"

type Props = {
  entries: Template[]
  cursor: number
  filter: string
  height: number
}

export function TemplateList(props: Props) {
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
        fallback={<text fg="gray">{"  No templates found. Run `git-stacks template new` to create one."}</text>}
      >
        <For each={visibleEntries()}>
          {(entry, visibleIndex) => {
            const absoluteIndex = () => scrollOffset() + visibleIndex()
            const focused = () => absoluteIndex() === props.cursor
            return (
              <box height={1} flexDirection="row" backgroundColor={focused() ? "#333333" : undefined}>
                <text fg={focused() ? "white" : "gray"}>{focused() ? " > " : "   "}</text>
                <text fg="white">{entry.name.padEnd(22)}</text>
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
