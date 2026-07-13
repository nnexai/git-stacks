import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import "@xterm/xterm/css/xterm.css"
import "./app.css"
import { isActiveSession, isBackgroundActivity, lifecycleLabel, matchesSignalScope, providerLetter, providerName, relativeTime, signalGroup } from "./presentation"

type Repository = { id: string; name: string; mode: string; exists: boolean; dirty: boolean; branch: string; ahead: number; behind: number; additions: number; removals: number; degraded: boolean }
type Command = { id: string; name: string; scope: "workspace" | "repository"; repository_id?: string }
type Workspace = { id: string; name: string; branch: string; labels: string[]; repositories: Repository[]; commands: Command[]; file_status: { warnings: number; errors: number; attention: number } }
type Snapshot = { revision: string; generated_at: string; workspaces: Workspace[] }
type TerminalMeta = { id: string; workspace_id: string; repository_id: string; command_id?: string; surface_id: string; title: string; state: "starting" | "running" | "ended" | "closing" | "cleanup_failed"; created_at: string; exit_code: number | null; cursor: string; earliest_cursor: string; history_available: boolean }
type Signal = { kind: "activity" | "notification"; id: string; source: string; workspace_id: string; repository_id?: string; surface_id?: string; title?: string; detail?: string; state?: string; occurred_at: string }
type Catalog = { templates: Array<{ name: string; description?: string }>; repositories: Array<{ name: string; type: string; default_branch: string }> }
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type Pair = { workspaceId: string; repositoryId: string }
type Organization = "label" | "repository"

class ApiRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message) }
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
function stored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T } catch { return fallback }
}
const preferences = {
  pins: new Set<string>(stored<string[]>("git-stacks.web.pins", [])),
  recent: stored<string[]>("git-stacks.web.recent", []),
  tabOrder: stored<string[]>("git-stacks.web.tab-order", []),
  theme: localStorage.getItem("git-stacks.web.theme") ?? "system",
  organization: (localStorage.getItem("git-stacks.web.organization") ?? "label") as Organization,
  lastPair: stored<Pair | undefined>("git-stacks.web.last-pair", undefined),
}
if (!["label", "repository"].includes(preferences.organization)) preferences.organization = "label"
if (preferences.theme !== "system") document.documentElement.dataset.theme = preferences.theme

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } })
  const envelope = await response.json() as Envelope<T>
  if (!response.ok || !envelope.ok) throw new ApiRequestError(envelope.ok ? "request_failed" : envelope.error.code, envelope.ok ? `Request failed (${response.status})` : envelope.error.message, response.status)
  return envelope.data
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
function savePreferences(): void {
  localStorage.setItem("git-stacks.web.pins", JSON.stringify([...preferences.pins]))
  localStorage.setItem("git-stacks.web.recent", JSON.stringify(preferences.recent.slice(0, 20)))
  localStorage.setItem("git-stacks.web.tab-order", JSON.stringify(preferences.tabOrder.slice(0, 100)))
  localStorage.setItem("git-stacks.web.organization", preferences.organization)
  if (preferences.lastPair) localStorage.setItem("git-stacks.web.last-pair", JSON.stringify(preferences.lastPair))
}
function toast(message: string, error = false): void {
  const node = element("div", `toast${error ? " error" : ""}`, message)
  node.setAttribute("role", error ? "alert" : "status")
  toastRegion.append(node)
  window.setTimeout(() => node.remove(), 6000)
}

class TerminalView {
  readonly pane = element("section", "terminal-pane")
  private host = element("div", "terminal-host")
  private banner = element("div", "terminal-banner")
  private terminal?: Terminal
  private fit?: FitAddon
  private webgl?: WebglAddon
  private webglUnavailable = false
  private socket?: WebSocket
  private observer?: ResizeObserver
  private reconnectTimer?: number
  private reconnectAttempt = 0
  private receivedCursor = 0n
  private pendingAck = 0n
  private writeGeneration = 0
  private ackTimer?: number
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
    this.disableWebgl()
    this.syncStreaming()
  }

  syncStreaming(): void {
    const streaming = this.active && !document.hidden
    if (this.socket?.readyState !== WebSocket.OPEN || this.streaming === streaming) return
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
      this.meta = await api<TerminalMeta>(`/web/api/terminals/${encodeURIComponent(this.meta.id)}`, { method: "DELETE" })
      this.dispose()
      terminalViews.delete(this.meta.id)
      if (activeTerminalId === this.meta.id) activeTerminalId = visibleTerminals().find((item) => item.id !== this.meta.id)?.id
      renderScope()
      statusNode.textContent = connectionSummary()
      if (activeTerminalId) terminalViews.get(activeTerminalId)?.focusInput()
    } catch (error) { toast(String(error), true); this.meta.state = "cleanup_failed"; renderTabs() }
  }

  async rename(): Promise<void> {
    const title = prompt("Terminal title", this.meta.title)?.trim()
    if (!title || title === this.meta.title) return
    try { this.meta = await api<TerminalMeta>(`/web/api/terminals/${encodeURIComponent(this.meta.id)}`, { method: "PATCH", body: JSON.stringify({ title }) }); renderTabs() } catch (error) { toast(String(error), true) }
  }

  copySelection(): void {
    const selection = this.terminal?.getSelection()
    if (selection) void navigator.clipboard.writeText(selection).then(() => toast("Selection copied"), () => toast("Clipboard permission denied", true))
  }

  showEnded(onRelaunch: () => void): void {
    this.banner.replaceChildren(element("span", "", `Process exited${this.meta.exit_code === null ? "" : ` with code ${this.meta.exit_code}`}.`))
    const relaunch = button("Relaunch", "button")
    relaunch.addEventListener("click", onRelaunch)
    this.banner.append(relaunch)
    this.banner.classList.add("visible")
  }

  private open(): void {
    if (this.opened || this.disposed || this.pane.hidden) return
    if (this.host.clientWidth < 2 || this.host.clientHeight < 2) { window.setTimeout(() => this.open(), 50); return }
    this.opened = true
    const terminal = new Terminal({
      cursorBlink: false,
      fontFamily: "'SFMono-Regular', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
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
    terminal.onData((data) => this.send({ type: "input", data }))
    terminal.onResize(({ cols, rows }) => this.send({ type: "resize", cols, rows }))
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

  private connect(): void {
    if (this.disposed) return
    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const streaming = this.active && !document.hidden
    const socket = new WebSocket(`${protocol}//${location.host}/web/ws/terminals/${encodeURIComponent(this.meta.id)}?streaming=${streaming ? "1" : "0"}`)
    socket.binaryType = "arraybuffer"
    this.socket = socket
    this.streaming = streaming
    socket.addEventListener("open", () => { this.reconnectAttempt = 0; this.resize(); this.syncStreaming(); renderTabs() })
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        const message = JSON.parse(event.data) as { type?: string; terminal?: TerminalMeta; reset?: boolean; code?: number; title?: string }
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
        } else if (message.type === "renamed" && message.title) { this.meta.title = message.title; renderTabs() }
        else if (message.type === "history_unavailable") { this.banner.textContent = "Terminal history changed while reconnecting. Reconnecting with the retained baseline…"; this.banner.classList.add("visible") }
        return
      }
      const frame = new Uint8Array(event.data as ArrayBuffer)
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
    })
    socket.addEventListener("close", (event) => {
      if (this.disposed || this.meta.state === "ended" || this.meta.state === "closing") return
      this.streaming = undefined
      this.reconnectAttempt += 1
      const delay = Math.min(15_000, 350 * 2 ** Math.min(this.reconnectAttempt, 6)) * (0.8 + Math.random() * 0.4)
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
      if (event.code !== 4001) renderTabs()
    })
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
  private send(message: unknown): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)) }
  private dispose(): void {
    this.disposed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ackTimer !== undefined) clearTimeout(this.ackTimer)
    this.observer?.disconnect()
    this.socket?.close()
    this.disableWebgl()
    this.terminal?.dispose()
    this.pane.remove()
  }
}

let snapshot: Snapshot = { revision: "0", generated_at: new Date().toISOString(), workspaces: [] }
let selectedPair: Pair | undefined
let activeTerminalId: string | undefined
let signals: Signal[] = []
let eventCursor = sessionStorage.getItem("git-stacks.web.cursor") ?? "0"
const terminalViews = new Map<string, TerminalView>()

app.innerHTML = `<div class="app"><header class="topbar"><div class="brand"><span class="brand-mark">gs</span><span>git-stacks</span></div><button class="header-signal" id="signal-toggle" type="button" aria-label="Signal inbox" aria-haspopup="dialog" aria-expanded="false"><span class="signal-glyph" aria-hidden="true">!</span><span id="signal-label">Signals</span><span class="header-badge" id="signal-count" hidden></span></button><div class="top-status" id="status" role="status"></div><div class="toolbar"><button class="button icon" id="theme" title="Change theme" aria-label="Change theme">◐</button><button class="button primary" id="launcher" aria-label="Configured commands"><span aria-hidden="true">⌘</span><span class="wide">Commands</span></button></div></header><div class="workspace-grid"><nav class="sidebar" aria-label="Workspaces"><div class="sidebar-tools"><div class="organization-switch" role="group" aria-label="Organize workspaces"><button type="button" data-organization="label">Labels</button><button type="button" data-organization="repository">Repositories</button></div><button class="button sidebar-create" id="create" type="button"><span aria-hidden="true">＋</span> Create workspace</button></div><div class="sidebar-summary"><span>Workspaces</span><span id="workspace-count"></span></div><ul class="nav-list" id="nav"></ul></nav><main class="main"><div class="scopebar" id="scope"></div><div class="tabs" id="tabs" role="tablist" aria-label="Repository terminals"></div><div class="terminal-deck" id="terminal-deck"></div></main></div></div><section class="signal-popover" id="signal-inbox" role="dialog" aria-modal="false" aria-labelledby="signal-inbox-title" hidden><header class="signal-popover-head"><div><strong id="signal-inbox-title">Signals</strong><span>Workspace and terminal activity</span></div><button class="button icon" id="signal-close" type="button" aria-label="Close signals">×</button></header><div class="signal-list" id="signals"></div></section><div class="toast-region" id="toasts" aria-live="polite"></div>`
const statusNode = document.querySelector<HTMLElement>("#status")!
const nav = document.querySelector<HTMLUListElement>("#nav")!
const scope = document.querySelector<HTMLElement>("#scope")!
const tabs = document.querySelector<HTMLElement>("#tabs")!
const terminalDeck = document.querySelector<HTMLElement>("#terminal-deck")!
const signalsNode = document.querySelector<HTMLElement>("#signals")!
const signalInbox = document.querySelector<HTMLElement>("#signal-inbox")!
const signalToggle = document.querySelector<HTMLButtonElement>("#signal-toggle")!
const toastRegion = document.querySelector<HTMLElement>("#toasts")!

function selectedWorkspace(): Workspace | undefined { return snapshot.workspaces.find((item) => item.id === selectedPair?.workspaceId) }
function selectedRepository(): Repository | undefined { return selectedWorkspace()?.repositories.find((item) => item.id === selectedPair?.repositoryId) }
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
  selectedPair = pair
  preferences.lastPair = pair
  savePreferences()
  const first = visibleTerminals()[0]
  activeTerminalId = first?.id
  renderAll()
}

function attentionCount(workspaceId: string, repositoryId?: string, surfaceId?: string): number {
  return signals.filter((signal) => matchesSignalScope(signal, workspaceId, repositoryId, surfaceId) && signalGroup(signal) === "needs-attention").length
}
function pairActive(workspaceId: string, repositoryId: string): boolean {
  const commandRunning = [...terminalViews.values()].some((view) => view.meta.workspace_id === workspaceId && view.meta.repository_id === repositoryId && Boolean(view.meta.command_id) && view.meta.state !== "ended")
  return commandRunning || signals.some((signal) => matchesSignalScope(signal, workspaceId, repositoryId) && isBackgroundActivity(signal))
}
function movePin(source: string, target: string): void {
  const order = [...preferences.pins]
  const sourceIndex = order.indexOf(source), targetIndex = order.indexOf(target)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
  order.splice(sourceIndex, 1); order.splice(targetIndex, 0, source)
  preferences.pins.clear(); for (const id of order) preferences.pins.add(id)
  savePreferences(); renderNav()
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
  const sessions = pairSignals.filter(isActiveSession).sort((left, right) => Number(right.state === "waiting") - Number(left.state === "waiting") || left.source.localeCompare(right.source))
  const notifications = pairSignals.filter((signal) => signal.kind === "notification").length
  const working = pairSignals.some(isBackgroundActivity)
  const running = [...terminalViews.values()].some((view) => view.meta.workspace_id === workspace.id && view.meta.repository_id === repository.id && Boolean(view.meta.command_id) && view.meta.state !== "ended")
  const selected = selectedPair?.workspaceId === workspace.id && selectedPair.repositoryId === repository.id
  const row = button("", `workspace-row${selected ? " active" : ""}${repository.degraded || !repository.exists ? " degraded" : ""}`)
  const title = groupKind === "repository" || workspace.repositories.length === 1 ? workspace.name : `${workspace.name} / ${repository.name}`
  row.setAttribute("aria-label", `${title}, repository ${repository.name}, branch ${repository.branch || workspace.branch}${pinned ? ", pinned" : ""}${sessions.length ? `, ${sessions.length} active agent sessions` : ""}${notifications ? `, ${notifications} unread notifications` : ""}`)
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
  for (const signal of sessions.slice(0, 3)) {
    const provider = element("span", `provider-chip${signal.state === "waiting" ? " awaiting" : ""}${signal.state === "failed" ? " failed" : ""}`, providerLetter(signal.source))
    provider.title = `${providerName(signal.source)} · ${lifecycleLabel(signal)}`
    status.append(provider)
  }
  if (sessions.length > 3) status.append(element("span", "provider-chip overflow", `+${sessions.length - 3}`))
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
  row.addEventListener("click", () => selectPair({ workspaceId: workspace.id, repositoryId: repository.id }))
  const pin = button(pinned ? "★" : "☆", `pin-button${pinned ? " pin" : ""}`)
  pin.setAttribute("aria-label", `${pinned ? "Unpin" : "Pin"} workspace ${workspace.name}`)
  pin.addEventListener("click", () => {
    pinned ? preferences.pins.delete(workspace.id) : preferences.pins.add(workspace.id)
    savePreferences(); renderNav()
  })
  container.append(row, pin); item.append(container)
  if (pinned) {
    container.draggable = true
    container.addEventListener("dragstart", (event) => event.dataTransfer?.setData("application/x-git-stacks-workspace", workspace.id))
    container.addEventListener("dragover", (event) => event.preventDefault())
    container.addEventListener("drop", (event) => { event.preventDefault(); const source = event.dataTransfer?.getData("application/x-git-stacks-workspace"); if (source) movePin(source, workspace.id) })
  }
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
  const byName = (left: SidebarEntry, right: SidebarEntry) => left.workspace.name.localeCompare(right.workspace.name) || left.repository.name.localeCompare(right.repository.name)
  const pairs = snapshot.workspaces.flatMap((workspace) => workspace.repositories.map((repository) => ({ workspace, repository })))
  const pinnedOrder = [...preferences.pins]
  const pinned = pairs.filter(({ workspace }) => preferences.pins.has(workspace.id)).sort((left, right) => pinnedOrder.indexOf(left.workspace.id) - pinnedOrder.indexOf(right.workspace.id) || byName(left, right))
  const unpinned = pairs.filter(({ workspace }) => !preferences.pins.has(workspace.id))
  const active = unpinned.filter(({ workspace, repository }) => pairActive(workspace.id, repository.id)).sort(byName)
  const ordinary = unpinned.filter(({ workspace, repository }) => !pairActive(workspace.id, repository.id)).sort(byName)
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
    const shell = button("New shell", "button primary")
    shell.addEventListener("click", () => void createTerminal())
    const actions = element("div", "scope-actions")
    const toggle = button("•••", "button icon")
    toggle.setAttribute("aria-label", "Workspace actions")
    toggle.setAttribute("aria-expanded", "false")
    const menu = element("div", "scope-menu")
    menu.hidden = true
    const menuAction = (label: string, action: () => void) => {
      const control = button(label, "scope-menu-item")
      control.addEventListener("click", () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); action() })
      menu.append(control)
    }
    menuAction("Copy terminal selection", () => { if (activeTerminalId) terminalViews.get(activeTerminalId)?.copySelection() })
    menuAction("Open workspace", () => void workspaceOperation("workspace.open", workspace))
    menuAction("Close workspace", () => void workspaceOperation("workspace.close", workspace))
    toggle.addEventListener("click", () => { menu.hidden = !menu.hidden; toggle.setAttribute("aria-expanded", String(!menu.hidden)) })
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
    tab.addEventListener("keydown", (event) => {
      if (event.key === "F2") { void view.rename(); event.preventDefault(); return }
      if (event.key !== "Enter" && event.key !== " ") return
      selectTerminal(meta.id); event.preventDefault()
    })
    tabs.append(tab)
    if (activeTerminalId === meta.id) {
      view.activate()
      if (meta.state === "ended") view.showEnded(() => void createTerminal(meta.command_id))
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
    const provider = element("span", "provider-chip signal-provider", providerLetter(signal.source))
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
function renderAll(): void { renderNav(); renderScope(); renderSignals(); statusNode.textContent = connectionSummary() }

async function createTerminal(commandId?: string): Promise<boolean> {
  if (!selectedPair) return false
  try {
    const create = () => api<TerminalMeta>("/web/api/terminals", { method: "POST", body: JSON.stringify({ workspace_id: selectedPair!.workspaceId, repository_id: selectedPair!.repositoryId, ...(commandId ? { command_id: commandId } : {}), expected_revision: snapshot.revision, cols: 100, rows: 30 }) })
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
async function workspaceOperation(kind: "workspace.open" | "workspace.close", workspace: Workspace): Promise<void> {
  try {
    const operation = await api<{ operation_id: string; state: string }>("/web/api/operations", { method: "POST", headers: { "idempotency-key": `${kind}-${workspace.id}-${crypto.randomUUID()}` }, body: JSON.stringify({ kind, request: { workspace_id: workspace.id, expected_revision: snapshot.revision } }) })
    toast(`${kind === "workspace.open" ? "Opening" : "Closing"} ${workspace.name} · ${operation.state}`)
  } catch (error) { toast(String(error), true) }
}
async function dismissSignal(id: string): Promise<void> {
  try { await api("/web/api/signals/dismiss", { method: "POST", body: JSON.stringify({ signal_id: id }) }); await refreshSignals() } catch (error) { toast(String(error), true) }
}

function modal(title: string): { body: HTMLElement; close: () => void } {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const backdrop = element("div", "modal-backdrop")
  const dialog = element("section", "modal")
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", title)
  const head = element("div", "modal-head"); head.append(element("strong", "", title))
  const closeButton = button("×", "button icon"); closeButton.setAttribute("aria-label", "Close"); head.append(closeButton)
  const bodyNode = element("div", "modal-body"); dialog.append(head, bodyNode); backdrop.append(dialog); document.body.append(backdrop)
  const close = () => { backdrop.remove(); previousFocus?.focus() }
  closeButton.addEventListener("click", close); backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close() })
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") { close(); event.preventDefault() } })
  return { body: bodyNode, close }
}

function showLauncher(): void {
  const workspace = selectedWorkspace(), repository = selectedRepository()
  if (!workspace || !repository) { toast("Select a repository first", true); return }
  const view = modal("Run a command")
  const available = workspace.commands.filter((command) => command.scope === "workspace" || command.repository_id === repository.id)
    .sort((a, b) => {
      const left = preferences.recent.indexOf(a.id), right = preferences.recent.indexOf(b.id)
      return (left === -1 ? Number.MAX_SAFE_INTEGER : left) - (right === -1 ? Number.MAX_SAFE_INTEGER : right) || a.name.localeCompare(b.name)
    })
  const search = element("input"); search.placeholder = "Search configured commands"; search.setAttribute("aria-label", "Search configured commands")
  const results = element("div", "command-results")
  const render = () => {
    results.replaceChildren()
    const query = search.value.trim().toLocaleLowerCase()
    const filtered = available.filter((command) => command.name.toLocaleLowerCase().includes(query))
    if (!filtered.length) { results.append(element("div", "empty", query ? "No configured commands match." : "No configured commands are available in this scope.")); return }
    for (const command of filtered) {
      const item = button("", "command-item")
      const recent = preferences.recent.includes(command.id) ? "Recent · " : ""
      item.append(element("span", "", command.name), element("span", "command-scope", `${recent}${workspace.name} / ${command.scope === "repository" ? repository.name : "workspace"}`))
      item.addEventListener("click", async () => {
        if (!await createTerminal(command.id)) return
        preferences.recent = [command.id, ...preferences.recent.filter((id) => id !== command.id)]; savePreferences(); view.close()
      })
      results.append(item)
    }
  }
  search.addEventListener("input", render)
  search.addEventListener("keydown", (event) => {
    const first = results.querySelector<HTMLButtonElement>("button")
    if (event.key === "ArrowDown") { first?.focus(); event.preventDefault() }
    else if (event.key === "Enter") { first?.click(); event.preventDefault() }
  })
  view.body.append(search, results); render(); search.focus()
}

async function showCreation(): Promise<void> {
  const view = modal("Create workspace")
  try {
    const catalog = await api<Catalog>("/web/api/workspace-creation/catalog")
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
        await api("/web/api/operations", { method: "POST", headers: { "idempotency-key": `workspace.create-${crypto.randomUUID()}` }, body: JSON.stringify({ kind: "workspace.create", request: { name: name.value.trim(), branch: branch.value.trim(), source: requestedSource } }) })
        toast(`Creating ${name.value.trim()}`); view.close()
      } catch (error) { toast(String(error), true) }
    })
    view.body.append(wrap("Name", name), wrap("Branch", branch), wrap("Source", source), repositoryPicker, create)
    name.focus()
  } catch (error) { view.body.append(element("div", "", String(error))) }
}

async function refreshSnapshot(): Promise<void> {
  snapshot = await api<Snapshot>("/web/api/snapshot")
  let preferencesChanged = false
  for (const id of [...preferences.pins]) if (!snapshot.workspaces.some((workspace) => workspace.id === id)) { preferences.pins.delete(id); preferencesChanged = true; toast("A pinned workspace no longer exists and was removed.") }
  if (selectedPair && !snapshot.workspaces.some((workspace) => workspace.id === selectedPair?.workspaceId && workspace.repositories.some((repository) => repository.id === selectedPair?.repositoryId))) selectedPair = undefined
  if (!selectedPair) {
    const restoredWorkspace = snapshot.workspaces.find((workspace) => workspace.id === preferences.lastPair?.workspaceId)
    const restoredRepository = restoredWorkspace?.repositories.find((repository) => repository.id === preferences.lastPair?.repositoryId)
    const workspace = restoredWorkspace && restoredRepository ? restoredWorkspace : snapshot.workspaces.find((item) => preferences.pins.has(item.id)) ?? snapshot.workspaces[0]
    const repository = restoredWorkspace && restoredRepository ? restoredRepository : workspace?.repositories[0]
    if (workspace && repository) { selectedPair = { workspaceId: workspace.id, repositoryId: repository.id }; preferences.lastPair = selectedPair; preferencesChanged = true }
  }
  if (preferencesChanged) savePreferences()
  renderAll()
}
async function refreshSignals(resetCursor = false): Promise<void> {
  try {
    const projection = await api<{ signals: Signal[]; sequence: string }>("/web/api/signals")
    signals = projection.signals
    if ((resetCursor || eventCursor === "0") && projection.sequence !== "0") { eventCursor = projection.sequence; sessionStorage.setItem("git-stacks.web.cursor", eventCursor) }
    renderSignals(); renderNav()
  } catch {}
}
async function loadTerminals(): Promise<void> {
  const items = await api<TerminalMeta[]>("/web/api/terminals")
  await Promise.all(items.filter((meta) => meta.state === "ended" && !meta.command_id).map((meta) => api(`/web/api/terminals/${encodeURIComponent(meta.id)}`, { method: "DELETE" }).catch(() => undefined)))
  for (const meta of items) if ((meta.state !== "ended" || meta.command_id) && !terminalViews.has(meta.id)) terminalViews.set(meta.id, new TerminalView(meta))
}
function connectEvents(): void {
  statusNode.textContent = connectionSummary()
  const events = new EventSource(`/web/api/events?cursor=${encodeURIComponent(eventCursor)}`)
  events.onopen = () => { statusNode.textContent = connectionSummary() }
  for (const type of ["control", "signal", "operation"]) events.addEventListener(type, (event) => {
    const message = event as MessageEvent<string>
    if (message.lastEventId) { eventCursor = message.lastEventId; sessionStorage.setItem("git-stacks.web.cursor", eventCursor) }
    const data = JSON.parse(message.data) as { type: string; control?: { kind: string } }
    if (data.type === "control") void refreshSnapshot()
    else if (data.type === "signal") void refreshSignals()
    else if (data.type === "operation") { void refreshSnapshot(); toast("Workspace operation updated") }
  })
  events.onerror = () => {
    events.close()
    statusNode.textContent = "Reconnecting to service events…"
    window.setTimeout(() => { void refreshSignals(true).finally(connectEvents) }, 1200)
  }
}

async function pairFromFragment(): Promise<void> {
  const parameters = new URLSearchParams(location.hash.slice(1))
  const code = parameters.get("pair")
  if (!code) return
  history.replaceState(null, "", `${location.pathname}${location.search}`)
  await api("/web/api/pair", { method: "POST", body: JSON.stringify({ code }) })
}

document.querySelector("#launcher")!.addEventListener("click", showLauncher)
document.querySelector("#create")!.addEventListener("click", () => void showCreation())
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
  localStorage.setItem("git-stacks.web.theme", preferences.theme)
  toast(`Theme: ${preferences.theme}`)
})
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !signalInbox.hidden) { closeSignalInbox(); event.preventDefault(); return }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); showLauncher() }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "t") { event.preventDefault(); void createTerminal() }
  if (event.ctrlKey && (event.key === "PageDown" || event.key === "PageUp")) {
    const items = visibleTerminals(); if (!items.length) return
    const current = Math.max(0, items.findIndex((item) => item.id === activeTerminalId)); const delta = event.key === "PageDown" ? 1 : -1
    selectTerminal(items[(current + delta + items.length) % items.length]!.id); event.preventDefault()
  }
})
document.addEventListener("visibilitychange", () => terminalViews.forEach((view) => view.syncStreaming()))
window.addEventListener("online", () => { statusNode.textContent = "Back online · reconnecting terminals" })
window.addEventListener("offline", () => { statusNode.textContent = "Offline · local terminal sessions remain in the service" })

void (async () => {
  try {
    await pairFromFragment()
    await Promise.all([refreshSnapshot(), loadTerminals(), refreshSignals()])
    renderAll()
    connectEvents()
  } catch (error) {
    app.innerHTML = ""
    const empty = element("div", "empty")
    empty.append(element("strong", "", "Pairing required"), element("span", "", error instanceof Error ? error.message : String(error)), element("span", "", "Run git-stacks web to open a fresh one-use link."))
    app.append(empty)
  }
})()
