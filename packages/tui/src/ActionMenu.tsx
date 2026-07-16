/** @jsxImportSource @opentui/solid */

import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Action } from "./types"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  workspaceName: string
  issueDisabledReason?: "none linked" | "no opener"
  commandsDisabledReason?: "none configured"
  onAction: (action: Action) => void
  onCancel: () => void
  onRun?: () => void
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
      props.onAction(item.action as Action)
      return
    }
    // Letter-key shortcuts (backward compatible)
    if (key.name === "u" && props.onRun) { props.onRun(); return }
    const match = fullActions().find((a) => a.key === key.name)
    if (match?.disabled) return
    if (match && match.action !== "run") props.onAction(match.action)
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
