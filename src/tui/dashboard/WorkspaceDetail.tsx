/** @jsxImportSource @opentui/solid */
import { For, Show } from "solid-js"
import type { WorkspaceEntry } from "./types"

type Props = {
  entry: WorkspaceEntry | undefined
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
            <text fg="white">  Messages:</text>
            <text fg="gray">  (no messages)</text>
          </>
        )
      }}
    </Show>
  )
}
