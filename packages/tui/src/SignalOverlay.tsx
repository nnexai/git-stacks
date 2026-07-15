/** @jsxImportSource @opentui/solid */

import { createMemo, createSignal, For, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { CenteredDialog } from "./CenteredDialog"
import type { DashboardSignal } from "./hooks/useSignals"
import { formatSignalAge, signalText } from "./signalUtils"

type Props = { workspaceName: string; signals: DashboardSignal[]; tick: number; onClose: () => void; onDismiss: (id: string) => Promise<void> }

export function SignalOverlay(props: Props) {
  const [cursor, setCursor] = createSignal(0)
  const dims = useTerminalDimensions()
  const rows = createMemo(() => (void props.tick, props.signals))
  useKeyboard((key) => {
    if (key.name === "escape") return props.onClose()
    if (key.name === "up" || key.name === "k") return setCursor((value) => Math.max(0, value - 1))
    if (key.name === "down" || key.name === "j") return setCursor((value) => Math.min(Math.max(0, rows().length - 1), value + 1))
    if (key.name === "d") {
      const selected = rows()[cursor()]
      if (selected) void props.onDismiss(selected.id)
    }
  })
  const height = createMemo(() => Math.max(5, dims().height - 4))
  const offset = createMemo(() => Math.max(0, Math.min(cursor(), rows().length - height())))
  return <CenteredDialog title={`${props.workspaceName} — Signals (${rows().length})`} size="large">
    <Show when={rows().length > 0} fallback={<text fg="gray">  No signals</text>}>
      <For each={rows().slice(offset(), offset() + height())}>{(signal, index) => {
        const focused = () => offset() + index() === cursor()
        const unread = signal.unread ? "●" : "○"
        return <text fg={focused() ? "cyan" : signal.unread ? "white" : "gray"}>
          {focused() ? ">" : " "} {unread} {signal.source}: {signalText(signal)}  {formatSignalAge(signal.occurred_at)}
        </text>
      }}</For>
    </Show>
  </CenteredDialog>
}
