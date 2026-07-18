/** @jsxImportSource @opentui/solid */

import { For, Show, createEffect, createMemo } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { formatSignalAge, signalText } from "./signalUtils"
import { formatConfigValue } from "./configUtils"
import type { WorkspaceEntry, WorkspaceFileStatusState } from "./types"
import type { DashboardSignal } from "./hooks/useSignals"
import type { WebFileEntry, WebNotesResponse } from "@git-stacks/protocol"
import type { GlobalConfig, Template } from "@git-stacks/core/config"
import { integrations } from "@git-stacks/core/integrations"
import { isConditional, resolveEnabledGlobally } from "@git-stacks/core/integrations/types"

const TRACKER_IDS = ["github", "gitlab", "gitea", "jira"] as const

type Props = {
  entry: WorkspaceEntry | undefined
  signals: DashboardSignal[]
  tick: number
  fileStatus?: WorkspaceFileStatusState
  notes?: WebNotesResponse
  scrollRequest?: { sequence: number; direction: -1 | 1 }
  config?: GlobalConfig
  templates?: Template[]
}

function entryIcon(entry: WebFileEntry): { icon: string; color: "green" | "yellow" | "red" } {
  if (entry.severity === "error") return { icon: "×", color: "red" }
  if (entry.severity === "warning") return { icon: "!", color: "yellow" }
  return { icon: "✓", color: "green" }
}

function renderFileEntry(entry: WebFileEntry) {
  const icon = entryIcon(entry)
  return <text fg={icon.color}>    {icon.icon} {entry.state.padEnd(9)} {entry.type.padEnd(7)} {entry.target} — {entry.message}</text>
}

function detailRow(row: unknown) {
  return <box height={1} flexDirection="row">{row as any}</box>
}

export function WorkspaceDetail(props: Props) {
  let scrollView: ScrollBoxRenderable | undefined
  let renderedWorkspaceName: string | undefined
  let handledScrollSequence = 0

  const syncScrollView = () => {
    const workspaceName = props.entry?.workspace.name
    const request = props.scrollRequest
    if (!scrollView) return
    if (workspaceName !== renderedWorkspaceName) {
      renderedWorkspaceName = workspaceName
      scrollView.scrollTo(0)
    }
    if (request && request.sequence !== handledScrollSequence) {
      handledScrollSequence = request.sequence
      scrollView.scrollBy(request.direction, "viewport")
    }
  }

  createEffect(syncScrollView)

  return (
    <Show
      when={props.entry}
      fallback={<text fg="gray">  No workspace selected</text>}
    >
      {(entry) => {
        const ws = () => entry().workspace
        const status = () => entry().status
        const globalConfig = () => props.config ?? { workspace_root: "", integrations: {}, ports: { range_start: 10000, range_end: 65000 } }

        const displaySignals = createMemo(() => {
          void props.tick
          return (props.signals ?? []).slice(0, 3)
        })
        const totalCount = createMemo(() => (props.signals ?? []).length)

        const aheadBehindStale = createMemo(() => {
          const s = status()
          return s.state === "loaded" && s.aheadBehindStale
        })

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

        const rows = createMemo(() => {
          const out: any[] = []

          out.push(<text fg="white">  Signals:</text>)
          if (totalCount() === 0) {
            out.push(<text fg="gray">    (no signals)</text>)
          } else {
            out.push(<text fg="gray">    {totalCount() > 3 ? `${totalCount()} total, press m for all` : `${totalCount()} total`}</text>)
            for (const signal of displaySignals()) {
              const age = formatSignalAge(signal.occurred_at)
              out.push(<text fg={signal.unread ? "white" : "gray"}>    {signal.source}: {signalText(signal)}  {age}</text>)
            }
          }

          out.push(<text> </text>)
          out.push(<text fg="white">  Repos:</text>)
          const currentStatus = status()
          if (currentStatus.state === "loaded") {
            for (const repo of currentStatus.repos) {
              const icon = !repo.exists ? "x" : repo.dirty ? "~" : "-"
              const fg = !repo.exists ? "red" : repo.dirty ? "yellow" : "green"
              const modeLabel = repo.mode === "worktree" ? `[${repo.branch}]` : repo.mode === "dir" ? "[dir]" : "[trunk]"
              const stale = aheadBehindStale() ? "?" : ""
              const ahead = repo.mode === "worktree" && repo.ahead > 0 ? `  ↑${repo.ahead}${stale}` : ""
              const behind = repo.mode === "worktree" && repo.behind > 0 ? `  ↓${repo.behind}${stale}` : ""
              out.push(<text fg={fg}>    {icon} {repo.name.padEnd(24)} {modeLabel}{ahead}{behind}</text>)
            }
          } else if (currentStatus.state === "error") {
            out.push(<text fg="red">    Error: {currentStatus.message}</text>)
          } else {
            out.push(<text fg="gray">    Loading...</text>)
          }

          out.push(<text> </text>)
          out.push(<text fg="white">  Files:</text>)
          const fileStatus = props.fileStatus
          if (!fileStatus || fileStatus.state === "idle") {
            out.push(<text fg="gray">    Select a workspace to load file status.</text>)
          } else if (fileStatus.state === "loading") {
            out.push(<text fg="gray">    Loading file status...</text>)
          } else if (fileStatus.state === "error") {
            out.push(<text fg="red">    Error: {fileStatus.message}</text>)
          } else {
            const view = fileStatus.view
            out.push(<text fg="gray">    {view.summary.total} entries, {view.summary.attention} need attention</text>)
            for (const group of view.groups) {
              out.push(<text fg="gray">    {group.name} ({group.summary.total})</text>)
              for (const fileEntry of group.entries.slice(0, 3)) out.push(renderFileEntry(fileEntry))
              if (group.entries.length > 3) out.push(<text fg="gray">      +{group.entries.length - 3} rows; open file status</text>)
            }
            if (view.summary.total === 0) out.push(<text fg="gray">    no file config entries</text>)
          }

          out.push(<text> </text>)
          out.push(<text fg="white">  Source/Issues:</text>)
          if (linkedIssues().length === 0) {
            out.push(<text fg="gray">    no linked source issues</text>)
          } else {
            for (const item of linkedIssues()) {
              out.push(<text fg="cyan">    {item.trackerId.padEnd(10)} {item.issueId}</text>)
            }
          }

          out.push(<text> </text>)
          out.push(<text fg="white">  Integrations:</text>)
          for (const integration of integrations) {
            if (isConditional(integration) && !integration.applies(ws())) {
              out.push(<text fg="gray">    -  {integration.id.padEnd(10)}  [skipped: no matching repos]</text>)
              continue
            }

            const wsOverride = ws().settings?.integrations?.[integration.id]
            let enabled: boolean
            let source: string

            if (wsOverride && typeof wsOverride === "object" && "enabled" in (wsOverride as object)) {
              enabled = (wsOverride as { enabled: boolean }).enabled
              source = "workspace"
            } else if (ws().template) {
              const tpl = props.templates?.find((template) => template.name === ws().template)
              if (tpl) {
                const tplOverride = tpl.integrations?.[integration.id]
                if (tplOverride && typeof tplOverride === "object" && "enabled" in (tplOverride as object)) {
                  enabled = (tplOverride as { enabled: boolean }).enabled
                  source = "template"
                } else {
                  enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig())
                  source = "global"
                }
              } else {
                enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig())
                source = "global"
              }
            } else {
              enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig())
              source = "global"
            }

            if (!enabled && source === "global") continue

            let configSummary = ""
            if (enabled) {
              const rawConfig = (ws().settings?.integrations?.[integration.id]
                ?? globalConfig().integrations[integration.id]
                ?? {}) as Record<string, unknown>
              const extras = Object.entries(rawConfig)
                .filter(([k]) => k !== "enabled" && k !== "issue")
                .map(([k, v]) => `${k}: ${formatConfigValue(v)}`)
                .join(", ")
              if (extras) configSummary = `(${extras})`
            }

            const icon = enabled ? "✓" : "✗"
            const fg = enabled ? "green" : "red"
            out.push(<text fg={fg}>    {icon}  {integration.id.padEnd(10)}  {configSummary}  [{source}]</text>)
          }

          out.push(<text> </text>)
          out.push(<text fg="white">  Notes:</text>)
          const notes = props.notes
          if (!notes) {
            out.push(<text fg="gray">    Open Workspace notes to load.</text>)
          } else if (notes.count === 0) {
            out.push(<text fg="gray">    0 notes</text>)
          } else {
            out.push(<text fg="gray">    {notes.count} total, latest {formatSignalAge(notes.records[0]!.created_at)}</text>)
            for (const note of notes.records.slice(0, 3)) {
              out.push(<text fg="white">    - {note.text}  {formatSignalAge(note.created_at)}</text>)
            }
          }

          out.push(<text> </text>)
          out.push(<text fg="white">  Config:</text>)
          out.push(<text fg="gray">    Branch: {ws().branch}</text>)
          out.push(<text fg="gray">    Created: {ws().created}</text>)
          out.push(<text fg="gray">    Template: {ws().template ?? "[adhoc]"}</text>)
          out.push(<text fg="gray">    Labels: {(ws().labels ?? []).join(", ") || "[none]"}</text>)

          return out
        })

        return (
          <scrollbox
            ref={(node) => {
              scrollView = node
              renderedWorkspaceName = undefined
              queueMicrotask(syncScrollView)
            }}
            flexGrow={1}
            scrollY
            scrollX={false}
            viewportCulling
          >
            <For each={rows()}>{(row) => detailRow(row)}</For>
          </scrollbox>
        )
      }}
    </Show>
  )
}
