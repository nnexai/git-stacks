/** @jsxImportSource @opentui/solid */

import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  message: string
  title?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog(props: Props) {
  const [settled, setSettled] = createSignal(false)
  useKeyboard((key) => {
    if (settled()) return
    if (key.name === "y") {
      setSettled(true)
      void props.onConfirm()
      return
    }
    if (key.name === "n" || key.name === "escape") {
      setSettled(true)
      props.onCancel()
    }
  })

  return (
    <CenteredDialog title={props.title ?? "Confirm"} size="small">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="yellow">  {props.message}</text>
        <text fg="gray">{"\n"}  {settled() ? "Submitting…" : "[y] Yes [n/Esc] No"}</text>
      </box>
    </CenteredDialog>
  )
}
