/** @jsxImportSource @opentui/solid */

import { createSignal, createMemo, Show, Switch, Match, For } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { useWorkspaces } from "./hooks/useWorkspaces"
import { useTemplates } from "./hooks/useTemplates"
import { useRepos } from "./hooks/useRepos"
import { useSignals } from "./hooks/useSignals"
import { useWorkspaceFileStatus } from "./hooks/useWorkspaceFileStatus"
import { WorkspaceList } from "./WorkspaceList"
import { WorkspaceDetail } from "./WorkspaceDetail"
import { TemplateList } from "./TemplateList"
import { TemplateDetail } from "./TemplateDetail"
import { RepoList } from "./RepoList"
import { RepoDetail } from "./RepoDetail"
import { ActionMenu } from "./ActionMenu"
import { WorkspaceOperationView } from "./WorkspaceOperationView"
import { WorkspaceNotesDialog } from "./WorkspaceNotesDialog"
import { WorkspaceFileStatusDialog } from "./WorkspaceFileStatusDialog"
import { ForgeSourceReviewDialog } from "./ForgeSourceReviewDialog"
import { StaleWorkspacesView, type StaleWorkspacesViewState } from "./StaleWorkspacesView"
import { ConfirmDialog } from "./ConfirmDialog"
import { ProgressView } from "./ProgressView"
import { BatchBar } from "./BatchBar"
import { InlineInput } from "./InlineInput"
import { HelpOverlay } from "./HelpOverlay"
import { SignalOverlay } from "./SignalOverlay"
import { TemplateActionMenu } from "./TemplateActionMenu"
import { RepoActionMenu } from "./RepoActionMenu"
import { RemoveBlockedView } from "./RemoveBlockedView"
import { CenteredDialog } from "./CenteredDialog"
import { ArchivedWorkspacesDialog, ArchivedWorkspaceUndoDialog } from "./ArchivedWorkspacesDialog"
import {
  WorkspaceDirtyBlockedDialog,
  WorkspaceForceRemoveDialog,
  WorkspaceRemovalDialog,
} from "./WorkspaceRemovalDialog"
import type { SyncRow, SyncResult, PushRow } from "@git-stacks/core/workspace-git"
import { expandBranchPattern, type Workspace, type Template } from "@git-stacks/core/config"
import { SyncProgressView } from "./SyncProgressView"
import { PushProgressView, type PushRowDisplay } from "./PushProgressView"
import { WizardView, type WizardStep } from "./WizardView"
import { CreateProgressView, type CreateRow } from "./CreateProgressView"
import type {
  GroupedWorkspaceItem,
  UIView,
  Action,
  Tab,
  WorkspaceEntry,
  WorkspaceGroupingMode,
  WorkspaceStatus,
  IssueCandidate,
  DirtyRemovalContext,
  LifecycleAction,
  WorkspaceLifecycleTarget,
  WorkspaceActionTarget,
  StaleWorkspaceOrigin,
  StaleWorkspaceSelection,
} from "./types"
import { matchesLabels } from "@git-stacks/core/labels"
import {
  createForgeReviewCoordinator,
  createOperationTracker,
  createWorkspaceActionRegistry,
  isStaleWorkspaceRevisionConflict,
  issueTrackerLabels,
  presentStaleWorkspaceResponse,
  WEB_SHORTCUT_ACTION_METADATA,
  type OperationTracker,
  type OperationTrackerState,
  type WorkspaceActionRegistry,
} from "@git-stacks/client"
import { listManualCommands } from "@git-stacks/core/workspace-command"
import { createWorkspaceThroughService, runCoreMutation } from "@git-stacks/service/client"
import { officialService } from "./official-service"
import {
  createStaleWorkspaceRequestCoordinator,
  createWorkspaceActionInventoryGate,
  createWorkspaceNotesResponseGate,
} from "./workspace-action-inventory"
import type {
  Operation,
  WebOperation,
  WebOperationMutation,
  WebOperationSummary,
  WebNotesResponse,
  WebWorkspaceAction,
  WebWorkspaceActionId,
  WebStaleWorkspaceResponse,
  WorkspaceLifecycleFailureDetails,
  WorkspaceLifecycleMutation,
} from "@git-stacks/protocol"
import { openEditorHandoff, resolveEditorHandoff } from "./editor-handoff"
import { useCoreState } from "./core-store"
import { runWorkspaceShellHandoff } from "./terminal-handoff"
import {
  appendCommandOutput,
  initialCommandOutputState,
  type CommandOutputLine,
  type CommandOutputState,
  type CommandOutputStatus,
} from "./command-output"

export function matchesWorkspaceFilter(workspace: Workspace, filter: string): boolean {
  const rawFilter = filter.trim()
  const f = rawFilter.toLowerCase()
  if (!rawFilter) return true

  const name = workspace.name.toLowerCase()
  const labels = workspace.labels ?? []
  if (f.startsWith("label:")) {
    const rawLabelTerm = rawFilter.slice(6).trim()
    const labelTerm = rawLabelTerm.toLowerCase()
    if (!labelTerm) return true
    return matchesLabels(workspace, [rawLabelTerm])
      || labels.some(label => label.toLowerCase().includes(labelTerm))
  }

  return name.includes(f)
    || matchesLabels(workspace, [rawFilter])
    || labels.some(label => label.toLowerCase().includes(f))
}

export function nextWorkspaceGroupingMode(mode: WorkspaceGroupingMode): WorkspaceGroupingMode {
  if (mode === "none") return "label"
  if (mode === "label") return "state"
  if (mode === "state") return "template"
  return "none"
}

function operationSummary(
  operation: WebOperation,
  context: { actionId: Exclude<WebWorkspaceActionId, "operation.cancel">; workspaceId: string; workspaceName: string },
  cancellable: boolean,
): WebOperationSummary {
  const identity = {
    operation_id: operation.operation_id,
    action_id: context.actionId,
    workspace_id: context.workspaceId,
    workspace_name: context.workspaceName,
    accepted_at: operation.accepted_at,
  }
  if (operation.state === "accepted") return { ...identity, state: "accepted", cancellation: cancellable ? { state: "available" } : undefined }
  if (operation.state === "running") return {
    ...identity,
    state: "running",
    started_at: operation.started_at ?? operation.accepted_at,
    progress: {
      stage: "executing",
      ...(operation.progress?.message ? { message: operation.progress.message } : {}),
      ...(operation.progress?.completed === undefined ? {} : { completed: operation.progress.completed, total: operation.progress.total! }),
    },
    cancellation: cancellable ? { state: "available" } : { state: "unavailable", reason: "not-cancellable" },
  }
  if (operation.state === "succeeded") return {
    ...identity,
    state: "succeeded",
    started_at: operation.started_at ?? operation.accepted_at,
    finished_at: operation.finished_at ?? operation.accepted_at,
    cancellation: { state: "unavailable", reason: "finished" },
    result: operation.result ?? {},
  }
  return {
    ...identity,
    state: operation.state,
    ...(operation.started_at ? { started_at: operation.started_at } : {}),
    finished_at: operation.finished_at ?? operation.accepted_at,
    cancellation: { state: "unavailable", reason: "finished" },
    error: {
      code: operation.error?.code ?? "operation_failed",
      message: operation.error?.message ?? "The operation failed.",
      retryable: ["request_timeout", "rate_limited", "provider_unavailable"].includes(operation.error?.code ?? ""),
      ...(operation.error?.forge ? { forge: operation.error.forge } : {}),
    },
  }
}

function workspaceStateGroup(status: WorkspaceStatus): string {
  if (status.state === "pending" || status.state === "loading") return "state: loading"
  if (status.state === "error") return "state: error"
  if (status.hasMissing) return "state: missing"
  if (status.hasDirty) return "state: dirty"
  if (status.aheadBehindStale) return "state: stale"
  return "state: clean"
}

const staleWorkspaceTuiShortcut = WEB_SHORTCUT_ACTION_METADATA
  .find((metadata) => metadata.actionId === "workspace.stale")
  ?.tuiKey

function workspaceGroupLabels(entry: WorkspaceEntry, mode: WorkspaceGroupingMode): string[] {
  if (mode === "label") {
    const labels = entry.workspace.labels ?? []
    return labels.length > 0 ? labels.map(label => `label: ${label}`) : ["label: [unlabeled]"]
  }
  if (mode === "state") return [workspaceStateGroup(entry.status)]
  if (mode === "template") return [`template: ${entry.workspace.template ?? "[adhoc]"}`]
  return []
}

function IssuePicker(props: {
  candidates: IssueCandidate[]
  onSelect: (candidate: IssueCandidate) => void
  onCancel: () => void
}) {
  const [cursor, setCursor] = createSignal(0)
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down") { setCursor(c => Math.min(c + 1, props.candidates.length - 1)); return }
    if (key.name === "up") { setCursor(c => Math.max(c - 1, 0)); return }
    if (key.name === "return") {
      const candidate = props.candidates[cursor()]
      if (candidate) props.onSelect(candidate)
    }
  })
  return (
    <CenteredDialog title="Issue" size="medium">
      <For each={props.candidates}>
        {(candidate, i) => (
          <text fg={i() === cursor() ? "cyan" : "white"}>
            {i() === cursor() ? "> " : "  "}{candidate.label}
          </text>
        )}
      </For>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </CenteredDialog>
  )
}

function CommandPicker(props: {
  commands: string[]
  onSelect: (commandName: string) => void
  onCancel: () => void
}) {
  const [cursor, setCursor] = createSignal(0)
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down") { setCursor(c => Math.min(c + 1, props.commands.length - 1)); return }
    if (key.name === "up") { setCursor(c => Math.max(c - 1, 0)); return }
    if (key.name === "return") {
      const commandName = props.commands[cursor()]
      if (commandName) props.onSelect(commandName)
    }
  })
  return (
    <CenteredDialog title="Commands" size="medium">
      <For each={props.commands}>
        {(commandName, i) => (
          <text fg={i() === cursor() ? "cyan" : "white"}>
            {i() === cursor() ? "> " : "  "}{commandName}
          </text>
        )}
      </For>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </CenteredDialog>
  )
}

export default function App() {
  const renderer = useRenderer()
  const dims = useTerminalDimensions()
  const { entries, loading, reload } = useWorkspaces()
  const { entries: templateEntries, reload: reloadTemplates } = useTemplates()
  const { entries: repoEntries, reload: reloadRepos } = useRepos()
  const { signalMap, tick, dismiss, reloadSignals, refreshSignals } = useSignals()
  const core = useCoreState()
  const [refreshFlash, setRefreshFlash] = createSignal("")

  const [view, setView] = createSignal<UIView>({ view: "list" })
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [reposSelected, setReposSelected] = createSignal<Set<number>>(new Set())
  const [templatesSelected, setTemplatesSelected] = createSignal<Set<number>>(new Set())
  const [commandOutput, setCommandOutput] = createSignal<CommandOutputState>(initialCommandOutputState())
  const [helpOpen, setHelpOpen] = createSignal(false)
  const [signalsOpen, setSignalsOpen] = createSignal(false)
  const [signalsWorkspace, setSignalsWorkspace] = createSignal("")
  const [confirmContext, setConfirmContext] = createSignal<"workspace" | "template">("workspace")
  const [filterFocused, setFilterFocused] = createSignal(false)
  const [syncRows, setSyncRows] = createSignal<SyncRow[]>([])
  const [syncDone, setSyncDone] = createSignal(false)
  const [syncSummary, setSyncSummary] = createSignal<{ text: string; color: "green" | "yellow" | "red" }>({ text: "", color: "green" })
  const [pushRows, setPushRows] = createSignal<PushRowDisplay[]>([])
  const [pushDone, setPushDone] = createSignal(false)
  const [pushSummary, setPushSummary] = createSignal<{ text: string; color: "green" | "yellow" | "red" }>({ text: "", color: "green" })
  const [createRows, setCreateRows] = createSignal<CreateRow[]>([])
  const [createDone, setCreateDone] = createSignal(false)
  const [createSummary, setCreateSummary] = createSignal<{ text: string; color: "green" | "yellow" | "red" }>({ text: "", color: "green" })
  const [repoRemoveTarget, setRepoRemoveTarget] = createSignal<string | null>(null)
  const [workspaceGroupingMode, setWorkspaceGroupingMode] = createSignal<WorkspaceGroupingMode>("none")
  const [detailScrollRequest, setDetailScrollRequest] = createSignal<{ sequence: number; direction: -1 | 1 }>({ sequence: 0, direction: 1 })
  const [workspaceActions, setWorkspaceActions] = createSignal<readonly WebWorkspaceAction[]>()
  const [workspaceActionInventoryState, setWorkspaceActionInventoryState] = createSignal<"loading" | "ready" | "error">("loading")
  const [workspaceActionInventoryError, setWorkspaceActionInventoryError] = createSignal("")
  const [workspaceActionRegistry, setWorkspaceActionRegistry] = createSignal<WorkspaceActionRegistry>()
  const [workspaceActionTarget, setWorkspaceActionTarget] = createSignal<WorkspaceActionTarget>()
  const workspaceActionInventoryGate = createWorkspaceActionInventoryGate()
  const [canonicalConfirmation, setCanonicalConfirmation] = createSignal<{
    descriptor: WebWorkspaceAction
    target: WorkspaceActionTarget
    resolve: (confirmed: boolean) => void
  }>()
  const [operationTracker, setOperationTracker] = createSignal<OperationTracker<WebOperationMutation>>()
  const [operationState, setOperationState] = createSignal<OperationTrackerState>({ phase: "ready" })
  const [operationCards, setOperationCards] = createSignal<WebOperationSummary[]>([])
  const [operationOverflow, setOperationOverflow] = createSignal(0)
  const [notesResponse, setNotesResponse] = createSignal<WebNotesResponse>()
  const [notesLoading, setNotesLoading] = createSignal(false)
  const [notesError, setNotesError] = createSignal("")
  const [notesMutationError, setNotesMutationError] = createSignal("")
  const notesResponseGate = createWorkspaceNotesResponseGate()
  const [staleWorkspaceState, setStaleWorkspaceState] = createSignal<StaleWorkspacesViewState>({
    phase: "initial-loading",
    message: "Loading stale workspace evidence…",
  })
  let staleWorkspaceRequestPending = false
  let staleWorkspaceRequestAbort: AbortController | undefined
  const staleWorkspaceCoordinator = createStaleWorkspaceRequestCoordinator({
    fetch: async ({ expected_revision, force_refresh, signal }) => {
      try {
        return await officialService.fetchStaleWorkspaceEvaluation(
          { expected_revision, force_refresh },
          signal,
        )
      } catch (error) {
        if (isStaleWorkspaceRevisionConflict(error) && view().view === "stale-workspaces") {
          const retained = staleWorkspaceState().response
          setStaleWorkspaceState(retained
            ? {
                phase: "revision-recovery",
                response: retained,
                message: "Workspace data changed while stale evidence was loading. Reloading the authoritative revision and retrying once…",
              }
            : {
                phase: "revision-recovery",
                message: "Workspace data changed while stale evidence was loading. Reloading the authoritative revision and retrying once…",
              })
        }
        throw error
      }
    },
    reloadAuthoritative: async () => {
      await core.refresh()
      const revision = core.state()?.revision
      if (!revision) throw new Error("Authoritative workspace revision is unavailable")
      return revision
    },
  })
  const forgeReview = createForgeReviewCoordinator({
    resolve: (request) => officialService.resolveForgeSourceReview(request),
    create: async (request) => {
      const operation = await officialService.submitWebOperation({ kind: "workspace.create.reviewed", request })
      return { operationId: operation.operation_id }
    },
  })

  // Tab system
  const [tab, setTab] = createSignal<Tab>("workspaces")

  // Per-tab independent cursor/filter/filtering state
  const tabCursor = {
    workspaces: createSignal(0),
    templates: createSignal(0),
    repos: createSignal(0),
  } as const
  const tabFilter = {
    workspaces: createSignal(""),
    templates: createSignal(""),
    repos: createSignal(""),
  } as const
  const tabFiltering = {
    workspaces: createSignal(false),
    templates: createSignal(false),
    repos: createSignal(false),
  } as const

  // Active tab accessors
  const cursor = createMemo(() => tabCursor[tab()][0]())
  const setCursor = (v: number | ((prev: number) => number)) => tabCursor[tab()][1](v as any)
  const filter = createMemo(() => tabFilter[tab()][0]())
  const setFilter = (v: string | ((prev: string) => string)) => tabFilter[tab()][1](v as any)
  const filtering = createMemo(() => tabFiltering[tab()][0]())
  const setFiltering = (v: boolean) => tabFiltering[tab()][1](v)

  // Tab title
  const tabTitle = createMemo(() => {
    const t = tab()
    const ws = t === "workspaces" ? "[1 Workspaces]" : "1 Workspaces"
    const tm = t === "templates" ? "[2 Templates]" : "2 Templates"
    const re = t === "repos" ? "[3 Repos]" : "3 Repos"
    return ` ${ws}  ${tm}  ${re} `
  })

  const filteredEntries = createMemo(() => {
    const rawFilter = tabFilter.workspaces[0]()
    if (!rawFilter.trim()) return entries()
    return entries().filter((entry) => matchesWorkspaceFilter(entry.workspace, rawFilter))
  })

  const groupedEntries = createMemo((): GroupedWorkspaceItem[] => {
    const mode = workspaceGroupingMode()
    if (mode === "none" || tab() !== "workspaces") return []

    const labelMap = new Map<string, { entry: WorkspaceEntry; originalIndex: number }[]>()

    filteredEntries().forEach((entry, originalIndex) => {
      for (const label of workspaceGroupLabels(entry, mode)) {
        const items = labelMap.get(label) ?? []
        items.push({ entry, originalIndex })
        labelMap.set(label, items)
      }
    })

    const items: GroupedWorkspaceItem[] = []
    for (const label of [...labelMap.keys()].sort()) {
      items.push({ kind: "header", label })
      for (const item of labelMap.get(label) ?? []) {
        items.push({ kind: "entry", ...item })
      }
    }
    return items
  })

  const groupedNavigableEntries = createMemo(() =>
    groupedEntries().filter((item): item is Extract<GroupedWorkspaceItem, { kind: "entry" }> => item.kind === "entry")
  )

  const filteredTemplates = createMemo(() => {
    const f = tabFilter.templates[0]().toLowerCase()
    if (!f) return templateEntries()
    return templateEntries().filter(t => t.name.toLowerCase().includes(f))
  })

  const filteredRepos = createMemo(() => {
    const f = tabFilter.repos[0]().toLowerCase()
    if (!f) return repoEntries()
    return repoEntries().filter(r => r.name.toLowerCase().includes(f) || r.local_path.toLowerCase().includes(f))
  })

  // Short lists only consume the rows they need. Larger lists are capped so
  // the detail pane always retains useful space.
  const activeListRows = createMemo(() => {
    if (tab() === "workspaces") {
      return workspaceGroupingMode() === "none" ? filteredEntries().length : groupedEntries().length
    }
    return tab() === "templates" ? filteredTemplates().length : filteredRepos().length
  })
  const batchBarRows = createMemo(() => {
    if (tab() === "workspaces") return selected().size > 0 ? 1 : 0
    if (tab() === "templates") return templatesSelected().size > 0 ? 1 : 0
    return reposSelected().size > 0 ? 1 : 0
  })
  const listPaneHeight = createMemo(() => {
    const maximum = Math.max(6, Math.floor((dims().height - 1) * 0.45))
    return Math.min(maximum, Math.max(6, activeListRows() + batchBarRows() + 2))
  })
  const listHeight = createMemo(() => {
    const available = listPaneHeight() - batchBarRows() - 2
    const footerRows = activeListRows() > available ? 1 : 0
    return Math.max(3, available - footerRows)
  })

  const currentEntry = createMemo(() => {
    if (workspaceGroupingMode() !== "none" && tab() === "workspaces") {
      const groupedEntry = groupedNavigableEntries()[tabCursor.workspaces[0]()]
      return groupedEntry ? filteredEntries()[groupedEntry.originalIndex] : undefined
    }
    return filteredEntries()[tabCursor.workspaces[0]()]
  })
  const currentTemplate = createMemo(() => filteredTemplates()[tabCursor.templates[0]()])
  const currentRepo = createMemo(() => filteredRepos()[tabCursor.repos[0]()])

  const allWorkspaces = createMemo(() => entries().map(e => e.workspace))
  const selectedWorkspace = createMemo(() => currentEntry()?.workspace)
  const selectedFileTarget = createMemo(() => {
    const entry = currentEntry()
    return entry ? { workspaceId: entry.workspaceId, workspaceName: entry.workspace.name } : undefined
  })
  const selectedNotesResponse = createMemo(() => {
    const entry = currentEntry()
    const response = notesResponse()
    const revision = core.state()?.revision
    return entry && response && revision
      && response.workspace_id === entry.workspaceId
      && response.revision === revision
      ? response
      : undefined
  })
  const fileStatus = useWorkspaceFileStatus(selectedFileTarget, () => core.state()?.revision)
  const selectedIssueCandidates = createMemo(() => buildIssueCandidates(selectedWorkspace()))
  const selectedManualCommands = createMemo(() => {
    const workspace = selectedWorkspace()
    return workspace ? listManualCommands(workspace) : []
  })
  const issueDisabledReason = createMemo(() => {
    const workspace = selectedWorkspace()
    if (!workspace) return "none linked" as const
    return selectedIssueCandidates().length > 0 ? undefined : "none linked" as const
  })
  const commandsDisabledReason = createMemo(() => selectedManualCommands().length > 0 ? undefined : "none configured" as const)

  const selectedName = createMemo(() => {
    const t = tab()
    if (t === "workspaces") return currentEntry()?.workspace.name ?? ""
    if (t === "templates") return currentTemplate()?.name ?? ""
    if (t === "repos") return currentRepo()?.name ?? ""
    return ""
  })

  // Detail box title shows selected entity name (list view only)
  const detailBoxTitle = createMemo(() => {
    const name = selectedName()
    return name ? ` ${name} ` : ""
  })

  // Contextual title for ConfirmDialog
  const confirmTitle = createMemo(() => {
    const repoTarget = repoRemoveTarget()
    if (repoTarget) return repoTarget
    if (confirmContext() === "template") return filteredTemplates()[(view() as any).index]?.name ?? "Confirm"
    return currentEntry()?.workspace.name ?? "Confirm"
  })

  // Context-sensitive help bar text (width-tiered to fit 80-column terminals)
  const helpBarText = createMemo(() => {
    const w = dims().width
    const t = tab()
    const msgShortcut = t === "workspaces" ? "  s Stale  m Signals  u PR/MR" : ""
    const groupHint = t === "workspaces" ? `  g Group:${workspaceGroupingMode()}` : ""
    const scrollHint = t === "workspaces" ? "  Pg Detail" : ""
    const clearHint = filter() ? "  esc Clear" : ""

    if (w < 50) return "? Help  q Quit"
    const core = `Enter Actions  Space Select  / Filter${msgShortcut}${clearHint}  ? Help  q Quit`
    if (w < 65) return core
    if (w <= 80) return `r Refresh  ${core}`
    if (w < 100) return `1/2/3 Tabs  r Refresh  ${core}`
    return `\u2191\u2193/jk Navigate  1/2/3 Tabs  r Refresh  ${core}${groupHint}${scrollHint}`
  })

  const inlineInputLabel = createMemo(() => {
    const v = view()
    if (v.view !== "inline-input") return ""
    if (v.purpose === "rename") return "New name"
    if (v.purpose === "add-label") return "Add labels (comma-separated)"
    return "Clone as"
  })

  function clampCursor() {
    const entriesList = tab() === "workspaces" && workspaceGroupingMode() !== "none" ? groupedNavigableEntries()
      : tab() === "workspaces" ? filteredEntries()
      : tab() === "templates" ? filteredTemplates()
      : filteredRepos()
    setCursor(c => Math.min(c, Math.max(0, entriesList.length - 1)))
  }

  function staleWorkspaceId(
    response: WebStaleWorkspaceResponse | undefined,
    selection: StaleWorkspaceSelection,
  ): string | undefined {
    return selection.section === "candidate"
      ? response?.candidates[selection.index]?.workspace_id
      : response?.incomplete[selection.index]?.workspace_id
  }

  function staleWorkspaceSelection(
    response: WebStaleWorkspaceResponse,
    preferredWorkspaceId?: string,
    fallback: StaleWorkspaceSelection = { section: "candidate", index: 0 },
  ): StaleWorkspaceSelection {
    if (preferredWorkspaceId) {
      const candidateIndex = response.candidates.findIndex((row) => row.workspace_id === preferredWorkspaceId)
      if (candidateIndex >= 0) return { section: "candidate", index: candidateIndex }
      const incompleteIndex = response.incomplete.findIndex((row) => row.workspace_id === preferredWorkspaceId)
      if (incompleteIndex >= 0) return { section: "incomplete", index: incompleteIndex }
    }
    if (fallback.section === "candidate" && response.candidates[fallback.index]) return fallback
    if (fallback.section === "incomplete" && response.incomplete[fallback.index]) return fallback
    if (response.candidates.length > 0) return { section: "candidate", index: 0 }
    return { section: "incomplete", index: 0 }
  }

  function captureStaleWorkspaceOrigin(): StaleWorkspaceOrigin {
    const activeTab = tab()
    const workspaceId = activeTab === "workspaces" ? currentEntry()?.workspaceId : undefined
    return {
      view: "list",
      tab: activeTab,
      cursor: tabCursor[activeTab][0](),
      ...(workspaceId ? { workspaceId } : {}),
    }
  }

  function restoreStaleWorkspaceOrigin(origin: StaleWorkspaceOrigin): void {
    staleWorkspaceRequestAbort?.abort()
    staleWorkspaceRequestAbort = undefined
    staleWorkspaceRequestPending = false
    staleWorkspaceCoordinator.invalidate()
    setTab(origin.tab)
    if (origin.tab === "workspaces" && origin.workspaceId) {
      const workspaceIndex = workspaceGroupingMode() === "none"
        ? filteredEntries().findIndex((entry) => entry.workspaceId === origin.workspaceId)
        : groupedNavigableEntries().findIndex((item) => item.entry.workspaceId === origin.workspaceId)
      tabCursor.workspaces[1](workspaceIndex >= 0 ? workspaceIndex : origin.cursor)
    } else {
      tabCursor[origin.tab][1](origin.cursor)
    }
    setView({ view: origin.view })
    clampCursor()
  }

  async function loadStaleWorkspaceEvidence(forceRefresh: boolean): Promise<void> {
    if (staleWorkspaceRequestPending) return
    const expectedRevision = core.state()?.revision
    const previousState = staleWorkspaceState()
    const previousResponse = previousState.response
    const currentView = view()
    const previousWorkspaceId = currentView.view === "stale-workspaces"
      ? staleWorkspaceId(previousResponse, currentView.selection)
      : undefined
    const retainedResponse = previousResponse?.revision === expectedRevision ? previousResponse : undefined
    if (!expectedRevision) {
      setStaleWorkspaceState({
        phase: "first-load-error",
        message: "Stale workspace evidence could not be loaded. Retry the refresh.",
      })
      return
    }

    const controller = new AbortController()
    staleWorkspaceRequestPending = true
    staleWorkspaceRequestAbort = controller
    setStaleWorkspaceState(retainedResponse
      ? {
          phase: "refreshing",
          response: retainedResponse,
          message: "Refreshing stale workspace evidence… Previous results remain visible.",
        }
      : {
          phase: "initial-loading",
          message: "Loading stale workspace evidence…",
        })

    try {
      const result = await staleWorkspaceCoordinator.load({
        expectedRevision,
        forceRefresh,
        signal: controller.signal,
      })
      if (staleWorkspaceRequestAbort !== controller || view().view !== "stale-workspaces") return
      if (result.status === "accepted") {
        const activeView = view() as Extract<UIView, { view: "stale-workspaces" }>
        const selection = staleWorkspaceSelection(result.response, previousWorkspaceId, activeView.selection)
        setStaleWorkspaceState({ phase: "loaded", response: result.response })
        setView({
          ...activeView,
          selection,
          detailOffset: staleWorkspaceId(result.response, selection) === previousWorkspaceId
            ? activeView.detailOffset
            : 0,
        })
        return
      }
      if (result.status === "ignored" && result.reason === "superseded") return

      const authoritativeRevision = core.state()?.revision
      const safeRetainedResponse = retainedResponse?.revision === authoritativeRevision
        ? retainedResponse
        : undefined
      if (safeRetainedResponse) {
        const checkedAt = presentStaleWorkspaceResponse(safeRetainedResponse).checkedAt.relative
        setStaleWorkspaceState({
          phase: "retained-error",
          response: safeRetainedResponse,
          message: `Stale evidence could not be refreshed. Showing results checked ${checkedAt}.`,
        })
      } else {
        setStaleWorkspaceState({
          phase: "first-load-error",
          message: "Stale workspace evidence could not be loaded. Retry the refresh.",
        })
      }
    } finally {
      if (staleWorkspaceRequestAbort === controller) {
        staleWorkspaceRequestAbort = undefined
        staleWorkspaceRequestPending = false
      }
    }
  }

  function enterStaleWorkspaces(): void {
    if (view().view === "stale-workspaces") return
    const origin = captureStaleWorkspaceOrigin()
    const response = staleWorkspaceState().response
    const reusableResponse = response?.revision === core.state()?.revision ? response : undefined
    setView({
      view: "stale-workspaces",
      origin,
      selection: reusableResponse
        ? staleWorkspaceSelection(reusableResponse)
        : { section: "candidate", index: 0 },
      detailOffset: 0,
    })
    if (reusableResponse) {
      setStaleWorkspaceState({ phase: "loaded", response: reusableResponse })
      return
    }
    void loadStaleWorkspaceEvidence(false)
  }

  function updateStaleWorkspaceSelection(selection: StaleWorkspaceSelection): void {
    const activeView = view()
    if (activeView.view !== "stale-workspaces") return
    setView({ ...activeView, selection, detailOffset: 0 })
  }

  function updateStaleWorkspaceDetail(direction: "page-up" | "page-down"): void {
    const activeView = view()
    if (activeView.view !== "stale-workspaces") return
    const delta = direction === "page-down" ? 1 : -1
    setView({ ...activeView, detailOffset: Math.max(0, Math.min(64, activeView.detailOffset + delta)) })
  }

  function announceStaleWorkspace(message: string): void {
    const current = staleWorkspaceState()
    if (!current.response) return
    setStaleWorkspaceState({ phase: "loaded", response: current.response, message })
  }

  function resetCommandOutput(status: CommandOutputStatus = "running") {
    setCommandOutput(initialCommandOutputState(status))
  }

  function appendCommandLine(line: CommandOutputLine) {
    setCommandOutput(prev => appendCommandOutput(prev, line))
  }

  function appendSystemLine(text: string) {
    appendCommandLine({ text, stream: "system" })
  }

  function finishCommandOutput(status: CommandOutputStatus) {
    setCommandOutput(prev => ({ ...prev, status }))
  }

  function operationProgress(operation: Operation): void {
    if (operation.state === "running" && operation.progress.message) appendSystemLine(operation.progress.message)
  }

  function workspaceEntryForTarget(target: WorkspaceActionTarget): WorkspaceEntry | undefined {
    return entries().find((candidate) => candidate.workspaceId === target.workspaceId)
  }

  function inventoryMatchesTarget(actions: readonly WebWorkspaceAction[], target: WorkspaceActionTarget): boolean {
    return actions.length > 0 && actions.every((descriptor) => descriptor.subject.workspace_id === target.workspaceId)
  }

  async function authorizeCurrentWorkspaceAction(
    target: WorkspaceActionTarget | WorkspaceLifecycleTarget,
    actionId: WebWorkspaceActionId,
  ): Promise<WebWorkspaceAction | undefined> {
    const revision = core.state()?.revision
    const workspaceId = "workspaceId" in target ? target.workspaceId : target.id
    if (!revision) return undefined
    try {
      const inventory = await officialService.fetchWorkspaceActionInventory({ workspace_id: workspaceId, expected_revision: revision })
      if (!inventory.every((descriptor) => descriptor.subject.workspace_id === workspaceId)) return undefined
      const descriptor = inventory.find((candidate) => candidate.action_id === actionId)
      return descriptor?.availability.available ? descriptor : undefined
    } catch {
      return undefined
    }
  }

  function lifecycleTarget(entry: WorkspaceEntry | undefined): WorkspaceLifecycleTarget | undefined {
    const revision = core.state()?.revision
    if (!entry || !revision) return undefined
    return { id: entry.workspaceId, name: entry.workspace.name, expectedRevision: revision }
  }

  function currentLifecycleTarget(id: string): WorkspaceLifecycleTarget | undefined {
    const state = core.state()
    if (!state) return undefined
    const entry = state.workspaces.find((candidate) => candidate.projection.id === id)
    if (!entry) return undefined
    return { id, name: entry.definition.name, expectedRevision: state.revision }
  }

  function lifecycleFailure(error: unknown): { code?: string; message: string; details?: WorkspaceLifecycleFailureDetails } {
    if (!(error instanceof Error)) return { message: String(error) }
    const value = error as Error & { code?: unknown; lifecycle?: unknown }
    const details = value.lifecycle && typeof value.lifecycle === "object"
      ? value.lifecycle as WorkspaceLifecycleFailureDetails
      : undefined
    return {
      message: value.message,
      ...(typeof value.code === "string" ? { code: value.code } : {}),
      ...(details ? { details } : {}),
    }
  }

  function dirtyRemovalContext(details: WorkspaceLifecycleFailureDetails | undefined): DirtyRemovalContext | undefined {
    if (
      details?.kind !== "workspace_dirty"
      || details.terminals_stopped !== true
      || details.force_allowed !== true
      || !Array.isArray(details.blocking_repositories)
    ) return undefined
    return {
      kind: "workspace_dirty",
      blockingRepositories: [...details.blocking_repositories],
      terminalsStopped: true,
      forceAllowed: true,
    }
  }

  async function reconcileLifecycleState(): Promise<void> {
    await core.refresh()
    await refreshSignals()
    setSelected(new Set<string>())
    tabCursor.workspaces[1](0)
  }

  async function executeWorkspaceLifecycle(
    action: LifecycleAction,
    target: WorkspaceLifecycleTarget,
    confirmationName?: string,
  ): Promise<void> {
    const actionId = `workspace.${action}` as Extract<WebWorkspaceActionId, `workspace.${string}`>
    const descriptor = await authorizeCurrentWorkspaceAction(target, actionId)
    if (!descriptor || descriptor.confirmation !== (action === "force-remove" ? "exact-name" : action === "remove" ? "confirm" : "none")) {
      setRefreshFlash("Workspace action is no longer authorized. Refresh and try again.")
      setView({ view: "list" })
      return
    }
    if (action === "force-remove" && confirmationName !== target.name) {
      setRefreshFlash("Exact, case-sensitive workspace name required.")
      setView({ view: "list" })
      return
    }
    const request: WorkspaceLifecycleMutation = action === "force-remove"
      ? {
          kind: "workspace.force-remove",
          workspace_id: target.id,
          expected_revision: target.expectedRevision,
          confirmation_name: confirmationName ?? "",
        }
      : {
          kind: action === "archive"
            ? "workspace.archive"
            : action === "unarchive"
            ? "workspace.unarchive"
            : "workspace.remove",
          workspace_id: target.id,
          expected_revision: target.expectedRevision,
        }
    setView({ view: "lifecycle-progress", target, action, message: `${action}: ${target.name}` })
    try {
      await officialService.runWorkspaceLifecycleMutation(request, {
        onOperation: (operation) => {
          if (operation.state !== "running") return
          setView({
            view: "lifecycle-progress",
            target,
            action,
            message: operation.progress.message ?? `${action}: ${target.name}`,
          })
        },
      })
    } catch (error) {
      const failure = lifecycleFailure(error)
      const shouldReload = failure.code === "conflict" || failure.details?.terminals_stopped === true
      if (shouldReload) await reconcileLifecycleState()
      const freshTarget = currentLifecycleTarget(target.id)
      const dirty = dirtyRemovalContext(failure.details)
      if ((action === "remove" || action === "force-remove") && dirty && freshTarget) {
        setView({ view: "dirty-remove-blocked", target: freshTarget, details: dirty })
        return
      }
      if (failure.code === "conflict") {
        setRefreshFlash("Workspace changed; confirm the action again.")
        setView({ view: "list" })
        return
      }
      setView({
        view: "lifecycle-failure",
        target: freshTarget ?? target,
        action,
        message: failure.message,
      })
      return
    }

    await reconcileLifecycleState()
    const currentRevision = core.state()?.revision ?? target.expectedRevision
    if (action === "archive") {
      setView({ view: "archive-undo", target: { ...target, expectedRevision: currentRevision } })
    } else {
      setView({ view: "list" })
    }
  }

  async function runWorkspaceMutation(
    mutation: "workspace.open" | "workspace.close" | "workspace.clean" | "workspace.remove" | "workspace.merge",
    workspace: string,
    options: Record<string, unknown> = {},
  ): Promise<boolean> {
    try {
      await runCoreMutation(mutation, { workspace, options }, { onOperation: operationProgress })
      return true
    } catch (error) {
      appendSystemLine(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  function buildSummary(result: SyncResult): { text: string; color: "green" | "yellow" | "red" } {
    const ns = result.synced.length
    const nsk = result.skipped.filter(s => s.reason.includes("conflict")).length
    const nf = result.skipped.length - nsk  // non-conflict skips are failures
    const stashFailures = result.stashPopFailures ?? []

    if (ns === 0 && nsk === 0 && nf === 0 && stashFailures.length === 0) {
      return { text: "Nothing to sync. Press any key to continue.", color: "green" }
    }
    if (stashFailures.length > 0) {
      return {
        text: `${ns} synced. Stash pop conflict in: ${stashFailures.map(f => f.repo).join(", ")}. Press any key to continue.`,
        color: "red",
      }
    }
    if (nf > 0) {
      return { text: `${ns} synced, ${nsk} skipped, ${nf} failed. Press any key to continue.`, color: "red" }
    }
    if (nsk > 0) {
      return { text: `${ns} synced, ${nsk} skipped. Press any key to continue.`, color: "yellow" }
    }
    return { text: `${ns} synced. Press any key to continue.`, color: "green" }
  }

  async function handleRun(name: string) {
    if (!name) return
    resetCommandOutput()
    setView({ view: "progress", message: `Running ${name}...` })
    const exitCode = await runWorkspaceShellHandoff(name, appendCommandLine)
    finishCommandOutput(exitCode === 0 ? "success" : "failed")
  }

  async function confirmCanonicalWorkspaceAction(descriptor: WebWorkspaceAction, target: WorkspaceActionTarget): Promise<boolean> {
    if (descriptor.confirmation === "none") return true
    const entry = workspaceEntryForTarget(target)
    if (!entry) return false
    if (descriptor.action_id === "workspace.notes.clear") {
      setNotesMutationError("")
      setNotesResponse(undefined)
      setView({ view: "workspace-notes", workspaceId: target.workspaceId, workspaceName: target.workspaceName, initialMode: "clear" })
      try { await loadWorkspaceNotes(entry) } catch {}
      return false
    }
    if (descriptor.action_id === "workspace.force-remove") return false
    return new Promise<boolean>((resolve) => {
      setCanonicalConfirmation({ descriptor, target, resolve })
    })
  }

  async function openWorkspaceActionMenu(index: number): Promise<void> {
    const entry = filteredEntries()[index]
    const revision = core.state()?.revision
    const token = workspaceActionInventoryGate.begin(entry?.workspaceId ?? "missing")
    setWorkspaceActions(undefined)
    setWorkspaceActionRegistry(undefined)
    setWorkspaceActionTarget(undefined)
    setWorkspaceActionInventoryError("")
    setWorkspaceActionInventoryState("loading")
    if (!entry || !revision) {
      setView({ view: "action-menu", index })
      setWorkspaceActionInventoryError("Workspace actions could not be loaded.")
      setWorkspaceActionInventoryState("error")
      return
    }
    const target: WorkspaceActionTarget = {
      workspaceId: entry.workspaceId,
      workspaceName: entry.workspace.name,
      originIndex: index,
    }
    setWorkspaceActionTarget(target)
    setView({ view: "action-menu", index, workspaceId: target.workspaceId, workspaceName: target.workspaceName })
    try {
      const actions = await officialService.fetchWorkspaceActionInventory({
        workspace_id: target.workspaceId,
        expected_revision: revision,
      })
      const activeTarget = workspaceActionTarget()
      if (!workspaceActionInventoryGate.isCurrent(token, target.workspaceId) || view().view !== "action-menu" || activeTarget?.workspaceId !== target.workspaceId) return
      if (!workspaceActionInventoryGate.accepts(token, target.workspaceId, actions) || !inventoryMatchesTarget(actions, target)) {
        throw new Error("Workspace action inventory subject mismatch")
      }
      const callbacks = Object.fromEntries(actions.map((descriptor) => [
        descriptor.action_id,
        async () => {
          await runCanonicalWorkspaceAction(descriptor, target)
          return { kind: "terminal" as const }
        },
      ])) as unknown as Parameters<typeof createWorkspaceActionRegistry>[1]
      const registry = createWorkspaceActionRegistry(actions, callbacks, {
        confirm: (descriptor) => confirmCanonicalWorkspaceAction(descriptor, target),
      })
      setWorkspaceActions(actions)
      setWorkspaceActionRegistry(registry)
      setWorkspaceActionInventoryState("ready")
    } catch {
      const activeTarget = workspaceActionTarget()
      if (!workspaceActionInventoryGate.isCurrent(token, target.workspaceId) || view().view !== "action-menu" || activeTarget?.workspaceId !== target.workspaceId) return
      setWorkspaceActions(undefined)
      setWorkspaceActionRegistry(undefined)
      setWorkspaceActionInventoryError("Workspace actions could not be loaded. Retry from the workspace list.")
      setWorkspaceActionInventoryState("error")
    }
  }

  async function invokeCanonicalWorkspaceAction(actionId: WebWorkspaceActionId): Promise<void> {
    const registry = workspaceActionRegistry()
    if (!registry) return
    const result = await registry.invoke(actionId, "menu")
    if (result.status === "unavailable") setRefreshFlash(result.reason)
  }

  function syncTrackedOperation(tracker: OperationTracker<WebOperationMutation>): void {
    setOperationTracker(tracker)
    setOperationState({ ...tracker.state() })
    setOperationCards([...tracker.cards()])
    setOperationOverflow(tracker.overflowCount())
  }

  async function startTrackedWorkspaceOperation(
    actionId: Exclude<WebWorkspaceActionId, "operation.cancel">,
    entry: WorkspaceEntry,
  ): Promise<void> {
    const revision = core.state()?.revision
    if (!revision) return
    const context = { actionId, workspaceId: entry.workspaceId, workspaceName: entry.workspace.name }
    const mutation: WebOperationMutation = {
      kind: actionId as Extract<WebOperationMutation, { kind: string }>["kind"],
      request: { workspace_id: entry.workspaceId, expected_revision: revision },
    } as WebOperationMutation
    const summarize = async (operation: WebOperation) => {
      let cancellable = false
      try {
        const inventory = await officialService.fetchWorkspaceActionInventory({
          workspace_id: entry.workspaceId,
          expected_revision: core.state()?.revision ?? revision,
        })
        cancellable = inventory.some((candidate) => candidate.action_id === "operation.cancel"
          && candidate.subject.kind === "operation"
          && candidate.subject.operation_id === operation.operation_id
          && candidate.availability.available)
      } catch {
        // Cancellation is fail-closed until the authoritative inventory says otherwise.
      }
      return operationSummary(operation, context, cancellable)
    }
    const tracker = createOperationTracker<WebOperationMutation>({
      submit: async (intent) => summarize(await officialService.submitWebOperation(intent)),
      get: async (operationId) => summarize(await officialService.fetchWebOperation(operationId)),
      cancel: (operationId) => officialService.cancelWebOperation(operationId),
      refresh: async () => { await core.refresh(); await refreshSignals() },
      reconcile: () => { setSelected(new Set<string>()) },
    })
    setView({ view: "workspace-operation" })
    syncTrackedOperation(tracker)
    try {
      await tracker.submit(mutation)
      syncTrackedOperation(tracker)
      while (tracker.state().phase === "observing" || tracker.state().phase === "reconnecting") {
        await new Promise<void>((resolve) => setTimeout(resolve, 250))
        await tracker.reconnect()
        syncTrackedOperation(tracker)
      }
    } catch {
      syncTrackedOperation(tracker)
    }
  }

  async function waitForWebOperation(operation: WebOperation): Promise<WebOperation> {
    let current = operation
    while (current.state === "accepted" || current.state === "running") {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
      current = await officialService.fetchWebOperation(current.operation_id)
    }
    if (current.state !== "succeeded") throw new Error(current.error?.message ?? "Workspace operation failed.")
    return current
  }

  async function observeReviewedWorkspaceCreate(operationId: string, workspaceName: string): Promise<void> {
    setCreateRows([{ repo: "Reviewed workspace", status: "pending", detail: "Operation accepted" }])
    setCreateDone(false)
    setCreateSummary({ text: "", color: "green" })
    setView({ view: "create-progress", workspaceName })
    let operation: WebOperation | undefined
    while (!operation || operation.state === "accepted" || operation.state === "running") {
      try {
        operation = await officialService.fetchWebOperation(operationId)
        if (operation.operation_id !== operationId) throw new Error("Operation identity mismatch")
        if (operation.state === "accepted" || operation.state === "running") {
          const detail = operation.progress?.message ?? (operation.state === "accepted" ? "Waiting to start" : "Creating from reviewed source")
          setCreateRows([{ repo: "Reviewed workspace", status: "creating-worktree", detail }])
          await new Promise<void>((resolve) => setTimeout(resolve, 250))
        }
      } catch {
        operation = undefined
        setCreateRows([{ repo: "Reviewed workspace", status: "creating-worktree", detail: `Reconnecting to ${operationId}…` }])
        await new Promise<void>((resolve) => setTimeout(resolve, 250))
      }
    }

    forgeReview.observeOperation(operation)
    setCreateRows([{
      repo: "Reviewed workspace",
      status: operation.state === "succeeded" ? "done" : "failed",
      detail: operation.state === "succeeded"
        ? `Created ${operation.result?.workspace_name ?? workspaceName}`
        : operation.error?.message ?? "Reviewed workspace creation did not complete.",
    }])

    for (;;) {
      try {
        await core.refresh()
        await refreshSignals()
        break
      } catch {
        setCreateSummary({ text: "Authoritative refresh failed. Reconnecting before recovery…", color: "red" })
        await new Promise<void>((resolve) => setTimeout(resolve, 250))
      }
    }

    if (operation.state === "succeeded") {
      const createdName = operation.result?.workspace_name ?? workspaceName
      forgeReview.reconcile()
      setCreateSummary({ text: `Created ${createdName}. Press any key to continue.`, color: "green" })
      setCreateDone(true)
      return
    }

    const recovery = forgeReview.state()
    if (recovery.phase === "review" || recovery.phase === "resolve") {
      setCreateDone(true)
      setView({ view: "forge-source-review" })
      return
    }
    setCreateSummary({ text: `${operation.error?.message ?? "Reviewed workspace creation did not complete."} Press any key to continue.`, color: "red" })
    setCreateDone(true)
  }

  async function loadWorkspaceNotes(entry: WorkspaceEntry, expectedRevision = core.state()?.revision): Promise<WebNotesResponse> {
    const workspaceId = entry.workspaceId
    const token = notesResponseGate.begin(workspaceId, expectedRevision ?? "missing")
    if (notesResponse()?.workspace_id !== workspaceId) setNotesResponse(undefined)
    if (!expectedRevision || typeof officialService.fetchWorkspaceNotesProjection !== "function") {
      setNotesError("Workspace notes could not be loaded. Retry without changing stored notes.")
      throw new Error("Workspace notes transport is unavailable")
    }
    setNotesLoading(true)
    setNotesError("")
    try {
      const response = await officialService.fetchWorkspaceNotesProjection({
        workspace_id: workspaceId,
        expected_revision: expectedRevision,
      })
      const currentView = view()
      if (!notesResponseGate.isCurrent(token) || currentView.view !== "workspace-notes" || currentView.workspaceId !== workspaceId) {
        throw new Error("Workspace notes response was superseded")
      }
      if (!notesResponseGate.accepts(token, response)) {
        throw new Error("Workspace notes response did not match the requested workspace revision")
      }
      setNotesResponse(response)
      return response
    } catch (error) {
      if (notesResponseGate.isCurrent(token)) setNotesError("Workspace notes could not be loaded. Retry without changing stored notes.")
      throw error
    } finally {
      if (notesResponseGate.isCurrent(token)) setNotesLoading(false)
    }
  }

  async function mutateWorkspaceNotes(kind: "workspace.notes.add" | "workspace.notes.clear", text?: string): Promise<void> {
    const v = view()
    if (v.view !== "workspace-notes") throw new Error("Workspace notes are not open")
    const response = notesResponse()
    const revision = core.state()?.revision
    const entry = entries().find((candidate) => candidate.workspaceId === v.workspaceId)
    setNotesMutationError("")
    try {
      if (!response || !revision || !entry || notesError() || response.workspace_id !== v.workspaceId || response.revision !== revision) {
        throw new Error("Matching authoritative workspace notes and revision are required")
      }
      if (typeof officialService.submitWebOperation !== "function" || typeof officialService.fetchWebOperation !== "function") {
        throw new Error("Workspace notes transport is unavailable")
      }
      const request = kind === "workspace.notes.add"
        ? { workspace_id: v.workspaceId, expected_revision: revision, expected_notes_revision: response.notes_revision, text: text ?? "" }
        : { workspace_id: v.workspaceId, expected_revision: revision, expected_notes_revision: response.notes_revision }
      await waitForWebOperation(await officialService.submitWebOperation({ kind, request } as WebOperationMutation))
      await core.refresh()
      const authoritativeRevision = core.state()?.revision
      if (!authoritativeRevision) throw new Error("Workspace note mutation did not reconcile an authoritative revision")
      await loadWorkspaceNotes(entry, authoritativeRevision)
    } catch {
      setNotesMutationError(kind === "workspace.notes.clear"
        ? "Workspace notes were not cleared. Refresh the list before retrying."
        : "Workspace note was not added. Existing notes were preserved.")
      throw new Error("Workspace note mutation failed")
    }
  }

  async function runCanonicalWorkspaceAction(descriptor: WebWorkspaceAction, target: WorkspaceActionTarget): Promise<void> {
    const actionId = descriptor.action_id
    if (descriptor.subject.workspace_id !== target.workspaceId) return
    const entry = workspaceEntryForTarget(target)
    if (!entry) return
    if (actionId === "operation.cancel") {
      const tracker = operationTracker()
      if (tracker) { await tracker.cancel(); syncTrackedOperation(tracker) }
      return
    }
    if (actionId === "workspace.notes.list" || actionId === "workspace.notes.add" || actionId === "workspace.notes.clear") {
      const initialMode = actionId === "workspace.notes.add" ? "add" : actionId === "workspace.notes.clear" ? "clear" : "list"
      setNotesMutationError("")
      setNotesResponse(undefined)
      setView({ view: "workspace-notes", workspaceId: entry.workspaceId, workspaceName: entry.workspace.name, initialMode })
      try { await loadWorkspaceNotes(entry) } catch {}
      return
    }
    if (actionId === "workspace.files.inspect") {
      setView({ view: "workspace-files", workspaceId: entry.workspaceId, workspaceName: entry.workspace.name })
      await fileStatus.load({ workspaceId: entry.workspaceId, workspaceName: entry.workspace.name }, {
        force: true,
        revision: core.state()?.revision,
      })
      return
    }
    if (actionId === "workspace.pin" || actionId === "workspace.unpin") {
      if (!await authorizeCurrentWorkspaceAction(target, actionId)) {
        setRefreshFlash("Workspace action is no longer authorized. Refresh and try again.")
        setView({ view: "list" })
        return
      }
      const state = core.state()
      if (!state) return
      const pinned = state.workspaces
        .filter(({ definition }) => definition.pinned === true)
        .map(({ projection }) => projection.id)
      const next = actionId === "workspace.pin"
        ? [...new Set([...pinned, entry.workspaceId])]
        : pinned.filter((id) => id !== entry.workspaceId)
      await officialService.setWorkspacePins(next, state.revision)
      await reload()
      setView({ view: "list" })
      return
    }
    if (["workspace.open", "workspace.close", "workspace.sync", "workspace.pull", "workspace.push", "workspace.merge"].includes(actionId)) {
      if (!await authorizeCurrentWorkspaceAction(target, actionId)) {
        setRefreshFlash("Workspace action is no longer authorized. Refresh and try again.")
        setView({ view: "list" })
        return
      }
      await startTrackedWorkspaceOperation(actionId, entry)
      return
    }
    if (actionId === "workspace.rename") {
      setView({ view: "inline-input", index: target.originIndex, purpose: "rename", prefill: entry.workspace.name, workspaceId: target.workspaceId })
      return
    }
    if (actionId === "workspace.archive" || actionId === "workspace.remove") {
      const lifecycle = lifecycleTarget(entry)
      if (lifecycle) await executeWorkspaceLifecycle(actionId === "workspace.archive" ? "archive" : "remove", lifecycle)
    }
  }

  async function runAction(action: Action, index: number) {
    const entry = filteredEntries()[index]
    if (!entry) return
    const name = entry.workspace.name

    if (action === "rename") {
      setView({ view: "inline-input", index, purpose: "rename", prefill: name })
      return
    }

    if (action === "edit") {
      await launchEditor(name)
      return
    }

    if (action === "issue") {
      const candidates = buildIssueCandidates(entry.workspace)
      if (candidates.length === 0) return
      if (candidates.length === 1) {
        await executeIssueOpen(entry.workspace.name, candidates[0])
      } else {
        setView({ view: "issue-picker", index, candidates })
      }
      return
    }

    if (action === "commands") {
      const commands = listManualCommands(entry.workspace)
      if (commands.length === 0) return
      setView({ view: "command-picker", index, commands })
      return
    }

    if (action === "open") {
      resetCommandOutput()
      setView({ view: "progress", message: `Opening ${name}...` })
      const ok = await runWorkspaceMutation("workspace.open", name)
      finishCommandOutput(ok ? "success" : "failed")
      return
    }

    if (action === "close") {
      resetCommandOutput()
      setView({ view: "progress", message: `Closing ${name}...` })
      const ok = await runWorkspaceMutation("workspace.close", name)
      finishCommandOutput(ok ? "success" : "failed")
      return
    }

    if (action === "archive") {
      const target = lifecycleTarget(entry)
      if (target) await executeWorkspaceLifecycle("archive", target)
      return
    }

    if (action === "remove") {
      const target = lifecycleTarget(entry)
      if (target) setView({ view: "remove-confirm", target })
      return
    }

    if (action === "sync") {
      setView({ view: "confirm", index, action: "sync" })
      return
    }

    if (action === "push") {
      await executePush(name)
      return
    }

    // clean and merge need confirmation
    setView({ view: "confirm", index, action })
  }

  async function executeConfirmed(action: Action, index: number, batch?: boolean) {
    if (confirmContext() === "template") {
      const tmpl = filteredTemplates()[index]
      if (tmpl) {
        try { await runCoreMutation("template.delete", { template: tmpl.name }) } catch {}
        reloadTemplates()
      }
      setConfirmContext("workspace")
      setView({ view: "list" })
      return
    }

    const names = batch
      ? [...selected()]
      : [filteredEntries()[index]?.workspace.name].filter((name): name is string => Boolean(name))

    resetCommandOutput()
    setView({ view: "progress", message: `${action}: ${names.join(", ")}` })

    const onProgress = (msg: string) =>
      appendSystemLine(msg)

    let failures = 0
    for (const wsName of names) {
      if (!wsName) continue
      const mutation = action === "clean" || action === "remove" || action === "merge" ? `workspace.${action}` as const : undefined
      const ok = mutation ? await runWorkspaceMutation(mutation, wsName) : false
      if (!ok) {
        failures++
        if (!mutation) onProgress(`ERROR [${wsName}]: Unknown action: ${action}`)
      }
    }

    if (batch) setSelected(new Set<string>())
    if (failures > 0) {
      appendSystemLine(`${failures}/${names.length} ${action} operation${failures === 1 ? "" : "s"} failed.`)
    }
    finishCommandOutput(failures === 0 ? "success" : "failed")
  }

  async function executeSync(name: string) {
    const ws = entries().find((entry) => entry.workspace.name === name)?.workspace
    const worktreeRepos = ws?.repos.filter((repo) => repo.mode === "worktree") ?? []
    const initialRows: SyncRow[] = worktreeRepos
      .map(r => ({ repo: r.name, status: "pending" as const, detail: "", conflicts: [] }))

    setSyncRows(initialRows)
    setSyncDone(false)
    setSyncSummary({ text: "", color: "green" })
    setView({ view: "sync-progress", message: `Syncing ${name}...` })

    try {
      const operation = await runCoreMutation("workspace.sync", { workspace: name, options: { strategy: "rebase", bestEffort: true, stash: true } }, {
        onOperation: (current) => {
          if (current.state !== "running" || current.progress.data?.kind !== "sync") return
          const update = current.progress.data as SyncRow & { kind: "sync" }
          setSyncRows(prev => prev.map(row => row.repo === update.repo ? { ...row, ...update } : row))
        },
      })
      const result = operation.result ?? {}
      setSyncSummary(buildSummary({
        ok: true,
        synced: Array.isArray(result.synced) ? result.synced as SyncResult["synced"] : [],
        skipped: Array.isArray(result.skipped) ? result.skipped as SyncResult["skipped"] : [],
        stashPopFailures: Array.isArray(result.stash_pop_failures) ? result.stash_pop_failures as NonNullable<SyncResult["stashPopFailures"]> : undefined,
      }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSyncSummary({ text: `Sync failed: ${msg}. Press any key to continue.`, color: "red" })
    }
    setSyncDone(true)
  }

  async function executePush(name: string) {
    const ws = entries().find((entry) => entry.workspace.name === name)?.workspace
    const initialRows: PushRowDisplay[] = (ws?.repos ?? [])
      .map((repo) => repo.mode === "worktree"
        ? { repo: repo.name, status: "pending" as const, detail: "" }
        : { repo: repo.name, status: "skipped" as const, detail: repo.mode })

    setPushRows(initialRows)
    setPushDone(false)
    setPushSummary({ text: "", color: "green" })
    setView({ view: "push-progress", message: `Pushing ${name}...` })

    try {
      const operation = await runCoreMutation("workspace.push", { workspace: name, options: {} }, {
        onOperation: (current) => {
          if (current.state !== "running" || current.progress.data?.kind !== "push") return
          const update = current.progress.data as PushRow & { kind: "push" }
          setPushRows(prev => prev.map(row => row.repo === update.repo ? { ...row, ...update } : row))
        },
      })
      const result = operation.result ?? {}
      const pushed = Array.isArray(result.pushed) ? result.pushed : []
      const failed = Array.isArray(result.failed) ? result.failed : []
      const skipped = Array.isArray(result.skipped) ? result.skipped : []
      const parts: string[] = []
      if (pushed.length > 0) parts.push(`${pushed.length} pushed`)
      if (failed.length > 0) parts.push(`${failed.length} failed`)
      if (skipped.length > 0) parts.push(`${skipped.length} skipped`)
      setPushSummary({
        text: parts.length > 0
          ? `${parts.join(", ")}. Press any key to continue.`
          : "Nothing to push. Press any key to continue.",
        color: failed.length > 0 ? "red" : skipped.length > 0 ? "yellow" : "green",
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setPushSummary({ text: `Push failed: ${msg}. Press any key to continue.`, color: "red" })
    }
    setPushDone(true)
  }

  async function executeIssueOpen(workspaceName: string, candidate: IssueCandidate) {
    resetCommandOutput()
    setView({ view: "progress", message: `Opening ${candidate.label}...` })
    try {
      await runCoreMutation("workspace.issue.open", { workspace: workspaceName, tracker: candidate.tracker }, {
        onOperation: (operation) => {
          if (operation.state !== "running" || operation.progress.data?.kind !== "command-output") return
          const lines = Array.isArray(operation.progress.data.lines) ? operation.progress.data.lines : [operation.progress.data]
          for (const line of lines) {
            const output = line as { text?: unknown; stream?: unknown }
            appendCommandLine({ text: String(output.text ?? ""), stream: output.stream === "stderr" ? "stderr" : "stdout" })
          }
        },
      })
      appendSystemLine(`Opened ${candidate.label}.`)
      finishCommandOutput("success")
    } catch (error) {
      appendSystemLine(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
      finishCommandOutput("failed")
    }
  }

  async function executeManualCommand(workspace: Workspace, commandName: string) {
    resetCommandOutput()
    setView({ view: "progress", message: `Running command ${commandName}...` })
    try {
      await runCoreMutation("workspace.command.run", { workspace: workspace.name, command: commandName }, {
        onOperation: (operation) => {
          if (operation.state !== "running" || operation.progress.data?.kind !== "command-output") return
          const lines = Array.isArray(operation.progress.data.lines) ? operation.progress.data.lines : [operation.progress.data]
          for (const line of lines) {
            const output = line as { text?: unknown; stream?: unknown }
            appendCommandLine({ text: String(output.text ?? ""), stream: output.stream === "stderr" ? "stderr" : "stdout" })
          }
        },
      })
      appendSystemLine(`Command ${commandName} completed.`)
      finishCommandOutput("success")
    } catch (error) {
      appendSystemLine(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
      finishCommandOutput("failed")
    }
  }

  function buildIssueCandidates(workspace: Workspace | undefined): IssueCandidate[] {
    const integrations = workspace?.settings?.integrations as Record<string, unknown> | undefined
    if (!integrations) return []
    const trackers: IssueCandidate["tracker"][] = ["github", "gitlab", "gitea", "jira"]
    return trackers.flatMap((tracker) => {
      const value = integrations[tracker] as Record<string, unknown> | undefined
      const issue = value?.issue
      if (issue === undefined || issue === null || String(issue).trim() === "") return []
      const issueId = String(issue)
      return [{ tracker, issueId, label: `${issueTrackerLabels[tracker]}: ${issueId}` }]
    })
  }

  async function launchEditor(name: string) {
    const { path, validate } = await resolveEditorHandoff({ kind: "workspace", name })
    renderer.suspend()

    try {
      await openEditorHandoff(path)

      const result = validate()
      if (!result.ok) {
        // Print error and wait for user to press enter before resuming
        process.stdout.write(`\nValidation error: ${result.error}\nPress Enter to re-edit, or Ctrl+C to discard changes...`)
        // Read a line from stdin
        const buf = Buffer.alloc(256)
        const { read } = await import("fs")
        await new Promise<void>((resolve) => {
          read(0, buf, 0, 256, null, () => resolve())
        })
        // Re-edit
        await openEditorHandoff(path)
      }
    } finally {
      renderer.resume()
      reload()
    }
  }

  async function handleInlineInputConfirm(value: string) {
    const v = view() as { view: "inline-input"; index: number; purpose: string; prefill: string; workspaceId?: string }
    const trimmed = value.trim()
    if (!trimmed) { setView({ view: "list" }); return }

    if (v.purpose === "rename") {
      const entry = v.workspaceId
        ? entries().find((candidate) => candidate.workspaceId === v.workspaceId)
        : filteredEntries()[v.index]
      const oldName = entry?.workspace.name
      if (!entry || !oldName) { setView({ view: "list" }); return }
      const target: WorkspaceActionTarget = { workspaceId: entry.workspaceId, workspaceName: oldName, originIndex: v.index }
      if (!await authorizeCurrentWorkspaceAction(target, "workspace.rename")) {
        setRefreshFlash("Rename is no longer authorized. Refresh and try again.")
        setView({ view: "list" })
        return
      }
      resetCommandOutput()
      setView({ view: "progress", message: `Renaming ${oldName} → ${trimmed}...` })
      try {
        await runCoreMutation("workspace.rename", { workspace: oldName, new_name: trimmed, options: {} }, { onOperation: operationProgress })
      } catch (error) {
        appendSystemLine(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
        finishCommandOutput("failed")
        return
      }
      finishCommandOutput("success")
      await reload()
      setView({ view: "list" })
      return
    }

    if (v.purpose === "clone-template") {
      const srcName = filteredTemplates()[v.index]?.name
      if (!srcName) { setView({ view: "list" }); return }
      try { await runCoreMutation("template.clone", { template: srcName, new_name: trimmed }); await reloadTemplates() } catch {}
      setView({ view: "list" })
      return
    }

    if (v.purpose === "add-label") {
      const entry = filteredEntries()[v.index]
      if (!entry) { setView({ view: "list" }); return }
      const newLabels = trimmed
        .split(",")
        .map(label => label.trim())
        .filter(label => /^[A-Za-z0-9._:-]+$/.test(label))
      if (newLabels.length > 0) {
        const merged = [...new Set([...(entry.workspace.labels ?? []), ...newLabels])]
        await runCoreMutation("workspace.labels.set", { workspace: entry.workspace.name, labels: merged })
        await reload()
      }
      setView({ view: "list" })
      return
    }

    setView({ view: "list" })
  }

  function handleInlineInputCancel() {
    setView({ view: "list" })
  }

  async function handleRepoAction(action: "create-workspace" | "create-template" | "edit" | "remove") {
    const v = view() as { view: "repo-action-menu"; index: number }
    const repo = filteredRepos()[v.index]
    if (!repo) { setView({ view: "list" }); return }

    // Compute effective repo list: multi-selected or just focused
    const selectedIndices = reposSelected()
    let repoNames: string[]
    if (selectedIndices.size > 0) {
      repoNames = [...selectedIndices].map(i => filteredRepos()[i]?.name).filter(Boolean) as string[]
    } else {
      repoNames = [repo.name]
    }

    if (action === "create-workspace") {
      setReposSelected(new Set<number>())
      setView({ view: "wizard-create-adhoc", source: "repos", repoNames })
      return
    }

    if (action === "create-template") {
      setReposSelected(new Set<number>())
      setView({ view: "wizard-create-template", source: "repos", repoNames })
      return
    }

    if (action === "edit") {
      const { path, validate } = await resolveEditorHandoff({ kind: "registry" })
      renderer.suspend()
      try {
        await openEditorHandoff(path)
        const result = validate()
        if (!result.ok) {
          process.stdout.write(`\nValidation error: ${result.error}\n`)
        }
      } finally {
        renderer.resume()
        reloadRepos()
        setView({ view: "list" })
      }
      return
    }

    if (action === "remove") {
      // Remove operates on focused repo only (not batch)
      const refTemplates = templateEntries().filter(t => t.repos.some(r => r.repo === repo.name))
      const refWorkspaces = allWorkspaces().filter(ws => ws.repos.some(r => r.repo === repo.name))
      if (refTemplates.length > 0 || refWorkspaces.length > 0) {
        setView({ view: "repo-remove-blocked", repoName: repo.name })
      } else {
        setRepoRemoveTarget(repo.name)
        setView({ view: "confirm", index: v.index, action: "remove" })
      }
      return
    }
  }

  async function handleTemplateAction(action: "edit" | "clone" | "remove" | "create-workspace") {
    const v = view() as { view: "action-menu"; index: number }
    const template = filteredTemplates()[v.index]
    if (!template) { setView({ view: "list" }); return }
    const name = template.name

    if (action === "create-workspace") {
      setView({ view: "wizard-create", source: "template", templateIndex: v.index })
      return
    }

    if (action === "edit") {
      const { path, validate } = await resolveEditorHandoff({ kind: "template", name })
      renderer.suspend()
      try {
        await openEditorHandoff(path)
        const result = validate()
        if (!result.ok) process.stdout.write(`\nValidation error: ${result.error}\n`)
      } finally {
        renderer.resume()
        reloadTemplates()
        setView({ view: "list" })
      }
      return
    }

    if (action === "clone") {
      setView({ view: "inline-input", index: v.index, purpose: "clone-template", prefill: name + "-copy" })
      return
    }

    if (action === "remove") {
      setConfirmContext("template")
      setView({ view: "confirm", index: v.index, action: "remove" })
      return
    }
  }

  // Wizard types and helpers
  type CreateWizardData = { name: string; branch: string }
  type CreateTemplateData = { name: string }

  function buildTemplateWizardSteps(template: Template): WizardStep<CreateWizardData>[] {
    return [
      {
        kind: "text",
        label: "Workspace name",
        key: "name",
        validate: (v: string) => {
          if (!v.trim()) return "Required"
          if (entries().some((entry) => entry.workspace.name === v.trim())) return `Workspace '${v.trim()}' already exists`
          return undefined
        },
      },
      {
        kind: "text",
        label: "Branch",
        key: "branch",
        prefill: (data: Partial<CreateWizardData>) => {
          const pattern = template.repos.find(r => r.branch_pattern)?.branch_pattern
          return pattern && data.name ? expandBranchPattern(pattern, data.name) : `feature/${data.name ?? ""}`
        },
        validate: (v: string) => (v.trim() ? undefined : "Required"),
      },
      {
        kind: "confirm",
        buildMessage: (data: Partial<CreateWizardData>) => {
          const repoLines = template.repos.map(r => `  ${r.repo} (${r.mode ?? "worktree"})`).join("\n")
          return `Template: ${template.name}\nBranch: ${data.branch}\nRepos:\n${repoLines}`
        },
      },
    ]
  }

  function buildCreateTemplateSteps(repoNames: string[]): WizardStep<CreateTemplateData>[] {
    return [
      {
        kind: "text" as const,
        label: "Template name",
        key: "name" as const,
        validate: (v: string) => {
          if (!v.trim()) return "Required"
          if (templateEntries().some((template) => template.name === v.trim())) return `Template "${v.trim()}" already exists`
          return undefined
        },
      },
      {
        kind: "confirm" as const,
        buildMessage: (data: Partial<CreateTemplateData>) => {
          const repoLines = repoNames.map(n => `  ${n} (worktree)`).join("\n")
          return `Create template "${data.name}" with ${repoNames.length} repos?\n${repoLines}`
        },
      },
    ]
  }

  function buildAdhocWizardSteps(repoNames: string[]): WizardStep<CreateWizardData>[] {
    return [
      {
        kind: "text",
        label: "Workspace name",
        key: "name",
        validate: (v: string) => {
          if (!v.trim()) return "Required"
          if (entries().some((entry) => entry.workspace.name === v.trim())) return `Workspace '${v.trim()}' already exists`
          return undefined
        },
      },
      {
        kind: "text",
        label: "Branch",
        key: "branch",
        validate: (v: string) => (v.trim() ? undefined : "Required"),
      },
      {
        kind: "confirm",
        buildMessage: (data: Partial<CreateWizardData>) => {
          const repoLines = repoNames.map(n => `  ${n} (worktree)`).join("\n")
          return `Ad-hoc workspace\nBranch: ${data.branch}\nRepos:\n${repoLines}`
        },
      },
    ]
  }

  async function executeCreateTemplate(data: CreateTemplateData, repoNames: string[]) {
    const template: Template = {
      name: data.name.trim(),
      schema_version: "1",
      repos: repoNames.map(name => ({
        repo: name,
        mode: "worktree" as const,
      })),
    }
    await runCoreMutation("template.write", { template })
    reloadTemplates().then(() => {
      const idx = templateEntries().findIndex(t => t.name === data.name.trim())
      if (idx >= 0) tabCursor.templates[1](idx)
      setTab("templates")
      setView({ view: "list" })
    })
  }

  async function executeCreateWorkspace(
    data: CreateWizardData,
    template: Template | null,
    repoNames: string[] | null,
  ) {
    const wsName = data.name.trim()
    const branch = data.branch.trim()

    setCreateRows([])
    setCreateDone(false)
    setCreateSummary({ text: "", color: "green" })
    setView({ view: "create-progress", workspaceName: wsName })

    try {
      const requested = template ? template.repos.map((repo) => ({ name: repo.repo, mode: repo.mode ?? "worktree" })) : (repoNames ?? []).map((name) => ({ name, mode: "worktree" as const }))
      const initialRows: CreateRow[] = requested.map((repo) => ({
        repo: repo.name,
        status: repo.mode === "worktree" ? "pending" : "skipped",
        detail: repo.mode === "worktree" ? "" : `${repo.mode} mode`,
      }))
      setCreateRows(initialRows)
      const updateRowByRepo = (repoName: string, patch: Partial<CreateRow>) => {
        setCreateRows(prev => prev.some(row => row.repo === repoName)
          ? prev.map(row => row.repo === repoName ? { ...row, ...patch } : row)
          : [...prev, { repo: repoName, status: "pending", detail: "", ...patch }])
      }

      const CREATING_RE = /^Creating worktree for (.+)$/
      const CREATED_RE = /^created worktree for (.+)$/
      const ROLLBACK_RE = /^Rollback: create worktree (.+)$/
      const ROLLBACK_ERROR_RE = /^Rollback error: create worktree (.+?) failed \((.+)\)$/

      const handleProgress = (operation: Operation) => {
        if (operation.state !== "running" || !operation.progress.message) return
        const msg = operation.progress.message
        let m: RegExpMatchArray | null
        if ((m = msg.match(CREATING_RE))) {
          updateRowByRepo(m[1]!, { status: "creating-worktree", detail: "creating worktree..." })
          return
        }
        if ((m = msg.match(CREATED_RE))) {
          updateRowByRepo(m[1]!, { status: "done", detail: "worktree created" })
          return
        }
        if ((m = msg.match(ROLLBACK_RE))) {
          updateRowByRepo(m[1]!, { status: "failed", detail: "rolling back..." })
          return
        }
        if ((m = msg.match(ROLLBACK_ERROR_RE))) {
          updateRowByRepo(m[1]!, { status: "failed", detail: `rollback failed: ${m[2]!}` })
          return
        }
      }
      const request = template
        ? { name: wsName, branch, source: { kind: "template" as const, template: template.name } }
        : { name: wsName, branch, source: { kind: "repositories" as const, repositories: repoNames ?? [] } }
      await createWorkspaceThroughService(request, { onOperation: handleProgress })

      const rows = createRows()
      const nCreated = rows.filter(row => row.status === "done").length
      const nSkipped = rows.filter(row => row.status === "skipped").length
      const parts: string[] = []
      if (nCreated > 0) parts.push(`${nCreated} created`)
      if (nSkipped > 0) parts.push(`${nSkipped} trunk`)
      setCreateSummary({ text: `${parts.join(", ")}. Press any key to continue.`, color: "green" })
      setCreateDone(true)
    } catch (err) {
      setCreateRows(prev => prev.map(row => row.status === "pending" ? { ...row, status: "failed", detail: "aborted" } : row))
      const msg = err instanceof Error ? err.message : String(err)
      setCreateSummary({ text: `Failed: ${msg}. Press any key to continue.`, color: "red" })
      setCreateDone(true)
    }
  }

  // Main keyboard handler
  useKeyboard((key) => {
    const v = view()

    // The dedicated stale view owns every key before dashboard or overlay shortcuts.
    if (view().view === "stale-workspaces") {
      if (key.name === "escape") {
        restoreStaleWorkspaceOrigin((v as Extract<UIView, { view: "stale-workspaces" }>).origin)
        return
      }
      // Repeated canonical entry is a refocus/no-op; StaleWorkspacesView routes its remaining intents.
      if (key.name === "s" && staleWorkspaceTuiShortcut === key.name) return
      return
    }

    // Help overlay toggle — must be at very top
    if (key.name === "?" && !filtering()) {
      if (helpOpen()) { setHelpOpen(false); return }
      setHelpOpen(true)
      return
    }
    if (helpOpen()) return  // block all other keys when help is open (HelpOverlay handles its own)

    // Signal overlay handles its own keys.
    if (signalsOpen()) return

    // Handle filter mode — must be before tab switching so 1/2/3/]/[ don't fire
    if (filtering()) {
      if (key.name === "escape") {
        setFilterFocused(false)
        setFiltering(false)
        setFilter("")
        clampCursor()
        return
      }
      if (key.name === "return") {
        setFilterFocused(false)
        setFiltering(false)
        clampCursor()
        return
      }
      return // <input> handles typing, backspace, cursor movement natively
    }

    // Dialog/overlay guards — block ALL global keys (including tab switching) when a
    // dialog is active. These must come before tab switching so 1/2/3 don't leak through.

    // Progress view — any key returns to list
    if (v.view === "progress" && commandOutput().status !== "running") {
      reload()
      setView({ view: "list" })
      clampCursor()
      return
    }

    if (v.view === "progress") return

    // Sync progress — any key returns to list when done
    if (v.view === "sync-progress" && syncDone()) {
      reload()
      setView({ view: "list" })
      clampCursor()
      return
    }
    if (v.view === "sync-progress") return  // block ALL keys during sync (D-11)

    if (v.view === "push-progress" && pushDone()) {
      reload()
      setView({ view: "list" })
      clampCursor()
      return
    }
    if (v.view === "push-progress") return

    if (v.view === "workspace-operation") return
    if (v.view === "workspace-notes" || v.view === "workspace-files" || v.view === "forge-source-review") return

    if (v.view === "lifecycle-progress") return
    if (v.view === "lifecycle-failure") {
      setView({ view: "list" })
      return
    }
    if (
      v.view === "archived-workspaces"
      || v.view === "archive-undo"
      || v.view === "remove-confirm"
      || v.view === "dirty-remove-blocked"
      || v.view === "force-remove-name"
    ) return

    // Confirm dialog
    if (v.view === "confirm") return // ConfirmDialog has its own keyboard handler

    // Action menu
    if (v.view === "action-menu") return // ActionMenu has its own keyboard handler
    if (v.view === "issue-picker") return // Issue picker handles its own keys
    if (v.view === "command-picker") return // Command picker handles its own keys

    // Inline input
    if (v.view === "inline-input") return

    // Wizard views — WizardView handles its own keyboard (escape, y, input)
    if (v.view === "wizard-create" || v.view === "wizard-create-adhoc") return
    if (v.view === "wizard-create-template") return  // WizardView handles its own keys
    if (v.view === "repo-action-menu") return         // RepoActionMenu handles its own keys
    if (v.view === "repo-remove-blocked") return      // RemoveBlockedView handles Esc

    // A running create transaction owns the UI. Check this before tab shortcuts
    // so a numeric key cannot escape the progress view and launch another mutation.
    if (v.view === "create-progress" && !createDone()) return

    // Tab switching
    if (key.name === "1") { setTab("workspaces"); setView({ view: "list" }); return }
    if (key.name === "2") { setTab("templates"); setView({ view: "list" }); return }
    if (key.name === "3") { setTab("repos"); setView({ view: "list" }); return }
    if (key.name === "]") {
      setTab(t => t === "workspaces" ? "templates" : t === "templates" ? "repos" : "workspaces")
      setView({ view: "list" })
      return
    }
    if (key.name === "[") {
      setTab(t => t === "workspaces" ? "repos" : t === "repos" ? "templates" : "workspaces")
      setView({ view: "list" })
      return
    }

    // Create progress — any key returns to list when done (same pattern as sync-progress)
    if (v.view === "create-progress" && createDone()) {
      const wsName = (v as { view: "create-progress"; workspaceName: string }).workspaceName
      setTab("workspaces")
      reload().then(() => {
        const idx = entries().findIndex(e => e.workspace.name === wsName)
        if (idx >= 0) tabCursor.workspaces[1](idx)
        setView({ view: "list" })
      })
      return
    }
    if (v.view === "create-progress") return

    // List view
    if (v.view === "list") {
      const activeEntries = tab() === "workspaces" ? filteredEntries()
        : tab() === "templates" ? filteredTemplates()
        : filteredRepos()
      const len = tab() === "workspaces" && workspaceGroupingMode() !== "none"
        ? groupedNavigableEntries().length
        : activeEntries.length

      if (key.name === "q") {
        renderer.destroy()
        return
      }
      if (key.name === "escape") {
        if (helpOpen()) { setHelpOpen(false); return }
        if (filtering()) { setFiltering(false); setFilter(""); clampCursor(); return }
        if (filter()) { setFilter(""); clampCursor(); return }
        if (selected().size > 0) { setSelected(() => new Set<string>()); return }
        if (reposSelected().size > 0) { setReposSelected(() => new Set<number>()); return }
        if (templatesSelected().size > 0) { setTemplatesSelected(() => new Set<number>()); return }
        // NO-OP at top-level list — do NOT call renderer.destroy()
        return
      }

      if (
        key.name === "s"
        && staleWorkspaceTuiShortcut === key.name
        && tab() === "workspaces"
        && view().view !== "stale-workspaces"
      ) {
        enterStaleWorkspaces()
        return
      }

      if (key.name === "up" || key.name === "k") {
        setCursor((i) => Math.max(0, i - 1))
        return
      }

      if (key.name === "down" || key.name === "j") {
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      if (tab() === "workspaces" && (key.name === "pagedown" || key.name === "pageup")) {
        const direction = key.name === "pagedown" ? 1 : -1
        setDetailScrollRequest((request) => ({ sequence: request.sequence + 1, direction }))
        return
      }

      if (key.name === "return") {
        if (tab() === "repos") {
          if (len > 0) setView({ view: "repo-action-menu", index: cursor() })
          return
        }
        if (tab() === "workspaces" && workspaceGroupingMode() !== "none") {
          const item = groupedNavigableEntries()[cursor()]
          if (item) void openWorkspaceActionMenu(item.originalIndex)
          return
        }
        if (len > 0) void openWorkspaceActionMenu(cursor())
        return
      }

      if (key.name === "space" && tab() === "workspaces") {
        setSelected((prev) => {
          const next = new Set(prev)
          const workspaceName = workspaceGroupingMode() !== "none"
            ? groupedNavigableEntries()[cursor()]?.entry.workspace.name
            : filteredEntries()[cursor()]?.workspace.name
          if (!workspaceName) return next
          if (next.has(workspaceName)) next.delete(workspaceName)
          else next.add(workspaceName)
          return next
        })
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      if (key.name === "space" && tab() === "repos") {
        setReposSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor())) next.delete(cursor())
          else next.add(cursor())
          return next
        })
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      if (key.name === "space" && tab() === "templates") {
        setTemplatesSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor())) next.delete(cursor())
          else next.add(cursor())
          return next
        })
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      // Batch operations (workspaces only)
      if (tab() === "workspaces" && selected().size > 0) {
        if (key.name === "c") {
          setView({ view: "confirm", index: cursor(), action: "clean", batch: true })
          return
        }
        if (key.name === "r") {
          if (selected().size > 1) return
          const selectedName = [...selected()][0]
          const target = lifecycleTarget(entries().find((entry) => entry.workspace.name === selectedName))
          if (target) setView({ view: "remove-confirm", target })
          return
        }
      }

      // Signal overlay (workspaces tab only, not during batch selection)
      if (key.name === "m" && tab() === "workspaces" && selected().size === 0) {
        const name = currentEntry()?.workspace.name
        if (name) {
          setSignalsWorkspace(name)
          setSignalsOpen(true)
        }
        return
      }

      // Filter — defer focus so the `/` keypress doesn't leak into the input
      // If a filter is already active (indicator showing), re-enter edit mode preserving text
      if (key.name === "/") {
        setFiltering(true)
        if (!filter()) setFilter("")
        setFilterFocused(false)
        setTimeout(() => setFilterFocused(true), 0)
        return
      }

      if (key.name === "g" && tab() === "workspaces") {
        setWorkspaceGroupingMode(mode => nextWorkspaceGroupingMode(mode))
        setCursor(0)
        return
      }

      if (key.name === "u" && tab() === "workspaces" && selected().size === 0) {
        forgeReview.setUrl("")
        setView({ view: "forge-source-review" })
        return
      }

      if (key.name === "a" && tab() === "workspaces" && selected().size === 0) {
        setView({ view: "archived-workspaces", rows: [...(core.state()?.archived_workspaces ?? [])] })
        return
      }

      // Refresh
      if (key.name === "r") {
        if (tab() === "templates") { reloadTemplates(); setRefreshFlash("Refreshed templates"); setTimeout(() => setRefreshFlash(""), 1500); return }
        if (tab() === "repos") { reloadRepos(); setRefreshFlash("Refreshed repos"); setTimeout(() => setRefreshFlash(""), 1500); return }
        void reloadSignals()
        reload()
        setRefreshFlash("Refreshed")
        setTimeout(() => setRefreshFlash(""), 1500)
        return
      }
    }
  })

  return (
    <box flexDirection="column" height="100%">
      {/* Help overlay replaces EVERYTHING when open */}
      <Show when={helpOpen()}>
        <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
      </Show>

      {/* Signal overlay replaces everything when open. */}
      <Show when={!helpOpen() && signalsOpen()}>
        <SignalOverlay
          workspaceName={signalsWorkspace()}
          signals={signalMap().get(signalsWorkspace()) ?? []}
          tick={tick()}
          onClose={() => setSignalsOpen(false)}
          onDismiss={dismiss}
        />
        <box height={1}>
          <text fg="gray">  {"\u2191\u2193"}/jk Navigate  d Dismiss signal  Esc Close</text>
        </box>
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "stale-workspaces"}>
        {(() => {
          const staleView = view() as Extract<UIView, { view: "stale-workspaces" }>
          return (
            <StaleWorkspacesView
              state={staleWorkspaceState()}
              selection={staleView.selection}
              detailOffset={staleView.detailOffset}
              onSelectionChange={updateStaleWorkspaceSelection}
              onDetailPage={updateStaleWorkspaceDetail}
              onRefresh={() => loadStaleWorkspaceEvidence(true)}
              onOpen={async () => undefined}
              onActions={async () => undefined}
              onAnnounce={announceStaleWorkspace}
              onBack={() => restoreStaleWorkspaceOrigin(staleView.origin)}
            />
          )
        })()}
      </Show>

      {/* Action menus — full-screen CenteredDialog overlays */}
      <Show when={!helpOpen() && !signalsOpen() && view().view === "action-menu" && !canonicalConfirmation()}>
        <Switch>
          <Match when={tab() === "workspaces"}>
            <ActionMenu
              workspaceName={workspaceActionTarget()?.workspaceName ?? ""}
              inventoryState={workspaceActionInventoryState()}
              inventoryError={workspaceActionInventoryError() || undefined}
              descriptors={workspaceActions()}
              issueDisabledReason={issueDisabledReason()}
              commandsDisabledReason={commandsDisabledReason()}
              onAction={(action) => {
                const target = workspaceActionTarget()
                const index = target ? filteredEntries().findIndex((entry) => entry.workspaceId === target.workspaceId) : -1
                if (index >= 0) void runAction(action, index)
              }}
              onInvoke={invokeCanonicalWorkspaceAction}
              onCancel={() => setView({ view: "list" })}
              onRun={() => {
                const target = workspaceActionTarget()
                if (target) void handleRun(target.workspaceName)
              }}
            />
          </Match>
          <Match when={tab() === "templates"}>
            <TemplateActionMenu
              templateName={currentTemplate()?.name ?? ""}
              onAction={handleTemplateAction}
              onCancel={() => setView({ view: "list" })}
            />
          </Match>
        </Switch>
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && canonicalConfirmation()}>
        {(() => {
          const pending = canonicalConfirmation()!
          const entry = workspaceEntryForTarget(pending.target)
          const targetBranch = entry?.workspace.repos.find((repo) => repo.mode === "worktree")?.base_branch ?? "main"
          const label = pending.descriptor.action_id === "workspace.merge"
            ? `Merge ${pending.target.workspaceName} into ${targetBranch}?`
            : `${pending.descriptor.action_id} ${pending.target.workspaceName}?`
          const settle = (confirmed: boolean) => {
            setCanonicalConfirmation(undefined)
            pending.resolve(confirmed)
          }
          return pending.descriptor.action_id === "workspace.remove" ? (
            <WorkspaceRemovalDialog
              workspaceName={pending.target.workspaceName}
              onConfirm={() => settle(true)}
              onCancel={() => settle(false)}
            />
          ) : (
            <ConfirmDialog
              title={pending.descriptor.action_id === "workspace.merge" ? "Merge workspace" : "Confirm workspace action"}
              message={label}
              onConfirm={() => settle(true)}
              onCancel={() => settle(false)}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "command-picker"}>
        {(() => {
          const v = view() as { view: "command-picker"; index: number; commands: string[] }
          return (
            <CommandPicker
              commands={v.commands}
              onCancel={() => setView({ view: "action-menu", index: v.index })}
              onSelect={(commandName) => {
                const workspace = filteredEntries()[v.index]?.workspace
                if (workspace) void executeManualCommand(workspace, commandName)
              }}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "archived-workspaces"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "archived-workspaces" }>
          return (
            <ArchivedWorkspacesDialog
              rows={v.rows}
              onCancel={() => setView({ view: "list" })}
              onUnarchive={(row) => {
                const revision = core.state()?.revision
                if (revision) void executeWorkspaceLifecycle("unarchive", {
                  id: row.id,
                  name: row.name,
                  expectedRevision: revision,
                })
              }}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "archive-undo"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "archive-undo" }>
          return (
            <ArchivedWorkspaceUndoDialog
              target={v.target}
              onClose={() => setView({ view: "list" })}
              onUndo={() => void executeWorkspaceLifecycle("unarchive", v.target)}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "remove-confirm"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "remove-confirm" }>
          return (
            <WorkspaceRemovalDialog
              workspaceName={v.target.name}
              onCancel={() => setView({ view: "list" })}
              onConfirm={() => void executeWorkspaceLifecycle("remove", v.target)}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "dirty-remove-blocked"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "dirty-remove-blocked" }>
          return (
            <WorkspaceDirtyBlockedDialog
              workspaceName={v.target.name}
              details={v.details}
              onCancel={() => setView({ view: "list" })}
              onForce={() => setView({ view: "force-remove-name", target: v.target, details: v.details })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "force-remove-name"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "force-remove-name" }>
          return (
            <WorkspaceForceRemoveDialog
              workspaceName={v.target.name}
              details={v.details}
              onCancel={() => setView({ view: "dirty-remove-blocked", target: v.target, details: v.details })}
              onConfirm={(confirmationName) => void executeWorkspaceLifecycle("force-remove", v.target, confirmationName)}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "lifecycle-progress"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "lifecycle-progress" }>
          return (
            <CenteredDialog title={`${v.action}: ${v.target.name}`} size="medium">
              <box flexDirection="column" paddingTop={1} paddingLeft={1}>
                <text fg="cyan">  {v.message}</text>
                <text fg="gray">{"\n"}  Waiting for authoritative reconciliation...</text>
              </box>
            </CenteredDialog>
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "lifecycle-failure"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "lifecycle-failure" }>
          return (
            <CenteredDialog title={`${v.action} failed: ${v.target.name}`} size="medium">
              <box flexDirection="column" paddingTop={1} paddingLeft={1}>
                <text fg="red">  {v.message}</text>
                <text fg="gray">{"\n"}  Press any key to continue.</text>
              </box>
            </CenteredDialog>
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "workspace-operation"}>
        <WorkspaceOperationView
          state={operationState()}
          operations={operationCards()}
          overflowCount={operationOverflow()}
          onCancel={async () => {
            const tracker = operationTracker()
            if (tracker) { await tracker.cancel(); syncTrackedOperation(tracker) }
          }}
          onReconnect={async () => {
            const tracker = operationTracker()
            if (tracker) { await tracker.reconnect(); syncTrackedOperation(tracker) }
          }}
          onRetryRefresh={async () => {
            const tracker = operationTracker()
            if (tracker) { await tracker.retryRefresh(); syncTrackedOperation(tracker) }
          }}
          onBack={() => setView({ view: "list" })}
        />
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "workspace-notes"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "workspace-notes" }>
          return (
            <WorkspaceNotesDialog
              workspaceName={v.workspaceName}
              response={notesResponse()}
              loading={notesLoading()}
              error={notesError() || undefined}
              mutationError={notesMutationError() || undefined}
              initialMode={v.initialMode}
              onAdd={(text) => mutateWorkspaceNotes("workspace.notes.add", text)}
              onClear={() => mutateWorkspaceNotes("workspace.notes.clear")}
              onRetry={async () => {
                const entry = entries().find((candidate) => candidate.workspaceId === v.workspaceId)
                if (entry) { try { await loadWorkspaceNotes(entry) } catch {} }
              }}
              onBack={() => setView({ view: "action-menu", index: tabCursor.workspaces[0]() })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "workspace-files"}>
        {(() => {
          const v = view() as Extract<UIView, { view: "workspace-files" }>
          const current = fileStatus.state()
          return (
            <WorkspaceFileStatusDialog
              workspaceName={v.workspaceName}
              response={current.state === "loaded" ? current.view : undefined}
              loading={current.state === "loading"}
              error={current.state === "error" ? current.message : undefined}
              onRetry={() => fileStatus.load({ workspaceId: v.workspaceId, workspaceName: v.workspaceName }, {
                force: true,
                revision: core.state()?.revision,
              })}
              onBack={() => setView({ view: "action-menu", index: tabCursor.workspaces[0]() })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "forge-source-review"}>
        <ForgeSourceReviewDialog
          coordinator={forgeReview}
          onAccepted={(operationId, workspaceName) => { void observeReviewedWorkspaceCreate(operationId, workspaceName) }}
          onBack={() => setView({ view: "list" })}
        />
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "issue-picker"}>
        {(() => {
          const v = view() as { view: "issue-picker"; index: number; candidates: IssueCandidate[] }
          return (
            <IssuePicker
              candidates={v.candidates}
              onCancel={() => setView({ view: "action-menu", index: v.index })}
              onSelect={(candidate) => {
                const workspace = filteredEntries()[v.index]?.workspace
                if (workspace) void executeIssueOpen(workspace.name, candidate)
              }}
            />
          )
        })()}
      </Show>

      {/* Repo action menu — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !signalsOpen() && view().view === "repo-action-menu"}>
        <RepoActionMenu
          repoName={currentRepo()?.name ?? ""}
          selectionCount={reposSelected().size}
          onAction={handleRepoAction}
          onCancel={() => setView({ view: "list" })}
        />
      </Show>

      {/* Confirm dialog — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !signalsOpen() && view().view === "confirm"}>
        {(() => {
          const v = view() as { view: "confirm"; index: number; action: Action; batch?: boolean }
          const repoTarget = repoRemoveTarget()
          const label = repoTarget
            ? `Remove repo "${repoTarget}" (${filteredRepos()[v.index]?.local_path})?`
            : confirmContext() === "template"
            ? `${v.action} template '${filteredTemplates()[v.index]?.name}'?`
            : v.action === "sync"
            ? `Sync '${filteredEntries()[v.index]?.workspace.name}'? (rebase from upstream)`
            : v.batch
            ? `${v.action} ${selected().size} workspace(s)?`
            : `${v.action} '${filteredEntries()[v.index]?.workspace.name}'?`
          return (
            <ConfirmDialog
              title={confirmTitle()}
              message={label}
              onConfirm={() => {
                const repoTarget = repoRemoveTarget()
                if (repoTarget) {
                  void runCoreMutation("repository.delete", { repository: repoTarget }).then(async () => {
                    await reloadRepos()
                    setRepoRemoveTarget(null)
                    setView({ view: "list" })
                    clampCursor()
                  })
                  return
                }
                if (v.action === "sync") {
                  const entry = filteredEntries()[v.index]
                  if (entry) executeSync(entry.workspace.name)
                } else {
                  executeConfirmed(v.action, v.index, v.batch)
                }
              }}
              onCancel={() => { setRepoRemoveTarget(null); setView({ view: "list" }) }}
            />
          )
        })()}
      </Show>

      {/* Inline input — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !signalsOpen() && view().view === "inline-input"}>
        <InlineInput
          label={inlineInputLabel()}
          prefill={(view() as any).prefill ?? ""}
          onConfirm={handleInlineInputConfirm}
          onCancel={handleInlineInputCancel}
        />
      </Show>

      {/* Repo remove blocked — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !signalsOpen() && view().view === "repo-remove-blocked"}>
        {(() => {
          const v = view() as { view: "repo-remove-blocked"; repoName: string }
          const refTemplates = templateEntries().filter(t => t.repos.some(r => r.repo === v.repoName))
          const refWorkspaces = allWorkspaces().filter(ws => ws.repos.some(r => r.repo === v.repoName))
          return (
            <RemoveBlockedView
              repoName={v.repoName}
              refTemplates={refTemplates.map(t => ({ name: t.name }))}
              refWorkspaces={refWorkspaces.map(ws => ({ name: ws.name }))}
              onBack={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      {/* Medium dialog overlays — progress and wizard views */}
      <Show when={!helpOpen() && !signalsOpen() && view().view === "progress"}>
        <ProgressView
          title={(view() as any).message}
          output={commandOutput()}
        />
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "sync-progress"}>
        <SyncProgressView
          rows={syncRows()}
          done={syncDone()}
          summary={syncSummary()}
          title={(view() as any).message}
        />
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "push-progress"}>
        <PushProgressView
          rows={pushRows()}
          done={pushDone()}
          summary={pushSummary()}
          title={(view() as any).message}
        />
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "wizard-create"}>
        {(() => {
          const v = view() as { view: "wizard-create"; templateIndex: number }
          const template = filteredTemplates()[v.templateIndex]
          if (!template) return null
          const steps = buildTemplateWizardSteps(template)
          return (
            <WizardView
              title="Create Workspace"
              steps={steps}
              onComplete={(data) => executeCreateWorkspace(data as CreateWizardData, template, null)}
              onCancel={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "wizard-create-adhoc"}>
        {(() => {
          const v = view() as { view: "wizard-create-adhoc"; repoNames: string[] }
          const steps = buildAdhocWizardSteps(v.repoNames)
          return (
            <WizardView
              title="Create Workspace"
              steps={steps}
              onComplete={(data) => executeCreateWorkspace(data as CreateWizardData, null, v.repoNames)}
              onCancel={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "wizard-create-template"}>
        {(() => {
          const v = view() as { view: "wizard-create-template"; repoNames: string[] }
          const steps = buildCreateTemplateSteps(v.repoNames)
          return (
            <WizardView
              title="Create Template"
              steps={steps}
              onComplete={(data) => executeCreateTemplate(data as CreateTemplateData, v.repoNames)}
              onCancel={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !signalsOpen() && view().view === "create-progress"}>
        <CreateProgressView
          rows={createRows()}
          done={createDone()}
          summary={createSummary()}
          title={"Creating " + (view() as any).workspaceName + "..."}
        />
      </Show>

      <Show when={
        view().view !== "archived-workspaces"
        && view().view !== "stale-workspaces"
      }>
      {/* Split pane — hidden while dedicated full-screen archive or stale-workspace surfaces are open */}
        {/* TOP BOX: list pane with tab title in border */}
        <box border title={tabTitle()} flexDirection="column" height={listPaneHeight()} minHeight={6}>
          <Show when={core.error()}>
            {(message) => <text fg="red">{`  Service unavailable: ${message()}\n  Press r to retry.`}</text>}
          </Show>
          <Show when={!core.error()}>
          <Show when={core.state()} fallback={<text fg="gray">  Loading workspace state...</text>}>
          <Switch>
            <Match when={tab() === "workspaces"}>
              <WorkspaceList
                entries={filteredEntries()}
                grouped={groupedEntries()}
                isGrouped={workspaceGroupingMode() !== "none"}
                cursor={cursor()}
                selected={selected()}
                filter={filtering() ? filter() : ""}
                height={listHeight()}
                allSignals={signalMap()}
                tick={tick()}
              />
            </Match>
            <Match when={tab() === "templates"}>
              <TemplateList
                entries={filteredTemplates()}
                cursor={tabCursor.templates[0]()}
                filter={tabFiltering.templates[0]() ? tabFilter.templates[0]() : ""}
                height={listHeight()}
                selected={templatesSelected()}
              />
            </Match>
            <Match when={tab() === "repos"}>
              <RepoList
                entries={filteredRepos()}
                cursor={tabCursor.repos[0]()}
                filter={tabFiltering.repos[0]() ? tabFilter.repos[0]() : ""}
                height={listHeight()}
                selected={reposSelected()}
              />
            </Match>
          </Switch>
          </Show>
          </Show>
          {/* Batch bar anchored to bottom of list box */}
          <Show when={view().view === "list" && tab() === "workspaces" && selected().size > 0}>
            <box flexGrow={1} />
            <BatchBar
              count={selected().size}
              actions={selected().size > 1 ? "[c] Clean All  Remove one workspace at a time" : undefined}
            />
          </Show>
          <Show when={view().view === "list" && tab() === "templates" && templatesSelected().size > 0}>
            <box flexGrow={1} />
            <BatchBar count={templatesSelected().size} actions="[Enter] Actions" />
          </Show>
          <Show when={view().view === "list" && tab() === "repos" && reposSelected().size > 0}>
            <box flexGrow={1} />
            <BatchBar count={reposSelected().size} actions="[Enter] Actions" />
          </Show>
        </box>

        {/* BOTTOM BOX: detail pane for list view only */}
        <box border title={detailBoxTitle()} flexDirection="column" flexGrow={1} minHeight={10}>
          {/* Tab-specific detail — always visible (dialogs overlay via absolute positioning) */}
          <Switch>
              <Match when={tab() === "workspaces"}>
                <WorkspaceDetail
                  entry={currentEntry()}
                  signals={currentEntry() ? (signalMap().get(currentEntry()!.workspace.name) ?? []) : []}
                  tick={tick()}
                  fileStatus={fileStatus.state()}
                  notes={selectedNotesResponse()}
                  scrollRequest={detailScrollRequest()}
                  config={core.state()?.config ?? { workspace_root: "", integrations: {}, ports: { range_start: 10000, range_end: 65000 } }}
                  templates={templateEntries()}
                />
              </Match>
              <Match when={tab() === "templates"}>
                <TemplateDetail
                  template={currentTemplate()}
                  config={core.state()?.config ?? { workspace_root: "", integrations: {}, ports: { range_start: 10000, range_end: 65000 } }}
                />
              </Match>
              <Match when={tab() === "repos"}>
                <RepoDetail
                  entry={currentRepo()}
                  allTemplates={templateEntries()}
                  allWorkspaces={allWorkspaces()}
                />
              </Match>
            </Switch>
        </box>

        {/* HELP BAR / FILTER LINE — single box, no DOM swapping, no height toggling */}
        <box height={1} flexDirection="row" paddingLeft={1}>
          <text fg="cyan">{filtering() || filter() ? "filter: " : ""}</text>
          <input
            focused={filterFocused()}
            value={filter()}
            flexGrow={filtering() ? 1 : 0}
            width={filtering() ? undefined : 0}
            onInput={(v) => { setFilter(typeof v === "string" ? v : ""); clampCursor() }}
          />
          <text fg={!filtering() && core.error() ? "red" : !filtering() && filter() ? "cyan" : !filtering() && refreshFlash() ? "green" : "gray"}>
            {filtering() ? "" : core.error() ? `Service error: ${core.error()}` : filter() ? `"${filter()}" ` : refreshFlash() ? refreshFlash() : loading() ? "(loading statuses...)" : helpBarText()}
          </text>
          <text fg="gray">{!filtering() && filter() ? " / edit · esc clear" : ""}</text>
          <box flexGrow={filtering() ? 0 : 1} />
        </box>
      </Show>

    </box>
  )
}
