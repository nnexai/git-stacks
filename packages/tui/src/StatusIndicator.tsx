/** @jsxImportSource @opentui/solid */

import { Switch, Match } from "solid-js"
import type { WorkspaceStatus } from "./types"
import { Spinner } from "./Spinner"

type Props = { status: WorkspaceStatus }

export function StatusIndicator(props: Props) {
  return (
    <Switch>
      <Match when={props.status.state === "pending"}>
        <text fg="gray">·</text>
      </Match>
      <Match when={props.status.state === "loading"}>
        <Spinner />
      </Match>
      <Match when={props.status.state === "loaded" && (props.status as any).hasMissing}>
        <text fg="red">✗</text>
      </Match>
      <Match when={props.status.state === "loaded" && (props.status as any).hasDirty}>
        <text fg="yellow">~</text>
      </Match>
      <Match when={props.status.state === "loaded"}>
        <text fg="green">✓</text>
      </Match>
      <Match when={props.status.state === "error"}>
        <text fg="red">!</text>
      </Match>
    </Switch>
  )
}
