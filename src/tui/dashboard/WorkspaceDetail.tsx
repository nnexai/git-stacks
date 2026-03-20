/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import { formatAge, isStale } from "./messageUtils"
import type { WorkspaceEntry } from "./types"
import type { MessageRecord } from "../../lib/messages"

type Props = {
  entry: WorkspaceEntry | undefined
  messages: MessageRecord[]
  tick: number
}

export function WorkspaceDetail(props: Props) {
  return (
    <Show
      when={props.entry}
      fallback={<text fg="gray">  No workspace selected</text>}
    >
      {(entry) => {
        const ws = () => entry().workspace
        const status = () => entry().status

        const displayMessages = createMemo(() => {
          void props.tick  // subscribe to tick for periodic time refresh
          const msgs = props.messages ?? []
          return msgs.slice(0, 3)  // last 3 in detail pane; full list via m overlay
        })
        const totalCount = createMemo(() => (props.messages ?? []).length)

        return (
          <>
            <text fg="white">  Branch: {ws().branch}</text>
            <text fg="gray">  Created: {ws().created}</text>
            <text>{""}</text>
            <text fg="white">  Repos:</text>
            <Show when={status().state === "loaded"}>
              <For each={(status() as any).repos}>
                {(repo: any) => {
                  const icon = !repo.exists ? "✗" : repo.dirty ? "~" : "✓"
                  const fg = !repo.exists ? "red" : repo.dirty ? "yellow" : "green"
                  const modeLabel = repo.mode === "worktree" ? `[${repo.branch}]` : "[trunk]"
                  return (
                    <text fg={fg}>    {icon}  {repo.name.padEnd(28)} {modeLabel}</text>
                  )
                }}
              </For>
            </Show>
            <Show when={status().state === "pending" || status().state === "loading"}>
              <text fg="gray">  Loading...</text>
            </Show>
            <Show when={status().state === "error"}>
              <text fg="red">  Error: {(status() as any).message}</text>
            </Show>
            <text>{""}</text>
            <Show when={totalCount() > 0} fallback={
              <>
                <text fg="white">  Messages:</text>
                <text fg="gray">  (no messages)</text>
              </>
            }>
              <text fg="white">
                {totalCount() > 3
                  ? `  Messages (${totalCount()}, press m for all):`
                  : `  Messages (${totalCount()}):`}
              </text>
              <For each={displayMessages()}>
                {(msg) => {
                  const senderLabel = msg.from ? `${msg.from}: ` : ""
                  const stale = () => (void props.tick, isStale(msg.timestamp))
                  const age = () => (void props.tick, formatAge(msg.timestamp))
                  return (
                    <box height={1} flexDirection="row">
                      <text fg={stale() ? "gray" : "white"}>    {senderLabel}{msg.text}</text>
                      <text fg={stale() ? "gray" : "yellow"}>  {age()}</text>
                    </box>
                  )
                }}
              </For>
            </Show>
          </>
        )
      }}
    </Show>
  )
}
