import {
  WEB_SHORTCUT_ACTION_METADATA,
  bindingKey,
  defaultShortcutSettings,
  findShortcutConflict,
  moveFuzzyActiveIndex,
  rankFuzzyItems,
  validateShortcutSettings,
  type FuzzyField,
} from "@git-stacks/client"
import {
  WEB_SHORTCUT_MAX_ALIASES,
  type WebShortcutActionId,
  type WebShortcutBinding,
  type WebShortcutMutation,
  type WebShortcutPlatform,
  type WebShortcutSettings,
} from "@git-stacks/protocol"

type OverlayControllerOptions = {
  restoreFocus(target: string | undefined): void
}

export type OverlayOpenOptions = {
  id: string
  title: string
  closeLabel: string
  returnTarget?: string
  exclusive?: boolean
}

export type OverlayView = {
  body: HTMLElement
  close(restoreFocus?: boolean): void
  setPrimaryFocus(focus: () => void): void
}

export type OverlayOpenResult =
  | { kind: "opened"; view: OverlayView }
  | { kind: "refocused"; view: OverlayView }
  | { kind: "unavailable" }

type ActiveOverlay = {
  id: string
  exclusive: boolean
  returnTarget?: string
  backdrop: HTMLElement
  dialog: HTMLElement
  body: HTMLElement
  primaryFocus: () => void
  close: (restoreFocus?: boolean) => void
  view: OverlayView
}

const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"

function node<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
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

export function createSingletonOverlayController(document: Document, options: OverlayControllerOptions) {
  let active: ActiveOverlay | undefined

  const containedKeydown = (event: KeyboardEvent) => {
    if (!active) return
    if (event.key === "Escape") {
      active.close()
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.key !== "Tab") return
    const focusable = [...active.dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      .filter((candidate) => !candidate.hidden && !candidate.hasAttribute("disabled"))
    if (!focusable.length) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const current = focusable.indexOf(document.activeElement as HTMLElement)
    const next = event.shiftKey
      ? (current <= 0 ? focusable.length - 1 : current - 1)
      : (current === -1 || current === focusable.length - 1 ? 0 : current + 1)
    focusable[next]?.focus()
    event.preventDefault()
    event.stopPropagation()
  }
  document.addEventListener("keydown", containedKeydown, true)

  const open = (request: OverlayOpenOptions): OverlayOpenResult => {
    if (active?.id === request.id) {
      active.primaryFocus()
      return { kind: "refocused", view: active.view }
    }
    if (active?.exclusive) return { kind: "unavailable" }

    const preservedReturnTarget = active?.returnTarget ?? request.returnTarget
    if (active) {
      active.backdrop.remove()
      active = undefined
    }

    const backdrop = node(document, "div", "modal-backdrop")
    const dialog = node(document, "section", "modal")
    dialog.setAttribute("role", "dialog")
    dialog.setAttribute("aria-modal", "true")
    const titleId = `overlay-title-${request.id.replaceAll(/[^a-z0-9_-]/gi, "-")}`
    dialog.setAttribute("aria-labelledby", titleId)
    const head = node(document, "div", "modal-head")
    const title = node(document, "strong", "", request.title)
    title.id = titleId
    const closeButton = control(document, "×", "button icon")
    closeButton.setAttribute("aria-label", request.closeLabel)
    head.append(title, closeButton)
    const body = node(document, "div", "modal-body")
    dialog.append(head, body)
    backdrop.append(dialog)
    document.body.append(backdrop)

    let closed = false
    const close = (restoreFocus = true) => {
      if (closed) return
      closed = true
      backdrop.remove()
      if (active?.close === close) active = undefined
      if (restoreFocus) options.restoreFocus(preservedReturnTarget)
    }
    const view: OverlayView = {
      body,
      close,
      setPrimaryFocus(focus) {
        if (active?.close === close) active.primaryFocus = focus
      },
    }
    active = {
      id: request.id,
      exclusive: request.exclusive ?? false,
      returnTarget: preservedReturnTarget,
      backdrop,
      dialog,
      body,
      primaryFocus: () => closeButton.focus(),
      close,
      view,
    }
    closeButton.addEventListener("click", () => close())
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close()
    })
    return { kind: "opened", view }
  }

  return {
    open,
    activeSurface: () => active?.id,
    close: (restoreFocus = true) => active?.close(restoreFocus),
    focusPrimary: () => active?.primaryFocus(),
    isExclusive: () => active?.exclusive ?? false,
  }
}

export type FuzzyOverlayOptions<T> = {
  inputLabel: string
  emptyHeading: string
  emptyBody: string
  noMatch: string
  items: readonly T[]
  stableId(item: T): string
  fields(item: T): readonly FuzzyField[]
  recency?(item: T): number | string
  defaultOrder?(left: T, right: T): number
  render(item: T): { primary: string; secondary?: string }
  select(item: T): void
}

export function mountFuzzyOverlay<T>(view: OverlayView, options: FuzzyOverlayOptions<T>) {
  const document = view.body.ownerDocument
  const input = node(document, "input")
  const listId = `overlay-list-${Math.random().toString(36).slice(2)}`
  input.placeholder = options.inputLabel
  input.setAttribute("aria-label", options.inputLabel)
  input.setAttribute("role", "combobox")
  input.setAttribute("aria-expanded", "true")
  input.setAttribute("aria-controls", listId)
  input.setAttribute("autocomplete", "off")
  const results = node(document, "div", "overlay-results")
  results.id = listId
  results.setAttribute("role", "listbox")
  const live = node(document, "div", "sr-only")
  live.setAttribute("aria-live", "polite")
  let ranked: T[] = []
  let activeIndex = -1

  const optionId = (item: T) => `${listId}-${options.stableId(item).replaceAll(/[^a-z0-9_-]/gi, "-")}`
  const setActive = (next: number) => {
    activeIndex = next
    const rows = [...results.querySelectorAll<HTMLElement>("[role='option']")]
    rows.forEach((row, index) => {
      const selected = index === activeIndex
      row.classList.toggle("active", selected)
      row.setAttribute("aria-selected", String(selected))
      if (selected) row.scrollIntoView({ block: "nearest" })
    })
    const item = ranked[activeIndex]
    if (item) input.setAttribute("aria-activedescendant", optionId(item))
    else input.removeAttribute("aria-activedescendant")
  }

  const render = () => {
    const query = input.value.trim()
    ranked = rankFuzzyItems(options.items, query, {
      stableId: options.stableId,
      fields: options.fields,
      ...(options.recency ? { recency: options.recency } : {}),
      ...(options.defaultOrder ? { defaultOrder: options.defaultOrder } : {}),
    }).map(({ item }) => item)
    activeIndex = ranked.length ? 0 : -1
    results.replaceChildren()
    if (!ranked.length) {
      const empty = node(document, "div", "overlay-empty")
      if (!query && options.items.length === 0) {
        empty.append(node(document, "strong", "", options.emptyHeading), node(document, "span", "", options.emptyBody))
      } else {
        empty.append(node(document, "span", "", options.noMatch))
      }
      results.append(empty)
    } else {
      ranked.forEach((item, index) => {
        const presentation = options.render(item)
        const row = control(document, "", "overlay-result")
        row.id = optionId(item)
        row.setAttribute("role", "option")
        row.setAttribute("aria-selected", String(index === activeIndex))
        row.title = [presentation.primary, presentation.secondary].filter(Boolean).join(" — ")
        const identity = node(document, "span", "overlay-result-identity")
        identity.append(node(document, "strong", "", presentation.primary))
        if (presentation.secondary) identity.append(node(document, "span", "overlay-result-secondary", presentation.secondary))
        row.append(identity)
        row.addEventListener("pointermove", () => setActive(index))
        row.addEventListener("click", () => options.select(item))
        results.append(row)
      })
      setActive(activeIndex)
    }
    live.textContent = `${ranked.length} result${ranked.length === 1 ? "" : "s"}.`
  }

  input.addEventListener("input", render)
  input.addEventListener("keydown", (event) => {
    let handled = true
    if (event.key === "ArrowDown") activeIndex = moveFuzzyActiveIndex(activeIndex, ranked.length, "next")
    else if (event.key === "ArrowUp") activeIndex = moveFuzzyActiveIndex(activeIndex, ranked.length, "previous")
    else if (event.key === "Home") activeIndex = moveFuzzyActiveIndex(activeIndex, ranked.length, "home")
    else if (event.key === "End") activeIndex = moveFuzzyActiveIndex(activeIndex, ranked.length, "end")
    else if (event.key === "Enter") {
      const item = ranked[activeIndex]
      if (item) options.select(item)
    } else handled = false
    if (!handled) return
    if (event.key !== "Enter") setActive(activeIndex)
    event.preventDefault()
    event.stopPropagation()
  })
  view.setPrimaryFocus(() => input.focus())
  view.body.append(input, results, live)
  render()
  input.focus()
  return { input, results, live, render }
}

const actionGroups: ReadonlyArray<{ label: string; actions: readonly WebShortcutActionId[] }> = [
  { label: "Navigation", actions: ["workspace.switch", "attention.next"] },
  { label: "Workspace", actions: ["commands.open", "workspace.new"] },
  { label: "Terminal", actions: ["terminal.new", "terminal.close", "terminal.previous", "terminal.next"] },
]

const labelByAction = new Map<WebShortcutActionId, string>(WEB_SHORTCUT_ACTION_METADATA.map(({ actionId, label }) => [
  actionId,
  actionId === "workspace.switch" ? "Switch workspace or repository" : label,
]))

function bindingParts(binding: WebShortcutBinding, platform: WebShortcutPlatform): string[] {
  const parts: string[] = []
  if (binding.ctrl) parts.push("Ctrl")
  if (binding.alt) parts.push("Alt")
  if (binding.shift) parts.push("Shift")
  if (binding.meta) parts.push(platform === "macos" ? "Command" : "Meta")
  parts.push(binding.code.slice(3))
  return parts
}

function bindingCaps(document: Document, binding: WebShortcutBinding, platform: WebShortcutPlatform): HTMLElement {
  const chord = node(document, "span", "shortcut-chord")
  chord.setAttribute("aria-label", bindingParts(binding, platform).join(" plus "))
  for (const part of bindingParts(binding, platform)) chord.append(node(document, "kbd", "", part))
  return chord
}

function effectiveBinding(document: Document, settings: WebShortcutSettings, actionId: WebShortcutActionId): HTMLElement {
  const wrapper = node(document, "span", "shortcut-bindings")
  const effective = settings.bindings.find((binding) => binding.action_id === actionId)
  if (!effective?.primary && !effective?.aliases.length) {
    wrapper.append(node(document, "span", "shortcut-unbound", "Unbound"))
    return wrapper
  }
  if (effective.primary) wrapper.append(bindingCaps(document, effective.primary, settings.platform))
  for (const alias of effective.aliases) wrapper.append(bindingCaps(document, alias, settings.platform))
  return wrapper
}

function appendShortcutRows(container: HTMLElement, settings: WebShortcutSettings): void {
  const document = container.ownerDocument
  for (const group of actionGroups) {
    const section = node(document, "section", "shortcut-group")
    section.append(node(document, "h3", "", group.label))
    for (const actionId of group.actions) {
      const row = node(document, "div", "shortcut-row")
      row.append(node(document, "span", "shortcut-label", labelByAction.get(actionId)), effectiveBinding(document, settings, actionId))
      section.append(row)
    }
    container.append(section)
  }
}

export function mountShortcutHelp(view: OverlayView, settings: WebShortcutSettings, customize: () => void): void {
  const document = view.body.ownerDocument
  appendShortcutRows(view.body, settings)
  const actions = node(document, "div", "modal-actions")
  const close = control(document, "Close help")
  const settingsButton = control(document, "Customize shortcuts", "button primary")
  close.addEventListener("click", () => view.close())
  settingsButton.addEventListener("click", customize)
  actions.append(close, settingsButton)
  view.body.append(actions)
  view.setPrimaryFocus(() => settingsButton.focus())
  settingsButton.focus()
}

type ShortcutSettingsOptions = {
  platform: WebShortcutPlatform
  load(): Promise<WebShortcutSettings>
  mutate(mutation: WebShortcutMutation): Promise<WebShortcutSettings>
  accept(settings: WebShortcutSettings): void
  announce(message: string): void
}

type CaptureState = { actionId: WebShortcutActionId; target: "primary" | "alias"; error?: string }

export function mountShortcutSettings(view: OverlayView, options: ShortcutSettingsOptions) {
  const document = view.body.ownerDocument
  let current: WebShortcutSettings | undefined
  let capture: CaptureState | undefined
  let busyAction: WebShortcutActionId | undefined
  let retryMutation: WebShortcutMutation | undefined
  let pending: Promise<void> = Promise.resolve()

  const rowFor = (actionId: WebShortcutActionId) => current?.bindings.find((binding) => binding.action_id === actionId)
  const actionLabel = (actionId: WebShortcutActionId) => labelByAction.get(actionId) ?? actionId
  const renderLoading = () => {
    view.body.setAttribute("aria-busy", "true")
    view.body.replaceChildren(node(document, "div", "shortcut-loading", "Loading shortcuts…"))
  }
  const renderLoadError = () => {
    view.body.setAttribute("aria-busy", "false")
    const message = node(document, "div", "shortcut-error", "Shortcuts could not be loaded. Retry to edit the authoritative settings.")
    const retry = control(document, "Retry loading shortcuts", "button primary")
    retry.addEventListener("click", () => { void load() })
    view.body.replaceChildren(message, retry)
    view.setPrimaryFocus(() => retry.focus())
    retry.focus()
  }

  const replaceAction = (settings: WebShortcutSettings, actionId: WebShortcutActionId, update: (binding: WebShortcutSettings["bindings"][number]) => WebShortcutSettings["bindings"][number]) => ({
    ...settings,
    bindings: settings.bindings.map((binding) => binding.action_id === actionId ? update(binding) : binding),
  })

  const runMutation = (mutation: WebShortcutMutation) => {
    if (!current || busyAction) return
    const previous = current
    busyAction = mutation.action_id
    retryMutation = undefined
    render()
    pending = options.mutate(mutation).then((next) => {
      if (!validateShortcutSettings(next).valid) throw new Error("Invalid authoritative shortcut response")
      current = next
      options.accept(next)
      options.announce(`${actionLabel(mutation.action_id)} shortcut updated.`)
      capture = undefined
    }).catch(() => {
      current = previous
      retryMutation = mutation
    }).finally(() => {
      busyAction = undefined
      render()
    })
  }

  const captureEvent = (event: KeyboardEvent) => {
    if (!capture || !current) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") {
      const actionId = capture.actionId
      capture = undefined
      render()
      view.body.querySelector<HTMLElement>(`[data-shortcut-primary='${actionId}']`)?.focus()
      return
    }
    if (event.repeat || event.isComposing || event.key === "Process" || event.key === "Dead" || event.getModifierState?.("AltGraph")) return
    if (!/^Key[A-Z]$/.test(event.code) || ["Control", "Alt", "Shift", "Meta"].includes(event.key)) return
    if (!(event.ctrlKey || event.altKey || event.metaKey)) {
      capture.error = "Add Ctrl, Alt, or Command so terminal typing stays available."
      render()
      view.body.querySelector<HTMLElement>(`[data-capture='${capture.actionId}']`)?.focus()
      return
    }
    const candidate: WebShortcutBinding = {
      code: event.code,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    }
    const effective = rowFor(capture.actionId)!
    const conflict = findShortcutConflict(current.bindings, candidate, capture.actionId)
      ?? (capture.target === "alias" && effective.primary && bindingKey(effective.primary) === bindingKey(candidate)
        ? { ownerLabel: actionLabel(capture.actionId) }
        : effective.aliases.some((alias) => bindingKey(alias) === bindingKey(candidate))
          ? { ownerLabel: actionLabel(capture.actionId) }
          : undefined)
    if (conflict) {
      capture.error = `Already assigned to ${conflict.ownerLabel}. Choose another shortcut or unbind that action first.`
      render()
      view.body.querySelector<HTMLElement>(`[data-capture='${capture.actionId}']`)?.focus()
      return
    }
    const candidateSettings = replaceAction(current, capture.actionId, (binding) => capture?.target === "primary"
      ? { ...binding, primary: candidate }
      : { ...binding, aliases: [...binding.aliases, candidate] })
    const validation = validateShortcutSettings(candidateSettings)
    if (!validation.valid) {
      capture.error = validation.conflict
        ? `Already assigned to ${validation.conflict.ownerLabel}. Choose another shortcut or unbind that action first.`
        : "Add Ctrl, Alt, or Command so terminal typing stays available."
      render()
      view.body.querySelector<HTMLElement>(`[data-capture='${capture.actionId}']`)?.focus()
      return
    }
    runMutation(capture.target === "primary"
      ? { intent: "set-primary", platform: options.platform, action_id: capture.actionId, expected_revision: current.revision, binding: candidate }
      : { intent: "set-aliases", platform: options.platform, action_id: capture.actionId, expected_revision: current.revision, aliases: candidateSettings.bindings.find((binding) => binding.action_id === capture!.actionId)!.aliases })
  }

  const startCapture = (actionId: WebShortcutActionId, target: "primary" | "alias") => {
    if (busyAction) return
    capture = { actionId, target }
    retryMutation = undefined
    render()
    view.body.querySelector<HTMLElement>(`[data-capture='${actionId}']`)?.focus()
  }

  const render = () => {
    if (!current) return
    view.body.setAttribute("aria-busy", String(Boolean(busyAction)))
    view.body.replaceChildren()
    for (const group of actionGroups) {
      const section = node(document, "section", "shortcut-group")
      section.append(node(document, "h3", "", group.label))
      for (const actionId of group.actions) {
        const binding = rowFor(actionId)!
        const row = node(document, "div", `shortcut-row shortcut-settings-row${capture?.actionId === actionId ? " capturing" : ""}`)
        row.append(node(document, "span", "shortcut-label", actionLabel(actionId)))
        const controls = node(document, "div", "shortcut-row-controls")
        const primary = control(document, binding.primary ? "" : "Unbound", "shortcut-binding-button")
        primary.setAttribute("data-shortcut-primary", actionId)
        if (binding.primary) primary.append(bindingCaps(document, binding.primary, options.platform))
        primary.disabled = busyAction === actionId
        primary.addEventListener("click", () => startCapture(actionId, "primary"))
        controls.append(primary)
        binding.aliases.forEach((alias, aliasIndex) => {
          const aliasGroup = node(document, "span", "shortcut-alias")
          aliasGroup.append(bindingCaps(document, alias, options.platform))
          const remove = control(document, "Remove shortcut alias", "button shortcut-remove")
          remove.setAttribute("aria-label", `Remove shortcut alias for ${actionLabel(actionId)}`)
          remove.disabled = busyAction === actionId
          remove.addEventListener("click", () => runMutation({
            intent: "set-aliases",
            platform: options.platform,
            action_id: actionId,
            expected_revision: current!.revision,
            aliases: binding.aliases.filter((_, index) => index !== aliasIndex),
          }))
          aliasGroup.append(remove)
          controls.append(aliasGroup)
        })
        const addAlias = control(document, "Add shortcut alias")
        addAlias.disabled = busyAction === actionId || binding.aliases.length >= WEB_SHORTCUT_MAX_ALIASES
        addAlias.addEventListener("click", () => startCapture(actionId, "alias"))
        const defaults = defaultShortcutSettings(options.platform).bindings.find((candidate) => candidate.action_id === actionId)!
        const reset = control(document, "Reset shortcut to default")
        reset.disabled = busyAction === actionId || (Boolean(binding.primary && defaults.primary && bindingKey(binding.primary) === bindingKey(defaults.primary)) && binding.aliases.length === 0)
        reset.addEventListener("click", () => runMutation({ intent: "reset", platform: options.platform, action_id: actionId, expected_revision: current!.revision }))
        const unbind = control(document, "Unbind shortcut")
        unbind.disabled = busyAction === actionId || (!binding.primary && binding.aliases.length === 0)
        unbind.addEventListener("click", () => runMutation({ intent: "unbind", platform: options.platform, action_id: actionId, expected_revision: current!.revision }))
        controls.append(addAlias, reset, unbind)
        row.append(controls)
        if (capture?.actionId === actionId) {
          const captureControl = control(document, "Press shortcut…", "button shortcut-capture")
          captureControl.setAttribute("data-capture", actionId)
          captureControl.addEventListener("keydown", captureEvent)
          const status = node(document, "div", capture.error ? "shortcut-inline-error" : "shortcut-capture-status", capture.error ?? `Press the new shortcut for ${actionLabel(actionId)}. Escape cancels.`)
          status.setAttribute("aria-live", "polite")
          row.append(captureControl, status)
        }
        if (busyAction === actionId) row.append(node(document, "div", "shortcut-busy", "Saving shortcut…"))
        if (retryMutation?.action_id === actionId) {
          const error = node(document, "div", "shortcut-inline-error", "Shortcut changes were not saved. Your previous bindings are still active.")
          const retry = control(document, "Retry saving shortcut")
          retry.addEventListener("click", () => runMutation(retryMutation!))
          row.append(error, retry)
        }
        section.append(row)
      }
      view.body.append(section)
    }
    const actions = node(document, "div", "modal-actions")
    const close = control(document, "Close shortcut settings")
    close.addEventListener("click", () => view.close())
    actions.append(close)
    view.body.append(actions)
    view.setPrimaryFocus(() => close.focus())
  }

  const load = async () => {
    current = undefined
    capture = undefined
    retryMutation = undefined
    renderLoading()
    try {
      const settings = await options.load()
      if (!validateShortcutSettings(settings).valid) throw new Error("Invalid authoritative shortcut response")
      current = settings
      options.accept(settings)
      render()
    } catch {
      renderLoadError()
    }
  }
  const ready = load()
  return { ready, idle: async () => pending }
}
