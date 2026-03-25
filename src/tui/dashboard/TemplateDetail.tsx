/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo } from "solid-js"
import { formatConfigValue } from "./configUtils"
import type { Template } from "../../lib/config"
import { readGlobalConfig } from "../../lib/config"
import { integrations } from "../../lib/integrations"
import { resolveEnabledGlobally } from "../../lib/integrations/types"

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
        const globalConfig = readGlobalConfig()
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
            <text>{""}</text>
            <text fg="white">  Integrations:</text>
            <For each={integrations}>
              {(integration) => {
                // Template detail: only two cascade levels — template and global
                // No applies() check needed for templates (no workspace context)
                const tplOverride = template().integrations?.[integration.id]
                let enabled: boolean
                let source: string

                if (tplOverride && typeof tplOverride === "object" && "enabled" in (tplOverride as object)) {
                  enabled = (tplOverride as { enabled: boolean }).enabled
                  source = "template"
                } else {
                  enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)
                  source = "global"
                }

                // Hide integrations that are globally disabled with no override
                if (!enabled && source === "global") return null

                // Config summary for enabled integrations (D-11)
                let configSummary = ""
                if (enabled) {
                  const rawConfig = ((tplOverride ?? globalConfig.integrations[integration.id] ?? {}) as Record<string, unknown>)
                  const extras = Object.entries(rawConfig)
                    .filter(([k]) => k !== "enabled")
                    .map(([k, v]) => `${k}: ${formatConfigValue(v)}`)
                    .join(", ")
                  if (extras) configSummary = `(${extras})`
                }

                const icon = enabled ? "\u2713" : "\u2717"
                const fg = enabled ? "green" : "red"

                return (
                  <box flexDirection="row" height={1}>
                    <text fg={fg}>    {icon}  {integration.id.padEnd(10)}  {configSummary}</text>
                    <text fg="gray">  [{source}]</text>
                  </box>
                )
              }}
            </For>
          </>
        )
      }}
    </Show>
  )
}
