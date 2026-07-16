import {
  WEB_SHORTCUT_ACTION_METADATA,
  matchShortcutEvent,
  validateShortcutSettings,
  type ShortcutCategory,
  type ShortcutKeyEvent,
} from "@git-stacks/client"
import {
  WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE,
  WEB_SHORTCUT_STALE_REVISION_ERROR_CODE,
  WEB_NOTE_LIMITS,
  WebShortcutErrorDetailsSchema,
  type WebShortcutActionId,
  type WebShortcutEffectiveBinding,
  type WebShortcutMutation,
  type WebShortcutSettings,
  type WebWorkspaceActionId,
} from "@git-stacks/protocol"

export type WorkspaceNoteDraftValidation =
  | { valid: true; text: string }
  | { valid: false; message: string }

type ScopeMenuOverlayFocusTarget = {
  kind: "scope-menu"
  actionId: WebWorkspaceActionId
  item: HTMLButtonElement
  menu: HTMLElement
  toggle: HTMLButtonElement
  visibleOrigin?(): HTMLElement | undefined
}

type ElementOverlayFocusTarget = {
  kind: "element"
  element: HTMLElement
  resolve?(): HTMLElement | undefined
}

type OverlayFocusTarget = ScopeMenuOverlayFocusTarget | ElementOverlayFocusTarget
export type OverlayFocusOwnership = () => boolean

export type CoordinatedOverlayFocusReturnTarget = {
  readonly kind: "coordinated-overlay-focus"
  activate(): void
  restore(ownsFocus?: OverlayFocusOwnership): void
}

export type WebOverlayReturnTarget = string | HTMLElement | CoordinatedOverlayFocusReturnTarget

export type OverlayTerminalFocusAttempt = {
  isCurrent(): boolean
  complete(focused: boolean): void
}

export type WebOverlayFocusCoordinator = {
  invokeFromElement(invoker: HTMLElement | undefined, invoke: () => void, resolve?: () => HTMLElement | undefined): void
  invokeFromScopeMenu(target: Omit<ScopeMenuOverlayFocusTarget, "kind">, invoke: () => void): void
  takeReturnTarget(requestedTerminalId?: string): CoordinatedOverlayFocusReturnTarget
  restore(target: WebOverlayReturnTarget | undefined, ownsFocus?: OverlayFocusOwnership): void
}

type WebOverlayFocusCoordinatorOptions = {
  document: Document
  requestFrame(callback: () => void): void
  focusTerminal(terminalId: string, attempt: OverlayTerminalFocusAttempt): void
  currentTerminalId(): string | undefined
  visibleInvoker(): HTMLElement | undefined
  defer?(callback: () => void): void
}

type ScopeMenuOverlayActionOptions = Omit<ScopeMenuOverlayFocusTarget, "kind"> & {
  disabledReason?: string
  invoke(): void
  unavailable?(): void
}

function isElementReturnTarget(target: unknown): target is HTMLElement {
  return typeof target === "object"
    && target !== null
    && "ownerDocument" in target
    && typeof (target as { focus?: unknown }).focus === "function"
}

export function isCoordinatedReturnTarget(target: unknown): target is CoordinatedOverlayFocusReturnTarget {
  return typeof target === "object"
    && target !== null
    && (target as { kind?: unknown }).kind === "coordinated-overlay-focus"
    && typeof (target as { activate?: unknown }).activate === "function"
    && typeof (target as { restore?: unknown }).restore === "function"
}

export function setMenuExpanded(menu: HTMLElement, toggle: HTMLElement, expanded: boolean): void {
  if (menu.isConnected) menu.hidden = !expanded
  if (toggle.isConnected) toggle.setAttribute("aria-expanded", String(expanded))
}

export function findWorkspaceRow(root: ParentNode, workspaceId: string, repositoryId: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>("[data-workspace-id]")].find((candidate) =>
    candidate.getAttribute("data-workspace-id") === workspaceId
      && candidate.getAttribute("data-repository-id") === repositoryId
      && isUsableOverlayReturnTarget(candidate),
  )
}

export function isUsableOverlayReturnTarget(target: HTMLElement): boolean {
  if (!target.isConnected) return false
  const view = target.ownerDocument.defaultView
  for (let current: HTMLElement | null = target; current; current = current.parentElement) {
    const stateful = current as HTMLElement & { disabled?: boolean; inert?: boolean }
    if (current.hidden
      || current.hasAttribute("hidden")
      || stateful.disabled
      || current.hasAttribute("disabled")
      || current.getAttribute("aria-disabled") === "true"
      || stateful.inert
      || current.hasAttribute("inert")
      || current.getAttribute("aria-hidden") === "true") return false
    try {
      const style = view?.getComputedStyle(current)
      if (style && (style.display === "none"
        || style.visibility === "hidden"
        || style.visibility === "collapse"
        || style.contentVisibility === "hidden"
        || style.opacity === "0")) return false
    } catch {
      return false
    }
  }
  return true
}

export function focusUsableOverlayReturnTarget(target: HTMLElement, document = target.ownerDocument): boolean {
  if (!isUsableOverlayReturnTarget(target)) return false
  try { target.focus() } catch { return false }
  return document.activeElement === target && isUsableOverlayReturnTarget(target)
}

export function createWebOverlayFocusCoordinator(options: WebOverlayFocusCoordinatorOptions): WebOverlayFocusCoordinator {
  let pending: { target: OverlayFocusTarget; epoch: number } | undefined
  let focusEpoch = 0
  const defer = options.defer ?? queueMicrotask
  const alwaysOwnsFocus: OverlayFocusOwnership = () => true

  const closeScopeMenu = (target: ScopeMenuOverlayFocusTarget): void => {
    setMenuExpanded(target.menu, target.toggle, false)
  }

  const scopeOrigin = (target: ScopeMenuOverlayFocusTarget): HTMLElement | undefined => {
    if (focusUsableOverlayReturnTarget(target.toggle, options.document)) return target.toggle
    const visible = target.visibleOrigin?.()
    return visible && focusUsableOverlayReturnTarget(visible, options.document) ? visible : undefined
  }

  const focusPrimary = (target: OverlayFocusTarget | undefined): boolean => {
    if (!target) return false
    if (target.kind === "element") {
      if (focusUsableOverlayReturnTarget(target.element, options.document)) return true
      const concrete = target.resolve?.()
      return Boolean(concrete && concrete !== target.element && focusUsableOverlayReturnTarget(concrete, options.document))
    }

    const canReopen = target.menu.isConnected
      && target.toggle.isConnected
      && isUsableOverlayReturnTarget(target.toggle)
    if (canReopen) {
      setMenuExpanded(target.menu, target.toggle, true)
      const concrete = target.menu.querySelector<HTMLElement>(`[data-workspace-action-id="${target.actionId}"]`)
      if (concrete && focusUsableOverlayReturnTarget(concrete, options.document)) return true
    }

    closeScopeMenu(target)
    return Boolean(scopeOrigin(target))
  }

  const scheduleRestore = (
    primary: OverlayFocusTarget | undefined,
    requestedTerminalId: string | undefined,
    epoch: number,
    ownsFocus: OverlayFocusOwnership,
  ): void => {
    const isCurrent = () => epoch === focusEpoch && ownsFocus()
    const focusFallback = () => {
      if (!isCurrent()) return
      const fallback = options.visibleInvoker()
      if (fallback) focusUsableOverlayReturnTarget(fallback, options.document)
    }
    const focusTerminal = (terminalId: string | undefined, onFailure: () => void): void => {
      if (!isCurrent()) return
      if (!terminalId) { onFailure(); return }
      let completed = false
      const complete = (focused: boolean) => {
        if (completed) return
        completed = true
        if (!isCurrent()) return
        if (focused) return
        onFailure()
      }
      try {
        options.focusTerminal(terminalId, { isCurrent, complete })
      } catch {
        complete(false)
      }
    }
    const focusCurrentTerminal = () => {
      const currentTerminalId = options.currentTerminalId()
      if (currentTerminalId === requestedTerminalId) { focusFallback(); return }
      focusTerminal(currentTerminalId, focusFallback)
    }

    options.requestFrame(() => {
      if (!isCurrent()) return
      if (focusPrimary(primary)) return
      focusTerminal(requestedTerminalId, focusCurrentTerminal)
    })
  }

  const beginInvocation = (target: OverlayFocusTarget, invoke: () => void): void => {
    const epoch = ++focusEpoch
    pending = { target, epoch }
    try {
      invoke()
    } finally {
      defer(() => {
        if (pending?.target !== target || pending.epoch !== epoch) return
        pending = undefined
        const visibleTarget: OverlayFocusTarget = target.kind === "scope-menu"
          ? { kind: "element", element: target.toggle, resolve: target.visibleOrigin }
          : target
        scheduleRestore(visibleTarget, undefined, epoch, alwaysOwnsFocus)
      })
    }
  }

  return {
    invokeFromElement(invoker, invoke, resolve) {
      if (!invoker) {
        focusEpoch += 1
        invoke()
        return
      }
      beginInvocation({ kind: "element", element: invoker, resolve }, invoke)
    },
    invokeFromScopeMenu(target, invoke) {
      setMenuExpanded(target.menu, target.toggle, false)
      beginInvocation({ kind: "scope-menu", ...target }, invoke)
    },
    takeReturnTarget(requestedTerminalId) {
      const captured = pending
      if (captured) pending = undefined
      let epoch = captured?.epoch
      let activated = false
      return {
        kind: "coordinated-overlay-focus",
        activate() {
          if (activated) return
          activated = true
          if (epoch === undefined) epoch = ++focusEpoch
        },
        restore(ownsFocus = alwaysOwnsFocus) {
          if (!activated) this.activate()
          scheduleRestore(captured?.target, requestedTerminalId, epoch!, ownsFocus)
        },
      }
    },
    restore(target, ownsFocus = alwaysOwnsFocus) {
      if (isCoordinatedReturnTarget(target)) {
        target.restore(ownsFocus)
        return
      }
      const epoch = ++focusEpoch
      scheduleRestore(
        isElementReturnTarget(target) ? { kind: "element", element: target } : undefined,
        typeof target === "string" ? target : undefined,
        epoch,
        ownsFocus,
      )
    },
  }
}

export function bindScopeMenuOverlayAction(
  coordinator: WebOverlayFocusCoordinator,
  options: ScopeMenuOverlayActionOptions,
): void {
  options.item.setAttribute("data-workspace-action-id", options.actionId)
  options.item.addEventListener("click", () => {
    if (options.disabledReason) { options.unavailable?.(); return }
    coordinator.invokeFromScopeMenu({
      actionId: options.actionId,
      item: options.item,
      menu: options.menu,
      toggle: options.toggle,
      visibleOrigin: options.visibleOrigin,
    }, options.invoke)
  })
}

export function validateWorkspaceNoteDraft(value: string): WorkspaceNoteDraftValidation {
  const text = value.trim()
  if (!text) return { valid: false, message: "Enter a workspace note." }
  if (new TextEncoder().encode(text).byteLength > WEB_NOTE_LIMITS.text_bytes) {
    return { valid: false, message: `Workspace notes must be ${WEB_NOTE_LIMITS.text_bytes} bytes or fewer.` }
  }
  return { valid: true, text }
}
import type {
  WorkspaceActionRegistry,
  WorkspaceActionRegistryEntry,
} from "@git-stacks/client"

export const WEB_WORKSPACE_ACTION_GROUPS = [
  { label: "Workspace", actions: ["workspace.open", "workspace.close", "workspace.rename", "workspace.pin", "workspace.unpin"] },
  { label: "Git", actions: ["workspace.sync", "workspace.pull", "workspace.push", "workspace.merge"] },
  { label: "Details", actions: ["workspace.notes.list", "workspace.files.inspect"] },
  { label: "Lifecycle", actions: ["workspace.archive", "workspace.unarchive", "workspace.remove", "workspace.force-remove"] },
] as const satisfies ReadonlyArray<{
  label: string
  actions: readonly WebWorkspaceActionId[]
}>

export type WorkspaceActionMenuRow = {
  actionId: WebWorkspaceActionId
  group: (typeof WEB_WORKSPACE_ACTION_GROUPS)[number]["label"]
  label: string
  destructive: boolean
  disabledReason?: string
  ariaDisabled: "true" | "false"
  tabIndex: 0
  callback: WorkspaceActionRegistryEntry["menu"]["callback"]
}

/** Renderer-neutral rows keep menu presentation tied to the shared descriptor callback. */
export function workspaceActionMenuRows(registry: WorkspaceActionRegistry): WorkspaceActionMenuRow[] {
  const rows: WorkspaceActionMenuRow[] = []
  for (const group of WEB_WORKSPACE_ACTION_GROUPS) {
    for (const actionId of group.actions) {
      const entry = registry.entry(actionId)
      if (!entry) continue
      rows.push({
        actionId,
        group: group.label,
        label: entry.label,
        destructive: actionId === "workspace.remove" || actionId === "workspace.force-remove",
        disabledReason: entry.disabledReason,
        ariaDisabled: entry.availability.available ? "false" : "true",
        tabIndex: 0,
        callback: entry.menu.callback,
      })
    }
  }
  return rows
}

export type WebActionSource = "document" | "xterm"
export type WebActionInvocation = {
  actionId: WebShortcutActionId
  kind: "execute" | "refocus"
  source: WebActionSource
}

export type WebActionAvailability =
  | { available: true; disabledReason?: never }
  | { available: false; disabledReason: string }

export function overlayAwareActionAvailability(
  actionId: WebShortcutActionId,
  state: { exclusive: boolean; navigationRegistered: boolean },
): WebActionAvailability {
  if (state.exclusive) return { available: false, disabledReason: "Another dialog is active." }
  if ((actionId === "workspace.switch" || actionId === "commands.open") && !state.navigationRegistered) {
    return { available: false, disabledReason: "This navigation surface is not available yet." }
  }
  return { available: true }
}

export type WebActionRegistration = {
  callback: (invocation: WebActionInvocation) => void
  availability?: () => WebActionAvailability
}

export type WebActionRegistryEntry = {
  actionId: WebShortcutActionId
  label: string
  category: ShortcutCategory
  effectiveBinding?: WebShortcutEffectiveBinding
  availability: WebActionAvailability
  repeatPolicy: "suppress" | "refocus"
  callback: WebActionRegistration["callback"]
}

export type WebActionDispatchResult = {
  consumed: boolean
  executed: boolean
  actionId?: WebShortcutActionId
  disabledReason?: string
  ownership?: WebActionSource
}

export type WebActionRegistry = {
  entries(): WebActionRegistryEntry[]
  entry(actionId: WebShortcutActionId): WebActionRegistryEntry | undefined
  setSettings(settings: WebShortcutSettings | undefined): void
  dispatch(event: ShortcutKeyEvent, source: WebActionSource): WebActionDispatchResult
}

const repeatRefocusActions = new Set<WebShortcutActionId>(["workspace.switch", "commands.open"])
const settingsUnavailable: WebActionAvailability = {
  available: false,
  disabledReason: "Shortcut settings are not loaded.",
}

export function createWebActionRegistry(
  registrations: Record<WebShortcutActionId, WebActionRegistration>,
): WebActionRegistry {
  let settings: WebShortcutSettings | undefined

  const effectiveBinding = (actionId: WebShortcutActionId) =>
    settings?.bindings.find((binding) => binding.action_id === actionId)

  const entry = (actionId: WebShortcutActionId): WebActionRegistryEntry | undefined => {
    const metadata = WEB_SHORTCUT_ACTION_METADATA.find((candidate) => candidate.actionId === actionId)
    if (!metadata) return undefined
    const registration = registrations[actionId]
    return {
      actionId,
      label: metadata.label,
      category: metadata.category,
      effectiveBinding: effectiveBinding(actionId),
      availability: settings ? (registration.availability?.() ?? { available: true }) : settingsUnavailable,
      repeatPolicy: repeatRefocusActions.has(actionId) ? "refocus" : "suppress",
      callback: registration.callback,
    }
  }

  return {
    entries: () => WEB_SHORTCUT_ACTION_METADATA.map(({ actionId }) => entry(actionId)!),
    entry,
    setSettings(next) {
      if (next && !validateShortcutSettings(next).valid) throw new Error("Invalid authoritative shortcut settings")
      settings = next
    },
    dispatch(event, source) {
      if (!settings) return { consumed: false, executed: false }
      const match = matchShortcutEvent(event, settings)
      if (!match.handled) return { consumed: false, executed: false }
      const action = entry(match.actionId)!
      if (!action.availability.available) {
        return {
          consumed: true,
          executed: false,
          actionId: action.actionId,
          disabledReason: action.availability.disabledReason,
          ownership: source,
        }
      }
      if (match.repeat && action.repeatPolicy === "suppress") {
        return { consumed: true, executed: false, actionId: action.actionId, ownership: source }
      }
      const invocation: WebActionInvocation = {
        actionId: action.actionId,
        kind: match.repeat ? "refocus" : "execute",
        source,
      }
      action.callback(invocation)
      return { consumed: true, executed: true, actionId: action.actionId, ownership: source }
    },
  }
}

type BoundaryKeyEvent = ShortcutKeyEvent & {
  preventDefault?(): void
  stopPropagation?(): void
}

export type WebShortcutDispatcher = {
  handleDocument(event: BoundaryKeyEvent): WebActionDispatchResult
  handleXterm(event: BoundaryKeyEvent): boolean
}

export class WebShortcutConflictRecoveryError extends Error {
  constructor(
    readonly settings: WebShortcutSettings,
    readonly retryMutation: WebShortcutMutation,
    options?: ErrorOptions,
  ) {
    super("Shortcut settings changed; authoritative bindings were reloaded", options)
    this.name = "WebShortcutConflictRecoveryError"
  }
}

export class WebShortcutConflictRefreshError extends Error {
  constructor(options?: ErrorOptions) {
    super("Shortcut settings changed and authoritative bindings could not be reloaded", options)
    this.name = "WebShortcutConflictRefreshError"
  }
}

export class WebShortcutOwnerConflictError extends Error {
  constructor(readonly ownerActionId: WebShortcutActionId, options?: ErrorOptions) {
    super(`Shortcut is already assigned to ${ownerActionId}`, options)
    this.name = "WebShortcutOwnerConflictError"
  }
}

export type WebShortcutMutationConflict =
  | { kind: "stale_revision" }
  | { kind: "binding_owner_conflict"; ownerActionId: WebShortcutActionId }

export function classifyWebShortcutMutationConflict(error: unknown): WebShortcutMutationConflict | undefined {
  if (!error || typeof error !== "object") return undefined
  const candidate = error as { code?: unknown; details?: unknown }
  const details = WebShortcutErrorDetailsSchema.safeParse(candidate.details)
  if (!details.success) return undefined
  if (candidate.code === WEB_SHORTCUT_STALE_REVISION_ERROR_CODE && details.data.kind === "stale_revision") {
    return { kind: "stale_revision" }
  }
  if (candidate.code === WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE && details.data.kind === "binding_owner_conflict") {
    return { kind: "binding_owner_conflict", ownerActionId: details.data.owner_action_id }
  }
  return undefined
}

export type WebShortcutSettingsCoordinator = {
  current(): WebShortcutSettings | undefined
  load(): Promise<WebShortcutSettings>
  mutate(mutation: WebShortcutMutation): Promise<WebShortcutSettings>
}

type WebShortcutSettingsCoordinatorOptions = {
  load(): Promise<WebShortcutSettings>
  mutate(mutation: WebShortcutMutation): Promise<WebShortcutSettings>
  classifyConflict(error: unknown): WebShortcutMutationConflict | undefined
  onChange?(settings: WebShortcutSettings | undefined): void
}

export function createWebShortcutSettingsCoordinator(
  registry: WebActionRegistry,
  options: WebShortcutSettingsCoordinatorOptions,
): WebShortcutSettingsCoordinator {
  let current: WebShortcutSettings | undefined
  let generation = 0
  let latestIdentity: symbol | undefined
  let latestOperation: Promise<WebShortcutSettings> | undefined

  const accept = (settings: WebShortcutSettings | undefined) => {
    if (settings && !validateShortcutSettings(settings).valid) {
      throw new Error("Invalid authoritative shortcut settings")
    }
    current = settings
    registry.setSettings(settings)
    options.onChange?.(settings)
  }
  const superseded = (identity: symbol): Promise<WebShortcutSettings> => {
    if (latestOperation && latestIdentity !== identity) return latestOperation
    if (current) return Promise.resolve(current)
    return Promise.reject(new Error("Shortcut settings operation was superseded"))
  }
  const start = (
    clear: boolean,
    run: (operationGeneration: number, identity: symbol) => Promise<WebShortcutSettings>,
  ): Promise<WebShortcutSettings> => {
    const operationGeneration = ++generation
    const identity = Symbol("shortcut-settings-operation")
    latestIdentity = identity
    if (clear) accept(undefined)
    const operation = run(operationGeneration, identity)
    latestOperation = operation
    return operation
  }
  const isCurrent = (operationGeneration: number) => operationGeneration === generation

  return {
    current: () => current,
    load: () => start(true, async (operationGeneration, identity) => {
      try {
        const settings = await options.load()
        if (!isCurrent(operationGeneration)) return superseded(identity)
        accept(settings)
        return settings
      } catch (error) {
        if (!isCurrent(operationGeneration)) return superseded(identity)
        accept(undefined)
        throw error
      }
    }),
    mutate: (mutation) => start(false, async (operationGeneration, identity) => {
      try {
        const settings = await options.mutate(mutation)
        if (!isCurrent(operationGeneration)) return superseded(identity)
        accept(settings)
        return settings
      } catch (error) {
        if (!isCurrent(operationGeneration)) return superseded(identity)
        const conflict = options.classifyConflict(error)
        if (!conflict) throw error
        if (conflict.kind === "binding_owner_conflict") {
          throw new WebShortcutOwnerConflictError(conflict.ownerActionId, { cause: error })
        }

        let settings: WebShortcutSettings
        try {
          settings = await options.load()
        } catch (refreshError) {
          if (!isCurrent(operationGeneration)) return superseded(identity)
          accept(undefined)
          throw new WebShortcutConflictRefreshError({ cause: refreshError })
        }
        if (!isCurrent(operationGeneration)) return superseded(identity)
        accept(settings)
        throw new WebShortcutConflictRecoveryError(settings, {
          ...mutation,
          expected_revision: settings.revision,
        }, { cause: error })
      }
    }),
  }
}

export async function loadAuthoritativeWebActionSettings(
  registry: WebActionRegistry,
  load: () => Promise<WebShortcutSettings>,
): Promise<WebShortcutSettings> {
  return createWebShortcutSettingsCoordinator(registry, {
    load,
    mutate: async () => { throw new Error("Shortcut mutation is unavailable") },
    classifyConflict: () => undefined,
  }).load()
}

export function terminalTraversalTarget(
  terminalIds: readonly string[],
  activeTerminalId: string | undefined,
  direction: -1 | 1,
): { terminalId: string } | { message: "No other terminal is available." } {
  if (terminalIds.length < 2) return { message: "No other terminal is available." }
  const activeIndex = terminalIds.indexOf(activeTerminalId ?? "")
  const current = activeIndex === -1 ? 0 : activeIndex
  return { terminalId: terminalIds[(current + direction + terminalIds.length) % terminalIds.length]! }
}

export function createWebShortcutDispatcher(registry: WebActionRegistry): WebShortcutDispatcher {
  const owners = new WeakMap<object, WebActionSource>()

  const ownedResult = (event: BoundaryKeyEvent): WebActionDispatchResult | undefined => {
    const ownership = owners.get(event)
    return ownership ? { consumed: true, executed: false, ownership } : undefined
  }
  const dispatch = (event: BoundaryKeyEvent, source: WebActionSource): WebActionDispatchResult => {
    const owned = ownedResult(event)
    if (owned) return owned
    const result = registry.dispatch(event, source)
    if (!result.consumed) return result
    owners.set(event, source)
    event.preventDefault?.()
    event.stopPropagation?.()
    return result
  }

  return {
    handleDocument: (event) => dispatch(event, "document"),
    handleXterm(event) {
      return !dispatch(event, "xterm").consumed
    },
  }
}
