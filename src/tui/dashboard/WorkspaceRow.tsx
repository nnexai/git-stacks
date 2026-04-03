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

  // Counts column: " Nwt Mtr" or " Nwt Mtr ~D" — fixed width
  const countsText = createMemo(() => {
    const dirty = dirtyCount()
    return `${wtCount()}wt ${trCount()}tr${dirty > 0 ? ` ~${dirty}` : ""}`
  })
  const countsWidth = createMemo(() => countsText().length + 2) // leading "  "

  // Ahead/behind indicators (D-07: after branch, before counts)
  const aheadCount = createMemo(() => {
    const s = props.entry.status
    if (s.state !== "loaded") return 0
    return s.repos.filter(r => r.mode === "worktree").reduce((sum, r) => sum + r.ahead, 0)
  })

  const behindCount = createMemo(() => {
    const s = props.entry.status
    if (s.state !== "loaded") return 0
    return Math.max(0, ...s.repos.filter(r => r.mode === "worktree").map(r => r.behind))
  })

  const isStale = createMemo(() => {
    const s = props.entry.status
    return s.state === "loaded" && s.aheadBehindStale
  })

  const abWidth = createMemo(() => {
    const ahead = aheadCount()
    const behind = behindCount()
    const stale = isStale() ? "?" : ""
    let len = 0
    if (ahead > 0) len += 2 + `↑${ahead}${stale}`.length  // "  ↑N" spacing
    if (behind > 0) len += 2 + `↓${behind}${stale}`.length // "  ↓N" spacing
    return len
  })

  const nameWidth = createMemo(() => {
    const w = dims().width
    // Fixed: prefix(5) + space(1) + status(2) + space(1) + countsCol + abWidth = 9 + countsWidth + abWidth
    const fixed = 9 + countsWidth() + abWidth()
    const remaining = w - fixed
    const nameMin = 10
    return Math.min(24, Math.max(nameMin, Math.floor(remaining * 0.3)))
  })

  const branchWidth = createMemo(() => {
    const nw = nameWidth()
    // branch gets ~30% of remaining after name, capped
    const w = dims().width
    const fixed = 9 + countsWidth() + abWidth() + nw + 2
    return Math.min(30, Math.max(10, Math.floor((w - fixed) * 0.4)))
  })

  const messagePreview = createMemo(() => {
    void props.tick  // subscribe to tick for periodic time refresh
    const msgs = props.messages
    if (!msgs || msgs.length === 0) return null
    const msg = msgs[0]  // most recent (newest-first from listMessages)
    const age = formatAge(msg.timestamp)
    const senderPrefix = msg.from ? `${msg.from}: ` : ""
    // Remaining space after all fixed columns
    const fixedWidth = 9 + nameWidth() + 2 + branchWidth() + countsWidth()
    const ageWidth = age.length + 2  // "  age" spacing
    const available = Math.max(10, dims().width - fixedWidth - ageWidth - 2) // -2 for "  " before msg
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
      {/* Ahead indicator — green (D-08) */}
      <text fg={aheadCount() > 0 ? (isStale() ? "gray" : "green") : "gray"}>
        {aheadCount() > 0 ? `  ↑${aheadCount()}${isStale() ? "?" : ""}` : ""}
      </text>
      {/* Behind indicator — yellow (D-08) */}
      <text fg={behindCount() > 0 ? (isStale() ? "gray" : "yellow") : "gray"}>
        {behindCount() > 0 ? `  ↓${behindCount()}${isStale() ? "?" : ""}` : ""}
      </text>
      <text fg="gray">{`  ${countsText()}`}</text>
      <text fg={messagePreview() ? "white" : "gray"}>
        {messagePreview() ? `  ${messagePreview()!.truncated}` : `  ${formatAge(ws().created)}`}
      </text>
      <text fg="yellow">
        {messagePreview() ? `  ${messagePreview()!.age}` : ""}
      </text>
    </box>
  )
}
