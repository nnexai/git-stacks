import {
  createStaleWorkspaceLoadCoordinator,
  matchScopedShortcutEvent,
  presentStaleWorkspaceResponse,
  staleWorkspaceIncompleteActionsExplanation,
  type PresentedStaleWorkspaceRow,
} from "@git-stacks/client"
import type {
  WebStaleWorkspaceResponse,
  WebWorkspaceAction,
  WebWorkspaceActionId,
} from "@git-stacks/protocol"

import type { OverlayView } from "./overlay-controller"

const COPY = Object.freeze({
  intro: "Review confirmed reasons before opening, archiving, or removing a workspace. Nothing is changed automatically.",
  refresh: "Refresh evidence",
  refreshing: "Refreshing stale workspace evidence…",
  initialLoading: "Loading stale workspace evidence…",
  candidateSection: "Cleanup candidates",
  incompleteSection: "Evaluation incomplete",
  emptyHeading: "No stale workspaces",
  emptyBody: "No workspace currently has a confirmed stale reason. Refresh evidence to check again.",
  incompleteOnly: "No confirmed stale workspaces. Some workspaces could not be fully evaluated.",
  firstLoadError: "Stale workspace evidence could not be loaded. Existing workspace state was not changed. Retry refresh.",
  retainedError: "Stale evidence could not be refreshed. Showing results checked",
  revisionRecovery: "Workspace state changed. Reloading current workspaces before checking again…",
  open: "Open workspace",
  actions: "Workspace actions",
  confirmed: "Confirmed reasons",
  unknown: "Unknown evidence",
  cautions: "Cautions",
  cautionExplanation: "Cautions do not determine whether this workspace is stale.",
  incompleteRecovery: "Resolve provider access or service availability, then refresh evidence.",
  inventoryLoading: "Loading workspace actions…",
  inventoryError: "Workspace actions could not be loaded. Refresh workspace state and try again.",
})

type StaleUiState =
  | { phase: "initial-loading"; message: string }
  | { phase: "loaded"; response: WebStaleWorkspaceResponse; message?: string }
  | { phase: "refreshing"; response: WebStaleWorkspaceResponse; message: string }
  | { phase: "first-load-error"; message: string }
  | { phase: "retained-error"; response: WebStaleWorkspaceResponse; message: string }
  | { phase: "revision-recovery"; response?: WebStaleWorkspaceResponse; message: string }
  | { phase: "open-pending"; response: WebStaleWorkspaceResponse; workspaceId: string; message: string }
  | { phase: "open-error"; response: WebStaleWorkspaceResponse; workspaceId: string; message: string }
  | { phase: "inventory-pending"; response: WebStaleWorkspaceResponse; workspaceId: string; message: string }
  | { phase: "inventory-error"; response: WebStaleWorkspaceResponse; workspaceId: string; message: string }

type ActionMenuState = {
  status: "ready" | "denied" | "error"
  descriptors: readonly WebWorkspaceAction[]
  message?: string
}

type CanonicalInvocation = {
  descriptor: WebWorkspaceAction
  expected_revision: string
}

export type WebStaleWorkspaceControllerOptions = {
  expectedRevision(): string
  fetchEvaluation(request: {
    expected_revision: string
    force_refresh: boolean
    signal?: AbortSignal
  }): Promise<WebStaleWorkspaceResponse>
  reloadAuthoritative(): Promise<string>
  fetchActionInventory(request: {
    workspace_id: string
    expected_revision: string
  }): Promise<readonly WebWorkspaceAction[]>
  invokeCanonicalAction(invocation: CanonicalInvocation): Promise<unknown>
  reconcileAuthoritative(): Promise<string>
  onOpenSucceeded(result: unknown): void
}

export type WebStaleWorkspaceController = {
  state(): StaleUiState
  subscribe(listener: (state: StaleUiState) => void): () => void
  open(): Promise<void>
  refresh(): Promise<void>
  close(): void
  openWorkspace(workspaceId: string): Promise<unknown>
  loadActions(workspaceId: string): Promise<ActionMenuState>
  invokeLifecycle(workspaceId: string, actionId: WebWorkspaceActionId): Promise<unknown>
  reconcileOperation(operationId: string): Promise<void>
}

function responseFromState(state: StaleUiState): WebStaleWorkspaceResponse | undefined {
  return "response" in state ? state.response : undefined
}

function rowIn(response: WebStaleWorkspaceResponse | undefined, workspaceId: string) {
  if (!response) return undefined
  return [...response.candidates, ...response.incomplete].find(({ workspace_id }) => workspace_id === workspaceId)
}

function isConfirmedCandidate(response: WebStaleWorkspaceResponse | undefined, workspaceId: string): boolean {
  return Boolean(response?.candidates.some(({ workspace_id }) => workspace_id === workspaceId))
}

function fixedRetainedError(response: WebStaleWorkspaceResponse): string {
  const checked = presentStaleWorkspaceResponse(response).checkedAt.relative
  return `${COPY.retainedError} ${checked || "previously"}.`
}

export function createWebStaleWorkspaceController(
  options: WebStaleWorkspaceControllerOptions,
): WebStaleWorkspaceController {
  let current: StaleUiState = { phase: "initial-loading", message: COPY.initialLoading }
  let retained: WebStaleWorkspaceResponse | undefined
  let openPromise: Promise<unknown> | undefined
  let openWorkspaceId: string | undefined
  let refreshPromise: Promise<void> | undefined
  let inventoryPromise: Promise<ActionMenuState> | undefined
  let inventoryWorkspaceId: string | undefined
  let cachedInventory: { workspaceId: string; revision: string; descriptors: readonly WebWorkspaceAction[] } | undefined
  const listeners = new Set<(state: StaleUiState) => void>()

  const publish = (next: StaleUiState) => {
    current = next
    for (const listener of listeners) listener(current)
  }

  let lastFetchedResponse: WebStaleWorkspaceResponse | undefined
  const coordinator = createStaleWorkspaceLoadCoordinator({
    fetch: async (request) => {
      const response = await options.fetchEvaluation(request)
      lastFetchedResponse = response
      return response
    },
    reloadAuthoritative: async () => {
      publish({
        phase: "revision-recovery",
        ...(retained ? { response: retained } : {}),
        message: COPY.revisionRecovery,
      })
      return options.reloadAuthoritative()
    },
  })

  const load = async (forceRefresh: boolean): Promise<void> => {
    const result = await coordinator.load({
      expectedRevision: options.expectedRevision(),
      forceRefresh,
    })
    if (result.status === "ignored") {
      if (result.reason !== "revision-mismatch" || !lastFetchedResponse) return
      const authoritativeRevision = await options.reloadAuthoritative()
      if (lastFetchedResponse.revision !== authoritativeRevision) return
      retained = lastFetchedResponse
      cachedInventory = undefined
      publish({ phase: "loaded", response: lastFetchedResponse })
      return
    }
    if (result.status === "accepted") {
      retained = result.response
      cachedInventory = undefined
      publish({ phase: "loaded", response: result.response })
      return
    }
    publish(retained
      ? { phase: "retained-error", response: retained, message: fixedRetainedError(retained) }
      : { phase: "first-load-error", message: COPY.firstLoadError })
  }

  const refresh = (): Promise<void> => {
    if (refreshPromise) return refreshPromise
    publish(retained
      ? { phase: "refreshing", response: retained, message: COPY.refreshing }
      : { phase: "initial-loading", message: COPY.initialLoading })
    refreshPromise = load(true).finally(() => { refreshPromise = undefined })
    return refreshPromise
  }

  const fetchInventory = async (workspaceId: string, showPending: boolean): Promise<ActionMenuState> => {
    const response = retained
    if (!isConfirmedCandidate(response, workspaceId)) {
      return { status: "denied", descriptors: [], message: staleWorkspaceIncompleteActionsExplanation() }
    }
    const revision = options.expectedRevision()
    if (cachedInventory?.workspaceId === workspaceId && cachedInventory.revision === revision) {
      return { status: "ready", descriptors: cachedInventory.descriptors }
    }
    if (inventoryPromise && inventoryWorkspaceId === workspaceId) return inventoryPromise
    if (showPending && response) {
      publish({ phase: "inventory-pending", response, workspaceId, message: COPY.inventoryLoading })
    }
    inventoryWorkspaceId = workspaceId
    inventoryPromise = options.fetchActionInventory({ workspace_id: workspaceId, expected_revision: revision })
      .then((descriptors) => {
        const exact = descriptors.filter(({ subject }) => subject.kind === "workspace" && subject.workspace_id === workspaceId)
        cachedInventory = { workspaceId, revision, descriptors: exact }
        if (retained) publish({ phase: "loaded", response: retained })
        return { status: "ready", descriptors: exact } as ActionMenuState
      })
      .catch(() => {
        if (retained) publish({ phase: "inventory-error", response: retained, workspaceId, message: COPY.inventoryError })
        return { status: "error", descriptors: [], message: COPY.inventoryError } as ActionMenuState
      })
      .finally(() => {
        inventoryPromise = undefined
        inventoryWorkspaceId = undefined
      })
    return inventoryPromise
  }

  const invokeCanonical = (descriptor: WebWorkspaceAction) =>
    options.invokeCanonicalAction({ descriptor, expected_revision: options.expectedRevision() })

  return {
    state: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    open() {
      publish(retained
        ? { phase: "loaded", response: retained }
        : { phase: "initial-loading", message: COPY.initialLoading })
      return load(false)
    },
    refresh,
    close() {
      coordinator.invalidate()
      cachedInventory = undefined
      openPromise = undefined
      openWorkspaceId = undefined
    },
    openWorkspace(workspaceId) {
      if (openPromise && openWorkspaceId === workspaceId) return openPromise
      const response = retained
      const row = rowIn(response, workspaceId)
      if (!response || !row) return Promise.reject(new Error("Workspace is not present in stale evidence"))
      openWorkspaceId = workspaceId
      openPromise = (async () => {
        try {
          const inventory = await options.fetchActionInventory({
            workspace_id: workspaceId,
            expected_revision: options.expectedRevision(),
          })
          const descriptor = inventory.find(({ action_id, subject }) => action_id === "workspace.open"
            && subject.kind === "workspace" && subject.workspace_id === workspaceId)
          if (!descriptor || !descriptor.availability.available) throw new Error("Open workspace is unavailable")
          publish({ phase: "open-pending", response, workspaceId, message: `Opening ${row.workspace_name}…` })
          const result = await invokeCanonical(descriptor)
          options.onOpenSucceeded(result)
          publish({ phase: "loaded", response })
          return result
        } catch {
          publish({
            phase: "open-error",
            response,
            workspaceId,
            message: `Could not open ${row.workspace_name}. The stale view was not changed. Refresh workspace state and try again.`,
          })
          return undefined
        } finally {
          openPromise = undefined
          openWorkspaceId = undefined
        }
      })()
      return openPromise
    },
    loadActions(workspaceId) {
      return fetchInventory(workspaceId, true)
    },
    async invokeLifecycle(workspaceId, actionId) {
      const inventory = await fetchInventory(workspaceId, false)
      const descriptor = inventory.descriptors.find((candidate) => candidate.action_id === actionId)
      if (!descriptor || !descriptor.availability.available) return undefined
      const result = await invokeCanonical(descriptor)
      if (actionId === "workspace.remove"
        && typeof result === "object" && result !== null
        && (result as { kind?: unknown }).kind === "workspace_dirty"
        && (result as { terminals_stopped?: unknown }).terminals_stopped === true
        && (result as { force_allowed?: unknown }).force_allowed === true) {
        cachedInventory = undefined
        await fetchInventory(workspaceId, false)
      }
      return result
    },
    async reconcileOperation(_operationId) {
      const revision = await options.reconcileAuthoritative()
      cachedInventory = undefined
      const result = await coordinator.load({ expectedRevision: revision, forceRefresh: true })
      if (result.status === "accepted") {
        retained = result.response
        publish({ phase: "loaded", response: result.response })
      } else if (result.status === "failed") {
        publish(retained
          ? { phase: "retained-error", response: retained, message: fixedRetainedError(retained) }
          : { phase: "first-load-error", message: COPY.firstLoadError })
      }
    },
  }
}

function node<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag)
  if (className) result.className = className
  if (text !== undefined) result.textContent = text
  return result
}

function control(document: Document, label: string, className = "button"): HTMLButtonElement {
  const result = node(document, "button", className, label)
  result.type = "button"
  return result
}

function appendTime(container: HTMLElement, label: string, time: { iso: string; relative: string; exactUtc: string }): void {
  const value = node(container.ownerDocument, "time", "stale-time", `${label} ${time.relative} · ${time.exactUtc}`)
  value.dateTime = time.iso
  value.setAttribute("datetime", time.iso)
  container.append(value)
}

function evidenceGroup(
  document: Document,
  heading: string,
  className: string,
  rows: PresentedStaleWorkspaceRow["confirmedReasons"],
): HTMLElement | undefined {
  if (!rows.length) return undefined
  const section = node(document, "section", `stale-evidence ${className}`)
  section.append(node(document, "h4", "stale-evidence-heading", heading))
  const list = node(document, "ul", "stale-evidence-list")
  for (const evidence of rows) {
    const item = node(document, "li", "stale-evidence-row")
    item.append(node(document, "span", "stale-evidence-label", evidence.label))
    if (evidence.time) appendTime(item, evidence.code === "inactive" ? "Last activity" : evidence.code === "merged" ? "Merged" : evidence.code === "closed" ? "Closed" : "Confirmed missing", evidence.time)
    list.append(item)
  }
  section.append(list)
  return section
}

export type MountedWebStaleWorkspaceOverlay = {
  ready: Promise<void>
  idle(): Promise<void>
  render(): void
  handleScopedKey(event: KeyboardEvent): boolean
}

export function mountWebStaleWorkspaceOverlay(
  view: OverlayView,
  controller: WebStaleWorkspaceController,
  options: { now?: () => number } = {},
): MountedWebStaleWorkspaceOverlay {
  const document = view.body.ownerDocument
  view.body.classList.add("stale-body")
  view.body.parentElement?.classList.add("stale-modal")
  let pending: Promise<void> = Promise.resolve()

  const runRefresh = () => {
    pending = controller.refresh()
    return pending
  }

  const renderRow = (row: PresentedStaleWorkspaceRow, incomplete: boolean): HTMLElement => {
    const article = node(document, "article", `stale-card${incomplete ? " incomplete" : " candidate"}`)
    article.setAttribute(incomplete ? "data-stale-incomplete" : "data-stale-candidate", "")
    article.setAttribute("data-workspace-id", row.workspaceId)
    article.title = row.workspaceName
    article.setAttribute("aria-label", row.workspaceName)
    const heading = node(document, "div", "stale-card-heading")
    heading.append(node(document, "strong", "stale-workspace-name", row.workspaceName))
    if (!incomplete) heading.append(node(document, "span", "stale-reason-count", `${row.confirmedReasons.length} confirmed ${row.confirmedReasons.length === 1 ? "reason" : "reasons"}`))
    article.append(heading)
    if (row.activity) appendTime(article, "Last activity", row.activity)
    for (const group of [
      evidenceGroup(document, COPY.confirmed, "confirmed", row.confirmedReasons),
      evidenceGroup(document, COPY.unknown, "unknown", row.unknownEvidence),
      evidenceGroup(document, COPY.cautions, "cautions", row.cautions),
    ]) if (group) article.append(group)
    if (row.cautions.length) article.append(node(document, "p", "stale-caution-explanation", COPY.cautionExplanation))
    if (incomplete) article.append(
      node(document, "p", "stale-recovery", COPY.incompleteRecovery),
      node(document, "p", "stale-disabled-explanation", staleWorkspaceIncompleteActionsExplanation()),
    )
    const actions = node(document, "div", "stale-card-actions")
    const open = control(document, COPY.open, "button stale-open")
    open.setAttribute("data-stale-open", row.workspaceId)
    open.addEventListener("click", () => { pending = controller.openWorkspace(row.workspaceId).then(() => undefined) })
    actions.append(open)
    if (!incomplete) {
      const action = control(document, COPY.actions, "button stale-actions")
      action.addEventListener("click", () => { pending = controller.loadActions(row.workspaceId).then(() => undefined) })
      actions.append(action)
    }
    article.append(actions)
    return article
  }

  const render = () => {
    const state = controller.state()
    const busy = state.phase === "initial-loading" || state.phase === "refreshing" || state.phase === "revision-recovery"
    view.body.setAttribute("aria-busy", String(busy))
    view.body.replaceChildren()
    const intro = node(document, "p", "stale-intro", COPY.intro)
    const toolbar = node(document, "div", "stale-toolbar")
    const status = node(document, "div", "stale-summary")
    status.setAttribute("aria-live", "polite")
    const refresh = control(document, busy ? "Refreshing…" : COPY.refresh, "button primary stale-refresh")
    refresh.setAttribute("data-stale-refresh", "")
    refresh.disabled = busy
    refresh.addEventListener("click", () => { void runRefresh() })
    const response = responseFromState(state)
    if (response) {
      const presentation = presentStaleWorkspaceResponse(response, { now: options.now?.() })
      status.append(
        node(document, "span", "stale-count", presentation.candidateCountLabel),
        node(document, "span", "stale-count", presentation.incompleteCountLabel),
      )
      appendTime(status, "Evidence checked", presentation.checkedAt)
    }
    toolbar.append(status, refresh)
    view.body.append(intro, toolbar)

    if (state.phase === "initial-loading" || state.phase === "revision-recovery") {
      view.body.append(node(document, "div", "stale-status stale-reserved", state.message))
    } else if (state.phase === "first-load-error") {
      const error = node(document, "div", "stale-error", state.message)
      error.setAttribute("role", "alert")
      const retry = control(document, "Retry refresh", "button primary")
      retry.addEventListener("click", () => { void runRefresh() })
      view.body.append(error, retry)
    }

    if (response) {
      if (state.phase === "refreshing" || state.phase === "retained-error") {
        const message = node(document, state.phase === "retained-error" ? "div" : "p", state.phase === "retained-error" ? "stale-error retained" : "stale-status", state.message)
        if (state.phase === "retained-error") message.setAttribute("role", "alert")
        view.body.append(message)
        if (state.phase === "retained-error") {
          const retry = control(document, "Retry refresh", "button")
          retry.addEventListener("click", () => { void runRefresh() })
          view.body.append(retry)
        }
      }
      const presentation = presentStaleWorkspaceResponse(response, { now: options.now?.() })
      const content = node(document, "div", "stale-content")
      if (!presentation.candidates.length && !presentation.incomplete.length) {
        const empty = node(document, "section", "stale-empty")
        empty.append(node(document, "strong", "", COPY.emptyHeading), node(document, "p", "", COPY.emptyBody))
        content.append(empty)
      } else {
        if (!presentation.candidates.length && presentation.incomplete.length) content.append(node(document, "p", "stale-incomplete-only", COPY.incompleteOnly))
        if (presentation.candidates.length) {
          const section = node(document, "section", "stale-section candidates")
          section.append(node(document, "h3", "stale-section-heading", COPY.candidateSection))
          const list = node(document, "div", "stale-list")
          list.setAttribute("role", "list")
          for (const row of presentation.candidates) {
            const item = renderRow(row, false)
            item.setAttribute("role", "listitem")
            list.append(item)
          }
          section.append(list)
          content.append(section)
        }
        if (presentation.incomplete.length) {
          const section = node(document, "section", "stale-section incomplete")
          section.append(node(document, "h3", "stale-section-heading", COPY.incompleteSection))
          const list = node(document, "div", "stale-list compact")
          list.setAttribute("role", "list")
          for (const row of presentation.incomplete) {
            const item = renderRow(row, true)
            item.setAttribute("role", "listitem")
            list.append(item)
          }
          section.append(list)
          content.append(section)
        }
      }
      if (state.phase === "open-pending" || state.phase === "open-error" || state.phase === "inventory-pending" || state.phase === "inventory-error") {
        const message = node(document, "div", state.phase.endsWith("error") ? "stale-error inline" : "stale-status inline", state.message)
        if (state.phase.endsWith("error")) message.setAttribute("role", "alert")
        content.append(message)
        const affected = content.querySelector<HTMLButtonElement>(`[data-stale-open='${state.workspaceId}']`)
        if (affected) affected.disabled = state.phase === "open-pending"
      }
      view.body.append(content)
    }
    view.setPrimaryFocus(() => refresh.disabled
      ? view.body.parentElement?.querySelector<HTMLButtonElement>(".modal-head button")?.focus()
      : refresh.focus())
  }

  const handleScopedKey = (event: KeyboardEvent): boolean => {
    const target = event.target as HTMLElement | null
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return false
    if (target?.getAttribute?.("contenteditable") === "true") return false
    const match = matchScopedShortcutEvent(event, "stale-view")
    if (!match.handled || controller.state().phase === "refreshing") return false
    event.preventDefault()
    event.stopPropagation()
    void runRefresh()
    return true
  }

  controller.subscribe(render)
  const ready = controller.open().finally(() => {
    render()
    view.body.querySelector<HTMLButtonElement>("[data-stale-refresh]")?.focus()
  })
  pending = ready
  render()
  return {
    ready,
    idle: async () => pending,
    render,
    handleScopedKey,
  }
}
