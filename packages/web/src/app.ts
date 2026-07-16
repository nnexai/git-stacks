import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import "@xterm/xterm/css/xterm.css"
import "./app.css"
import { FUZZY_FIELD_WEIGHT, createOperationTracker, createWorkspaceActionRegistry, deduplicateProviderSessions, isBackgroundActivity, lifecycleLabel, matchesSignalScope, providerLetter, providerName, relativeTime, selectNextAttentionTarget, signalGroup, workspacePriorityOrder, workspaceSuccessorOrder, type WorkspaceActionCallback } from "@git-stacks/client"
import { WEB_SHORTCUT_ACTION_IDS, WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE, WEB_SHORTCUT_STALE_REVISION_ERROR_CODE, type OperationCancelResult, type WebFileStatusResponse, type WebNotesResponse, type WebOperation, type WebOperationSummary, type WebRepository as Repository, type WebShortcutActionId, type WebShortcutPlatform, type WebShortcutSettings, type WebSnapshot as Snapshot, type WebTerminal as TerminalMeta, type WebWorkspace as Workspace, type WebWorkspaceAction, type WebWorkspaceActionId, type Signal, type WorkspaceCreationCatalog as Catalog, type SecureScope, type WorkspaceLifecycleFailureDetails } from "@git-stacks/protocol"
import { initializeWebSession, secureApi, SecureTerminalChannel, subscribeSecureEvents } from "./secure-client"
import { classifyWebShortcutMutationConflict, createWebActionRegistry, createWebShortcutDispatcher, createWebShortcutSettingsCoordinator, overlayAwareActionAvailability, terminalTraversalTarget, workspaceActionMenuRows, type WebActionAvailability, type WebActionInvocation, type WebActionRegistration } from "./navigation"
import { createSingletonOverlayController, mountFuzzyOverlay, mountShortcutHelp, mountShortcutSettings, type OverlayView } from "./overlay-controller"

if (window.top !== window) {
  document.documentElement.replaceChildren()
  throw new Error("The git-stacks client cannot run inside a frame")
}

type Pair = { workspaceId: string; repositoryId: string }
type Organization = "label" | "repository"

class ApiRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly details?: unknown) { super(message) }
}

const app = document.querySelector<HTMLDivElement>("#app")!
let acceleratedWebgl: boolean | undefined
function hasAcceleratedWebgl(): boolean {
  if (acceleratedWebgl !== undefined) return acceleratedWebgl
  try {
    const context = document.createElement("canvas").getContext("webgl2")
    if (!context) return acceleratedWebgl = false
    const debug = context.getExtension("WEBGL_debug_renderer_info")
    const renderer = debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(context.getParameter(context.RENDERER))
    acceleratedWebgl = !/(swiftshader|llvmpipe|softpipe|software)/i.test(renderer)
    context.getExtension("WEBGL_lose_context")?.loseContext()
  } catch { acceleratedWebgl = false }
  return acceleratedWebgl
}
const preferences = {
  pins: new Set<string>(),
  recent: [] as string[],
  tabOrder: [] as string[],
  theme: "system",
  organization: "label" as Organization,
  lastPair: undefined as Pair | undefined,
}
if (!["label", "repository"].includes(preferences.organization)) preferences.organization = "label"
if (preferences.theme !== "system") document.documentElement.dataset.theme = preferences.theme

async function api<T>(method: string, body?: unknown, options: { scope?: SecureScope; idempotencyKey?: string } = {}): Promise<T> {
  try { return await secureApi<T>(method, body, options) } catch (error) {
    const code = String((error as { code?: unknown }).code ?? "request_failed")
    const details = (error as { details?: unknown }).details
    const status = code === "conflict" || code === WEB_SHORTCUT_STALE_REVISION_ERROR_CODE || code === WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE ? 409 : 500
    throw new ApiRequestError(code, error instanceof Error ? error.message : String(error), status, details)
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function button(label: string, className = "button"): HTMLButtonElement {
  const node = element("button", className, label)
  node.type = "button"
  return node
}
function boundedUtf8(value: string, maximum: number): string {
  const encoder = new TextEncoder()
  if (encoder.encode(value).byteLength <= maximum) return value
  let result = ""
  for (const character of value) {
    if (encoder.encode(result + character).byteLength > maximum) break
    result += character
  }
  return result
}

// Provider marks are the current monochrome Lobe Icons paths (MIT), kept
// inline so the local-only browser client does not fetch third-party assets.
const providerPaths: Record<string, string> = {
  codex: "M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z",
  claude: "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z",
  copilot: "M19.245 5.364c1.322 1.36 1.877 3.216 2.11 5.817.622 0 1.2.135 1.592.654l.73.964c.21.278.323.61.323.955v2.62c0 .339-.173.669-.453.868C20.239 19.602 16.157 21.5 12 21.5c-4.6 0-9.205-2.583-11.547-4.258-.28-.2-.452-.53-.453-.868v-2.62c0-.345.113-.679.321-.956l.73-.963c.392-.517.974-.654 1.593-.654l.029-.297c.25-2.446.81-4.213 2.082-5.52 2.461-2.54 5.71-2.851 7.146-2.864h.198c1.436.013 4.685.323 7.146 2.864zm-7.244 4.328c-.284 0-.613.016-.962.05-.123.447-.305.85-.57 1.108-1.05 1.023-2.316 1.18-2.994 1.18-.638 0-1.306-.13-1.851-.464-.516.165-1.012.403-1.044.996a65.882 65.882 0 00-.063 2.884l-.002.48c-.002.563-.005 1.126-.013 1.69.002.326.204.63.51.765 2.482 1.102 4.83 1.657 6.99 1.657 2.156 0 4.504-.555 6.985-1.657a.854.854 0 00.51-.766c.03-1.682.006-3.372-.076-5.053-.031-.596-.528-.83-1.046-.996-.546.333-1.212.464-1.85.464-.677 0-1.942-.157-2.993-1.18-.266-.258-.447-.661-.57-1.108-.32-.032-.64-.049-.96-.05zm-2.525 4.013c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zm5 0c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zM7.635 5.087c-1.05.102-1.935.438-2.385.906-.975 1.037-.765 3.668-.21 4.224.405.394 1.17.657 1.995.657h.09c.649-.013 1.785-.176 2.73-1.11.435-.41.705-1.433.675-2.47-.03-.834-.27-1.52-.63-1.813-.39-.336-1.275-.482-2.265-.394zm6.465.394c-.36.292-.6.98-.63 1.813-.03 1.037.24 2.06.675 2.47.968.957 2.136 1.104 2.776 1.11h.044c.825 0 1.59-.263 1.995-.657.555-.556.765-3.187-.21-4.224-.45-.468-1.335-.804-2.385-.906-.99-.088-1.875.058-2.265.394zM12 7.615c-.24 0-.525.015-.84.044.03.16.045.336.06.526l-.001.159a2.94 2.94 0 01-.014.25c.225-.022.425-.027.612-.028h.366c.187 0 .387.006.612.028-.015-.146-.015-.277-.015-.409.015-.19.03-.365.06-.526a9.29 9.29 0 00-.84-.044z",
  opencode: "M16 6H8v12h8V6zm4 16H4V2h16v20z",
}
function providerBadge(source: string, className = "provider-chip"): HTMLElement {
  const node = element("span", className)
  const path = providerPaths[source]
  if (path) node.innerHTML = `<svg viewBox="0 0 24 24" fill-rule="evenodd" clip-rule="evenodd" aria-hidden="true"><path d="${path}"></path></svg>`
  else node.textContent = providerLetter(source)
  node.setAttribute("aria-label", providerName(source))
  return node
}

type ContextAction = { label: string; run: () => void; disabled?: boolean; disabledReason?: string; destructive?: boolean; group?: string }
function hideContextMenu(): void {
  contextMenu.hidden = true
  contextMenu.replaceChildren()
}
function showContextMenu(event: MouseEvent, actions: ContextAction[]): void {
  event.preventDefault()
  event.stopPropagation()
  contextMenu.replaceChildren()
  let group = ""
  for (const action of actions) {
    if (action.group && action.group !== group) {
      group = action.group
      const heading = element("div", "context-menu-group", group)
      heading.setAttribute("role", "presentation")
      contextMenu.append(heading)
    }
    const control = button(action.label, `context-menu-item${action.destructive ? " destructive" : ""}`)
    const disabledReason = action.disabledReason ?? (action.disabled ? "This action is unavailable." : undefined)
    control.setAttribute("role", "menuitem")
    control.setAttribute("aria-disabled", String(Boolean(disabledReason)))
    control.tabIndex = 0
    if (disabledReason) control.append(element("span", "context-menu-reason", disabledReason))
    control.addEventListener("click", () => {
      if (disabledReason) { toast(`${action.label} unavailable — ${disabledReason}`, true); return }
      hideContextMenu(); action.run()
    })
    contextMenu.append(control)
  }
  contextMenu.hidden = false
  const width = contextMenu.offsetWidth, height = contextMenu.offsetHeight
  const rule = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
    .find((candidate): candidate is CSSStyleRule => candidate instanceof CSSStyleRule && candidate.selectorText === ".context-menu")
  rule?.style.setProperty("--menu-left", `${Math.max(6, Math.min(event.clientX, window.innerWidth - width - 6))}px`)
  rule?.style.setProperty("--menu-top", `${Math.max(6, Math.min(event.clientY, window.innerHeight - height - 6))}px`)
  const controls = [...contextMenu.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
  controls[0]?.focus()
  contextMenu.onkeydown = (keyboardEvent) => {
    const current = controls.indexOf(document.activeElement as HTMLButtonElement)
    if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
      const direction = keyboardEvent.key === "ArrowDown" ? 1 : -1
      controls[(Math.max(0, current) + direction + controls.length) % controls.length]?.focus()
      keyboardEvent.preventDefault()
    } else if (keyboardEvent.key === "Home") { controls[0]?.focus(); keyboardEvent.preventDefault() }
    else if (keyboardEvent.key === "End") { controls.at(-1)?.focus(); keyboardEvent.preventDefault() }
  }
}
function savePreferences(): void {
  preferences.recent = preferences.recent.slice(0, 20)
  preferences.tabOrder = preferences.tabOrder.slice(0, 100)
}
function toast(message: string, error = false): void {
  const node = element("div", `toast${error ? " error" : ""}`, message)
  node.setAttribute("role", error ? "alert" : "status")
  toastRegion.append(node)
  window.setTimeout(() => node.remove(), 6000)
}
function actionToast(message: string, label: string, action: () => void): void {
  const node = element("div", "toast toast-action")
  node.setAttribute("role", "status")
  const control = button(label, "button")
  control.addEventListener("click", () => { node.remove(); action() })
  node.append(element("span", "", message), control)
  toastRegion.append(node)
  window.setTimeout(() => node.remove(), 10_000)
}

class TerminalView {
  readonly pane = element("section", "terminal-pane")
  private host = element("div", "terminal-host")
  private banner = element("div", "terminal-banner")
  private terminal?: Terminal
  private fit?: FitAddon
  private webgl?: WebglAddon
  private webglUnavailable = false
  private socket?: SecureTerminalChannel
  private observer?: ResizeObserver
  private receivedCursor = 0n
  private pendingAck = 0n
  private writeGeneration = 0
  private ackTimer?: number
  private titleTimer?: number
  private pendingAutomaticTitle?: string
  private active = false
  private streaming?: boolean
  private opened = false
  private disposed = false

  constructor(public meta: TerminalMeta) {
    this.pane.hidden = true
    this.pane.setAttribute("role", "tabpanel")
    this.pane.append(this.banner, this.host)
    terminalDeck.append(this.pane)
  }

  activate(): void {
    this.active = true
    this.pane.hidden = false
    requestAnimationFrame(() => { if (!this.opened) this.open(); this.enableWebgl(); this.resize(); this.syncStreaming() })
  }
  deactivate(): void {
    this.active = false
    this.pane.hidden = true
    if (this.webgl) {
      this.disableWebgl()
      // xterm does not reliably support loading a second WebGL addon onto the
      // same Terminal instance. The built-in renderer remains correct and the
      // GPU context stays released for the rest of this view's lifetime.
      this.webglUnavailable = true
    }
    this.syncStreaming()
  }

  syncStreaming(): void {
    const streaming = this.active && !document.hidden
    if (!this.socket || this.streaming === streaming) return
    this.streaming = streaming
    this.send({ type: "flow", streaming })
  }

  focusInput(): void {
    requestAnimationFrame(() => {
      if (!this.active || this.disposed) return
      if (!this.opened) this.open()
      this.terminal?.focus()
    })
  }

  async close(): Promise<void> {
    this.meta.state = "closing"
    renderTabs()
    try {
      this.meta = await api<TerminalMeta>("terminal.close", { terminal_id: this.meta.id }, { scope: "terminal.close" })
      this.dispose()
      terminalViews.delete(this.meta.id)
      if (activeTerminalId === this.meta.id) activeTerminalId = visibleTerminals().find((item) => item.id !== this.meta.id)?.id
      renderScope()
      statusNode.textContent = connectionSummary()
      if (activeTerminalId) terminalViews.get(activeTerminalId)?.focusInput()
    } catch (error) { toast(String(error), true); this.meta.state = "cleanup_failed"; renderTabs() }
  }

  async rename(): Promise<void> {
    const requested = prompt("Terminal title — leave empty to restore automatic shell titles", this.meta.title)
    if (requested === null) return
    const title = boundedUtf8(requested.trim(), 64)
    if (title === this.meta.title && this.meta.title_pinned === Boolean(title)) return
    try {
      this.meta = await api<TerminalMeta>("terminal.rename", { terminal_id: this.meta.id, mode: "manual", title }, { scope: "terminal.write" })
      renderTabs()
    } catch (error) { toast(String(error), true) }
  }

  copySelection(): void {
    const selection = this.terminal?.getSelection()
    if (selection) void navigator.clipboard.writeText(selection).then(() => toast("Selection copied"), () => toast("Clipboard permission denied", true))
  }

  pasteClipboard(): void {
    void navigator.clipboard.readText().then((value) => { if (value) this.send({ type: "input", data: value }) }, () => toast("Clipboard permission denied", true))
  }

  showEnded(): void {
    this.banner.replaceChildren(element("span", "", `Process exited${this.meta.exit_code === null ? "" : ` with code ${this.meta.exit_code}`}.`))
    this.banner.classList.add("visible")
  }

  private open(): void {
    if (this.opened || this.disposed || this.pane.hidden) return
    if (this.host.clientWidth < 2 || this.host.clientHeight < 2) { window.setTimeout(() => this.open(), 50); return }
    this.opened = true
    const terminal = new Terminal({
      cursorBlink: false,
      fontFamily: "'SFMono-Regular', 'Cascadia Code', Consolas, monospace",
      fontSize: 14,
      scrollback: 5000,
      allowProposedApi: false,
      theme: { background: "#080b10", foreground: "#e9eef5", cursor: "#70d6b4", selectionBackground: "#315477" },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(this.host)
    this.terminal = terminal
    this.fit = fit
    this.enableWebgl()
    terminal.attachCustomKeyEventHandler((event) => shortcutDispatcher.handleXterm(event))
    terminal.onData((data) => this.send({ type: "input", data }))
    terminal.onResize(({ cols, rows }) => this.send({ type: "resize", cols, rows }))
    terminal.onTitleChange((title) => this.scheduleAutomaticTitle(title))
    this.host.addEventListener("contextmenu", (event) => showContextMenu(event, [
      { label: "Copy selection", run: () => this.copySelection(), disabled: !this.terminal?.hasSelection() },
      { label: "Paste", run: () => this.pasteClipboard() },
    ]))
    this.observer = new ResizeObserver(() => { if (!this.pane.hidden) requestAnimationFrame(() => this.resize()) })
    this.observer.observe(this.host)
    this.connect()
  }

  private enableWebgl(): void {
    if (!this.active || !this.terminal || this.webgl || this.webglUnavailable || !hasAcceleratedWebgl()) return
    let webgl: WebglAddon | undefined
    try {
      const addon = new WebglAddon()
      webgl = addon
      addon.onContextLoss(() => {
        addon.dispose()
        if (this.webgl === addon) this.webgl = undefined
        this.webglUnavailable = true
      })
      this.terminal.loadAddon(addon)
      this.webgl = addon
    } catch {
      // Software rendering remains available when WebGL2 is unavailable or blocked.
      webgl?.dispose()
      this.webgl = undefined
      this.webglUnavailable = true
    }
  }

  private disableWebgl(): void {
    this.webgl?.dispose()
    this.webgl = undefined
  }

  private connect(): void { void this.connectSecure() }

  private async connectSecure(): Promise<void> {
    if (this.disposed) return
    const streaming = this.active && !document.hidden
    this.streaming = streaming
    this.socket = await SecureTerminalChannel.open(this.meta.id, this.receivedCursor.toString(), streaming, (data) => {
      if (typeof data === "string") {
        const message = JSON.parse(data) as { type?: string; terminal?: TerminalMeta; reset?: boolean; code?: number; title?: string; title_pinned?: boolean }
        if (message.type === "ready" && message.terminal) {
          this.meta = message.terminal
          if (message.reset) { this.writeGeneration += 1; this.terminal?.reset(); this.receivedCursor = 0n; this.pendingAck = 0n }
          if (this.meta.state === "ended" && !this.meta.command_id) { void this.close(); return }
          this.banner.textContent = this.meta.history_available ? "" : "Earlier terminal history is no longer retained. Live process state is unchanged."
          this.banner.classList.toggle("visible", !this.meta.history_available)
          renderTabs()
        } else if (message.type === "exit") {
          this.meta.state = "ended"
          this.meta.exit_code = message.code ?? null
          if (this.meta.command_id) renderTabs()
          else void this.close()
        } else if (message.type === "renamed" && message.title) {
          this.meta.title = message.title
          if (typeof message.title_pinned === "boolean") this.meta.title_pinned = message.title_pinned
          renderTabs()
        }
        else if (message.type === "history_unavailable") { this.banner.textContent = "Terminal history changed while reconnecting. Reconnecting with the retained baseline…"; this.banner.classList.add("visible") }
        return
      }
      const frame = data
      if (frame.length < 9 || frame[0] !== 1) return
      const cursor = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getBigUint64(1)
      if (cursor <= this.receivedCursor) return
      this.receivedCursor = cursor
      const bytes = frame.subarray(9)
      const generation = this.writeGeneration
      this.terminal?.write(bytes, () => {
        if (generation !== this.writeGeneration) return
        this.acknowledge(cursor)
      })
    }, () => {
      if (this.disposed || this.meta.state === "ended" || this.meta.state === "closing") return
      this.streaming = undefined
      this.socket = undefined
      renderTabs()
    })
    this.resize(); this.syncStreaming(); renderTabs()
  }

  private resize(): void {
    if (!this.fit || !this.terminal || this.pane.hidden || this.host.clientWidth < 2 || this.host.clientHeight < 2) return
    try { this.fit.fit(); this.send({ type: "resize", cols: this.terminal.cols, rows: this.terminal.rows }) } catch {}
  }
  private acknowledge(cursor: bigint): void {
    if (cursor > this.pendingAck) this.pendingAck = cursor
    if (this.ackTimer !== undefined) return
    this.ackTimer = window.setTimeout(() => {
      this.ackTimer = undefined
      this.send({ type: "ack", cursor: this.pendingAck.toString() })
    }, 16)
  }
  private scheduleAutomaticTitle(value: string): void {
    const title = boundedUtf8(value.replaceAll("\0", "").trim(), 64)
    if (!title || title === this.pendingAutomaticTitle || (!this.meta.title_pinned && title === this.meta.title)) return
    this.pendingAutomaticTitle = title
    if (this.titleTimer !== undefined) clearTimeout(this.titleTimer)
    this.titleTimer = window.setTimeout(() => {
      this.titleTimer = undefined
      const pending = this.pendingAutomaticTitle
      this.pendingAutomaticTitle = undefined
      if (!pending || this.disposed) return
      void api<TerminalMeta>("terminal.rename", { terminal_id: this.meta.id, mode: "automatic", title: pending }, { scope: "terminal.write" })
        .then((meta) => { this.meta = meta; renderTabs() })
        .catch(() => undefined)
    }, 120)
  }
  private send(message: unknown): void { this.socket?.send(message) }
  dispose(): void {
    this.disposed = true
    if (this.ackTimer !== undefined) clearTimeout(this.ackTimer)
    if (this.titleTimer !== undefined) clearTimeout(this.titleTimer)
    this.observer?.disconnect()
    this.socket?.close()
    this.disableWebgl()
    this.terminal?.dispose()
    this.pane.remove()
  }
}

let snapshot: Snapshot = {
  protocol: "web-v1",
  revision: "0",
  generated_at: new Date().toISOString(),
  pinned_workspace_ids: [],
  workspaces: [],
  archived_workspaces: [],
}
let snapshotRefreshGeneration = 0
let selectedPair: Pair | undefined
let activeTerminalId: string | undefined
let signalRefreshGeneration = 0
let signals: Signal[] = []
let eventCursor = "0"
const terminalViews = new Map<string, TerminalView>()
const pendingWorkspaceCreations = new Map<string, string>()
const pendingLifecycleOperations = new Set<string>()
const operationContexts = new Map<string, { actionId: Exclude<WebWorkspaceActionId, "operation.cancel">; workspaceId: string; workspaceName: string }>()
let workspaceActionInventory: WebWorkspaceAction[] = []
let workspaceActionInventoryKey = ""
let workspaceActionLoadingKey = ""
let overlayController: ReturnType<typeof createSingletonOverlayController>
let shortcutSettings: WebShortcutSettings | undefined

const shortcutPlatform: WebShortcutPlatform = /Mac(?:intosh| OS X)/i.test(navigator.userAgent) ? "macos" : "linux"
const overlayShortcutActions = new Map<WebShortcutActionId, (invocation: WebActionInvocation) => void>()

function registerOverlayShortcutAction(actionId: "workspace.switch" | "commands.open", callback: (invocation: WebActionInvocation) => void): void {
  overlayShortcutActions.set(actionId, callback)
}

function shortcutAvailability(actionId: WebShortcutActionId): WebActionAvailability {
  return overlayAwareActionAvailability(actionId, {
    exclusive: overlayController?.isExclusive() ?? false,
    navigationRegistered: overlayShortcutActions.has(actionId),
  })
}

function moveVisibleTerminal(direction: -1 | 1): void {
  const target = terminalTraversalTarget(visibleTerminals().map(({ id }) => id), activeTerminalId, direction)
  if ("message" in target) { toast(target.message); return }
  selectTerminal(target.terminalId)
}

function selectNextAttention(): void {
  const candidate = selectNextAttentionTarget({
    workspaces: snapshot.workspaces.map((workspace) => ({ ...workspace, pinned: preferences.pins.has(workspace.id) })),
    signals,
    terminals: [...terminalViews.values()].map(({ meta }) => meta),
    tabOrder: preferences.tabOrder,
    current: selectedPair ? { ...selectedPair, terminalId: activeTerminalId } : undefined,
  })
  if (!candidate) { toast("No workspace needs attention."); return }
  const target = candidate.target
  selectPair({ workspaceId: target.workspaceId, repositoryId: target.repositoryId })
  if (target.terminalId) selectTerminal(target.terminalId)
}

function hasResolvableAttention(): boolean {
  return Boolean(selectNextAttentionTarget({
    workspaces: snapshot.workspaces.map((workspace) => ({ ...workspace, pinned: preferences.pins.has(workspace.id) })),
    signals,
    terminals: [...terminalViews.values()].map(({ meta }) => meta),
    tabOrder: preferences.tabOrder,
    current: selectedPair ? { ...selectedPair, terminalId: activeTerminalId } : undefined,
  }))
}

const actionRegistrations = Object.fromEntries(WEB_SHORTCUT_ACTION_IDS.map((actionId) => [actionId, {
  availability: () => shortcutAvailability(actionId),
  callback: (invocation: WebActionInvocation) => {
    if (actionId === "workspace.switch" || actionId === "commands.open") {
      overlayShortcutActions.get(actionId)?.(invocation)
    } else if (actionId === "workspace.new") {
      void showCreation()
    } else if (actionId === "terminal.new") {
      if (!selectedPair) toast("Select a repository before starting a terminal.")
      else void createTerminal()
    } else if (actionId === "terminal.close") {
      if (!activeTerminalId) toast("No active terminal to close.")
      else void terminalViews.get(activeTerminalId)?.close()
    } else if (actionId === "terminal.previous") {
      moveVisibleTerminal(-1)
    } else if (actionId === "terminal.next") {
      moveVisibleTerminal(1)
    } else if (actionId === "attention.next") {
      selectNextAttention()
    }
  },
} satisfies WebActionRegistration])) as Record<WebShortcutActionId, WebActionRegistration>
const webActionRegistry = createWebActionRegistry(actionRegistrations)
const shortcutSettingsCoordinator = createWebShortcutSettingsCoordinator(webActionRegistry, {
  load: () => api<WebShortcutSettings>("shortcuts.get", { platform: shortcutPlatform }, { scope: "snapshot.read" }),
  mutate: (mutation) => api<WebShortcutSettings>("shortcuts.set", mutation, { scope: "operation.write" }),
  classifyConflict: classifyWebShortcutMutationConflict,
  onChange: (settings) => { shortcutSettings = settings },
})
const shortcutDispatcher = createWebShortcutDispatcher(webActionRegistry)
function invokeRegisteredAction(actionId: WebShortcutActionId): void {
  const action = webActionRegistry.entry(actionId)
  if (!action) return
  if (!action.availability.available) {
    toast(action.availability.disabledReason, true)
    return
  }
  action.callback({ actionId, kind: "execute", source: "document" })
}
registerOverlayShortcutAction("commands.open", (invocation) => {
  if (invocation.kind === "refocus") {
    if (overlayController.activeSurface() === "commands.open") overlayController.focusPrimary()
    return
  }
  showLauncher()
})
registerOverlayShortcutAction("workspace.switch", (invocation) => {
  if (invocation.kind === "refocus") {
    if (overlayController.activeSurface() === "workspace.switch") overlayController.focusPrimary()
    return
  }
  showWorkspaceSwitcher()
})

app.innerHTML = `<div class="app"><header class="topbar"><div class="brand"><span class="brand-mark">gs</span><span>git-stacks</span></div><button class="header-signal" id="signal-toggle" type="button" aria-label="Signal inbox" aria-haspopup="dialog" aria-expanded="false"><span class="signal-glyph" aria-hidden="true">!</span><span id="signal-label">Signals</span><span class="header-badge" id="signal-count" hidden></span></button><div class="top-status" id="status" role="status"></div><div class="toolbar"><button class="button toolbar-discovery" id="next-attention" type="button" aria-label="Next attention" title="Next attention"><span aria-hidden="true">!</span><span class="wide">Next attention</span></button><button class="button toolbar-discovery" id="keyboard-shortcuts" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts"><span aria-hidden="true">⌨</span><span class="wide">Keyboard shortcuts</span></button><button class="button toolbar-compact" id="archived" type="button" aria-label="Archived workspaces"><span aria-hidden="true">▣</span><span class="wide">Archived</span></button><button class="button icon" id="theme" title="Change theme" aria-label="Change theme">◐</button><button class="button primary" id="launcher" aria-label="Configured commands"><span aria-hidden="true">⌘</span><span class="wide">Commands</span></button></div></header><div class="workspace-grid"><nav class="sidebar" aria-label="Workspaces"><div class="sidebar-tools"><div class="organization-switch" role="group" aria-label="Organize workspaces"><button type="button" data-organization="label">Labels</button><button type="button" data-organization="repository">Repositories</button></div><button class="button sidebar-create" id="create" type="button"><span aria-hidden="true">＋</span> Create workspace</button></div><div class="sidebar-summary"><span>Workspaces</span><span id="workspace-count"></span></div><ul class="nav-list" id="nav"></ul></nav><main class="main"><div class="scopebar" id="scope"></div><div class="tabs" id="tabs" role="tablist" aria-label="Repository terminals"></div><div class="terminal-deck" id="terminal-deck"></div></main></div></div><section class="signal-popover" id="signal-inbox" role="dialog" aria-modal="false" aria-labelledby="signal-inbox-title" hidden><header class="signal-popover-head"><div><strong id="signal-inbox-title">Signals</strong><span>Workspace and terminal activity</span></div><button class="button icon" id="signal-close" type="button" aria-label="Close signals">×</button></header><div class="signal-list" id="signals"></div></section><div class="context-menu" id="context-menu" role="menu" hidden></div><div class="operation-region" id="operations" aria-live="polite"></div><div class="toast-region" id="toasts" aria-live="polite"></div>`
const statusNode = document.querySelector<HTMLElement>("#status")!
const nav = document.querySelector<HTMLUListElement>("#nav")!
const scope = document.querySelector<HTMLElement>("#scope")!
const tabs = document.querySelector<HTMLElement>("#tabs")!
const terminalDeck = document.querySelector<HTMLElement>("#terminal-deck")!
const signalsNode = document.querySelector<HTMLElement>("#signals")!
const signalInbox = document.querySelector<HTMLElement>("#signal-inbox")!
const signalToggle = document.querySelector<HTMLButtonElement>("#signal-toggle")!
const toastRegion = document.querySelector<HTMLElement>("#toasts")!
const contextMenu = document.querySelector<HTMLElement>("#context-menu")!
const operationRegion = document.querySelector<HTMLElement>("#operations")!

function restoreOverlayFocus(terminalId: string | undefined): void {
  const terminal = terminalId ? terminalViews.get(terminalId) : undefined
  if (terminal) {
    const { workspace_id: workspaceId, repository_id: repositoryId } = terminal.meta
    if (selectedPair?.workspaceId !== workspaceId || selectedPair.repositoryId !== repositoryId) selectPair({ workspaceId, repositoryId })
    selectTerminal(terminal.meta.id)
    return
  }
  if (activeTerminalId && terminalViews.has(activeTerminalId)) {
    terminalViews.get(activeTerminalId)?.focusInput()
    return
  }
  document.querySelector<HTMLElement>("#keyboard-shortcuts, #launcher, #create, .workspace-row")?.focus()
}

overlayController = createSingletonOverlayController(document, { restoreFocus: restoreOverlayFocus })

function selectedWorkspace(): Workspace | undefined { return snapshot.workspaces.find((item) => item.id === selectedPair?.workspaceId) }
function selectedRepository(): Repository | undefined { return selectedWorkspace()?.repositories.find((item) => item.id === selectedPair?.repositoryId) }

type WebOperationIntent = {
  actionId: Exclude<WebWorkspaceActionId, "operation.cancel">
  workspaceId: string
  workspaceName: string
  body: unknown
  idempotencyKey: string
}

function operationCancellation(operationId: string): { state: "available" } | { state: "unavailable"; reason: "not-cancellable" } {
  const available = workspaceActionInventory.some((descriptor) => descriptor.action_id === "operation.cancel"
    && descriptor.subject.kind === "operation"
    && descriptor.subject.operation_id === operationId
    && descriptor.availability.available)
  return available ? { state: "available" } : { state: "unavailable", reason: "not-cancellable" }
}

function summarizeOperation(operation: WebOperation, context: WebOperationIntent): WebOperationSummary {
  const common = {
    operation_id: operation.operation_id,
    action_id: context.actionId,
    workspace_id: context.workspaceId,
    workspace_name: context.workspaceName,
    accepted_at: operation.accepted_at,
  }
  if (operation.state === "accepted") return { ...common, state: "accepted" }
  if (operation.state === "running") return {
    ...common,
    state: "running",
    started_at: operation.started_at!,
    progress: {
      stage: "executing",
      ...(operation.progress?.message ? { message: operation.progress.message } : {}),
      ...(operation.progress?.completed === undefined ? {} : { completed: operation.progress.completed, total: operation.progress.total! }),
    },
    cancellation: operationCancellation(operation.operation_id),
  }
  if (operation.state === "succeeded") return {
    ...common,
    state: "succeeded",
    started_at: operation.started_at!,
    finished_at: operation.finished_at!,
    cancellation: { state: "unavailable", reason: "finished" },
    result: operation.result ?? {},
  }
  return {
    ...common,
    state: operation.state,
    ...(operation.started_at ? { started_at: operation.started_at } : {}),
    finished_at: operation.finished_at!,
    cancellation: { state: "unavailable", reason: "finished" },
    error: {
      code: operation.error?.code ?? "operation_failed",
      message: operation.error?.message ?? "The operation failed.",
      retryable: operation.error?.code === "conflict",
      ...(operation.error?.forge ? { forge: operation.error.forge } : {}),
    },
  }
}

const operationTracker = createOperationTracker<WebOperationIntent>({
  async submit(intent) {
    const operation = await api<WebOperation>("operation.submit", intent.body, {
      scope: "operation.write",
      idempotencyKey: intent.idempotencyKey,
    })
    operationContexts.set(operation.operation_id, {
      actionId: intent.actionId,
      workspaceId: intent.workspaceId,
      workspaceName: intent.workspaceName,
    })
    return summarizeOperation(operation, intent)
  },
  async get(operationId) {
    const context = operationContexts.get(operationId)
    if (!context) throw new Error("Operation context is unavailable; refresh workspace state.")
    const operation = await api<WebOperation>("operation.get", { operation_id: operationId }, { scope: "snapshot.read" })
    return summarizeOperation(operation, { ...context, body: {}, idempotencyKey: "" })
  },
  cancel: (operationId) => api<OperationCancelResult>("operation.cancel", { operation_id: operationId }, { scope: "operation.write" }),
  refresh: reconcileAuthoritativeState,
  reconcile: () => { workspaceActionInventoryKey = "" },
}, { maxCards: 3 })

function renderOperationCards(): void {
  operationRegion.replaceChildren()
  const state = operationTracker.state()
  if (state.phase === "submitting") {
    const pending = element("article", "operation-card")
    pending.setAttribute("aria-busy", "true")
    pending.append(element("strong", "", "Workspace action…"), element("span", "", "Submitting once to the service."))
    operationRegion.append(pending)
  }
  for (const operation of operationTracker.cards()) {
    const card = element("article", `operation-card ${operation.state}`)
    if (operation.state === "failed") card.setAttribute("role", "alert")
    card.append(
      element("strong", "", `${operation.action_id.replace("workspace.", "").replaceAll("-", " ")} — ${operation.workspace_name}`),
      element("span", "operation-stage", operation.state === "running"
        ? operation.progress.message ?? "Operation in progress."
        : operation.state === "accepted"
          ? "Operation accepted."
          : operation.state === "succeeded"
            ? "Workspace state refreshed."
            : operation.error.message),
    )
    if ((operation.state === "accepted" || operation.state === "running") && operation.cancellation?.state === "available") {
      const cancel = button(`Cancel ${operation.action_id.replace("workspace.", "")}`, "button")
      cancel.addEventListener("click", async () => {
        cancel.disabled = true
        cancel.textContent = "Cancelling…"
        const result = await operationTracker.cancel()
        if ("outcome" in result && (result.outcome === "too-late" || result.outcome === "not-cancellable" || result.outcome === "already-finished")) {
          toast(`${operation.action_id.replace("workspace.", "")} is already finishing and can no longer be cancelled.`)
        }
        renderOperationCards()
      })
      card.append(cancel)
    }
    operationRegion.append(card)
  }
  if (state.phase === "reconnecting") operationRegion.prepend(element("div", "operation-connection", "Reconnecting to the known workspace operation…"))
  if (state.phase === "refresh-failed") {
    const retry = button("Retry refresh", "button")
    retry.addEventListener("click", async () => { await operationTracker.retryRefresh(); renderOperationCards(); renderAll() })
    operationRegion.prepend(element("div", "operation-connection error", "Workspace state could not be refreshed."), retry)
  }
  const overflow = operationTracker.overflowCount()
  if (overflow) {
    const more = button(`View ${overflow} more operations`, "button operation-more")
    more.addEventListener("click", () => {
      const view = modal("Workspace operations")
      if (view) view.body.append(element("p", "", `${overflow} older operations are retained by this session. Refresh authoritative state before repeating an action.`))
    })
    operationRegion.append(more)
  }
}

async function observeTrackedOperation(operationId: string): Promise<void> {
  const context = operationContexts.get(operationId)
  if (!context) return
  const operation = await api<WebOperation>("operation.get", { operation_id: operationId }, { scope: "snapshot.read" })
  await operationTracker.observe(summarizeOperation(operation, { ...context, body: {}, idempotencyKey: "" }))
  renderOperationCards()
  renderAll()
}

async function submitDurableWorkspaceAction(
  actionId: Exclude<WebWorkspaceActionId, "operation.cancel">,
  workspace: Workspace,
  body: unknown,
): Promise<{ kind: "operation"; operationId: string }> {
  const submission = operationTracker.submit({
    actionId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    body,
    idempotencyKey: `${actionId}-${workspace.id}-${crypto.randomUUID()}`,
  })
  renderOperationCards()
  const result = await submission
  renderOperationCards()
  if (result.status !== "observing") throw new Error(`${actionId} is already running for ${workspace.name}.`)
  return { kind: "operation", operationId: result.operationId }
}

async function loadWorkspaceActions(workspace: Workspace): Promise<void> {
  const key = `${workspace.id}:${snapshot.revision}`
  if (workspaceActionInventoryKey === key || workspaceActionLoadingKey === key) return
  workspaceActionLoadingKey = key
  try {
    const inventory = await api<WebWorkspaceAction[]>("workspace.actions", {
      workspace_id: workspace.id,
      expected_revision: snapshot.revision,
    }, { scope: "snapshot.read" })
    if (selectedPair?.workspaceId !== workspace.id || snapshot.revision !== key.slice(key.indexOf(":") + 1)) return
    workspaceActionInventory = inventory
    workspaceActionInventoryKey = key
    renderScope()
  } catch {
    if (selectedPair?.workspaceId === workspace.id) toast("Workspace actions could not be loaded. Retry after refreshing.", true)
  } finally {
    if (workspaceActionLoadingKey === key) workspaceActionLoadingKey = ""
  }
}
function visibleTerminals(): TerminalMeta[] {
  if (!selectedPair) return []
  return [...terminalViews.values()].map((view) => view.meta)
    .filter((item) => item.workspace_id === selectedPair?.workspaceId && item.repository_id === selectedPair.repositoryId)
    .sort((a, b) => {
      const left = preferences.tabOrder.indexOf(a.id), right = preferences.tabOrder.indexOf(b.id)
      return (left === -1 ? Number.MAX_SAFE_INTEGER : left) - (right === -1 ? Number.MAX_SAFE_INTEGER : right)
    })
}
function selectPair(pair: Pair): void {
  if (selectedPair?.workspaceId !== pair.workspaceId) {
    workspaceActionInventory = []
    workspaceActionInventoryKey = ""
  }
  selectedPair = pair
  preferences.lastPair = pair
  savePreferences()
  const first = visibleTerminals()[0]
  activeTerminalId = first?.id
  renderAll()
  const workspace = selectedWorkspace()
  if (workspace) void loadWorkspaceActions(workspace)
  void refreshSignals()
}

const confirmedForceNames = new Map<string, string>()

function confirmWorkspaceDescriptor(descriptor: WebWorkspaceAction): Promise<boolean> | boolean {
  if (descriptor.confirmation === "none") return true
  const workspace = snapshot.workspaces.find(({ id }) => id === descriptor.subject.workspace_id)
  if (!workspace) return false
  return new Promise<boolean>((resolve) => {
    const exact = descriptor.confirmation === "exact-name"
    const action = descriptor.action_id === "workspace.remove"
      ? "Remove"
      : descriptor.action_id === "workspace.merge"
        ? "Merge"
        : descriptor.action_id === "workspace.notes.clear"
          ? "Clear all notes for"
          : "Force remove"
    const view = modal(`${action} ${workspace.name}?`)
    if (!view) { resolve(false); return }
    if (descriptor.action_id === "workspace.remove") {
      view.body.append(element("p", "lifecycle-warning", `Remove ${workspace.name} permanently. This cannot be undone.`))
      const inventory = element("ul", "removal-inventory")
      for (const item of ["Service-owned terminals", "Managed Git worktrees", "Workspace directory", "Workspace YAML definition"]) inventory.append(element("li", "", item))
      view.body.append(inventory)
    } else if (descriptor.action_id === "workspace.notes.clear") {
      view.body.append(element("p", "lifecycle-warning", `Clear all notes for ${workspace.name}? This permanently removes the workspace note history.`))
    } else {
      view.body.append(element("p", "lifecycle-warning", `${action} ${workspace.name}? Review the authoritative workspace state before continuing.`))
    }
    const confirmation = exact ? element("input") : undefined
    if (confirmation) {
      confirmation.setAttribute("aria-label", `Type ${workspace.name} to confirm irreversible removal`)
      confirmation.placeholder = workspace.name
      view.body.append(confirmation)
    }
    const actions = element("div", "modal-actions")
    const keep = button(descriptor.action_id === "workspace.notes.clear" ? "Keep notes" : exact ? "Back" : "Keep workspace")
    const submit = button(
      descriptor.action_id === "workspace.notes.clear" ? "Clear workspace notes" : `${action} workspace`,
      descriptor.action_id === "workspace.remove" || exact || descriptor.action_id === "workspace.notes.clear" ? "button danger" : "button primary",
    )
    if (confirmation) {
      submit.disabled = true
      confirmation.addEventListener("input", () => { submit.disabled = confirmation.value !== workspace.name })
    }
    let settled = false
    const finish = (accepted: boolean) => {
      if (settled) return
      settled = true
      if (accepted && confirmation) confirmedForceNames.set(workspace.id, confirmation.value)
      view.close()
      resolve(accepted)
    }
    keep.addEventListener("click", () => finish(false))
    submit.addEventListener("click", () => finish(!confirmation || confirmation.value === workspace.name))
    actions.append(keep, submit)
    view.body.append(actions)
    keep.focus()
  })
}

function workspaceActionCallbacks(workspace: Workspace): Record<WebWorkspaceActionId, WorkspaceActionCallback> {
  const terminal = async (): Promise<{ kind: "terminal" }> => ({ kind: "terminal" })
  const durable = (actionId: Exclude<WebWorkspaceActionId, "operation.cancel">, body: unknown) =>
    submitDurableWorkspaceAction(actionId, workspace, body)
  const workspaceMutation = (actionId: "workspace.open" | "workspace.close" | "workspace.sync" | "workspace.pull" | "workspace.push" | "workspace.merge") =>
    durable(actionId, { kind: actionId, request: { workspace_id: workspace.id, expected_revision: snapshot.revision } })
  return {
    "workspace.archive": async () => { await archiveWorkspace(workspace); return terminal() },
    "workspace.unarchive": async () => { await unarchiveWorkspace(lifecycleTarget(workspace)); return terminal() },
    "workspace.remove": async () => {
      const operation = await runWorkspaceLifecycle("workspace.remove", lifecycleTarget(workspace))
      const details = operation?.state === "failed" ? operation.error?.lifecycle : undefined
      if (details?.kind === "workspace_dirty" && details.terminals_stopped && details.force_allowed) {
        const current = snapshot.workspaces.find(({ id }) => id === workspace.id)
        if (current) showDirtyRemovalFailure(current, details)
      }
      return terminal()
    },
    "workspace.force-remove": async () => {
      const confirmation = confirmedForceNames.get(workspace.id)
      confirmedForceNames.delete(workspace.id)
      if (confirmation === workspace.name) await runWorkspaceLifecycle("workspace.force-remove", lifecycleTarget(workspace), confirmation)
      return terminal()
    },
    "workspace.rename": async () => {
      const nextName = prompt(`Rename ${workspace.name}`, workspace.name)?.trim()
      if (!nextName || nextName === workspace.name) return terminal()
      return durable("workspace.rename", { mutation: "workspace.rename", request: { workspace: workspace.name, new_name: nextName } })
    },
    "workspace.open": () => workspaceMutation("workspace.open"),
    "workspace.close": () => workspaceMutation("workspace.close"),
    "workspace.pin": async () => { await persistPins([...preferences.pins, workspace.id]); return terminal() },
    "workspace.unpin": async () => { await persistPins([...preferences.pins].filter((id) => id !== workspace.id)); return terminal() },
    "workspace.sync": () => workspaceMutation("workspace.sync"),
    "workspace.pull": () => workspaceMutation("workspace.pull"),
    "workspace.push": () => workspaceMutation("workspace.push"),
    "workspace.merge": () => workspaceMutation("workspace.merge"),
    "workspace.notes.list": async () => { await showWorkspaceNotes(workspace); return terminal() },
    "workspace.notes.add": terminal,
    "workspace.notes.clear": terminal,
    "workspace.files.inspect": async () => { await showWorkspaceFileStatus(workspace); return terminal() },
    "operation.cancel": async () => { await operationTracker.cancel(); renderOperationCards(); return terminal() },
  }
}

function actionRegistryFor(workspace: Workspace) {
  return createWorkspaceActionRegistry(workspaceActionInventory, workspaceActionCallbacks(workspace), {
    confirm: confirmWorkspaceDescriptor,
    localAvailability: (descriptor) => operationTracker.isLocked()
      && descriptor.action_id !== "workspace.notes.list"
      && descriptor.action_id !== "workspace.files.inspect"
      && descriptor.action_id !== "operation.cancel"
      ? { available: false, reason: "Another workspace action is still reconciling." }
      : { available: true },
  })
}

function invokeWorkspaceAction(workspace: Workspace, actionId: WebWorkspaceActionId): void {
  const entry = actionRegistryFor(workspace).entry(actionId)
  if (!entry) {
    if (actionId === "workspace.remove") showRemoveConfirmation(workspace)
    else toast("Workspace action is not loaded yet.", true)
    return
  }
  void entry.pointer.callback().then((result) => {
    if (result.status === "unavailable") toast(`${entry.label} unavailable — ${result.reason}`, true)
    renderOperationCards()
  }).catch(() => toast(`${entry.label} could not be submitted. Refresh before trying again.`, true))
}

function canonicalContextActions(workspace: Workspace): ContextAction[] {
  return workspaceActionMenuRows(actionRegistryFor(workspace)).map((row) => ({
    label: row.label,
    group: row.group,
    destructive: row.destructive,
    disabledReason: row.disabledReason,
    run: () => {
      void row.callback().then((result) => {
        if (result.status === "unavailable") toast(`${row.label} unavailable — ${result.reason}`, true)
        renderOperationCards()
      }).catch(() => toast(`${row.label} could not be submitted. Refresh before trying again.`, true))
    },
  }))
}

function attentionCount(workspaceId: string, repositoryId?: string, surfaceId?: string): number {
  return signals.filter((signal) => matchesSignalScope(signal, workspaceId, repositoryId, surfaceId) && signalGroup(signal) === "needs-attention").length
}
function pairActive(workspaceId: string, repositoryId: string): boolean {
  const commandRunning = [...terminalViews.values()].some((view) => view.meta.workspace_id === workspaceId && view.meta.repository_id === repositoryId && Boolean(view.meta.command_id) && view.meta.state !== "ended")
  return commandRunning || signals.some((signal) => matchesSignalScope(signal, workspaceId, repositoryId) && isBackgroundActivity(signal))
}
async function persistPins(ids: string[]): Promise<void> {
  const previous = [...preferences.pins]
  preferences.pins = new Set(ids)
  renderNav()
  try {
    const result = await api<{ workspace_ids: string[] }>("workspace.pins.set", { workspace_ids: ids, expected_revision: snapshot.revision }, { scope: "operation.write" })
    preferences.pins = new Set(result.workspace_ids)
    renderNav()
    await refreshSnapshot()
  } catch (error) {
    preferences.pins = new Set(previous)
    renderNav()
    toast(String(error), true)
  }
}
type WorkspacePriority = { workspace_id: string; priority: number }
async function persistPriorities(priorities: WorkspacePriority[]): Promise<void> {
  const previous = new Map(snapshot.workspaces.map((workspace) => [workspace.id, workspace.priority]))
  const optimistic = new Map(priorities.map(({ workspace_id, priority }) => [workspace_id, priority]))
  for (const workspace of snapshot.workspaces) workspace.priority = optimistic.get(workspace.id) ?? workspace.priority
  renderNav()
  try {
    const result = await api<{ priorities: WorkspacePriority[] }>("workspace.priorities.set", { priorities, expected_revision: snapshot.revision }, { scope: "operation.write" })
    const accepted = new Map(result.priorities.map(({ workspace_id, priority }) => [workspace_id, priority]))
    for (const workspace of snapshot.workspaces) workspace.priority = accepted.get(workspace.id) ?? workspace.priority
    renderNav()
    await refreshSnapshot()
  } catch (error) {
    for (const workspace of snapshot.workspaces) workspace.priority = previous.get(workspace.id) ?? 0
    renderNav()
    toast(String(error), true)
  }
}
function reorderWorkspace(sourceId: string, targetId: string, after: boolean): void {
  if (sourceId === targetId) return
  const order = [...snapshot.workspaces].sort(workspacePriorityOrder)
  const sourceIndex = order.findIndex(({ id }) => id === sourceId)
  if (sourceIndex < 0 || !order.some(({ id }) => id === targetId)) return
  const [source] = order.splice(sourceIndex, 1)
  const targetIndex = order.findIndex(({ id }) => id === targetId)
  order.splice(targetIndex + Number(after), 0, source!)
  void persistPriorities(order.map((workspace, index) => ({ workspace_id: workspace.id, priority: order.length - index })))
}
type SidebarEntry = { workspace: Workspace; repository: Repository }
type SidebarGroupKind = "pinned" | "active" | "label" | "repository"

function openSignalInbox(): void {
  signalInbox.hidden = false
  signalToggle.setAttribute("aria-expanded", "true")
  document.querySelector<HTMLButtonElement>("#signal-close")?.focus()
}
function closeSignalInbox(restoreFocus = true): void {
  signalInbox.hidden = true
  signalToggle.setAttribute("aria-expanded", "false")
  if (restoreFocus) signalToggle.focus()
}
function workspaceItem(entry: SidebarEntry, pinned: boolean, groupKind: SidebarGroupKind): HTMLLIElement {
  const { workspace, repository } = entry
  const item = element("li", "workspace")
  const container = element("div", `workspace-row-container${pinned ? " pinned" : ""}`)
  const pairSignals = signals.filter((signal) => matchesSignalScope(signal, workspace.id, repository.id))
  const sessions = deduplicateProviderSessions(pairSignals)
  const notifications = pairSignals.filter((signal) => signal.kind === "notification").length
  const working = pairSignals.some(isBackgroundActivity)
  const running = [...terminalViews.values()].some((view) => view.meta.workspace_id === workspace.id && view.meta.repository_id === repository.id && Boolean(view.meta.command_id) && view.meta.state !== "ended")
  const selected = selectedPair?.workspaceId === workspace.id && selectedPair.repositoryId === repository.id
  const row = button("", `workspace-row${selected ? " active" : ""}${repository.degraded || !repository.exists ? " degraded" : ""}`)
  const title = groupKind === "repository" || workspace.repositories.length === 1 ? workspace.name : `${workspace.name} / ${repository.name}`
  row.setAttribute("aria-label", `${title}, repository ${repository.name}, branch ${repository.branch || workspace.branch}${pinned ? ", pinned" : ""}${sessions.length ? `, ${sessions.length} active agent${sessions.length === 1 ? "" : "s"}` : ""}${notifications ? `, ${notifications} unread notifications` : ""}`)
  const icon = element("span", `workspace-icon${repository.degraded || !repository.exists ? " warning" : ""}`)
  icon.setAttribute("aria-hidden", "true")
  icon.innerHTML = repository.degraded || !repository.exists
    ? `<svg viewBox="0 0 16 16"><path d="M8 2 14 14H2Z"/><path d="M8 6v4M8 12v.1"/></svg>`
    : `<svg viewBox="0 0 16 16"><path d="M2 4.5h4l1.2 1.5H14v7.5H2Z"/></svg>`
  const text = element("span", "workspace-text")
  text.append(element("span", "workspace-primary", title))
  const secondaryParts = [repository.branch || workspace.branch]
  if (repository.ahead) secondaryParts.push(`↑${repository.ahead}`)
  if (repository.behind) secondaryParts.push(`↓${repository.behind}`)
  text.append(element("span", "workspace-secondary", secondaryParts.filter(Boolean).join(" · ")))
  const status = element("span", "workspace-status")
  if (repository.additions) status.append(element("span", "git-additions", `+${repository.additions}`))
  if (repository.removals) status.append(element("span", "git-removals", `-${repository.removals}`))
  if (sessions.length) {
    const providers = element("span", "provider-stack")
    for (const signal of sessions.slice(0, 3)) {
      const provider = providerBadge(signal.source, `provider-chip${signal.state === "waiting" ? " awaiting" : ""}${signal.state === "completed" ? " completed" : ""}${signal.state === "failed" ? " failed" : ""}`)
      provider.title = `${providerName(signal.source)} · ${lifecycleLabel(signal)}`
      provider.setAttribute("aria-label", provider.title)
      providers.append(provider)
    }
    if (sessions.length > 3) providers.append(element("span", "provider-chip overflow", `+${sessions.length - 3}`))
    status.append(providers)
  }
  if (working || running) {
    const activity = element("span", "activity-marker")
    activity.title = working ? "Agent working" : "Configured command running"
    activity.setAttribute("aria-label", activity.title)
    status.append(activity)
  }
  if (notifications) {
    const unread = button("", "unread-marker")
    unread.title = `${notifications} unread notification${notifications === 1 ? "" : "s"}`
    unread.setAttribute("aria-label", `${unread.title}; open signal inbox`)
    unread.addEventListener("click", (event) => { event.stopPropagation(); openSignalInbox() })
    status.append(unread)
  }
  row.append(icon, text, status)
  row.draggable = true
  row.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("application/x-git-stacks-workspace", workspace.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
    container.classList.add("dragging")
  })
  row.addEventListener("dragend", () => container.classList.remove("dragging"))
  row.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("application/x-git-stacks-workspace")) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const after = event.clientY >= row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2
    container.classList.toggle("drop-before", !after)
    container.classList.toggle("drop-after", after)
  })
  row.addEventListener("dragleave", () => container.classList.remove("drop-before", "drop-after"))
  row.addEventListener("drop", (event) => {
    event.preventDefault()
    container.classList.remove("drop-before", "drop-after")
    const sourceId = event.dataTransfer?.getData("application/x-git-stacks-workspace")
    if (!sourceId) return
    const bounds = row.getBoundingClientRect()
    reorderWorkspace(sourceId, workspace.id, event.clientY >= bounds.top + bounds.height / 2)
  })
  row.addEventListener("click", () => selectPair({ workspaceId: workspace.id, repositoryId: repository.id }))
  row.addEventListener("contextmenu", (event) => {
    selectPair({ workspaceId: workspace.id, repositoryId: repository.id })
    const canonical = canonicalContextActions(workspace)
    showContextMenu(event, canonical.length ? canonical : [{ label: "Workspace actions", disabledReason: "Actions are still loading.", run: () => undefined }])
  })
  const pin = button(pinned ? "★" : "☆", `pin-button${pinned ? " pin" : ""}`)
  pin.setAttribute("aria-label", `${pinned ? "Unpin" : "Pin"} workspace ${workspace.name}`)
  pin.addEventListener("click", () => {
    invokeWorkspaceAction(workspace, pinned ? "workspace.unpin" : "workspace.pin")
  })
  container.append(row, pin); item.append(container)
  return item
}
function navGroup(title: string, entries: SidebarEntry[], groupKind: SidebarGroupKind): void {
  if (!entries.length) return
  const heading = element("li", `nav-group ${groupKind}`, title)
  heading.setAttribute("role", "heading"); heading.setAttribute("aria-level", "2"); nav.append(heading)
  for (const entry of entries) nav.append(workspaceItem(entry, groupKind === "pinned", groupKind))
}
function renderNav(): void {
  nav.replaceChildren()
  document.querySelector("#workspace-count")!.textContent = String(snapshot.workspaces.length)
  for (const control of document.querySelectorAll<HTMLButtonElement>("[data-organization]")) {
    const active = control.dataset.organization === preferences.organization
    control.classList.toggle("active", active)
    control.setAttribute("aria-pressed", String(active))
  }
  const byPriority = (left: SidebarEntry, right: SidebarEntry) => workspacePriorityOrder(left.workspace, right.workspace) || left.repository.name.localeCompare(right.repository.name)
  const pairs = snapshot.workspaces.flatMap((workspace) => workspace.repositories.map((repository) => ({ workspace, repository })))
  const pinned = pairs.filter(({ workspace }) => preferences.pins.has(workspace.id)).sort(byPriority)
  const unpinned = pairs.filter(({ workspace }) => !preferences.pins.has(workspace.id))
  const active = unpinned.filter(({ workspace, repository }) => pairActive(workspace.id, repository.id)).sort(byPriority)
  const ordinary = unpinned.filter(({ workspace, repository }) => !pairActive(workspace.id, repository.id)).sort(byPriority)
  navGroup("Pinned", pinned, "pinned")
  navGroup("Active", active, "active")
  if (preferences.organization === "label") {
    const groups = new Map<string, SidebarEntry[]>()
    for (const entry of ordinary) for (const label of entry.workspace.labels.length ? entry.workspace.labels : ["Unlabelled"]) groups.set(label, [...(groups.get(label) ?? []), entry])
    for (const [label, entries] of [...groups].sort(([left], [right]) => left.localeCompare(right))) navGroup(label, entries, "label")
  } else {
    const groups = new Map<string, SidebarEntry[]>()
    for (const entry of ordinary) groups.set(entry.repository.name, [...(groups.get(entry.repository.name) ?? []), entry])
    for (const [repository, entries] of [...groups].sort(([left], [right]) => left.localeCompare(right))) navGroup(repository, entries, "repository")
  }
  if (!nav.children.length) nav.append(element("li", "empty-nav", "No workspaces"))
}

function renderScope(): void {
  scope.replaceChildren()
  const workspace = selectedWorkspace(), repository = selectedRepository()
  const title = element("div", "scope-title")
  if (workspace && repository) title.innerHTML = `<strong></strong><span></span>`, title.querySelector("strong")!.textContent = workspace.name, title.querySelector("span")!.textContent = ` / ${repository.name} · ${repository.branch || workspace.branch}`
  else title.textContent = "Select a repository"
  scope.append(title)
  if (workspace && repository) {
    void loadWorkspaceActions(workspace)
    const shell = button("New shell", "button primary")
    shell.addEventListener("click", () => void createTerminal())
    const actions = element("div", "scope-actions")
    const toggle = button("Workspace actions", "button workspace-actions-toggle")
    toggle.setAttribute("aria-label", "Workspace actions")
    toggle.setAttribute("aria-haspopup", "menu")
    toggle.setAttribute("aria-expanded", "false")
    const menu = element("div", "scope-menu")
    menu.setAttribute("role", "menu")
    menu.hidden = true
    const rows = canonicalContextActions(workspace)
    let group = ""
    for (const row of rows) {
      if (row.group && row.group !== group) {
        group = row.group
        menu.append(element("div", "scope-menu-group", group))
      }
      const control = button(row.label, `scope-menu-item${row.destructive ? " destructive" : ""}`)
      control.setAttribute("role", "menuitem")
      control.setAttribute("aria-disabled", String(Boolean(row.disabledReason)))
      control.tabIndex = 0
      if (row.disabledReason) control.append(element("span", "scope-menu-reason", row.disabledReason))
      control.addEventListener("click", () => {
        if (row.disabledReason) { toast(`${row.label} unavailable — ${row.disabledReason}`, true); return }
        menu.hidden = true
        toggle.setAttribute("aria-expanded", "false")
        row.run()
      })
      menu.append(control)
    }
    if (!rows.length) menu.append(element("div", "scope-menu-empty", "Workspace actions are loading…"))
    toggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden
      toggle.setAttribute("aria-expanded", String(!menu.hidden))
      if (!menu.hidden) menu.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus()
    })
    actions.append(toggle, menu)
    scope.append(shell, actions)
  }
  renderTabs()
}

function renderTabs(): void {
  tabs.replaceChildren()
  terminalDeck.querySelectorAll(":scope > .empty").forEach((item) => item.remove())
  const visible = visibleTerminals()
  if (!activeTerminalId || !visible.some((item) => item.id === activeTerminalId)) activeTerminalId = visible[0]?.id
  const visibleIds = new Set(visible.map((item) => item.id))
  terminalViews.forEach((view, id) => { if (!visibleIds.has(id)) view.deactivate() })
  for (const meta of visible) {
    const view = terminalViews.get(meta.id)!
    const tab = element("div", `tab${activeTerminalId === meta.id ? " active" : ""}`)
    tab.setAttribute("role", "tab")
    tab.tabIndex = 0
    tab.setAttribute("aria-selected", String(activeTerminalId === meta.id))
    tab.draggable = true
    tab.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", meta.id))
    tab.addEventListener("dragover", (event) => event.preventDefault())
    tab.addEventListener("drop", (event) => {
      event.preventDefault()
      const source = event.dataTransfer?.getData("text/plain")
      if (!source || source === meta.id) return
      const order = visibleTerminals().map((item) => item.id)
      const sourceIndex = order.indexOf(source), targetIndex = order.indexOf(meta.id)
      if (sourceIndex < 0 || targetIndex < 0) return
      order.splice(sourceIndex, 1)
      order.splice(targetIndex, 0, source)
      preferences.tabOrder = [...preferences.tabOrder.filter((id) => !order.includes(id)), ...order]
      savePreferences()
      renderTabs()
    })
    const dot = element("span", `state-dot${meta.state === "ended" ? " ended" : meta.state === "cleanup_failed" ? " failed" : ""}`)
    dot.setAttribute("aria-label", meta.state)
    const title = element("span", "tab-title", meta.title)
    title.addEventListener("dblclick", (event) => { event.stopPropagation(); void view.rename() })
    const close = button("×", "tab-close")
    close.setAttribute("aria-label", `Close ${meta.title}`)
    close.disabled = meta.state === "closing"
    close.addEventListener("click", (event) => { event.stopPropagation(); void view.close() })
    tab.append(dot, title)
    const attention = attentionCount(meta.workspace_id, meta.repository_id, meta.surface_id)
    if (attention) tab.append(element("span", "badge", String(attention)))
    tab.append(close)
    tab.addEventListener("click", () => selectTerminal(meta.id))
    tab.addEventListener("contextmenu", (event) => {
      selectTerminal(meta.id)
      showContextMenu(event, [
        { label: "Rename…", run: () => void view.rename() },
        { label: "Copy selection", run: () => view.copySelection(), disabled: activeTerminalId !== meta.id },
        { label: meta.state === "ended" ? "Remove" : "Close", run: () => void view.close(), destructive: true },
      ])
    })
    tab.addEventListener("keydown", (event) => {
      if (event.key === "F2") { void view.rename(); event.preventDefault(); return }
      if (event.key !== "Enter" && event.key !== " ") return
      selectTerminal(meta.id); event.preventDefault()
    })
    tabs.append(tab)
    if (activeTerminalId === meta.id) {
      view.activate()
      if (meta.state === "ended") view.showEnded()
    } else view.deactivate()
  }
  if (!visible.length) {
    terminalViews.forEach((view) => view.deactivate())
    const empty = element("div", "empty")
    empty.append(element("strong", "", selectedPair ? "No terminal in this repository" : "Select a workspace"), element("span", "", selectedPair ? "Start a shell or launch a configured command." : "Choose a repository from the workspace sidebar."))
    const add = button("Start a shell", "button primary")
    add.disabled = !selectedPair
    add.addEventListener("click", () => void createTerminal())
    empty.append(add)
    terminalDeck.append(empty)
  }
}

function selectTerminal(id: string): void {
  activeTerminalId = id
  renderTabs()
  terminalViews.get(id)?.focusInput()
  void refreshSignals()
}

function renderSignals(): void {
  signalsNode.replaceChildren()
  const needsAttention = signals.filter((signal) => signalGroup(signal) === "needs-attention").slice().reverse()
  const recentActivity = signals.filter((signal) => signalGroup(signal) === "recent-activity")
  const unread = signals.filter((signal) => signal.kind === "notification").length
  const count = document.querySelector<HTMLElement>("#signal-count")!
  count.textContent = String(needsAttention.length)
  count.hidden = needsAttention.length === 0
  document.querySelector("#signal-label")!.textContent = unread ? `Signal: ${unread} unread · Needs input` : "Signals"
  signalToggle.classList.toggle("attention", needsAttention.length > 0)
  signalToggle.setAttribute("aria-label", needsAttention.length ? `Signal inbox: ${needsAttention.length} need attention` : "Signal inbox")

  const appendHeading = (title: string, amount?: number) => {
    const heading = element("div", "signal-group-head")
    heading.append(element("span", "", title))
    if (amount !== undefined) heading.append(element("span", "signal-group-count", String(amount)))
    signalsNode.append(heading)
  }
  appendHeading("Needs attention", needsAttention.length)
  if (!needsAttention.length) {
    const empty = element("div", "signal-empty")
    empty.append(element("strong", "", "No signals need attention"), element("span", "", "Waiting and failed agent sessions and unread notifications will appear here."))
    signalsNode.append(empty)
  }
  for (const signal of needsAttention) {
    const item = element("article", "signal")
    const header = element("div", "signal-header")
    const provider = providerBadge(signal.source, "provider-chip signal-provider")
    provider.title = providerName(signal.source)
    const signalTitle = element("div", "signal-title", signal.title ?? `${providerName(signal.source)} ${lifecycleLabel(signal).toLowerCase()}`)
    const lifecycle = element("span", `lifecycle-chip ${signal.state ?? signal.kind}`, lifecycleLabel(signal))
    header.append(provider, signalTitle, lifecycle)
    item.append(header)
    if (signal.detail) item.append(element("div", "signal-detail", signal.detail))
    const workspace = snapshot.workspaces.find((entry) => entry.id === signal.workspace_id)
    const repository = workspace?.repositories.find((entry) => entry.id === signal.repository_id)
    const terminal = [...terminalViews.values()].find((view) => view.meta.surface_id === signal.surface_id)
    const location = [workspace?.name ?? signal.workspace_id.slice(0, 8), repository?.name, terminal?.meta.title].filter(Boolean).join(" / ")
    const when = relativeTime(signal.occurred_at)
    item.append(element("div", "signal-location", `${location}${when ? ` · ${when}` : ""}`))
    const actions = element("div", "signal-actions")
    const focus = button(terminal ? "Focus terminal" : repository ? "Open repository" : "Open workspace", "button primary")
    focus.addEventListener("click", () => {
      const workspace = snapshot.workspaces.find((entry) => entry.id === signal.workspace_id)
      const repository = workspace?.repositories.find((entry) => entry.id === signal.repository_id) ?? workspace?.repositories[0]
      if (workspace && repository) {
        closeSignalInbox(false)
        selectPair({ workspaceId: workspace.id, repositoryId: repository.id })
        const terminal = [...terminalViews.values()].find((view) => view.meta.surface_id === signal.surface_id)
        if (terminal) selectTerminal(terminal.meta.id)
        else if (signal.surface_id) toast("The original terminal is no longer available; focused its repository instead.")
      }
    })
    actions.append(focus)
    if (signal.kind === "notification") {
      const dismiss = button("Dismiss notification", "button")
      dismiss.addEventListener("click", () => void dismissSignal(signal.id))
      actions.append(dismiss)
    }
    item.append(actions)
    signalsNode.append(item)
  }
  appendHeading("Recent activity", recentActivity.length)
  const recent = element("div", "signal-empty compact")
  if (recentActivity.length) recent.append(element("span", "", "Working and completed sessions stay summarized on their workspace rows."))
  else recent.append(element("strong", "", "No recent activity"), element("span", "", "Agent and automation activity for this workspace will appear here."))
  signalsNode.append(recent)
}
function connectionSummary(): string { return `${snapshot.workspaces.length} workspaces · revision ${snapshot.revision} · ${terminalViews.size} browser terminals` }
function renderAll(): void {
  renderNav(); renderScope(); renderSignals(); renderOperationCards(); statusNode.textContent = connectionSummary()
  document.querySelector("#next-attention")?.classList.toggle("attention", hasResolvableAttention())
  for (const [selector, actionId] of [["#next-attention", "attention.next"], ["#launcher", "commands.open"], ["#create", "workspace.new"]] as const) {
    const control = document.querySelector<HTMLButtonElement>(selector)
    const availability = webActionRegistry.entry(actionId)?.availability
    if (!control || !availability) continue
    control.disabled = !availability.available
    control.title = availability.available ? control.getAttribute("aria-label") ?? "" : availability.disabledReason
  }
}

async function createTerminal(commandId?: string): Promise<boolean> {
  if (!selectedPair) return false
  try {
    const create = () => api<TerminalMeta>("terminal.create", { workspace_id: selectedPair!.workspaceId, repository_id: selectedPair!.repositoryId, ...(commandId ? { command_id: commandId } : {}), expected_revision: snapshot.revision, cols: 100, rows: 30 }, { scope: "terminal.create" })
    let meta: TerminalMeta
    try { meta = await create() } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "conflict") throw error
      await refreshSnapshot()
      meta = await create()
    }
    terminalViews.set(meta.id, new TerminalView(meta))
    preferences.tabOrder.push(meta.id)
    savePreferences()
    activeTerminalId = meta.id
    renderAll()
    terminalViews.get(meta.id)?.focusInput()
    return true
  } catch (error) { toast(String(error), true); return false }
}
async function dismissSignal(id: string): Promise<void> {
  try { await api("signals.dismiss", { signal_id: id }, { scope: "signal.dismiss" }); await refreshSignals() } catch (error) { toast(String(error), true) }
}

function modal(title: string, shortcutAction?: WebShortcutActionId): OverlayView | undefined {
  const opened = overlayController.open({
    id: shortcutAction ?? `exclusive:${title}`,
    title,
    closeLabel: `Close ${title.toLocaleLowerCase()}`,
    returnTarget: activeTerminalId,
    exclusive: shortcutAction === undefined,
  })
  if (opened.kind === "unavailable") return undefined
  return opened.view
}

type LifecycleKind = "workspace.archive" | "workspace.unarchive" | "workspace.remove" | "workspace.force-remove"
type LifecycleTarget = { id: string; name: string; expectedRevision: string }

function lifecycleTarget(workspace: Pick<Workspace, "id" | "name">): LifecycleTarget {
  return { id: workspace.id, name: workspace.name, expectedRevision: snapshot.revision }
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

async function observeLifecycleOperation(initial: WebOperation): Promise<WebOperation> {
  let operation = initial
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (["succeeded", "failed", "cancelled"].includes(operation.state)) return operation
    if (operation.progress?.message) statusNode.textContent = operation.progress.message
    await delay(100)
    operation = await api<WebOperation>("operation.get", { operation_id: operation.operation_id }, { scope: "operation.write" })
  }
  throw new Error("Workspace lifecycle operation did not finish in time")
}

async function submitWorkspaceLifecycle(
  kind: LifecycleKind,
  workspace: LifecycleTarget,
  confirmationName?: string,
): Promise<WebOperation | undefined> {
  try {
    const operation = await api<WebOperation>("operation.submit", {
      kind,
      workspace_id: workspace.id,
      expected_revision: workspace.expectedRevision,
      ...(kind === "workspace.force-remove" ? { confirmation_name: confirmationName } : {}),
    }, {
      scope: "operation.write",
      idempotencyKey: `${kind}-${workspace.id}-${crypto.randomUUID()}`,
    })
    pendingLifecycleOperations.add(operation.operation_id)
    try { return await observeLifecycleOperation(operation) }
    finally { pendingLifecycleOperations.delete(operation.operation_id) }
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "conflict") {
      await reconcileAuthoritativeState()
      toast("Workspace state changed. Review it and confirm the action again.", true)
      return
    }
    await reconcileAuthoritativeState().catch(() => undefined)
    toast(`Workspace action stopped: ${error instanceof Error ? error.message : String(error)}. Invoke and confirm it again after reconnecting.`, true)
    return
  }
}

async function reconcileAuthoritativeState(): Promise<void> {
  await refreshSnapshot()
  await Promise.all([loadTerminals(), refreshSignals(true)])
  renderAll()
}

async function runWorkspaceLifecycle(
  kind: LifecycleKind,
  workspace: LifecycleTarget,
  confirmationName?: string,
): Promise<WebOperation | undefined> {
  const operation = await submitWorkspaceLifecycle(kind, workspace, confirmationName)
  if (!operation) return
  if (operation.state === "succeeded") {
    await reconcileAuthoritativeState()
    return operation
  }
  await reconcileAuthoritativeState()
  if (operation.error) toast(operation.error.message, true)
  return operation
}

async function archiveWorkspace(workspace: Workspace): Promise<void> {
  const target = lifecycleTarget(workspace)
  const operation = await runWorkspaceLifecycle("workspace.archive", target)
  if (operation?.state !== "succeeded") return
  actionToast(`${workspace.name} archived. Its terminals were stopped.`, "Undo", () => {
    void unarchiveWorkspace(lifecycleTarget(workspace))
  })
}

async function unarchiveWorkspace(workspace: LifecycleTarget): Promise<void> {
  const operation = await runWorkspaceLifecycle("workspace.unarchive", workspace)
  if (operation?.state === "succeeded") toast(`${workspace.name} unarchived. Stopped terminals were not recreated.`)
}

function showArchivedWorkspaces(): void {
  const view = modal("Archived Workspaces")
  if (!view) return
  const list = element("div", "archived-list")
  if (!snapshot.archived_workspaces.length) {
    list.append(element("div", "archived-empty", "No archived workspaces"))
  } else {
    for (const workspace of snapshot.archived_workspaces) {
      const row = element("div", "archived-row")
      const identity = element("div", "archived-identity")
      identity.append(element("strong", "", workspace.name), element("span", "", relativeTime(workspace.activity_at) || workspace.activity_at))
      const unarchive = button("Unarchive")
      unarchive.addEventListener("click", async () => {
        const operation = await runWorkspaceLifecycle("workspace.unarchive", lifecycleTarget(workspace))
        if (operation?.state !== "succeeded") return
        view.close()
        toast(`${workspace.name} unarchived. Stopped terminals were not recreated.`)
      })
      row.append(identity, unarchive)
      list.append(row)
    }
  }
  view.body.append(list)
}

function showRemoveConfirmation(workspace: Workspace): void {
  const target = lifecycleTarget(workspace)
  const view = modal(`Remove ${workspace.name}?`)
  if (!view) return
  view.body.append(
    element("p", "lifecycle-warning", `Remove ${workspace.name} permanently. This cannot be undone.`),
  )
  const inventory = element("ul", "removal-inventory")
  for (const item of ["Service-owned terminals", "Managed Git worktrees", "Workspace directory", "Workspace YAML definition"]) {
    inventory.append(element("li", "", item))
  }
  const actions = element("div", "modal-actions")
  const cancel = button("Cancel")
  const remove = button("Remove", "button danger")
  cancel.addEventListener("click", () => view.close())
  remove.addEventListener("click", async () => {
    view.close()
    const operation = await runWorkspaceLifecycle("workspace.remove", target)
    const details = operation?.state === "failed" ? operation.error?.lifecycle : undefined
    if (details?.kind === "workspace_dirty" && details.terminals_stopped && details.force_allowed) {
      const current = snapshot.workspaces.find(({ id }) => id === workspace.id)
      if (current) showDirtyRemovalFailure(current, details)
    }
  })
  actions.append(cancel, remove)
  view.body.append(inventory, actions)
  cancel.focus()
}

function showDirtyRemovalFailure(workspace: Workspace, details: WorkspaceLifecycleFailureDetails): void {
  const view = modal(`Dirty worktrees block ${workspace.name}`)
  if (!view) return
  view.body.append(element("p", "lifecycle-warning", "Workspace terminals are already stopped. No workspace files were deleted."))
  const blockers = element("ul", "removal-blockers")
  for (const repository of details.blocking_repositories ?? []) blockers.append(element("li", "", repository))
  const actions = element("div", "modal-actions")
  const cancel = button("Keep workspace")
  cancel.addEventListener("click", () => view.close())
  actions.append(cancel)
  if (details.force_allowed) {
    const force = button("Force Remove…", "button danger")
    force.addEventListener("click", () => { view.close(); void showForceRemoveConfirmation(workspace) })
    actions.append(force)
  }
  view.body.append(element("strong", "", "Dirty repositories"), blockers, actions)
  cancel.focus()
}

async function showForceRemoveConfirmation(requestedWorkspace: Workspace): Promise<void> {
  await refreshSnapshot()
  const workspace = snapshot.workspaces.find(({ id }) => id === requestedWorkspace.id)
  if (!workspace) { toast("Workspace no longer exists.", true); return }
  const target = lifecycleTarget(workspace)
  const view = modal(`Force Remove ${workspace.name}?`)
  if (!view) return
  view.body.append(element("p", "lifecycle-warning", "This irreversibly deletes dirty worktrees and the workspace resources listed in the previous confirmation."))
  const confirmation = element("input")
  confirmation.placeholder = workspace.name
  confirmation.setAttribute("aria-label", `Type ${workspace.name} to enable Force Remove`)
  const actions = element("div", "modal-actions")
  const cancel = button("Cancel")
  const force = button("Force Remove", "button danger")
  force.disabled = true
  confirmation.addEventListener("input", () => { force.disabled = !(confirmation.value === workspace.name) })
  cancel.addEventListener("click", () => view.close())
  force.addEventListener("click", async () => {
    if (!(confirmation.value === workspace.name)) return
    await refreshSnapshot()
    const current = snapshot.workspaces.find(({ id }) => id === workspace.id)
    if (!current || current.name !== workspace.name || confirmation.value !== current.name || snapshot.revision !== target.expectedRevision) {
      view.close()
      toast("Workspace state changed. Start Force Remove again from a fresh dirty-worktree result.", true)
      return
    }
    view.close()
    await runWorkspaceLifecycle("workspace.force-remove", target, confirmation.value)
  })
  actions.append(cancel, force)
  view.body.append(confirmation, actions)
  cancel.focus()
}

function showWorkspaceSwitcher(): void {
  const opened = overlayController.open({
    id: "workspace.switch",
    title: "Switch workspace or repository",
    closeLabel: "Close workspace switcher",
    returnTarget: activeTerminalId,
  })
  if (opened.kind === "unavailable" || opened.kind === "refocused") return
  const orderedWorkspaces = snapshot.workspaces
    .map((workspace) => ({ ...workspace, pinned: preferences.pins.has(workspace.id) }))
    .sort(workspacePriorityOrder)
  const pairs = orderedWorkspaces.flatMap((workspace, workspaceIndex) => [...workspace.repositories]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map((repository, repositoryIndex) => ({
      id: `${workspace.id}:${repository.id}`,
      workspace,
      repository,
      order: workspaceIndex * 10_000 + repositoryIndex,
    })))
  mountFuzzyOverlay(opened.view, {
    inputLabel: "Search active workspaces and repositories",
    emptyHeading: "No active workspaces",
    emptyBody: "Create or unarchive a workspace to switch here.",
    noMatch: "No workspaces or repositories match.",
    items: pairs,
    stableId: (pair) => pair.id,
    fields: (pair) => [
      { text: pair.workspace.name, weight: FUZZY_FIELD_WEIGHT.workspace },
      { text: pair.repository.name, weight: FUZZY_FIELD_WEIGHT.repository },
      { text: pair.repository.branch, weight: FUZZY_FIELD_WEIGHT.branch },
    ],
    recency: (pair) => pair.workspace.activity_at,
    defaultOrder: (left, right) => left.order - right.order,
    render: (pair) => ({
      primary: pair.workspace.name,
      secondary: [pair.repository.name, pair.repository.branch].filter(Boolean).join(" · "),
    }),
    select: (pair) => {
      opened.view.close(false)
      selectPair({ workspaceId: pair.workspace.id, repositoryId: pair.repository.id })
      if (activeTerminalId) terminalViews.get(activeTerminalId)?.focusInput()
      else document.querySelector<HTMLElement>(`[data-workspace-id='${pair.workspace.id}'][data-repository-id='${pair.repository.id}']`)?.focus()
    },
  })
}

function showLauncher(): void {
  const workspace = selectedWorkspace(), repository = selectedRepository()
  if (!workspace || !repository) { toast("Select a repository first.", true); return }
  const opened = overlayController.open({
    id: "commands.open",
    title: "Configured commands",
    closeLabel: "Close commands",
    returnTarget: activeTerminalId,
  })
  if (opened.kind === "unavailable" || opened.kind === "refocused") return
  const available = workspace.commands.filter((command) => command.scope === "workspace" || command.repository_id === repository.id)
    .sort((a, b) => {
      const left = preferences.recent.indexOf(a.id), right = preferences.recent.indexOf(b.id)
      return (left === -1 ? Number.MAX_SAFE_INTEGER : left) - (right === -1 ? Number.MAX_SAFE_INTEGER : right) || a.name.localeCompare(b.name)
    })
  mountFuzzyOverlay(opened.view, {
    inputLabel: "Search configured commands",
    emptyHeading: "No configured commands",
    emptyBody: "This workspace and repository have no configured commands.",
    noMatch: "No configured commands match.",
    items: available,
    stableId: (command) => command.id,
    fields: (command) => [
      { text: command.name, weight: FUZZY_FIELD_WEIGHT.primary },
      { text: workspace.name, weight: FUZZY_FIELD_WEIGHT.secondary },
      { text: command.scope === "repository" ? repository.name : "workspace", weight: FUZZY_FIELD_WEIGHT.tertiary },
    ],
    recency: (command) => {
      const index = preferences.recent.indexOf(command.id)
      return index === -1 ? 0 : preferences.recent.length - index
    },
    defaultOrder: (left, right) => available.indexOf(left) - available.indexOf(right),
    render: (command) => ({
      primary: command.name,
      secondary: `${preferences.recent.includes(command.id) ? "Recent · " : ""}${workspace.name} / ${command.scope === "repository" ? repository.name : "workspace"}`,
    }),
    select: (command) => {
      return createTerminal(command.id).then((created) => {
        if (!created) return
        preferences.recent = [command.id, ...preferences.recent.filter((id) => id !== command.id)]
        savePreferences()
        opened.view.close(false)
      })
    },
  })
}

async function loadShortcutSettings(reportFailure = true): Promise<WebShortcutSettings> {
  try {
    return await shortcutSettingsCoordinator.load()
  } catch (error) {
    if (reportFailure) toast("Shortcuts could not be loaded. Retry to enable keyboard actions.", true)
    throw error
  }
}

function showKeyboardHelp(): void {
  const hasInvoker = document.activeElement !== document.body
  const opened = overlayController.open({
    id: "shortcut-help",
    title: "Keyboard shortcuts",
    closeLabel: "Close keyboard shortcuts",
    returnTarget: activeTerminalId,
  })
  if (opened.kind === "unavailable" || opened.kind === "refocused") return
  if (!shortcutSettings) {
    opened.view.body.append(element("div", "shortcut-error", "Shortcuts could not be loaded. Retry to edit the authoritative settings."))
    const retry = button("Retry loading shortcuts", "button primary")
    retry.addEventListener("click", () => { opened.view.close(false); showShortcutSettings() })
    opened.view.body.append(retry)
    opened.view.setPrimaryFocus(() => retry.focus())
    retry.focus()
    return
  }
  mountShortcutHelp(opened.view, shortcutSettings, showShortcutSettings, { hasInvoker })
}

function showShortcutSettings(): void {
  const opened = overlayController.open({
    id: "shortcut-settings",
    title: "Customize shortcuts",
    closeLabel: "Close shortcut settings",
    returnTarget: activeTerminalId,
  })
  if (opened.kind === "unavailable" || opened.kind === "refocused") return
  mountShortcutSettings(opened.view, {
    platform: shortcutPlatform,
    load: () => loadShortcutSettings(false),
    mutate: (mutation) => shortcutSettingsCoordinator.mutate(mutation),
    accept: (settings) => {
      shortcutSettings = settings
      webActionRegistry.setSettings(settings)
    },
    announce: (message) => toast(message),
  })
}

async function showWorkspaceNotes(workspace: Workspace): Promise<void> {
  const view = modal(`Workspace notes — ${workspace.name}`)
  if (!view) return
  const content = element("div", "workspace-notes")
  content.append(element("div", "detail-loading", "Loading workspace notes…"))
  view.body.append(content)
  try {
    const notes = await api<WebNotesResponse>("workspace.notes.list", {
      workspace_id: workspace.id,
      expected_revision: snapshot.revision,
    }, { scope: "snapshot.read" })
    content.replaceChildren()
    if (!notes.records.length) content.append(element("strong", "", "No workspace notes"), element("p", "", "Add an operator note to keep workspace context here."))
    else for (const record of notes.records) {
      const item = element("article", "workspace-note")
      item.append(element("time", "", relativeTime(record.created_at) || record.created_at), element("p", "", record.text))
      content.append(item)
    }
  } catch {
    content.replaceChildren(element("div", "detail-error", "Workspace notes could not be loaded. Retry without changing stored notes."))
  }
}

async function showWorkspaceFileStatus(workspace: Workspace): Promise<void> {
  const view = modal(`Workspace file status — ${workspace.name}`)
  if (!view) return
  const content = element("div", "workspace-file-status")
  content.append(element("div", "detail-loading", "Loading workspace file status…"))
  view.body.append(content)
  try {
    const status = await api<WebFileStatusResponse>("workspace.files.inspect", {
      workspace_id: workspace.id,
      expected_revision: snapshot.revision,
    }, { scope: "snapshot.read" })
    content.replaceChildren()
    if (!status.groups.length) content.append(element("strong", "", "No configured workspace files"), element("p", "", "This workspace has no configured copy, symlink, or sync targets."))
    else for (const group of status.groups) {
      const section = element("section", "file-status-group")
      section.append(element("strong", "", `${group.name} · ${group.summary.attention} need attention`))
      for (const entry of group.entries) {
        const row = element("div", `file-status-entry ${entry.severity}`)
        row.append(element("span", "file-target", entry.target), element("span", "file-state", `${entry.type} · ${entry.state}`), element("span", "file-message", entry.message))
        section.append(row)
      }
      content.append(section)
    }
  } catch {
    content.replaceChildren(element("div", "detail-error", "Workspace file status could not be loaded. Retry the service check."))
  }
}

async function showCreation(): Promise<void> {
  const view = modal("Create workspace")
  if (!view) return
  try {
    const catalog = await api<Catalog>("workspace-creation.catalog", undefined, { scope: "snapshot.read" })
    const name = element("input"); name.placeholder = "Workspace name"
    const branch = element("input"); branch.placeholder = "feature/my-change"
    const source = element("select")
    for (const template of catalog.templates) { const option = element("option", "", `Template: ${template.name}`); option.value = `template:${template.name}`; source.append(option) }
    const repositoriesOption = element("option", "", "Choose repositories…"); repositoriesOption.value = "repositories"; source.append(repositoriesOption)
    const repositoryPicker = element("div", "repository-picker")
    const repositoryInputs: HTMLInputElement[] = []
    for (const repository of catalog.repositories) {
      const choice = element("label", "repository-choice")
      const input = element("input"); input.type = "checkbox"; input.value = repository.name; repositoryInputs.push(input)
      choice.append(input, element("span", "", `${repository.name} · ${repository.type} · ${repository.default_branch}`))
      repositoryPicker.append(choice)
    }
    const updateSource = () => { repositoryPicker.hidden = source.value !== "repositories" }
    source.addEventListener("change", updateSource); updateSource()
    const wrap = (label: string, field: HTMLElement) => { const node = element("label", "field", label); node.append(field); return node }
    const create = button("Create workspace", "button primary")
    create.addEventListener("click", async () => {
      try {
        const [kind, value] = source.value.split(":", 2)
        const selected = repositoryInputs.filter((input) => input.checked).map((input) => input.value)
        const requestedSource = kind === "template" ? { kind: "template", template: value } : { kind: "repositories", repositories: selected }
        const workspaceName = name.value.trim()
        const operation = await api<{ operation_id: string }>("operation.submit", { kind: "workspace.create", request: { name: workspaceName, branch: branch.value.trim(), source: requestedSource } }, { scope: "operation.write", idempotencyKey: `workspace.create-${crypto.randomUUID()}` })
        pendingWorkspaceCreations.set(operation.operation_id, workspaceName)
        toast(`Creating ${workspaceName}`); view.close()
      } catch (error) { toast(String(error), true) }
    })
    view.body.append(wrap("Name", name), wrap("Branch", branch), wrap("Source", source), repositoryPicker, create)
    name.focus()
  } catch (error) { view.body.append(element("div", "", String(error))) }
}

async function refreshSnapshot(): Promise<void> {
  const generation = ++snapshotRefreshGeneration
  const refreshed = await api<Snapshot>("web.snapshot", undefined, { scope: "snapshot.read" })
  if (generation !== snapshotRefreshGeneration) return
  snapshot = refreshed
  if (workspaceActionInventoryKey !== `${selectedPair?.workspaceId ?? ""}:${snapshot.revision}`) {
    workspaceActionInventory = []
    workspaceActionInventoryKey = ""
  }
  preferences.pins = new Set(snapshot.pinned_workspace_ids)
  let preferencesChanged = false
  if (selectedPair && !snapshot.workspaces.some((workspace) => workspace.id === selectedPair?.workspaceId && workspace.repositories.some((repository) => repository.id === selectedPair?.repositoryId))) selectedPair = undefined
  if (!selectedPair) {
    const restoredWorkspace = snapshot.workspaces.find((workspace) => workspace.id === preferences.lastPair?.workspaceId)
    const restoredRepository = restoredWorkspace?.repositories.find((repository) => repository.id === preferences.lastPair?.repositoryId)
    const ordered = [...snapshot.workspaces].sort((left, right) => workspaceSuccessorOrder(
      { ...left, pinned: preferences.pins.has(left.id) },
      { ...right, pinned: preferences.pins.has(right.id) },
    ))
    const workspace = restoredWorkspace && restoredRepository ? restoredWorkspace : ordered[0]
    const repository = restoredWorkspace && restoredRepository ? restoredRepository : workspace?.repositories[0]
    if (workspace && repository) { selectedPair = { workspaceId: workspace.id, repositoryId: repository.id }; preferences.lastPair = selectedPair; preferencesChanged = true }
  }
  if (preferencesChanged) savePreferences()
  renderAll()
}
async function refreshSignals(resetCursor = false): Promise<void> {
  const generation = ++signalRefreshGeneration
  try {
    const active = activeTerminalId ? terminalViews.get(activeTerminalId)?.meta : undefined
    const projection = active
      ? await api<{ signals: Signal[]; sequence: string }>("signals.acknowledge", { surface_id: active.surface_id }, { scope: "signal.dismiss" })
      : await api<{ signals: Signal[]; sequence: string }>("signals.list", undefined, { scope: "signal.read" })
    if (generation !== signalRefreshGeneration) return
    signals = projection.signals
    if ((resetCursor || eventCursor === "0") && projection.sequence !== "0") eventCursor = projection.sequence
    renderSignals(); renderNav()
  } catch {}
}
async function loadTerminals(): Promise<void> {
  const items = await api<TerminalMeta[]>("terminal.list", undefined, { scope: "terminal.read" })
  await Promise.all(items.filter((meta) => meta.state === "ended" && !meta.command_id).map((meta) => api("terminal.close", { terminal_id: meta.id }, { scope: "terminal.close" }).catch(() => undefined)))
  const retained = items.filter((meta) => meta.state !== "ended" || meta.command_id)
  const retainedIds = new Set(retained.map(({ id }) => id))
  for (const [id, view] of terminalViews) {
    if (retainedIds.has(id)) continue
    view.dispose()
    terminalViews.delete(id)
  }
  for (const meta of retained) {
    const current = terminalViews.get(meta.id)
    if (current) current.meta = meta
    else terminalViews.set(meta.id, new TerminalView(meta))
  }
  preferences.tabOrder = preferences.tabOrder.filter((id) => retainedIds.has(id))
  if (activeTerminalId && !retainedIds.has(activeTerminalId)) activeTerminalId = undefined
  savePreferences()
}
function connectEvents(): void {
  statusNode.textContent = connectionSummary()
  void subscribeSecureEvents(eventCursor, (value) => {
    const data = value as {
      type: string
      sequence?: string
      control?: { kind: string }
      operation?: {
        operation_id: string
        state: "accepted" | "running" | "succeeded" | "failed" | "cancelled"
        progress?: { message?: string }
        result?: { snapshot_changed?: boolean }
        error?: { message?: string; lifecycle?: WorkspaceLifecycleFailureDetails }
      }
    }
    if (data.sequence) eventCursor = data.sequence
    if (data.type === "control" && data.control?.kind === "snapshot_invalidated") void refreshSnapshot()
    else if (data.type === "signal") void refreshSignals()
    else if (data.type === "operation" && data.operation) {
      const operation = data.operation
      if (operationContexts.has(operation.operation_id)) {
        void observeTrackedOperation(operation.operation_id).catch(() => {
          toast("Operation status could not be refreshed. Reconnect before repeating the action.", true)
        })
        return
      }
      if (pendingLifecycleOperations.has(operation.operation_id)) {
        if (operation.progress?.message) statusNode.textContent = operation.progress.message
        return
      }
      const workspaceName = pendingWorkspaceCreations.get(operation.operation_id)
      if (operation.state === "succeeded") {
        pendingWorkspaceCreations.delete(operation.operation_id)
        if (operation.result?.snapshot_changed) void refreshSnapshot()
        toast(workspaceName ? `Created ${workspaceName}` : "Workspace operation completed")
      } else if (operation.state === "failed" || operation.state === "cancelled") {
        pendingWorkspaceCreations.delete(operation.operation_id)
        toast(operation.error?.message ?? `${workspaceName ?? "Workspace operation"} ${operation.state}`, true)
      } else if (operation.progress?.message) {
        toast(operation.progress.message)
      }
    }
  }).catch((error) => { statusNode.textContent = `Secure event channel unavailable: ${String(error)}` })
}

async function pairFromFragment(): Promise<void> {
  await initializeWebSession()
}

function showStartupFailure(title: string, error: unknown, hint: string): void {
  app.innerHTML = ""
  const empty = element("div", "empty")
  empty.append(
    element("strong", "", title),
    element("span", "", error instanceof Error ? error.message : String(error)),
    element("span", "", hint),
  )
  app.append(empty)
}

document.querySelector("#launcher")!.addEventListener("click", () => invokeRegisteredAction("commands.open"))
document.querySelector("#next-attention")!.addEventListener("click", () => invokeRegisteredAction("attention.next"))
document.querySelector("#keyboard-shortcuts")!.addEventListener("click", showKeyboardHelp)
document.querySelector("#create")!.addEventListener("click", () => invokeRegisteredAction("workspace.new"))
document.querySelector("#archived")!.addEventListener("click", showArchivedWorkspaces)
for (const control of document.querySelectorAll<HTMLButtonElement>("[data-organization]")) control.addEventListener("click", () => {
  preferences.organization = control.dataset.organization as Organization
  savePreferences(); renderNav()
})
signalToggle.addEventListener("click", () => signalInbox.hidden ? openSignalInbox() : closeSignalInbox())
document.querySelector("#signal-close")!.addEventListener("click", () => closeSignalInbox())
tabs.addEventListener("dblclick", (event) => { if (event.target === tabs) void createTerminal() })
document.querySelector("#theme")!.addEventListener("click", () => {
  preferences.theme = preferences.theme === "system" ? "dark" : preferences.theme === "dark" ? "light" : "system"
  if (preferences.theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = preferences.theme
  toast(`Theme: ${preferences.theme}`)
})
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !contextMenu.hidden) { hideContextMenu(); event.preventDefault(); return }
  if (event.key === "Escape" && !signalInbox.hidden) { closeSignalInbox(); event.preventDefault(); return }
  shortcutDispatcher.handleDocument(event)
})
document.addEventListener("pointerdown", (event) => { if (!contextMenu.hidden && !contextMenu.contains(event.target as Node)) hideContextMenu() })
window.addEventListener("blur", hideContextMenu)
window.addEventListener("resize", hideContextMenu)
document.addEventListener("scroll", hideContextMenu, true)
document.addEventListener("visibilitychange", () => terminalViews.forEach((view) => view.syncStreaming()))
window.addEventListener("online", () => {
  statusNode.textContent = "Back online · reconnecting terminals"
  void operationTracker.reconnect().then(() => renderOperationCards()).catch(() => {
    toast("The known workspace operation could not be reconnected yet.", true)
  })
})
window.addEventListener("offline", () => { statusNode.textContent = "Offline · local terminal sessions remain in the service" })

void (async () => {
  try {
    await pairFromFragment()
  } catch (error) {
    showStartupFailure("Pairing required", error, "Run git-stacks web to open a fresh one-use link.")
    return
  }
  await loadShortcutSettings().catch(() => undefined)
  try {
    await refreshSnapshot()
  } catch (error) {
    showStartupFailure("Workspace data unavailable", error, "The secure session is connected, but web.snapshot failed.")
    return
  }
  try {
    await loadTerminals()
  } catch (error) {
    toast(`terminal.list failed: ${error instanceof Error ? error.message : String(error)}`, true)
  }
  await refreshSignals()
  renderAll()
  connectEvents()
})()
