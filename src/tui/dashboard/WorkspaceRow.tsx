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

  const nameWidth = createMemo(() => {
    const w = dims().width
    // Fixed: prefix(5) + space(1) + status(2) + space(1) = 9
    // Fixed right: " Nwt Mtr" ~10 + optional dirty ~4 = ~14
    const fixed = 9 + 14
    const remaining = w - fixed
    const nameMin = 10
    return Math.min(24, Math.max(nameMin, Math.floor(remaining * 0.3)))
  })

  const branchWidth = createMemo(() => {
    const w = dims().width
    const fixed = 9 + 14
    const nw = nameWidth()
    return Math.max(10, w - fixed - nw - 2)
  })

  const messagePreview = createMemo(() => {
    void props.tick  // subscribe to tick for periodic time refresh
    const msgs = props.messages
    if (!msgs || msgs.length === 0) return null
    const msg = msgs[0]  // most recent (newest-first from listMessages)
    const age = formatAge(msg.timestamp)
    const senderPrefix = msg.from ? `${msg.from}: ` : ""
    // Fixed columns adapt to reactive column widths
    const fixedWidth = nameWidth() + branchWidth() + 23
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
      <text fg="white"> {(() => {
        const n = ws().name
        const nw = nameWidth()
        return (n.length > nw ? n.slice(0, nw - 1) + "\u2026" : n.padEnd(nw))
      })()}</text>
      <text fg="cyan"> {(() => {
        const b = ws().branch
        const bw = branchWidth()
        return (b.length > bw ? b.slice(0, bw - 1) + "\u2026" : b.padEnd(bw))
      })()}</text>
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
