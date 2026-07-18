/** @jsxImportSource @opentui/solid */

import { For, Show, createSignal, onMount } from "solid-js"
import { useKeyboard } from "@opentui/solid"

import { CenteredDialog } from "./CenteredDialog"
import type { DirtyRemovalContext } from "./types"

type ConfirmProps = {
  workspaceName: string
  onConfirm: () => void
  onCancel: () => void
}

export function WorkspaceRemovalDialog(props: ConfirmProps) {
  const [settled, setSettled] = createSignal(false)
  useKeyboard((key) => {
    if (settled()) return
    if (key.name === "y") { setSettled(true); props.onConfirm(); return }
    if (key.name === "n" || key.name === "escape") { setSettled(true); props.onCancel() }
  })

  return (
    <CenteredDialog title={`Remove ${props.workspaceName}`} size="medium">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="yellow">  Remove {props.workspaceName} permanently?</text>
        <text fg="white">  This removes:</text>
        <text fg="white">    - service-owned terminals</text>
        <text fg="white">    - managed worktrees</text>
        <text fg="white">    - workspace directory</text>
        <text fg="white">    - YAML definition</text>
        <text fg="gray">{"\n"}  [y] Remove workspace  [n/Esc] Keep workspace</text>
      </box>
    </CenteredDialog>
  )
}

type BatchConfirmProps = {
  workspaceNames: readonly string[]
  onConfirm: () => void
  onCancel: () => void
}

export function WorkspaceBatchRemovalDialog(props: BatchConfirmProps) {
  const [settled, setSettled] = createSignal(false)
  const visibleNames = () => props.workspaceNames.slice(0, 8)
  const remaining = () => Math.max(0, props.workspaceNames.length - visibleNames().length)
  useKeyboard((key) => {
    if (settled()) return
    if (key.name === "y") { setSettled(true); props.onConfirm(); return }
    if (key.name === "n" || key.name === "escape") { setSettled(true); props.onCancel() }
  })

  return (
    <CenteredDialog title={`Remove ${props.workspaceNames.length} workspaces`} size="large">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="yellow">  Remove all selected workspaces permanently?</text>
        <For each={visibleNames()}>
          {(name) => <text fg="white">    - {name}</text>}
        </For>
        <Show when={remaining() > 0}>
          <text fg="gray">    ... and {remaining()} more</text>
        </Show>
        <text fg="white">{"\n"}  Each removal independently checks terminals, managed worktrees,</text>
        <text fg="white">  workspace directory, YAML definition, authorization, and revision.</text>
        <text fg="gray">{"\n"}  [y] Remove selected workspaces  [n/Esc] Keep workspaces</text>
      </box>
    </CenteredDialog>
  )
}

type DirtyProps = {
  workspaceName: string
  details: DirtyRemovalContext
  onForce: () => void
  onCancel: () => void
}

export function WorkspaceDirtyBlockedDialog(props: DirtyProps) {
  const [settled, setSettled] = createSignal(false)
  useKeyboard((key) => {
    if (settled()) return
    if (key.name === "escape") { setSettled(true); props.onCancel(); return }
    if (key.name === "f") { setSettled(true); props.onForce() }
  })

  return (
    <CenteredDialog title={`Remove blocked: ${props.workspaceName}`} size="medium">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="yellow">  Dirty worktrees block removal.</text>
        <text fg="green">  Terminals were stopped.</text>
        <text fg="white">  Blocking repositories:</text>
        <For each={props.details.blockingRepositories}>
          {(repository) => <text fg="yellow">    - {repository}</text>}
        </For>
        <text fg="red">{"\n"}  [f] Review Force Remove  [Esc] Back to workspace actions</text>
      </box>
    </CenteredDialog>
  )
}

type ForceProps = {
  workspaceName: string
  details: DirtyRemovalContext
  onConfirm: (confirmationName: string) => void
  onCancel: () => void
}

export function WorkspaceForceRemoveDialog(props: ForceProps) {
  const [confirmation, setConfirmation] = createSignal("")
  const [inputFocused, setInputFocused] = createSignal(false)
  const [submitted, setSubmitted] = createSignal(false)
  const exact = () => confirmation() === props.workspaceName

  onMount(() => {
    // Keep the key that opened this dialog out of the confirmation input while
    // allowing an asynchronously authorized dialog to focus after its mount.
    queueMicrotask(() => setInputFocused(true))
  })

  useKeyboard((key) => {
    if (key.name === "escape" && !submitted()) props.onCancel()
  })

  return (
    <CenteredDialog title={`Force Remove ${props.workspaceName}`} size="medium">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="red">  Dirty worktrees will be deleted irreversibly:</text>
        <For each={props.details.blockingRepositories}>
          {(repository) => <text fg="yellow">    - {repository}</text>}
        </For>
        <text fg="white">  Type {props.workspaceName} to confirm irreversible removal.</text>
        <box flexDirection="row">
          <text fg="cyan">  Name: </text>
          <input
            focused={inputFocused()}
            value={confirmation()}
            onInput={(value) => setConfirmation(typeof value === "string" ? value : "")}
            onSubmit={() => {
              if (submitted()) return
              if (exact()) { setSubmitted(true); props.onConfirm(confirmation()) }
              else setConfirmation("")
            }}
          />
        </box>
        <text fg={exact() ? "red" : "gray"}>
          {exact() ? "  [Enter] Force Remove" : "  Exact, case-sensitive name required"}
        </text>
        <text fg="gray">  [Esc] Back to removal review</text>
      </box>
    </CenteredDialog>
  )
}
