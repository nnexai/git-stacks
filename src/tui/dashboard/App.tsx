import { createSignal, createMemo, Show } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { spawn } from "bun"
import { useWorkspaces } from "./hooks/useWorkspaces"
import { WorkspaceList } from "./WorkspaceList"
import { ActionMenu } from "./ActionMenu"
import { ConfirmDialog } from "./ConfirmDialog"
import { ProgressView } from "./ProgressView"
import { DetailStatus } from "./DetailStatus"
import { BatchBar } from "./BatchBar"
import {
  cleanWorkspace,
  removeWorkspace,
  mergeWorkspace,
  openWorkspace,
  editWorkspaceYaml,
} from "../../lib/workspace-ops"
import type { UIView, Action } from "./types"

export default function App() {
  const renderer = useRenderer()
  const { entries, loading, reload } = useWorkspaces()

  const [view, setView] = createSignal<UIView>({ view: "list" })
  const [cursor, setCursor] = createSignal(0)
  const [selected, setSelected] = createSignal<Set<number>>(new Set())
  const [filter, setFilter] = createSignal("")
  const [filtering, setFiltering] = createSignal(false)
  const [progressLines, setProgressLines] = createSignal<string[]>([])
  const [progressDone, setProgressDone] = createSignal(false)

  const filteredEntries = createMemo(() => {
    const f = filter().toLowerCase()
    if (!f) return entries()
    return entries().filter((e) => e.workspace.name.toLowerCase().includes(f))
  })

  const currentEntry = createMemo(() => {
    const v = view()
    if (v.view === "action-menu" || v.view === "confirm" || v.view === "detail-status") {
      return filteredEntries()[v.index]
    }
    return filteredEntries()[cursor()]
  })

  function clampCursor() {
    const max = filteredEntries().length - 1
    if (cursor() > max) setCursor(Math.max(0, max))
  }

  async function runAction(action: Action, index: number) {
    const entry = filteredEntries()[index]
    if (!entry) return
    const name = entry.workspace.name

    if (action === "status") {
      setView({ view: "detail-status", index })
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

    // Detail status view
    if (v.view === "detail-status") return // DetailStatus has its own keyboard handler

    // Confirm dialog
    if (v.view === "confirm") return // ConfirmDialog has its own keyboard handler

    // Action menu
    if (v.view === "action-menu") return // ActionMenu has its own keyboard handler

    // List view
    if (v.view === "list") {
      const len = filteredEntries().length

      if (key.name === "q" || key.name === "escape") {
        if (selected().size > 0) {
          setSelected(new Set<number>())
          return
        }
        renderer.destroy()
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
        reload()
        return
      }
    }
  })

  return (
    <box flexDirection="column" height="100%">
      {/* Header */}
      <box height={1}>
        <text fg="cyan"> ws manage </text>
        <Show when={loading()}>
          <text fg="gray"> (loading statuses...)</text>
        </Show>
      </box>

      {/* Main content */}
      <Show when={view().view === "list" || view().view === "action-menu" || view().view === "confirm"}>
        <WorkspaceList
          entries={filteredEntries()}
          cursor={cursor()}
          selected={selected()}
          filter={filtering() ? filter() : ""}
        />
      </Show>

      <Show when={view().view === "action-menu"}>
        <ActionMenu
          workspaceName={currentEntry()?.workspace.name ?? ""}
          onAction={(action) => runAction(action, (view() as any).index)}
          onCancel={() => setView({ view: "list" })}
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

      <Show when={view().view === "detail-status" && currentEntry()}>
        <DetailStatus
          entry={currentEntry()!}
          onBack={() => setView({ view: "list" })}
        />
      </Show>

      {/* Batch bar */}
      <Show when={view().view === "list" && selected().size > 0}>
        <BatchBar count={selected().size} />
      </Show>

      {/* Help bar */}
      <Show when={view().view === "list"}>
        <box height={1}>
          <text fg="gray">
            {" "}↑↓/jk Navigate  Enter Actions  Space Select  / Filter  R Refresh  q Quit
          </text>
        </box>
      </Show>
    </box>
  )
}
