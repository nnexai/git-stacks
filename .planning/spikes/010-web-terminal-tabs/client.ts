import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"

type Session = { id: string; label: string; closed: boolean; exitCode: number | null }
type Tab = { session: Session; terminal: Terminal; fit: FitAddon; socket?: WebSocket; pane: HTMLElement; tab: HTMLButtonElement; status: HTMLElement; reconnectTimer?: number; closedByUser: boolean }

const tabs = new Map<string, Tab>()
const tabStrip = document.querySelector<HTMLElement>("#tabs")!
const panes = document.querySelector<HTMLElement>("#panes")!
const status = document.querySelector<HTMLElement>("#connection-status")!
const addButton = document.querySelector<HTMLButtonElement>("#new-tab")!
let activeId: string | undefined

function send(tab: Tab, message: unknown): void {
  if (tab.socket?.readyState === WebSocket.OPEN) tab.socket.send(JSON.stringify(message))
}

function fit(tab: Tab): void {
  if (activeId !== tab.session.id) return
  tab.fit.fit()
  send(tab, { type: "resize", cols: tab.terminal.cols, rows: tab.terminal.rows })
}

function activate(id: string): void {
  const next = tabs.get(id)
  if (!next) return
  activeId = id
  for (const tab of tabs.values()) {
    const active = tab.session.id === id
    tab.tab.classList.toggle("active", active)
    tab.pane.hidden = !active
  }
  requestAnimationFrame(() => fit(next))
}

function updateTabLabel(tab: Tab, label: string): void {
  tab.session.label = label
  tab.tab.querySelector(".tab-label")!.textContent = label
}

function connect(tab: Tab): void {
  if (tab.closedByUser) return
  tab.status.textContent = "connecting"
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const socket = new WebSocket(`${protocol}//${location.host}/ws?session=${encodeURIComponent(tab.session.id)}`)
  socket.binaryType = "arraybuffer"
  tab.socket = socket
  socket.addEventListener("open", () => {
    tab.status.textContent = "connected"
    send(tab, { type: "attach", cols: tab.terminal.cols || 100, rows: tab.terminal.rows || 30 })
    fit(tab)
    if (activeId === tab.session.id) status.textContent = `${tabs.size} independent PTY tabs · ${tab.session.label} active`
  })
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      const message = JSON.parse(event.data) as { type?: string; session?: Session; code?: number | null }
      if (message.type === "ready" && message.session) {
        tab.session = message.session
        updateTabLabel(tab, message.session.label)
      }
      if (message.type === "exit") {
        tab.session.closed = true
        tab.session.exitCode = message.code ?? null
        tab.status.textContent = `exited ${message.code ?? ""}`
      }
      return
    }
    tab.terminal.write(new Uint8Array(event.data as ArrayBuffer))
  })
  socket.addEventListener("close", () => {
    if (tab.closedByUser || tab.session.closed) return
    tab.status.textContent = "reconnecting"
    tab.reconnectTimer = window.setTimeout(() => connect(tab), 500)
  })
  socket.addEventListener("error", () => { tab.status.textContent = "connection error" })
}

function closeTab(tab: Tab): void {
  tab.closedByUser = true
  if (tab.reconnectTimer) window.clearTimeout(tab.reconnectTimer)
  tab.socket?.close()
  void fetch(`/api/sessions/${encodeURIComponent(tab.session.id)}`, { method: "POST" })
  tab.terminal.dispose()
  tab.tab.remove()
  tab.pane.remove()
  tabs.delete(tab.session.id)
  const next = tabs.keys().next().value as string | undefined
  if (activeId === tab.session.id) {
    activeId = undefined
    if (next) activate(next)
  }
  status.textContent = `${tabs.size} independent PTY tabs`
}

function addTab(session: Session): void {
  const pane = document.createElement("section")
  pane.className = "terminal-pane"
  pane.hidden = true
  panes.append(pane)

  const tabButton = document.createElement("button")
  tabButton.className = "tab"
  tabButton.type = "button"
  tabButton.innerHTML = `<span class="tab-label"></span><span class="tab-status"></span><span class="tab-close" aria-label="Close tab">×</span>`
  tabButton.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".tab-close")) closeTab(tab)
    else activate(session.id)
  })
  tabStrip.insertBefore(tabButton, addButton)

  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
    fontSize: 14,
    scrollback: 2_000,
    theme: { background: "#0b1020", foreground: "#e8eef9", cursor: "#7dd3fc", selectionBackground: "#28466b" },
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(pane)
  const tab: Tab = { session, terminal, fit: fitAddon, pane, tab: tabButton, status: tabButton.querySelector(".tab-status")!, closedByUser: false }
  updateTabLabel(tab, session.label)
  tab.status.textContent = session.closed ? "closed" : "starting"
  terminal.onData((data) => send(tab, { type: "input", data }))
  terminal.onResize(({ cols, rows }) => send(tab, { type: "resize", cols, rows }))
  new ResizeObserver(() => fit(tab)).observe(pane)
  tabs.set(session.id, tab)
  connect(tab)
  if (!activeId) activate(session.id)
}

async function addServerTab(): Promise<void> {
  const response = await fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: `shell-${tabs.size + 1}` }) })
  if (!response.ok) throw new Error(`session create failed: ${response.status}`)
  addTab(await response.json() as Session)
  activate([...tabs.keys()].at(-1)!)
}

addButton.addEventListener("click", () => void addServerTab().catch((error) => { status.textContent = String(error) }))

const sessions = await (await fetch("/api/sessions")).json() as Session[]
for (const session of sessions) addTab(session)
status.textContent = `${tabs.size} independent PTY tabs · switching tabs preserves process state`
