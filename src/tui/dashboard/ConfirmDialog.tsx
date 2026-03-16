/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"

type Props = {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog(props: Props) {
  useKeyboard((key) => {
    if (key.name === "y") props.onConfirm()
    if (key.name === "n" || key.name === "escape") props.onCancel()
  })

  return (
    <box border flexDirection="column" width="60%">
      <text fg="yellow">  {props.message}</text>
      <text fg="gray">{"\n"}  [y] Yes  [n/Esc] No</text>
    </box>
  )
}
