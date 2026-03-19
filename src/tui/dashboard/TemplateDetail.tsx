/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo } from "solid-js"
import type { Template } from "../../lib/config"

type Props = {
  template: Template | undefined
}

export function TemplateDetail(props: Props) {
  return (
    <Show
      when={props.template}
      fallback={<text fg="gray">  No template selected</text>}
    >
      {(template) => {
        const hookCounts = createMemo(() => {
          const h = template().hooks
          if (!h) return { total: 0, primary: "" }
          const types: Array<[string, string[] | undefined]> = [
            ["pre_create", h.pre_create],
            ["post_create", h.post_create],
            ["pre_open", h.pre_open],
            ["post_open", h.post_open],
            ["pre_remove", h.pre_remove],
            ["post_merge", h.post_merge],
          ]
          let total = 0
          let primaryType = ""
          let primaryCount = 0
          for (const [name, arr] of types) {
            const count = arr?.length ?? 0
            total += count
            if (count > primaryCount) {
              primaryCount = count
              primaryType = name
            }
          }
          return { total, primary: primaryType }
        })

        return (
          <>
            <text fg="white">
              {"  "}Repos ({template().repos.length}){"   "}Hooks:{" "}
              {hookCounts().total === 0
                ? "none"
                : `${hookCounts().total} ${hookCounts().primary}`}
            </text>
            <text>{""}</text>
            <text fg="white">  Repos:</text>
            <For each={template().repos}>
              {(repo) => (
                <text fg="gray">    {repo.repo.padEnd(28)} {repo.mode}</text>
              )}
            </For>
            <text>{""}</text>
            <Show when={template().description}>
              <text fg="gray">  {template().description}</text>
            </Show>
          </>
        )
      }}
    </Show>
  )
}
