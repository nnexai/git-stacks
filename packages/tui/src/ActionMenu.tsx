/** @jsxImportSource @opentui/solid */

import { For, Match, Switch, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { WebWorkspaceAction, WebWorkspaceActionId } from "@git-stacks/protocol"
import type { Action } from "./types"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  workspaceName: string
  inventoryState?: "loading" | "ready" | "error"
  inventoryError?: string
  descriptors?: readonly WebWorkspaceAction[]
  issueDisabledReason?: "none linked" | "no opener"
  commandsDisabledReason?: "none configured"
  onAction?: (action: Action) => void
  onInvoke?: (action: WebWorkspaceActionId) => void | Promise<void>
  onCancel: () => void
  onRun?: () => void
}

type CanonicalGroup = "Workspace" | "Git" | "Details" | "Lifecycle"

type CanonicalRow = {
  id: string
  key: string
  label: string
  group: CanonicalGroup
  disabledReason?: string
  activate: () => void | Promise<void>
}

const canonicalPresentation: Record<WebWorkspaceActionId, { key: string; label: string; group: CanonicalGroup }> = {
  "workspace.open": { key: "o", label: "Open workspace", group: "Workspace" },
  "workspace.close": { key: "x", label: "Close workspace", group: "Workspace" },
  "workspace.rename": { key: "n", label: "Rename workspace", group: "Workspace" },
  "workspace.pin": { key: "v", label: "Pin workspace", group: "Workspace" },
  "workspace.unpin": { key: "g", label: "Unpin workspace", group: "Workspace" },
  "workspace.sync": { key: "s", label: "Sync workspace", group: "Git" },
  "workspace.pull": { key: "l", label: "Pull workspace", group: "Git" },
  "workspace.push": { key: "p", label: "Push workspace", group: "Git" },
  "workspace.merge": { key: "m", label: "Merge workspace", group: "Git" },
  "workspace.notes.list": { key: "t", label: "View notes", group: "Details" },
  "workspace.notes.add": { key: "+", label: "Add note", group: "Details" },
  "workspace.notes.clear": { key: "z", label: "Clear notes", group: "Details" },
  "workspace.files.inspect": { key: "f", label: "View file status", group: "Details" },
  "workspace.archive": { key: "a", label: "Archive workspace", group: "Lifecycle" },
  "workspace.unarchive": { key: "h", label: "Unarchive workspace", group: "Lifecycle" },
  "workspace.remove": { key: "r", label: "Remove workspace", group: "Lifecycle" },
  "workspace.force-remove": { key: "!", label: "Force remove workspace", group: "Lifecycle" },
  "operation.cancel": { key: "c", label: "Cancel operation", group: "Lifecycle" },
}

function InventoryUnavailableMenu(props: Pick<Props, "workspaceName" | "inventoryState" | "inventoryError" | "onCancel">) {
  useKeyboard((key) => {
    if (key.name === "escape") props.onCancel()
  })
  return (
    <CenteredDialog title={props.workspaceName} size="medium">
      <text fg={props.inventoryState === "loading" ? "cyan" : "red"}>
        {props.inventoryState === "loading"
          ? "  Loading authoritative workspace actions…"
          : `  ${props.inventoryError ?? "Workspace actions could not be loaded."}`}
      </text>
      <text fg="gray">{"\n"}  No workspace action is available until the service inventory loads.</text>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </CenteredDialog>
  )
}

function CanonicalActionMenu(props: Required<Pick<Props, "workspaceName" | "descriptors" | "onInvoke" | "onCancel">> & Pick<Props, "issueDisabledReason" | "commandsDisabledReason" | "onAction" | "onRun">) {
  const canonicalRows = (): CanonicalRow[] => props.descriptors.map((descriptor) => ({
    ...canonicalPresentation[descriptor.action_id],
    id: descriptor.action_id,
    ...(!descriptor.availability.available ? { disabledReason: descriptor.availability.message } : {}),
    activate: () => props.onInvoke(descriptor.action_id),
  }))
  const adaptedRows = (): CanonicalRow[] => {
    const invokeLegacy = (action: Action) => () => props.onAction?.(action)
    return [
      ...(props.onAction ? [
        { id: "legacy.edit", key: "e", label: "Edit ($EDITOR)", group: "Workspace" as const, activate: invokeLegacy("edit") },
        { id: "legacy.clean", key: "k", label: "Clean", group: "Git" as const, activate: invokeLegacy("clean") },
        { id: "legacy.issue", key: "i", label: "Issue...", group: "Details" as const, disabledReason: props.issueDisabledReason, activate: invokeLegacy("issue") },
        { id: "legacy.commands", key: "d", label: "Commands...", group: "Details" as const, disabledReason: props.commandsDisabledReason, activate: invokeLegacy("commands") },
      ] : []),
      ...(props.onRun ? [{ id: "legacy.run", key: "u", label: "Run", group: "Workspace" as const, activate: props.onRun }] : []),
    ]
  }
  const rows = (): CanonicalRow[] => [...canonicalRows(), ...adaptedRows()]
  const firstAvailable = () => Math.max(0, rows().findIndex((row) => !row.disabledReason))
  const [cursor, setCursor] = createSignal(firstAvailable())
  const [announcement, setAnnouncement] = createSignal("")

  const activate = (row: CanonicalRow | undefined) => {
    if (!row) return
    if (row.disabledReason) { setAnnouncement(row.disabledReason); return }
    void row.activate()
  }

  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down") { setCursor((value) => Math.min(value + 1, rows().length - 1)); return }
    if (key.name === "up") { setCursor((value) => Math.max(value - 1, 0)); return }
    if (key.name === "return") { activate(rows()[cursor()]); return }
    activate(rows().find((row) => row.key === key.name))
  })

  return (
    <CenteredDialog title={props.workspaceName} size="medium">
      <For each={["Workspace", "Git", "Details", "Lifecycle"] as const}>
        {(group) => (
          <>
            <text fg="cyan">  {group}</text>
            <For each={rows().filter((row) => row.group === group)}>
              {(row) => {
                const index = () => rows().findIndex((candidate) => candidate.id === row.id)
                return (
                  <text fg={row.disabledReason ? "gray" : index() === cursor() ? "cyan" : "white"}>
                    {index() === cursor() ? "> " : "  "}[{row.key}] {row.label}{row.disabledReason ? ` (${row.disabledReason})` : ""}
                  </text>
                )
              }}
            </For>
          </>
        )}
      </For>
      {announcement() ? <text fg="yellow">  {announcement()}</text> : null}
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </CenteredDialog>
  )
}

type ActionItem = { key: string; action: Action | "run"; label: string; disabled?: boolean }

const actions: ActionItem[] = [
  { key: "o", action: "open", label: "Open" },
  { key: "x", action: "close", label: "Close" },
  { key: "n", action: "rename", label: "Rename" },
  { key: "e", action: "edit", label: "Edit ($EDITOR)" },
  { key: "c", action: "clean", label: "Clean" },
  { key: "a", action: "archive", label: "Archive" },
  { key: "r", action: "remove", label: "Remove" },
  { key: "m", action: "merge", label: "Merge" },
  { key: "s", action: "sync", label: "Sync" },
  { key: "p", action: "push", label: "Push" },
]

function LegacyActionMenu(props: Props) {
  const issueItem = (): ActionItem => ({
    key: "i",
    action: "issue",
    label: props.issueDisabledReason ? `Issue... (${props.issueDisabledReason})` : "Issue...",
    disabled: Boolean(props.issueDisabledReason),
  })
  const commandsItem = (): ActionItem => ({
    key: "d",
    action: "commands",
    label: props.commandsDisabledReason ? `Commands... (${props.commandsDisabledReason})` : "Commands...",
    disabled: Boolean(props.commandsDisabledReason),
  })
  const fullActions = () => {
    const base = [...actions, issueItem(), commandsItem()]
    return props.onRun
      ? [...base, { key: "u", action: "run" as const, label: "Run" }]
      : base
  }

  const [cursor, setCursor] = createSignal(0)

  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "down") { setCursor(c => Math.min(c + 1, fullActions().length - 1)); return }
    if (key.name === "up") { setCursor(c => Math.max(c - 1, 0)); return }
    if (key.name === "return") {
      const item = fullActions()[cursor()]
      if (item.disabled) return
      if (item.action === "run" && props.onRun) { props.onRun(); return }
      props.onAction?.(item.action as Action)
      return
    }
    if (key.name === "u" && props.onRun) { props.onRun(); return }
    const match = fullActions().find((a) => a.key === key.name)
    if (match?.disabled) return
    if (match && match.action !== "run") props.onAction?.(match.action)
  })

  return (
    <CenteredDialog title={props.workspaceName} size="small">
      <For each={fullActions()}>
        {(item, i) => (
          <text fg={item.disabled ? "gray" : i() === cursor() ? "cyan" : "white"}>
            {i() === cursor() ? "> " : "  "}[{item.key}] {item.label}
          </text>
        )}
      </For>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </CenteredDialog>
  )
}

function ReadyActionMenu(props: Props) {
  if (!props.descriptors || !props.onInvoke) {
    return <InventoryUnavailableMenu workspaceName={props.workspaceName} inventoryState="error" inventoryError="Workspace actions could not be loaded." onCancel={props.onCancel} />
  }
  return <CanonicalActionMenu {...props} descriptors={props.descriptors} onInvoke={props.onInvoke} />
}

export function ActionMenu(props: Props) {
  return (
    <Switch fallback={<LegacyActionMenu {...props} />}>
      <Match when={props.inventoryState === "loading" || props.inventoryState === "error"}>
        <InventoryUnavailableMenu workspaceName={props.workspaceName} inventoryState={props.inventoryState} inventoryError={props.inventoryError} onCancel={props.onCancel} />
      </Match>
      <Match when={props.inventoryState === "ready"}>
        <ReadyActionMenu {...props} />
      </Match>
      <Match when={props.descriptors && props.onInvoke}>
        <ReadyActionMenu {...props} />
      </Match>
    </Switch>
  )
}
