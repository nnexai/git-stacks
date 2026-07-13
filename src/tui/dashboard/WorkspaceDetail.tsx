/** @jsxImportSource @opentui/solid */
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { formatSignalAge, signalText } from "./signalUtils"
import { formatConfigValue } from "./configUtils"
import type { WorkspaceEntry, WorkspaceFileStatusState } from "./types"
import type { DashboardSignal } from "./hooks/useSignals"
import type { WorkspaceFileStatusEntry, WorkspaceFileStatusRepoSection } from "../../lib/workspace-file-status"
import type { WorkspaceNoteRecord } from "../../lib/notes"
import { listWorkspaceNotes } from "../../lib/notes"
import { readGlobalConfig, readTemplate } from "../../lib/config"
import { integrations } from "../../lib/integrations"
import { isConditional, resolveEnabledGlobally } from "../../lib/integrations/types"

const TRACKER_IDS = ["github", "gitlab", "gitea", "jira"] as const

type Props = {
  entry: WorkspaceEntry | undefined
  signals: DashboardSignal[]
  tick: number
  fileStatus?: WorkspaceFileStatusState
  scrollOffset?: number
  height?: number
  onOverflowChange?: (canScroll: boolean) => void
}

type NoteState =
  | { state: "loading"; workspaceName: string }
  | { state: "loaded"; workspaceName: string; notes: WorkspaceNoteRecord[] }
  | { state: "error"; workspaceName: string; message: string }

function entryIcon(entry: WorkspaceFileStatusEntry): { icon: string; color: "green" | "yellow" | "red" | "gray" } {
  if (entry.severity === "error") return { icon: "✗", color: "red" }
  if (entry.severity === "warning") return { icon: "!", color: "yellow" }
  return { icon: "✓", color: "green" }
}

function renderFileEntry(entry: WorkspaceFileStatusEntry) {
  const icon = entryIcon(entry)
  const label = entry.repo ? `${entry.repo}:${entry.target}` : entry.target
  const details = entry.hint ? ` - ${entry.hint}` : ""
  return <text fg={icon.color}>    {icon.icon} {entry.state.padEnd(9)} {entry.type.padEnd(7)} {label}{details}</text>
}

function renderRepoFileSection(section: WorkspaceFileStatusRepoSection): unknown[] {
  const rows: unknown[] = [<text fg="gray">    repo {section.name} ({section.mode})</text>]
  if (section.entries.length === 0) rows.push(<text fg="gray">      no file config entries</text>)
  else rows.push(...section.entries.map((entry) => renderFileEntry(entry)))
  rows.push(...section.warnings.map((warning) => <text fg="yellow">      {warning}</text>))
  rows.push(...section.errors.map((error) => <text fg="red">      {error}</text>))
  return rows
}

function detailRow(row: unknown) {
  return <box height={1} flexDirection="row">{row as any}</box>
}

export function WorkspaceDetail(props: Props) {
  const [notesState, setNotesState] = createSignal<NoteState | null>(null)
  let notesRequest = 0

  createEffect(() => {
    const workspaceName = props.entry?.workspace.name
    notesRequest += 1
    const requestId = notesRequest
    if (!workspaceName) {
      setNotesState(null)
      return
    }
    setNotesState({ state: "loading", workspaceName })
    void listWorkspaceNotes(workspaceName, { limit: 5 })
      .then((notes) => {
        if (requestId === notesRequest) setNotesState({ state: "loaded", workspaceName, notes })
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        if (requestId === notesRequest) setNotesState({ state: "error", workspaceName, message })
      })
  })

  return (
    <Show
      when={props.entry}
      fallback={<text fg="gray">  No workspace selected</text>}
    >
      {(entry) => {
        const ws = () => entry().workspace
        const status = () => entry().status
        const globalConfig = readGlobalConfig()

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

          out.push(<text>{""}</text>)
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

          out.push(<text>{""}</text>)
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
            if (view.workspace.entries.length > 0) {
              out.push(<text fg="gray">    workspace files</text>)
              for (const fileEntry of view.workspace.entries) out.push(renderFileEntry(fileEntry))
            }
            for (const repoSection of view.repos) out.push(...renderRepoFileSection(repoSection))
            if (view.summary.total === 0) out.push(<text fg="gray">    no file config entries</text>)
          }

          out.push(<text>{""}</text>)
          out.push(<text fg="white">  Source/Issues:</text>)
          if (linkedIssues().length === 0) {
            out.push(<text fg="gray">    no linked source issues</text>)
          } else {
            for (const item of linkedIssues()) {
              out.push(<text fg="cyan">    {item.trackerId.padEnd(10)} {item.issueId}</text>)
            }
          }

          out.push(<text>{""}</text>)
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
                enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)
                source = "global"
              }
            } else {
              enabled = resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)
              source = "global"
            }

            if (!enabled && source === "global") continue

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

            const icon = enabled ? "✓" : "✗"
            const fg = enabled ? "green" : "red"
            out.push(<text fg={fg}>    {icon}  {integration.id.padEnd(10)}  {configSummary}  [{source}]</text>)
          }

          out.push(<text>{""}</text>)
          out.push(<text fg="white">  Notes:</text>)
          const notes = notesState()
          if (!notes || notes.state === "loading") {
            out.push(<text fg="gray">    Loading notes...</text>)
          } else if (notes.state === "error") {
            out.push(<text fg="red">    Error: {notes.message}</text>)
          } else if (notes.notes.length === 0) {
            out.push(<text fg="gray">    0 notes</text>)
          } else {
            out.push(<text fg="gray">    {notes.notes.length} shown, latest {formatSignalAge(notes.notes[0]!.created)}</text>)
            for (const note of notes.notes) {
              out.push(<text fg="white">    - {note.text}  {formatSignalAge(note.created)}</text>)
            }
          }

          out.push(<text>{""}</text>)
          out.push(<text fg="white">  Config:</text>)
          out.push(<text fg="gray">    Branch: {ws().branch}</text>)
          out.push(<text fg="gray">    Created: {ws().created}</text>)
          out.push(<text fg="gray">    Template: {ws().template ?? "[adhoc]"}</text>)
          out.push(<text fg="gray">    Labels: {(ws().labels ?? []).join(", ") || "[none]"}</text>)

          return out
        })

        const visibleRows = createMemo(() => {
          const height = props.height ?? rows().length
          const maxOffset = Math.max(0, rows().length - height)
          const offset = Math.min(Math.max(0, props.scrollOffset ?? 0), maxOffset)
          return rows().slice(offset, offset + height).map(detailRow)
        })

        createEffect(() => {
          props.onOverflowChange?.(rows().length > (props.height ?? rows().length))
        })

        return (
          <box flexDirection="column">
            <For each={visibleRows()}>{(row) => row}</For>
          </box>
        )
      }}
    </Show>
  )
}
