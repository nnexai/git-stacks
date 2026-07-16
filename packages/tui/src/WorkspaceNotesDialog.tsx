/** @jsxImportSource @opentui/solid */

import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { WebNotesResponse } from "@git-stacks/protocol"

import { CenteredDialog } from "./CenteredDialog"

type Props = {
  workspaceName: string
  response?: WebNotesResponse
  loading?: boolean
  error?: string
  mutationError?: string
  initialMode?: Mode
  onAdd: (text: string) => unknown | Promise<unknown>
  onClear: () => unknown | Promise<unknown>
  onRetry: () => unknown | Promise<unknown>
  onBack: () => void
}

type Mode = "list" | "add" | "clear"

export function WorkspaceNotesDialog(props: Props) {
  const [mode, setMode] = createSignal<Mode>(props.initialMode ?? "list")
  const [draft, setDraft] = createSignal("")
  const [validation, setValidation] = createSignal("")
  const [pending, setPending] = createSignal(false)
  const [inputFocused, setInputFocused] = createSignal(false)

  const submitAdd = () => {
    const text = draft()
    if (!text.trim()) { setValidation("Workspace notes cannot be blank."); return }
    if (new TextEncoder().encode(text).length > 4096) { setValidation("Workspace notes must be 4096 bytes or fewer."); return }
    if (pending()) return
    setPending(true)
    void Promise.resolve(props.onAdd(text)).then(() => {
      setDraft("")
      setMode("list")
      setValidation("")
    }).catch(() => {
      // The parent exposes the authoritative mutation error; keep the draft editable.
    }).finally(() => setPending(false))
  }

  useKeyboard((key) => {
    if (mode() === "add") {
      if (key.name === "escape") { setMode("list"); setValidation(""); return }
      if (key.name === "return") submitAdd()
      return
    }
    if (mode() === "clear") {
      if (key.name === "y" && !pending()) {
        setPending(true)
        void Promise.resolve(props.onClear()).then(() => setMode("list")).catch(() => {
          // Retain the confirmation and authoritative list after a rejected clear.
        }).finally(() => setPending(false))
        return
      }
      if (key.name === "n" || key.name === "escape") setMode("list")
      return
    }
    if (key.name === "escape") { props.onBack(); return }
    if (key.name === "r" && props.error) { void props.onRetry(); return }
    if (key.name === "a" && !props.loading) {
      setDraft("")
      setInputFocused(false)
      setMode("add")
      setValidation("")
      setTimeout(() => { setDraft(""); setInputFocused(true) }, 0)
      return
    }
    if (key.name === "x" && (props.response?.count ?? 0) > 0) setMode("clear")
  })

  const title = () => `Workspace notes — ${props.workspaceName} (${props.response?.count ?? 0})`
  return (
    <CenteredDialog title={title()} size="large" height={22}>
      {mode() === "add" ? (
        <box flexDirection="column">
          <text fg="cyan">  New workspace note</text>
          <input focused={inputFocused()} value={draft()} onInput={(value) => setDraft(typeof value === "string" ? value : "")} />
          <text fg="gray">  Plain text only. Notes are stored by the service for this workspace.</text>
          {validation() ? <text fg="red">  {validation()}</text> : null}
          <text fg="gray">  [Enter] Add note  [Esc] Cancel</text>
        </box>
      ) : mode() === "clear" ? (
        <box flexDirection="column" paddingLeft={1}>
          <text fg="yellow">Clear all workspace notes for {props.workspaceName}?</text>
          <text fg="gray">This removes the local note history for this workspace. This cannot be undone.</text>
          <text fg="gray">[y] Clear notes  [n/Esc] Keep notes</text>
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1}>
          {props.loading ? <text fg="gray">  Loading workspace notes…</text> : null}
          {props.error ? <text fg="red">  Workspace notes could not be loaded. Retry without changing stored notes.{"\n"}  [r] Retry</text> : null}
          {!props.loading && !props.error && props.response?.count === 0 ? (
            <box flexDirection="column" paddingLeft={1}>
              <text fg="white">No workspace notes</text>
              <text fg="gray">Add an operator note to keep workspace context here.</text>
            </box>
          ) : null}
          {!props.loading && !props.error && (props.response?.records.length ?? 0) > 0 ? (
            <scrollbox flexGrow={1} scrollY scrollX={false} viewportCulling>
              <For each={props.response?.records ?? []}>
                {(note) => <text fg="white">  {note.created_at}  {note.text}</text>}
              </For>
              {(props.response?.count ?? 0) > (props.response?.records.length ?? 0)
                ? <text fg="gray">  +{props.response!.count - props.response!.records.length} older notes omitted</text>
                : null}
            </scrollbox>
          ) : null}
          <text fg="gray">  [a] Add note  {(props.response?.count ?? 0) > 0 ? "[x] Clear notes  " : ""}[Esc] Back</text>
        </box>
      )}
      {props.mutationError ? <text fg="red">  {props.mutationError}</text> : null}
      {pending() ? <text fg="cyan">  Saving through the service…</text> : null}
    </CenteredDialog>
  )
}
