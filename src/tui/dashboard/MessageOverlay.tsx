/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo, For, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { groupBySender, formatAge, isStale } from "./messageUtils"
import type { SenderGroup } from "./messageUtils"
import type { MessageRecord } from "../../lib/messages"

type Props = {
  workspaceName: string
  messages: MessageRecord[]
  tick: number
  onClose: () => void
  onClearSender: (sender: string | undefined) => Promise<void>
}

export function MessageOverlay(props: Props) {
  const [groupCursor, setGroupCursor] = createSignal(0)
  const dims = useTerminalDimensions()

  const groups = createMemo(() => groupBySender(props.messages))

  useKeyboard((key) => {
    const len = groups().length
    if (key.name === "escape") {
      props.onClose()
      return
    }
    if (key.name === "up" || key.name === "k") {
      setGroupCursor(c => Math.max(0, c - 1))
      return
    }
    if (key.name === "down" || key.name === "j") {
      setGroupCursor(c => Math.min(Math.max(0, len - 1), c + 1))
      return
    }
    if (key.name === "c") {
      const focused = groups()[groupCursor()]
      if (focused) {
        props.onClearSender(focused.sender)
        // Clamp cursor after group removal
        setGroupCursor(c => Math.min(c, Math.max(0, len - 2)))
      }
      return
    }
  })

  // Calculate how many lines are available for message content
  const contentHeight = createMemo(() => Math.max(5, dims().height - 4))

  // Build a flat list of renderable lines with scroll viewport
  const renderLines = createMemo(() => {
    const allGroups = groups()
    const lines: { type: "header" | "message"; groupIdx: number; group?: SenderGroup; msg?: MessageRecord }[] = []
    for (let gi = 0; gi < allGroups.length; gi++) {
      const g = allGroups[gi]
      lines.push({ type: "header", groupIdx: gi, group: g })
      for (const msg of g.messages) {
        lines.push({ type: "message", groupIdx: gi, msg })
      }
    }
    return lines
  })

  // Scroll to keep focused group header visible
  const scrollOffset = createMemo(() => {
    const lines = renderLines()
    const ch = contentHeight()
    // Find line index of focused group header
    const focusedHeaderIdx = lines.findIndex(
      l => l.type === "header" && l.groupIdx === groupCursor()
    )
    if (focusedHeaderIdx < 0) return 0
    if (focusedHeaderIdx < ch) return 0
    return Math.min(focusedHeaderIdx, Math.max(0, lines.length - ch))
  })

  const visibleLines = createMemo(() => {
    const all = renderLines()
    return all.slice(scrollOffset(), scrollOffset() + contentHeight())
  })

  return (
    <box border title={` ${props.workspaceName} \u2014 Messages (${props.messages.length}) `}
         flexDirection="column" height="100%" width="100%">
      <Show when={groups().length === 0}>
        <text fg="gray">  No messages</text>
      </Show>
      <Show when={groups().length > 0}>
        <For each={visibleLines()}>
          {(line) => {
            if (line.type === "header") {
              const g = line.group!
              const focused = () => line.groupIdx === groupCursor()
              return (
                <box height={1} flexDirection="row">
                  <text fg={focused() ? "white" : "gray"}>  {focused() ? "\u25b8" : " "} {g.label}</text>
                  <text fg="gray"> ({g.messages.length})</text>
                  <text fg={focused() ? "cyan" : "gray"}>{focused() ? "  [c] clear" : ""}</text>
                </box>
              )
            }
            // message line
            const msg = line.msg!
            const senderLabel = msg.from ? `${msg.from}: ` : ""
            const stale = () => (void props.tick, isStale(msg.timestamp))
            const age = () => (void props.tick, formatAge(msg.timestamp))
            return (
              <box height={1} flexDirection="row">
                <text fg={stale() ? "gray" : "white"}>      {senderLabel}{msg.text}</text>
                <text fg={stale() ? "gray" : "yellow"}>  {age()}</text>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}
