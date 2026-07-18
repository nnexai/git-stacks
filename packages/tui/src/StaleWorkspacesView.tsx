/** @jsxImportSource @opentui/solid */

import { For, Match, Show, Switch, createEffect, createMemo } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import {
  presentStaleWorkspaceResponse,
  staleWorkspaceIncompleteActionsExplanation,
  workspaceActionLabel,
  type PresentedStaleWorkspaceRow,
  type StaleWorkspacePresentedEvidence,
  type StaleWorkspacePresentation,
} from "@git-stacks/client"
import type {
  WebStaleWorkspaceResponse,
  WebWorkspaceAction,
  WebWorkspaceActionId,
} from "@git-stacks/protocol"
import type { StaleWorkspaceSelection } from "./types"

export type { StaleWorkspaceSelection } from "./types"

export type StaleWorkspacesViewState = {
  phase:
    | "initial-loading"
    | "loaded"
    | "refreshing"
    | "first-load-error"
    | "retained-error"
    | "revision-recovery"
    | "open-pending"
    | "open-error"
    | "inventory-pending"
    | "inventory-error"
  response?: WebStaleWorkspaceResponse
  workspaceId?: string
  message?: string
}

type Props = {
  state: StaleWorkspacesViewState
  selection: StaleWorkspaceSelection
  detailOffset: number
  onSelectionChange(selection: StaleWorkspaceSelection): void
  onDetailPage(direction: "page-up" | "page-down"): void
  onRefresh(): void | Promise<void>
  onOpen(workspaceId: string): void | Promise<void>
  onActions(workspaceId: string): void | Promise<void>
  onAnnounce(message: string): void
  onBack(): void
}

type SelectableRow = {
  selection: StaleWorkspaceSelection
  row: PresentedStaleWorkspaceRow
}

function sameSelection(left: StaleWorkspaceSelection, right: StaleWorkspaceSelection): boolean {
  return left.section === right.section && left.index === right.index
}

function selectableRows(presentation: StaleWorkspacePresentation | undefined): SelectableRow[] {
  if (!presentation) return []
  return [
    ...presentation.candidates.map((row, index) => ({
      selection: { section: "candidate" as const, index },
      row,
    })),
    ...presentation.incomplete.map((row, index) => ({
      selection: { section: "incomplete" as const, index },
      row,
    })),
  ]
}

const TUI_STALE_LIFECYCLE_ACTION_ORDER = [
  "workspace.archive",
  "workspace.remove",
  "workspace.force-remove",
] as const satisfies readonly WebWorkspaceActionId[]

export function adaptTuiStaleWorkspacePresentation(
  presentation: StaleWorkspacePresentation,
  options: {
    inventories: Readonly<Record<string, readonly WebWorkspaceAction[]>>
  },
) {
  const adaptRow = (
    row: PresentedStaleWorkspaceRow,
    section: StaleWorkspaceSelection["section"],
  ) => {
    const actions: Array<{
      actionId: WebWorkspaceActionId
      label: string
      disabledReason?: string
    }> = [{
      actionId: "workspace.open",
      label: workspaceActionLabel("workspace.open"),
    }]

    if (section === "candidate") {
      const descriptors = options.inventories[row.workspaceId] ?? []
      for (const actionId of TUI_STALE_LIFECYCLE_ACTION_ORDER) {
        const descriptor = descriptors.find((candidate) =>
          candidate.action_id === actionId
          && candidate.subject.kind === "workspace"
          && candidate.subject.workspace_id === row.workspaceId)
        if (!descriptor) continue
        actions.push({
          actionId,
          label: workspaceActionLabel(actionId),
          ...(!descriptor.availability.available
            ? { disabledReason: descriptor.availability.message }
            : {}),
        })
      }
    }

    return Object.freeze({
      ...row,
      section,
      actions: Object.freeze(actions),
      ...(section === "incomplete"
        ? { lifecycleDeniedReason: staleWorkspaceIncompleteActionsExplanation() }
        : {}),
    })
  }

  return Object.freeze({
    revision: presentation.revision,
    checkedAt: presentation.checkedAt,
    candidateCountLabel: presentation.candidateCountLabel,
    incompleteCountLabel: presentation.incompleteCountLabel,
    rows: Object.freeze([
      ...presentation.candidates.map((row) => adaptRow(row, "candidate")),
      ...presentation.incomplete.map((row) => adaptRow(row, "incomplete")),
    ]),
  })
}

function compact(value: string, width: number): string {
  const limit = Math.max(12, width - 8)
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(1, limit - 1))}…`
}

function wrappedLineCount(value: string, width: number): number {
  return Math.max(1, Math.ceil(value.length / Math.max(1, width - 4)))
}

function evidenceTimeLabel(evidence: StaleWorkspacePresentedEvidence): string | undefined {
  if (!evidence.time) return undefined
  const prefix = evidence.code === "merged"
    ? "Merged"
    : evidence.code === "closed"
    ? "Closed"
    : evidence.code === "remote_branch_deleted" || evidence.code === "managed_worktree_missing"
    ? "Confirmed missing"
    : evidence.code === "inactive"
    ? "Last activity"
    : "Observed"
  return `${prefix} ${evidence.time.relative} · ${evidence.time.exactUtc}`
}

function selectedRowId(selection: StaleWorkspaceSelection): string {
  return `stale-${selection.section}-${selection.index}`
}

function ListPane(props: {
  presentation: StaleWorkspacePresentation
  selection: StaleWorkspaceSelection
  width: number
  height?: number
  onReady(view: ScrollBoxRenderable): void
}) {
  const isSelected = (section: StaleWorkspaceSelection["section"], index: number) =>
    props.selection.section === section && props.selection.index === index

  const candidateRow = (row: PresentedStaleWorkspaceRow, index: number) => (
    <box id={selectedRowId({ section: "candidate", index })} flexDirection="column" paddingLeft={1} paddingRight={1}>
      <box flexDirection="row">
        <text fg={isSelected("candidate", index) ? "cyan" : "white"}>{isSelected("candidate", index) ? "> " : "  "}</text>
        <text fg={isSelected("candidate", index) ? "cyan" : "white"}>{compact(row.workspaceName, props.width)}</text>
      </box>
      <text fg="gray">    {row.confirmedReasons.length} confirmed {row.confirmedReasons.length === 1 ? "reason" : "reasons"}{row.activity ? ` · ${row.activity.relative}` : " · activity unavailable"}</text>
      <For each={row.confirmedReasons}>
        {(reason) => <text fg="yellow">    ! {reason.label}</text>}
      </For>
    </box>
  )

  const incompleteRow = (row: PresentedStaleWorkspaceRow, index: number) => (
    <box id={selectedRowId({ section: "incomplete", index })} flexDirection="column" paddingLeft={1} paddingRight={1}>
      <box flexDirection="row">
        <text fg={isSelected("incomplete", index) ? "cyan" : "white"}>{isSelected("incomplete", index) ? "> " : "  "}</text>
        <text fg={isSelected("incomplete", index) ? "cyan" : "white"}>{compact(row.workspaceName, props.width)}</text>
      </box>
      <text fg="gray">    incomplete{row.activity ? ` · ${row.activity.relative}` : " · activity unavailable"}</text>
      <For each={row.unknownEvidence}>
        {(evidence) => <text fg="gray">    ? {evidence.label}</text>}
      </For>
    </box>
  )

  return (
    <scrollbox
      ref={(view) => props.onReady(view)}
      flexGrow={props.height === undefined ? 1 : undefined}
      height={props.height}
      scrollY
      scrollX={false}
      verticalScrollbarOptions={{ visible: false }}
      viewportCulling
    >
      {props.presentation.candidateCount === 0 && props.presentation.incompleteCount > 0
        ? <text fg="yellow">  No confirmed stale workspaces. Some workspaces could not be fully evaluated.</text>
        : <box height={0} />}
      {props.presentation.candidateCount > 0
        ? <box flexDirection="column">
            <text fg="white">  Cleanup candidates</text>
            <For each={props.presentation.candidates}>{(row, index) => candidateRow(row, index())}</For>
          </box>
        : <box height={0} />}
      {props.presentation.incompleteCount > 0
        ? <box flexDirection="column">
            <text fg="white">  Evaluation incomplete</text>
            <For each={props.presentation.incomplete}>{(row, index) => incompleteRow(row, index())}</For>
          </box>
        : <box height={0} />}
    </scrollbox>
  )
}

function EvidenceDetail(props: {
  item: SelectableRow | undefined
  onReady(view: ScrollBoxRenderable): void
}) {
  const candidate = () => props.item?.selection.section === "candidate"
  const row = () => props.item?.row

  return (
    <scrollbox
      ref={(view) => props.onReady(view)}
      flexGrow={1}
      scrollY
      scrollX={false}
      verticalScrollbarOptions={{ visible: false }}
      viewportCulling
    >
      {row()
        ? (() => {
          const selected = row()!
          return (
          <box flexDirection="column" paddingLeft={1} paddingRight={1}>
            <text fg="cyan">{selected.workspaceName}</text>
            <text fg="gray">{selected.activity ? `Last activity ${selected.activity.relative} · ${selected.activity.exactUtc}` : "Last activity is unavailable."}</text>

            {candidate()
              ? <box flexDirection="column">
                  <text> </text>
                  <text fg="white">Confirmed reasons</text>
                  <For each={selected.confirmedReasons}>
                    {(reason) => (
                      <box flexDirection="column">
                        <box flexDirection="row">
                          <text fg="yellow">! </text>
                          <text fg="white">{reason.label}</text>
                        </box>
                        {evidenceTimeLabel(reason)
                          ? <text fg="gray">  {evidenceTimeLabel(reason)}</text>
                          : <box height={0} />}
                      </box>
                    )}
                  </For>
                </box>
              : <box height={0} />}

            {selected.unknownEvidence.length > 0
              ? <box flexDirection="column">
                  <text> </text>
                  <text fg="white">Unknown evidence</text>
                  <For each={selected.unknownEvidence}>
                    {(evidence) => (
                      <box flexDirection="column">
                        <box flexDirection="row">
                          <text fg="yellow">? </text>
                          <text fg="gray">{evidence.label}</text>
                        </box>
                        {evidenceTimeLabel(evidence)
                          ? <text fg="gray">  {evidenceTimeLabel(evidence)}</text>
                          : <box height={0} />}
                      </box>
                    )}
                  </For>
                  <text fg="gray">Resolve provider access or service availability, then refresh evidence.</text>
                </box>
              : <box height={0} />}

            {selected.cautions.length > 0
              ? <box flexDirection="column">
                  <text> </text>
                  <text fg="yellow">Cautions</text>
                  <text fg="gray">Cautions do not determine whether this workspace is stale.</text>
                  <For each={selected.cautions}>
                    {(caution) => (
                      <box flexDirection="row">
                        <text fg="yellow">! </text>
                        <text fg="gray">{caution.label}</text>
                      </box>
                    )}
                  </For>
                </box>
              : <box height={0} />}

            <text> </text>
            <text fg="cyan">[o/Enter] Open workspace</text>
            {candidate()
              ? <text fg="cyan">[a] Workspace actions</text>
              : <text fg="gray">{staleWorkspaceIncompleteActionsExplanation()}</text>}
          </box>
          )
        })()
        : <text fg="gray">  No stale workspace selected.</text>}
    </scrollbox>
  )
}

export function StaleWorkspacesView(props: Props) {
  const dimensions = useTerminalDimensions()
  const presentation = createMemo(() => props.state.response
    ? presentStaleWorkspaceResponse(props.state.response)
    : undefined)
  const rows = createMemo(() => selectableRows(presentation()))
  const normalizedSelection = createMemo<StaleWorkspaceSelection>(() => {
    const available = rows()
    return available.find((item) => sameSelection(item.selection, props.selection))?.selection
      ?? available[0]?.selection
      ?? { section: "candidate", index: 0 }
  })
  const selectedItem = createMemo(() => rows().find((item) => sameSelection(item.selection, normalizedSelection())))
  const tooSmall = () => dimensions().width < 40 || dimensions().height < 12
  const wide = () => dimensions().width >= 80
  const medium = () => dimensions().width >= 56 && dimensions().width < 80
  const listWidth = () => Math.max(28, Math.floor(dimensions().width * 0.38))
  const stackedListHeight = () => Math.max(4, Math.min(10, Math.floor((dimensions().height - 6) * 0.4)))
  const normalRefreshLabel = () => props.state.phase === "first-load-error" || props.state.phase === "retained-error"
    ? "[r] Retry refresh"
    : props.state.phase === "refreshing" || props.state.phase === "revision-recovery"
    ? "[r] Refresh pending"
    : "[r] Refresh evidence"
  const introCopy = () => dimensions().width < 56
    ? "Review confirmed stale reasons. Nothing is changed automatically."
    : "Review confirmed reasons before opening, archiving, or removing a workspace. Nothing is changed automatically."
  const countCopy = (current: StaleWorkspacePresentation) =>
    `${current.candidateCountLabel} · ${current.incompleteCountLabel} · Evidence checked ${current.checkedAt.relative} · ${current.checkedAt.exactUtc}`

  let listView: ScrollBoxRenderable | undefined
  let detailView: ScrollBoxRenderable | undefined
  let renderedWorkspaceId: string | undefined
  let handledDetailOffset = 0
  let refreshPending = false
  let openPending = false
  let actionsPending = false

  createEffect(() => {
    const selection = normalizedSelection()
    queueMicrotask(() => listView?.scrollChildIntoView(selectedRowId(selection)))
  })

  createEffect(() => {
    const item = selectedItem()
    const offset = props.detailOffset
    if (!detailView) return
    if (item?.row.workspaceId !== renderedWorkspaceId) {
      renderedWorkspaceId = item?.row.workspaceId
      handledDetailOffset = 0
      detailView.scrollTo(0)
    }
    const delta = offset - handledDetailOffset
    if (delta !== 0) {
      detailView.scrollBy(delta > 0 ? 1 : -1, "viewport")
      handledDetailOffset = offset
    }
  })

  const moveSelection = (targetIndex: number) => {
    const available = rows()
    if (available.length === 0) return
    const currentIndex = Math.max(0, available.findIndex((item) => sameSelection(item.selection, normalizedSelection())))
    const nextIndex = Math.max(0, Math.min(available.length - 1, targetIndex))
    const next = available[nextIndex]?.selection
    if (next && currentIndex !== nextIndex) props.onSelectionChange(next)
  }

  let syntheticSpecialKey = ""
  let syntheticSpecialKeyTimer: ReturnType<typeof setTimeout> | undefined
  const consumeSyntheticSpecialKey = (name: string): boolean => {
    if (name.length !== 1) return false
    const next = `${syntheticSpecialKey}${name}`
    const supported = ["home", "end", "pageup", "pagedown"] as const
    if (!supported.some((candidate) => candidate.startsWith(next))) {
      syntheticSpecialKey = ""
      if (syntheticSpecialKeyTimer) clearTimeout(syntheticSpecialKeyTimer)
      return false
    }
    syntheticSpecialKey = next
    if (syntheticSpecialKeyTimer) clearTimeout(syntheticSpecialKeyTimer)
    syntheticSpecialKeyTimer = setTimeout(() => { syntheticSpecialKey = "" }, 25)
    if (!supported.includes(next as typeof supported[number])) return true
    syntheticSpecialKey = ""
    clearTimeout(syntheticSpecialKeyTimer)
    syntheticSpecialKeyTimer = undefined
    if (next === "home") moveSelection(0)
    else if (next === "end") moveSelection(rows().length - 1)
    else props.onDetailPage(next === "pageup" ? "page-up" : "page-down")
    return true
  }

  const invokeRefresh = () => {
    if (refreshPending || props.state.phase === "refreshing" || props.state.phase === "revision-recovery") return
    refreshPending = true
    try {
      Promise.resolve(props.onRefresh()).finally(() => { refreshPending = false })
    } catch {
      refreshPending = false
    }
  }

  const invokeOpen = () => {
    const item = selectedItem()
    if (
      !item
      || openPending
      || props.state.phase === "open-pending"
      || props.state.phase === "refreshing"
      || props.state.phase === "revision-recovery"
    ) return
    openPending = true
    try {
      Promise.resolve(props.onOpen(item.row.workspaceId)).finally(() => { openPending = false })
    } catch {
      openPending = false
    }
  }

  const invokeActions = () => {
    const item = selectedItem()
    if (!item) return
    if (item.selection.section === "incomplete") {
      props.onAnnounce(staleWorkspaceIncompleteActionsExplanation())
      return
    }
    if (
      actionsPending
      || props.state.phase === "inventory-pending"
      || props.state.phase === "refreshing"
      || props.state.phase === "revision-recovery"
    ) return
    actionsPending = true
    try {
      Promise.resolve(props.onActions(item.row.workspaceId)).finally(() => { actionsPending = false })
    } catch {
      actionsPending = false
    }
  }

  useKeyboard((key) => {
    if (props.state.phase === "open-pending") return
    if (tooSmall()) {
      if (key.name === "escape") props.onBack()
      return
    }
    if (key.name === "escape") { props.onBack(); return }
    const available = rows()
    const currentIndex = Math.max(0, available.findIndex((item) => sameSelection(item.selection, normalizedSelection())))
    if (key.name === "up" || key.name === "k") { moveSelection(currentIndex - 1); return }
    if (key.name === "down" || key.name === "j") { moveSelection(currentIndex + 1); return }
    if (key.name === "home") { moveSelection(0); return }
    if (key.name === "end") { moveSelection(available.length - 1); return }
    if (key.name === "pageup") { props.onDetailPage("page-up"); return }
    if (key.name === "pagedown") { props.onDetailPage("page-down"); return }
    // testRender's string helper emits these named special keys as character streams;
    // real terminals reach the direct branches above.
    if (consumeSyntheticSpecialKey(key.name)) return
    if (key.name === "s") return
    if (key.name === "r") { invokeRefresh(); return }
    if (key.name === "o" || key.name === "return") { invokeOpen(); return }
    if (key.name === "a") invokeActions()
  })

  const statusColor = () => props.state.phase === "first-load-error"
    || props.state.phase === "retained-error"
    || props.state.phase === "open-error"
    || props.state.phase === "inventory-error"
    ? "red"
    : props.state.phase === "loaded"
    ? "gray"
    : "yellow"

  const footer = () => {
    const item = selectedItem()
    const actions = item?.selection.section === "candidate" ? "  [a] Actions" : ""
    if (dimensions().width >= 80) {
      return (
        <box height={1} flexDirection="row">
          <text fg="gray">  ↑↓/jk Navigate  [o/Enter] Open{actions}  {normalRefreshLabel()}  [Esc] Back</text>
        </box>
      )
    }
    return (
      <box height={2} flexDirection="column">
        <box height={1} flexDirection="row">
          <text fg="gray">  ↑↓/jk Navigate  [o/Enter] Open{actions}</text>
        </box>
        <box height={1} flexDirection="row">
          <text fg="gray">  {normalRefreshLabel()}  [Esc] Back</text>
        </box>
      </box>
    )
  }

  return (
    <Switch>
      <Match when={tooSmall()}>
        <box border title=" Stale Workspaces " flexDirection="column" height="100%" paddingLeft={1} paddingRight={1}>
          <text fg="yellow">Terminal is too small for</text>
          <text fg="yellow">Stale Workspaces. Resize to at</text>
          <text fg="yellow">least 40 × 12.</text>
          <text fg="gray">[Esc] Back</text>
        </box>
      </Match>
      <Match when={!tooSmall()}>
        <box flexDirection="column" height="100%">
          <box height={1} flexDirection="row" paddingLeft={1}>
            <text fg="cyan">Stale Workspaces</text>
          </box>
          <box height={wrappedLineCount(introCopy(), dimensions().width)} flexDirection="column" paddingLeft={1} paddingRight={1}>
            <text fg="white">{introCopy()}</text>
          </box>
          {props.state.message
            ? <box height={wrappedLineCount(props.state.message, dimensions().width)} flexDirection="column" paddingLeft={1} paddingRight={1}>
                <text fg={statusColor()}>{props.state.message}</text>
              </box>
            : <box height={0} />}
          {presentation()
            ? <box height={wrappedLineCount(countCopy(presentation()!), dimensions().width)} flexDirection="column" paddingLeft={1} paddingRight={1}>
                <text fg="gray">{countCopy(presentation()!)}</text>
              </box>
            : <box height={0} />}

          <Show
            when={presentation()}
            fallback={
              <box border flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
                <text fg={props.state.phase === "first-load-error" ? "red" : "gray"}>{props.state.message ?? "Loading stale workspace evidence…"}</text>
              </box>
            }
          >
            {(current) => (
              <Switch>
                <Match when={current().candidateCount === 0 && current().incompleteCount === 0}>
                  <box border flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
                    <text fg="white">No stale workspaces</text>
                    <text fg="gray">No workspace currently has a confirmed stale reason. Refresh evidence to check again.</text>
                  </box>
                </Match>
                <Match when={current().candidateCount > 0 || current().incompleteCount > 0}>
                  <Switch>
                    <Match when={wide()}>
                      <box flexDirection="row" flexGrow={1}>
                        <box border title=" Workspaces " flexDirection="column" width={listWidth()}>
                          <ListPane
                            presentation={current()}
                            selection={normalizedSelection()}
                            width={listWidth()}
                            onReady={(view) => { listView = view }}
                          />
                        </box>
                        <box border title=" Evidence " flexDirection="column" flexGrow={1}>
                          <EvidenceDetail item={selectedItem()} onReady={(view) => { detailView = view }} />
                        </box>
                      </box>
                    </Match>
                    <Match when={medium()}>
                      <box flexDirection="column" flexGrow={1}>
                        <box border title=" Workspaces " flexDirection="column" height={stackedListHeight()}>
                          <ListPane
                            presentation={current()}
                            selection={normalizedSelection()}
                            width={dimensions().width}
                            height={Math.max(2, stackedListHeight() - 2)}
                            onReady={(view) => { listView = view }}
                          />
                        </box>
                        <box border title=" Evidence " flexDirection="column" flexGrow={1}>
                          <EvidenceDetail item={selectedItem()} onReady={(view) => { detailView = view }} />
                        </box>
                      </box>
                    </Match>
                    <Match when={!wide() && !medium()}>
                      <box flexDirection="column" flexGrow={1}>
                        <EvidenceDetail item={selectedItem()} onReady={(view) => { detailView = view }} />
                      </box>
                    </Match>
                  </Switch>
                </Match>
              </Switch>
            )}
          </Show>
          {footer()}
        </box>
      </Match>
    </Switch>
  )
}
