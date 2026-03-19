/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo, Show } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { spawn } from "bun"
import { useWorkspaces } from "./hooks/useWorkspaces"
import { useTemplates } from "./hooks/useTemplates"
import { useRepos } from "./hooks/useRepos"
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
import {
  cleanWorkspace,
  removeWorkspace,
  mergeWorkspace,
  openWorkspace,
  editWorkspaceYaml,
} from "../../lib/workspace-ops"
import type { UIView, Action, Tab } from "./types"

export default function App() {
  const renderer = useRenderer()
  const dims = useTerminalDimensions()
  const { entries, loading, reload } = useWorkspaces()
  const { entries: templateEntries, reload: reloadTemplates } = useTemplates()
  const { entries: repoEntries, reload: reloadRepos } = useRepos()

  const [view, setView] = createSignal<UIView>({ view: "list" })
  const [selected, setSelected] = createSignal<Set<number>>(new Set())
  const [progressLines, setProgressLines] = createSignal<string[]>([])
  const [progressDone, setProgressDone] = createSignal(false)

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

  // Split layout dimensions
  const listHeight = createMemo(() => Math.floor((dims().height - 5) * 0.6))
  const detailHeight = createMemo(() => dims().height - 5 - listHeight())

  // Tab title
  const tabTitle = createMemo(() => {
    const t = tab()
    const ws = t === "workspaces" ? "[1 Workspaces]" : "1 Workspaces"
    const tm = t === "templates" ? "[2 Templates]" : "2 Templates"
    const re = t === "repos" ? "[3 Repos]" : "3 Repos"
    return `  ${ws}  ${tm}  ${re}`
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

  // Main keyboard handler
  useKeyboard((key) => {
    const v = view()

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

      if (key.name === "space") {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor())) next.delete(cursor())
          else next.add(cursor())
          return next
        })
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      // Batch operations
      if (selected().size > 0) {
        if (key.name === "c") {
          setView({ view: "confirm", index: cursor(), action: "clean", batch: true })
          return
        }
        if (key.name === "r") {
          setView({ view: "confirm", index: cursor(), action: "remove", batch: true })
          return
        }
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
        return
      }
    }
  })

  return (
    <box border title={tabTitle()} flexDirection="column" height="100%">
      {/* Loading indicator */}
      <Show when={loading()}>
        <box height={1}>
          <text fg="gray"> (loading statuses...)</text>
        </box>
      </Show>

      {/* Main content — list pane */}
      <Show when={view().view === "list" || view().view === "action-menu" || view().view === "confirm"}>
        <Show when={tab() === "workspaces"}>
          <WorkspaceList
            entries={filteredEntries()}
            cursor={cursor()}
            selected={selected()}
            filter={filtering() ? filter() : ""}
            height={listHeight()}
          />
        </Show>
        <Show when={tab() === "templates"}>
          <TemplateList
            entries={filteredTemplates()}
            cursor={tabCursor.templates[0]()}
            filter={tabFiltering.templates[0]() ? tabFilter.templates[0]() : ""}
            height={listHeight()}
          />
        </Show>
        <Show when={tab() === "repos"}>
          <RepoList
            entries={filteredRepos()}
            cursor={tabCursor.repos[0]()}
            filter={tabFiltering.repos[0]() ? tabFilter.repos[0]() : ""}
            height={listHeight()}
          />
        </Show>
      </Show>

      <Show when={view().view === "action-menu"}>
        <ActionMenu
          workspaceName={currentEntry()?.workspace.name ?? ""}
          onAction={(action) => runAction(action, (view() as any).index)}
          onCancel={() => setView({ view: "list" })}
          onRun={() => handleRun(selectedName())}
        />
      </Show>

      <Show when={view().view === "confirm"}>
        {(() => {
          const v = view() as { view: "confirm"; index: number; action: Action; batch?: boolean }
          const label = v.batch
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

      <Show when={view().view === "progress"}>
        <ProgressView
          title={(view() as any).message}
          lines={progressLines()}
          done={progressDone()}
        />
      </Show>

      {/* Separator + detail pane */}
      <Show when={view().view === "list" || view().view === "action-menu" || view().view === "confirm"}>
        <text fg="gray">  ── {selectedName()} {'─'.repeat(40)}</text>
        <box flexDirection="column" height={detailHeight()}>
          <Show when={tab() === "workspaces"}>
            <WorkspaceDetail entry={currentEntry()} />
          </Show>
          <Show when={tab() === "templates"}>
            <TemplateDetail template={currentTemplate()} />
          </Show>
          <Show when={tab() === "repos"}>
            <RepoDetail
              entry={currentRepo()}
              allTemplates={templateEntries()}
              allWorkspaces={allWorkspaces()}
            />
          </Show>
        </box>
      </Show>

      {/* Batch bar */}
      <Show when={view().view === "list" && selected().size > 0}>
        <BatchBar count={selected().size} />
      </Show>

      {/* Help bar */}
      <Show when={view().view === "list"}>
        <box height={1}>
          <text fg="gray">
            {" "}↑↓/jk Navigate  Enter Actions  Space Select  / Filter  R Refresh  ? Help  q Quit
          </text>
        </box>
      </Show>
    </box>
  )
}
