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
      <Show when={props.filter}>
        <text fg="cyan">  filter: {props.filter}</text>
      </Show>
      <Show
        when={props.entries.length > 0}
        fallback={<text fg="gray">  No templates found. Run `git-stacks template new` to create one.</text>}
      >
        <For each={visibleEntries()}>
          {(entry, visibleIndex) => {
            const absoluteIndex = () => scrollOffset() + visibleIndex()
            const focused = () => absoluteIndex() === props.cursor
            return (
              <Show
                when={focused()}
                fallback={
                  <text fg="white">
                    {"   "}{entry.name}
                    {"   "}
                    <text fg="gray">({entry.repos.length} repos){entry.description ? `  ${entry.description}` : ""}</text>
                  </text>
                }
              >
                <text fg="cyan">
                  {"  > "}{entry.name}
                  {"   "}
                  <text fg="gray">({entry.repos.length} repos){entry.description ? `  ${entry.description}` : ""}</text>
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
