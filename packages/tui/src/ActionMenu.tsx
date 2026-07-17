/** @jsxImportSource @opentui/solid */

import { For, Match, Switch, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { WebWorkspaceAction, WebWorkspaceActionId } from "@git-stacks/protocol"
import type { Action } from "./types"
import { CenteredDialog } from "./CenteredDialog"
import { tuiWorkspaceActionRows, type TuiWorkspaceActionGroup } from "./workspace-action-inventory"

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

type CanonicalGroup = TuiWorkspaceActionGroup

type CanonicalRow = {
  id: string
  key: string
  label: string
  group: CanonicalGroup
  disabledReason?: string
  activate: () => void | Promise<void>
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
  const canonicalRows = (): CanonicalRow[] => tuiWorkspaceActionRows(props.descriptors).map((row) => ({
    ...row,
    activate: () => props.onInvoke(row.actionId),
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

function ReadyActionMenu(props: Props) {
  if (!props.descriptors || !props.onInvoke) {
    return <InventoryUnavailableMenu workspaceName={props.workspaceName} inventoryState="error" inventoryError="Workspace actions could not be loaded." onCancel={props.onCancel} />
  }
  return <CanonicalActionMenu {...props} descriptors={props.descriptors} onInvoke={props.onInvoke} />
}

export function ActionMenu(props: Props) {
  return (
    <Switch fallback={<InventoryUnavailableMenu workspaceName={props.workspaceName} inventoryState="error" inventoryError="Workspace actions could not be loaded." onCancel={props.onCancel} />}>
      <Match when={props.inventoryState === "loading" || props.inventoryState === "error"}>
        <InventoryUnavailableMenu workspaceName={props.workspaceName} inventoryState={props.inventoryState} inventoryError={props.inventoryError} onCancel={props.onCancel} />
      </Match>
      <Match when={props.inventoryState === "ready" && props.descriptors && props.onInvoke}>
        <ReadyActionMenu {...props} />
      </Match>
    </Switch>
  )
}
