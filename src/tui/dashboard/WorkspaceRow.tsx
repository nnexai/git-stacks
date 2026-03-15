import { StatusIndicator } from "./StatusIndicator"
import type { WorkspaceEntry } from "./types"

type Props = {
  entry: WorkspaceEntry
  focused: boolean
  selected: boolean
}

export function WorkspaceRow(props: Props) {
  const ws = () => props.entry.workspace
  const wtCount = () => ws().repos.filter((r) => r.mode === "worktree").length
  const trCount = () => ws().repos.filter((r) => r.mode === "trunk").length

  const dirtyCount = () => {
    const s = props.entry.status
    if (s.state !== "loaded") return 0
    return s.repos.filter((r) => r.dirty).length
  }

  const prefix = () => {
    const sel = props.selected ? "x" : " "
    const focus = props.focused ? ">" : " "
    return `${focus}[${sel}]`
  }

  return (
    <box
      height={1}
      flexDirection="row"
      backgroundColor={props.focused ? "#333333" : undefined}
    >
      <text fg={props.focused ? "white" : "gray"}>{prefix()} </text>
      <StatusIndicator status={props.entry.status} />
      <text fg="white"> {ws().name.padEnd(22)}</text>
      <text fg="cyan"> {ws().branch.padEnd(32)}</text>
      <text fg="gray">
        {` ${wtCount()}wt ${trCount()}tr`}
        {dirtyCount() > 0 ? ` ~${dirtyCount()}` : ""}
        {`  ${ws().created}`}
      </text>
    </box>
  )
}
