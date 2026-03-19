/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo } from "solid-js"
import type { RepoEntry } from "./hooks/useRepos"
import type { Template, Workspace } from "../../lib/config"

type Props = {
  entry: RepoEntry | undefined
  allTemplates: Template[]
  allWorkspaces: Workspace[]
}

export function RepoDetail(props: Props) {
  return (
    <Show
      when={props.entry}
      fallback={<text fg="gray">  No repo selected</text>}
    >
      {(entry) => {
        const usedByTemplates = createMemo(() =>
          props.allTemplates.filter(t => t.repos.some(r => r.repo === entry().name))
        )
        const usedByWorkspaces = createMemo(() =>
          props.allWorkspaces.filter(ws => ws.repos.some(r => r.repo === entry().name))
        )
        const notReferenced = createMemo(() =>
          usedByTemplates().length === 0 && usedByWorkspaces().length === 0
        )

        return (
          <>
            <text fg="white">  Path: {entry().local_path}</text>
            <text fg="gray">  Type: {entry().type}   Branch: {entry().default_branch}</text>
            <text fg={entry().diskExists ? "green" : "red"}>
              {"  "}{entry().diskExists ? "✓ exists" : "✗ missing"}
            </text>
            <text>{""}</text>
            <text fg="white">  Used by:</text>
            <For each={usedByTemplates()}>
              {(t) => <text fg="gray">    template: {t.name}</text>}
            </For>
            <For each={usedByWorkspaces()}>
              {(ws) => <text fg="gray">    workspace: {ws.name}</text>}
            </For>
            <Show when={notReferenced()}>
              <text fg="gray">    (not referenced)</text>
            </Show>
          </>
        )
      }}
    </Show>
  )
}
