/** @jsxImportSource @opentui/solid */

import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { WebWorkspaceAction, WebWorkspaceActionId } from "@git-stacks/protocol"
import type { Action } from "./types"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  workspaceName: string
  descriptors?: readonly WebWorkspaceAction[]
  issueDisabledReason?: "none linked" | "no opener"
  commandsDisabledReason?: "none configured"
  onAction?: (action: Action) => void
  onInvoke?: (action: WebWorkspaceActionId) => void | Promise<void>
  onCancel: () => void
  onRun?: () => void
}

type CanonicalRow = {
  action: WebWorkspaceActionId
  key: string
  label: string
  group: "Workspace" | "Git" | "Details" | "Lifecycle"
  disabledReason?: string
}

const canonicalPresentation: Record<WebWorkspaceActionId, Omit<CanonicalRow, "action" | "disabledReason">> = {
  "workspace.open": { key: "o", label: "Open workspace", group: "Workspace" },
  "workspace.close": { key: "x", label: "Close workspace", group: "Workspace" },
  "workspace.rename": { key: "n", label: "Rename workspace", group: "Workspace" },
  "workspace.pin": { key: "v", label: "Pin workspace", group: "Workspace" },
  "workspace.unpin": { key: "v", label: "Unpin workspace", group: "Workspace" },
  "workspace.sync": { key: "s", label: "Sync workspace", group: "Git" },
  "workspace.pull": { key: "l", label: "Pull workspace", group: "Git" },
  "workspace.push": { key: "p", label: "Push workspace", group: "Git" },
  "workspace.merge": { key: "m", label: "Merge workspace", group: "Git" },
  "workspace.notes.list": { key: "t", label: "View notes", group: "Details" },
  "workspace.notes.add": { key: "+", label: "Add note", group: "Details" },
  "workspace.notes.clear": { key: "z", label: "Clear notes", group: "Details" },
  "workspace.files.inspect": { key: "f", label: "View file status", group: "Details" },
  "workspace.archive": { key: "a", label: "Archive workspace", group: "Lifecycle" },
  "workspace.unarchive": { key: "a", label: "Unarchive workspace", group: "Lifecycle" },
  "workspace.remove": { key: "r", label: "Remove workspace", group: "Lifecycle" },
  "workspace.force-remove": { key: "!", label: "Force remove workspace", group: "Lifecycle" },
  "operation.cancel": { key: "c", label: "Cancel operation", group: "Lifecycle" },
}

function CanonicalActionMenu(props: Required<Pick<Props, "workspaceName" | "descriptors" | "onInvoke" | "onCancel">>) {
  const rows = (): CanonicalRow[] => props.descriptors.map((descriptor) => ({
    ...canonicalPresentation[descriptor.action_id],
    action: descriptor.action_id,
    ...(!descriptor.availability.available ? { disabledReason: descriptor.availability.message } : {}),
  }))
  const firstAvailable = () => Math.max(0, rows().findIndex((row) => !row.disabledReason))
  const [cursor, setCursor] = createSignal(firstAvailable())
  const [announcement, setAnnouncement] = createSignal("")
  const pending = new Set<WebWorkspaceActionId>()

  const activate = (row: CanonicalRow | undefined) => {
    if (!row) return
    if (row.disabledReason) { setAnnouncement(row.disabledReason); return }
    if (pending.has(row.action)) return
    pending.add(row.action)
    Promise.resolve(props.onInvoke(row.action)).finally(() => pending.delete(row.action))
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
                const index = () => rows().findIndex((candidate) => candidate.action === row.action)
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

export function ActionMenu(props: Props) {
  if (props.descriptors && props.onInvoke) {
    return <CanonicalActionMenu workspaceName={props.workspaceName} descriptors={props.descriptors} onInvoke={props.onInvoke} onCancel={props.onCancel} />
  }
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
    // Letter-key shortcuts (backward compatible)
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
