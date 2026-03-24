/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from "solid-js"
import { formatAge, isStale } from "./messageUtils"
import { formatConfigValue } from "./configUtils"
import type { WorkspaceEntry } from "./types"
import type { MessageRecord } from "../../lib/messages"
import { readGlobalConfig, readTemplate } from "../../lib/config"
import { integrations } from "../../lib/integrations"
import { resolveEnabledGlobally } from "../../lib/integrations/types"

const TRACKER_IDS = ["github", "gitlab", "gitea", "jira"] as const

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
        const globalConfig = readGlobalConfig()

        const displayMessages = createMemo(() => {
          void props.tick  // subscribe to tick for periodic time refresh
          const msgs = props.messages ?? []
          return msgs.slice(0, 3)  // last 3 in detail pane; full list via m overlay
        })
        const totalCount = createMemo(() => (props.messages ?? []).length)

        const linkedIssues = createMemo(() => {
          const results: { trackerId: string; issueId: string }[] = []
          for (const id of TRACKER_IDS) {
            const trackerConfig = ws().settings?.integrations?.[id] as
              Record<string, unknown> | undefined
            const issue = trackerConfig?.issue
            if (issue !== undefined && issue !== null) {
              results.push({ trackerId: id, issueId: String(issue) })
            }
          }
          return results
        })

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
            <text>{""}</text>
            <text fg="white">  Integrations:</text>
            <For each={integrations}>
              {(integration) => {
                // applies() check — takes precedence (skipped rows)
                if (integration.applies && !integration.applies(ws())) {
                  return (
                    <text fg="gray">    -  {integration.id.padEnd(10)}  [skipped: no matching repos]</text>
                  )
                }

                // Determine enabled state and source annotation (D-10)
                // Walk cascade: workspace settings -> template -> global
                const wsOverride = ws().settings?.integrations?.[integration.id]
                let enabled: boolean
                let source: string

                if (wsOverride && typeof wsOverride === "object" && "enabled" in (wsOverride as object)) {
                  enabled = (wsOverride as { enabled: boolean }).enabled
                  source = "workspace"
                } else if (ws().template) {
                  // Check template-level override
                  try {
                    const tpl = readTemplate(ws().template!)
                    const tplOverride = tpl.integrations?.[integration.id]
                    if (tplOverride && typeof tplOverride === "object" && "enabled" in (tplOverride as object)) {
                      enabled = (tplOverride as { enabled: boolean }).enabled
                      source = "template"
                    } else {
                      enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)
                      source = "global"
                    }
                  } catch {
                    // Template file missing — fall through to global
                    enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)
                    source = "global"
                  }
                } else {
                  enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)
                  source = "global"
                }

                // Config summary for enabled integrations (D-11)
                let configSummary = ""
                if (enabled) {
                  const rawConfig = (ws().settings?.integrations?.[integration.id]
                    ?? globalConfig.integrations[integration.id]
                    ?? {}) as Record<string, unknown>
                  const extras = Object.entries(rawConfig)
                    .filter(([k]) => k !== "enabled" && k !== "issue")
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
            <Show when={linkedIssues().length > 0}>
              <text>{""}</text>
              <text fg="white">  Linked Issues:</text>
              <For each={linkedIssues()}>
                {(item) => (
                  <text fg="cyan">    {item.trackerId.padEnd(10)}  {item.issueId}</text>
                )}
              </For>
            </Show>
          </>
        )
      }}
    </Show>
  )
}
