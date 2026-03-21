/** @jsxImportSource @opentui/solid */
import { createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { StatusIndicator } from "./StatusIndicator"
import { formatAge } from "./messageUtils"
import type { WorkspaceEntry } from "./types"
import type { MessageRecord } from "../../lib/messages"

type Props = {
  entry: WorkspaceEntry
  focused: boolean
  selected: boolean
  messages: MessageRecord[]
  tick: number
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

  const dims = useTerminalDimensions()

  const messagePreview = createMemo(() => {
    void props.tick  // subscribe to tick for periodic time refresh
    const msgs = props.messages
    if (!msgs || msgs.length === 0) return null
    const msg = msgs[0]  // most recent (newest-first from listMessages)
    const age = formatAge(msg.timestamp)
    const senderPrefix = msg.from ? `${msg.from}: ` : ""
    // Fixed columns: prefix(5) + space(1) + status(2) + space(1) + name(23) + space(1) + branch(33) + wt/tr(~14) = ~80
    const fixedWidth = 80
    const ageWidth = age.length + 2  // "  age" spacing
    const available = Math.max(10, dims().width - fixedWidth - ageWidth)
    const text = senderPrefix + msg.text
    const truncated = text.length > available ? text.slice(0, available - 1) + "\u2026" : text
    return { truncated, age }
  })

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
        {messagePreview() ? `  ${messagePreview()!.truncated}` : `  ${formatAge(ws().created)}`}
      </text>
      <text fg={messagePreview() ? "yellow" : "gray"}>
        {messagePreview() ? `  ${messagePreview()!.age}` : ""}
      </text>
    </box>
  )
}
