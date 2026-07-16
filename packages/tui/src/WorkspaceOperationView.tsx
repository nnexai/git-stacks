/** @jsxImportSource @opentui/solid */

import { For, createMemo, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { OperationTrackerState } from "@git-stacks/client"
import type { WebOperationSummary } from "@git-stacks/protocol"

import { CenteredDialog } from "./CenteredDialog"

type Props = {
  state: OperationTrackerState
  operations: readonly WebOperationSummary[]
  overflowCount?: number
  onCancel: () => unknown | Promise<unknown>
  onReconnect: () => unknown | Promise<unknown>
  onRetryRefresh: () => unknown | Promise<unknown>
  onBack: () => void
}

const labels: Partial<Record<WebOperationSummary["action_id"], string>> = {
  "workspace.archive": "Archive workspace",
  "workspace.unarchive": "Unarchive workspace",
  "workspace.remove": "Remove workspace",
  "workspace.force-remove": "Force remove workspace",
  "workspace.rename": "Rename workspace",
  "workspace.open": "Open workspace",
  "workspace.close": "Close workspace",
  "workspace.pin": "Pin workspace",
  "workspace.unpin": "Unpin workspace",
  "workspace.sync": "Sync workspace",
  "workspace.pull": "Pull workspace",
  "workspace.push": "Push workspace",
  "workspace.merge": "Merge workspace",
  "workspace.notes.add": "Add workspace note",
  "workspace.notes.clear": "Clear workspace notes",
}

export function recoverableWorkspaceOperationBack(
  state: OperationTrackerState,
  operation: WebOperationSummary | undefined,
): boolean {
  const terminal = operation && operation.state !== "accepted" && operation.state !== "running"
  return state.phase === "submit-unknown" || Boolean(terminal && state.phase === "ready")
}

function terminalText(operation: WebOperationSummary): string | undefined {
  if (operation.state === "succeeded") return `${labels[operation.action_id] ?? "Operation"} completed.`
  if (operation.state === "cancelled") return `${labels[operation.action_id] ?? "Operation"} was cancelled. Authoritative workspace state has been refreshed.`
  if (operation.state === "failed") return operation.error.message
  return undefined
}

export function WorkspaceOperationView(props: Props) {
  const [cancelPending, setCancelPending] = createSignal(false)
  const current = createMemo(() => props.operations[0])
  const cancellable = createMemo(() => {
    const operation = current()
    return (props.state.phase === "observing" || props.state.phase === "reconnecting")
      && (operation?.state === "accepted" || operation?.state === "running")
      && operation.cancellation?.state === "available"
  })

  useKeyboard((key) => {
    if (key.name === "c" && cancellable() && !cancelPending()) {
      setCancelPending(true)
      void Promise.resolve(props.onCancel()).finally(() => setCancelPending(false))
      return
    }
    if (key.name === "r") {
      if (props.state.phase === "refresh-failed") void props.onRetryRefresh()
      else if (props.state.phase === "reconnecting") void props.onReconnect()
      return
    }
    if ((key.name === "escape" || key.name === "return") && recoverableWorkspaceOperationBack(props.state, current())) props.onBack()
  })

  return (
    <CenteredDialog title="Workspace operation" size="large" height={18}>
      <For each={props.operations.slice(0, 8)}>
        {(operation) => (
          <box flexDirection="column">
            <text fg="white">  {labels[operation.action_id] ?? "Workspace operation"} — {operation.workspace_name}</text>
            {operation.state === "running"
              ? <text fg="cyan">  {operation.progress.stage}: {operation.progress.message ?? "Working…"}{operation.progress.total ? ` (${operation.progress.completed}/${operation.progress.total})` : ""}</text>
              : operation.state === "accepted"
                ? <text fg="cyan">  preparing: Waiting to start…</text>
                : <text fg={operation.state === "succeeded" ? "green" : operation.state === "failed" ? "red" : "yellow"}>  {terminalText(operation)}</text>}
          </box>
        )}
      </For>
      {(props.overflowCount ?? 0) > 0 ? <text fg="gray">  +{props.overflowCount} earlier operation rows omitted</text> : null}
      {props.state.phase === "reconnecting" ? <text fg="yellow">  Reconnecting… observing the known operation only.</text> : null}
      {props.state.phase === "submit-unknown" ? <text fg="yellow">  The submission outcome is unknown. The action will not be replayed. Return Back and refresh before retrying.</text> : null}
      {props.state.phase === "refreshing" ? <text fg="cyan">  Refreshing authoritative workspace state…</text> : null}
      {props.state.phase === "refresh-failed" ? <text fg="red">  Authoritative refresh failed. [r] Retry refresh</text> : null}
      {cancellable()
        ? <text fg="yellow">  {cancelPending() ? "Cancelling…" : `[c] Cancel ${labels[current()!.action_id] ?? "operation"}`}</text>
        : current()?.state === "accepted" || current()?.state === "running"
          ? <text fg="gray">  Finishing current step — cancellation unavailable</text>
          : recoverableWorkspaceOperationBack(props.state, current())
            ? <text fg="gray">  [Enter/Esc] Back</text>
            : null}
    </CenteredDialog>
  )
}
