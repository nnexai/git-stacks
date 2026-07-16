/** @jsxImportSource @opentui/solid */

import { For, createSignal, onMount } from "solid-js"
import { useKeyboard } from "@opentui/solid"

import { CenteredDialog } from "./CenteredDialog"
import type { DirtyRemovalContext } from "./types"

type ConfirmProps = {
  workspaceName: string
  onConfirm: () => void
  onCancel: () => void
}

export function WorkspaceRemovalDialog(props: ConfirmProps) {
  useKeyboard((key) => {
    if (key.name === "y") props.onConfirm()
    if (key.name === "n" || key.name === "escape") props.onCancel()
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
        <text fg="gray">{"\n"}  [y] Remove  [n/Esc] Cancel</text>
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
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "f") props.onForce()
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
        <text fg="red">{"\n"}  [f] Force Remove  [Esc] Cancel</text>
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
  const exact = () => confirmation() === props.workspaceName

  onMount(() => {
    // Keep the key that opened this dialog out of the confirmation input.
    setTimeout(() => setInputFocused(true), 0)
  })

  useKeyboard((key) => {
    if (key.name === "escape") props.onCancel()
  })

  return (
    <CenteredDialog title={`Force Remove ${props.workspaceName}`} size="medium">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="red">  Dirty worktrees will be deleted irreversibly:</text>
        <For each={props.details.blockingRepositories}>
          {(repository) => <text fg="yellow">    - {repository}</text>}
        </For>
        <text fg="white">  Type {props.workspaceName} to enable Force Remove.</text>
        <box flexDirection="row">
          <text fg="cyan">  Name: </text>
          <input
            focused={inputFocused()}
            value={confirmation()}
            onInput={(value) => setConfirmation(typeof value === "string" ? value : "")}
            onSubmit={() => {
              if (exact()) props.onConfirm(confirmation())
              else setConfirmation("")
            }}
          />
        </box>
        <text fg={exact() ? "red" : "gray"}>
          {exact() ? "  [Enter] Force Remove" : "  Exact, case-sensitive name required"}
        </text>
        <text fg="gray">  [Esc] Cancel</text>
      </box>
    </CenteredDialog>
  )
}
