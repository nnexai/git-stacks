/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo, Show, Switch, Match } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { spawn } from "bun"
import { useWorkspaces } from "./hooks/useWorkspaces"
import { useTemplates } from "./hooks/useTemplates"
import { useRepos } from "./hooks/useRepos"
import { useMessages } from "./hooks/useMessages"
import { WorkspaceList } from "./WorkspaceList"
import { WorkspaceDetail } from "./WorkspaceDetail"
import { TemplateList } from "./TemplateList"
import { TemplateDetail } from "./TemplateDetail"
import { RepoList } from "./RepoList"
import { RepoDetail } from "./RepoDetail"
import { ActionMenu } from "./ActionMenu"
import { ConfirmDialog } from "./ConfirmDialog"
import { ProgressView } from "./ProgressView"
import { BatchBar } from "./BatchBar"
import { InlineInput } from "./InlineInput"
import { HelpOverlay } from "./HelpOverlay"
import { MessageOverlay } from "./MessageOverlay"
import { TemplateActionMenu } from "./TemplateActionMenu"
import {
  cleanWorkspace,
  removeWorkspace,
  mergeWorkspace,
  openWorkspace,
  editWorkspaceYaml,
  renameWorkspace,
} from "../../lib/workspace-ops"
import { readTemplate, writeTemplate, templatePath } from "../../lib/config"
import { unlinkSync } from "fs"
import type { UIView, Action, Tab } from "./types"

export default function App() {
  const renderer = useRenderer()
  const dims = useTerminalDimensions()
  const { entries, loading, reload } = useWorkspaces()
  const { entries: templateEntries, reload: reloadTemplates } = useTemplates()
  const { entries: repoEntries, reload: reloadRepos } = useRepos()
  const { msgMap, tick, clearSender, reloadMessages } = useMessages()

  const [view, setView] = createSignal<UIView>({ view: "list" })
  const [selected, setSelected] = createSignal<Set<number>>(new Set())
  const [progressLines, setProgressLines] = createSignal<string[]>([])
  const [progressDone, setProgressDone] = createSignal(false)
  const [helpOpen, setHelpOpen] = createSignal(false)
  const [messagesOpen, setMessagesOpen] = createSignal(false)
  const [messagesWorkspace, setMessagesWorkspace] = createSignal("")
  const [confirmContext, setConfirmContext] = createSignal<"workspace" | "template">("workspace")

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

  // List pane height estimate for scroll viewport
  const listHeight = createMemo(() => Math.max(6, Math.floor(dims().height * 0.6) - 2))

  // Tab title
  const tabTitle = createMemo(() => {
    const t = tab()
    const ws = t === "workspaces" ? "[1 Workspaces]" : "1 Workspaces"
    const tm = t === "templates" ? "[2 Templates]" : "2 Templates"
    const re = t === "repos" ? "[3 Repos]" : "3 Repos"
    return ` ${ws}  ${tm}  ${re} `
  })

  const filteredEntries = createMemo(() => {
    const f = tabFilter.workspaces[0]().toLowerCase()
    if (!f) return entries()
    return entries().filter((e) => e.workspace.name.toLowerCase().includes(f))
  })

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

  const currentEntry = createMemo(() => filteredEntries()[tabCursor.workspaces[0]()])
  const currentTemplate = createMemo(() => filteredTemplates()[tabCursor.templates[0]()])
  const currentRepo = createMemo(() => filteredRepos()[tabCursor.repos[0]()])

  const allWorkspaces = createMemo(() => entries().map(e => e.workspace))

  const selectedName = createMemo(() => {
    const t = tab()
    if (t === "workspaces") return currentEntry()?.workspace.name ?? ""
    if (t === "templates") return currentTemplate()?.name ?? ""
    if (t === "repos") return currentRepo()?.name ?? ""
    return ""
  })

  // Detail box title shows selected name or progress message
  const detailBoxTitle = createMemo(() => {
    const v = view()
    if (v.view === "progress") return ` ${(v as any).message} `
    const name = selectedName()
    return name ? ` ${name} ` : ""
  })

  // Context-sensitive help bar text
  const helpBarText = createMemo(() => {
    const t = tab()
    if (t === "workspaces")
      return "  1/2/3 Tabs  up/dn Navigate  Enter Actions  Space Select  m Messages  / Filter  R Refresh  ? Help  q Quit"
    if (t === "templates")
      return "  1/2/3 Tabs  up/dn Navigate  Enter Actions  / Filter  R Refresh  ? Help  q Quit"
    return "  1/2/3 Tabs  up/dn Navigate  / Filter  R Refresh  ? Help  q Quit"
  })

  const inlineInputLabel = createMemo(() => {
    const v = view()
    if (v.view === "inline-input") return v.purpose === "rename" ? "New name" : "Clone as"
    return ""
  })

  function clampCursor() {
    const entriesList = tab() === "workspaces" ? filteredEntries()
      : tab() === "templates" ? filteredTemplates()
      : filteredRepos()
    setCursor(c => Math.min(c, Math.max(0, entriesList.length - 1)))
  }

  async function handleRun(name: string) {
    if (!name) return
    setProgressLines([])
    setProgressDone(false)
    setView({ view: "progress", message: `Running ${name}...` })
    const proc = Bun.spawn(["git-stacks", "run", name], {
      stdout: "pipe",
      stderr: "inherit",
    })
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split("\n")) {
          if (line) setProgressLines(prev => [...prev, line])
        }
      }
    } catch {}
    await proc.exited
    setProgressDone(true)
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

    if (action === "open") {
      setProgressLines([])
      setProgressDone(false)
      setView({ view: "progress", message: `Opening ${name}...` })
      const result = await openWorkspace(name, {}, (msg) =>
        setProgressLines((prev) => [...prev, msg])
      )
      if (!result.ok) setProgressLines((prev) => [...prev, `ERROR: ${result.error}`])
      setProgressDone(true)
      return
    }

    // clean, remove, merge need confirmation
    setView({ view: "confirm", index, action })
  }

  async function executeConfirmed(action: Action, index: number, batch?: boolean) {
    if (confirmContext() === "template") {
      const tmpl = filteredTemplates()[index]
      if (tmpl) {
        try { unlinkSync(templatePath(tmpl.name)) } catch {}
        reloadTemplates()
      }
      setConfirmContext("workspace")
      setView({ view: "list" })
      return
    }

    const indicesToProcess = batch
      ? [...selected()]
      : [index]

    const names = indicesToProcess.map((i) => filteredEntries()[i]?.workspace.name).filter(Boolean)

    setProgressLines([])
    setProgressDone(false)
    setView({ view: "progress", message: `${action}: ${names.join(", ")}` })

    const onProgress = (msg: string) =>
      setProgressLines((prev) => [...prev, msg])

    for (const wsName of names) {
      if (!wsName) continue
      let result: { ok: boolean; error?: string }

      switch (action) {
        case "clean":
          result = await cleanWorkspace(wsName, { force: false }, onProgress)
          break
        case "remove":
          result = await removeWorkspace(wsName, { force: false }, onProgress)
          break
        case "merge":
          result = await mergeWorkspace(wsName, { force: false }, onProgress)
          break
        default:
          result = { ok: false, error: `Unknown action: ${action}` }
      }

      if (!result.ok) {
        onProgress(`ERROR [${wsName}]: ${result.error}`)
      }
    }

    if (batch) setSelected(new Set<number>())
    setProgressDone(true)
  }

  async function launchEditor(name: string) {
    const { path, validate } = editWorkspaceYaml(name)
    const editor = process.env.VISUAL || process.env.EDITOR || "vi"

    renderer.suspend()

    try {
      const proc = spawn([editor, path], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      await proc.exited

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
        const proc2 = spawn([editor, path], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        })
        await proc2.exited
      }
    } finally {
      renderer.resume()
      reload()
    }
  }

  async function handleInlineInputConfirm(value: string) {
    const v = view() as { view: "inline-input"; index: number; purpose: string; prefill: string }
    const trimmed = value.trim()
    if (!trimmed) { setView({ view: "list" }); return }

    if (v.purpose === "rename") {
      const oldName = filteredEntries()[v.index]?.workspace.name
      if (!oldName) { setView({ view: "list" }); return }
      setProgressLines([])
      setProgressDone(false)
      setView({ view: "progress", message: `Renaming ${oldName} → ${trimmed}...` })
      const result = await renameWorkspace(oldName, trimmed, {}, (msg) =>
        setProgressLines(prev => [...prev, msg])
      )
      if (!result.ok) {
        setProgressLines(prev => [...prev, `ERROR: ${result.error}`])
        setProgressDone(true)
      } else {
        setProgressDone(true)
        reload()
        setView({ view: "list" })
      }
      return
    }

    if (v.purpose === "clone-template") {
      const srcName = filteredTemplates()[v.index]?.name
      if (!srcName) { setView({ view: "list" }); return }
      try {
        const src = readTemplate(srcName)
        writeTemplate({ ...src, name: trimmed })
        reloadTemplates()
      } catch {}
      setView({ view: "list" })
      return
    }

    setView({ view: "list" })
  }

  function handleInlineInputCancel() {
    setView({ view: "list" })
  }

  async function handleTemplateAction(action: "edit" | "clone" | "remove") {
    const v = view() as { view: "action-menu"; index: number }
    const template = filteredTemplates()[v.index]
    if (!template) { setView({ view: "list" }); return }
    const name = template.name

    if (action === "edit") {
      const editor = process.env.VISUAL || process.env.EDITOR || "vi"
      const path = templatePath(name)
      renderer.suspend()
      try {
        const proc = spawn([editor, path], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
        await proc.exited
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

  // Main keyboard handler
  useKeyboard((key) => {
    const v = view()

    // Help overlay toggle — must be at very top
    if (key.name === "?" && !filtering()) {
      if (helpOpen()) { setHelpOpen(false); return }
      setHelpOpen(true)
      return
    }
    if (helpOpen()) return  // block all other keys when help is open (HelpOverlay handles its own)

    // Message overlay guard — MessageOverlay handles its own keys
    if (messagesOpen()) return

    // Tab switching — at the very beginning before other checks
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

    // Handle filter mode
    if (filtering()) {
      if (key.name === "escape") {
        setFiltering(false)
        setFilter("")
        clampCursor()
        return
      }
      if (key.name === "return") {
        setFiltering(false)
        clampCursor()
        return
      }
      if (key.name === "backspace") {
        setFilter((f) => f.slice(0, -1))
        clampCursor()
        return
      }
      // Printable character
      if (key.name.length === 1 && !key.ctrl && !key.meta) {
        setFilter((f) => f + key.name)
        clampCursor()
        return
      }
      return
    }

    // Progress view — any key returns to list
    if (v.view === "progress" && progressDone()) {
      reload()
      setView({ view: "list" })
      clampCursor()
      return
    }

    if (v.view === "progress") return

    // Confirm dialog
    if (v.view === "confirm") return // ConfirmDialog has its own keyboard handler

    // Action menu
    if (v.view === "action-menu") return // ActionMenu has its own keyboard handler

    // Inline input
    if (v.view === "inline-input") return

    // List view
    if (v.view === "list") {
      const activeEntries = tab() === "workspaces" ? filteredEntries()
        : tab() === "templates" ? filteredTemplates()
        : filteredRepos()
      const len = activeEntries.length

      if (key.name === "q") {
        renderer.destroy()
        return
      }
      if (key.name === "escape") {
        if (helpOpen()) { setHelpOpen(false); return }
        if (filtering()) { setFiltering(false); setFilter(""); clampCursor(); return }
        if (selected().size > 0) { setSelected(() => new Set<number>()); return }
        // NO-OP at top-level list — do NOT call renderer.destroy()
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

      if (key.name === "return") {
        if (tab() === "repos") return
        if (len > 0) setView({ view: "action-menu", index: cursor() })
        return
      }

      if (key.name === "space" && tab() === "workspaces") {
        setSelected((prev) => {
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
          setView({ view: "confirm", index: cursor(), action: "remove", batch: true })
          return
        }
      }

      // Message overlay (workspaces tab only, not during batch selection)
      if (key.name === "m" && tab() === "workspaces" && selected().size === 0) {
        const name = currentEntry()?.workspace.name
        if (name) {
          setMessagesWorkspace(name)
          setMessagesOpen(true)
        }
        return
      }

      // Filter
      if (key.name === "/") {
        setFiltering(true)
        setFilter("")
        return
      }

      // Refresh
      if (key.name === "R" || (key.ctrl && key.name === "r")) {
        if (tab() === "templates") { reloadTemplates(); return }
        if (tab() === "repos") { reloadRepos(); return }
        reload()
        reloadMessages()
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

      {/* Message overlay replaces EVERYTHING when open */}
      <Show when={!helpOpen() && messagesOpen()}>
        <MessageOverlay
          workspaceName={messagesWorkspace()}
          messages={msgMap().get(messagesWorkspace()) ?? []}
          onClose={() => setMessagesOpen(false)}
          onClearSender={(sender) => clearSender(messagesWorkspace(), sender)}
        />
        <box height={1}>
          <text fg="gray">  j/k Navigate groups  c Clear group  Esc Close</text>
        </box>
      </Show>

      <Show when={!helpOpen() && !messagesOpen()}>
        {/* TOP BOX: list pane with tab title in border */}
        <box border title={tabTitle()} flexDirection="column" flexGrow={3} minHeight={10}>
          <Switch>
            <Match when={tab() === "workspaces"}>
              <WorkspaceList
                entries={filteredEntries()}
                cursor={cursor()}
                selected={selected()}
                filter={filtering() ? filter() : ""}
                height={listHeight()}
                allMessages={msgMap()}
                tick={tick()}
              />
            </Match>
            <Match when={tab() === "templates"}>
              <TemplateList
                entries={filteredTemplates()}
                cursor={tabCursor.templates[0]()}
                filter={tabFiltering.templates[0]() ? tabFilter.templates[0]() : ""}
                height={listHeight()}
              />
            </Match>
            <Match when={tab() === "repos"}>
              <RepoList
                entries={filteredRepos()}
                cursor={tabCursor.repos[0]()}
                filter={tabFiltering.repos[0]() ? tabFilter.repos[0]() : ""}
                height={listHeight()}
              />
            </Match>
          </Switch>
          {/* Batch bar INSIDE top box as footer row */}
          <Show when={view().view === "list" && tab() === "workspaces" && selected().size > 0}>
            <BatchBar count={selected().size} />
          </Show>
        </box>

        {/* BOTTOM BOX: detail / action-menu / confirm / progress / inline-input */}
        <box border title={detailBoxTitle()} flexDirection="column" flexGrow={2} minHeight={10}>
          {/* List view — tab-specific detail */}
          <Show when={view().view === "list"}>
            <Switch>
              <Match when={tab() === "workspaces"}>
                <WorkspaceDetail entry={currentEntry()} messages={currentEntry() ? (msgMap().get(currentEntry()!.workspace.name) ?? []) : []} tick={tick()} />
              </Match>
              <Match when={tab() === "templates"}>
                <TemplateDetail template={currentTemplate()} />
              </Match>
              <Match when={tab() === "repos"}>
                <RepoDetail
                  entry={currentRepo()}
                  allTemplates={templateEntries()}
                  allWorkspaces={allWorkspaces()}
                />
              </Match>
            </Switch>
          </Show>

          {/* Action menus */}
          <Show when={view().view === "action-menu"}>
            <Switch>
              <Match when={tab() === "workspaces"}>
                <ActionMenu
                  workspaceName={currentEntry()?.workspace.name ?? ""}
                  onAction={(action) => runAction(action, (view() as any).index)}
                  onCancel={() => setView({ view: "list" })}
                  onRun={() => handleRun(selectedName())}
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

          {/* Confirm dialog */}
          <Show when={view().view === "confirm"}>
            {(() => {
              const v = view() as { view: "confirm"; index: number; action: Action; batch?: boolean }
              const label = confirmContext() === "template"
                ? `${v.action} template '${filteredTemplates()[v.index]?.name}'?`
                : v.batch
                ? `${v.action} ${selected().size} workspace(s)?`
                : `${v.action} '${filteredEntries()[v.index]?.workspace.name}'?`
              return (
                <ConfirmDialog
                  message={label}
                  onConfirm={() => executeConfirmed(v.action, v.index, v.batch)}
                  onCancel={() => setView({ view: "list" })}
                />
              )
            })()}
          </Show>

          {/* Inline input */}
          <Show when={view().view === "inline-input"}>
            <InlineInput
              label={inlineInputLabel()}
              prefill={(view() as any).prefill ?? ""}
              onConfirm={handleInlineInputConfirm}
              onCancel={handleInlineInputCancel}
            />
          </Show>

          {/* Progress view */}
          <Show when={view().view === "progress"}>
            <ProgressView
              title={(view() as any).message}
              lines={progressLines()}
              done={progressDone()}
            />
          </Show>
        </box>

        {/* HELP BAR / FILTER LINE / LOADING — outside both boxes, fixed 1 row */}
        <box height={1}>
          <Show when={filtering()}>
            <text fg="cyan">  filter: {filter() || "_"}</text>
          </Show>
          <Show when={!filtering() && loading()}>
            <text fg="gray">  (loading statuses...)</text>
          </Show>
          <Show when={!filtering() && !loading()}>
            <text fg="gray">{helpBarText()}</text>
          </Show>
        </box>
      </Show>
    </box>
  )
}
