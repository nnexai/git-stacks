/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  message: string
  title?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog(props: Props) {
  useKeyboard((key) => {
    if (key.name === "y") props.onConfirm()
    if (key.name === "n" || key.name === "escape") props.onCancel()
  })

  return (
    <CenteredDialog title={props.title ?? "Confirm"} size="small">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <text fg="yellow">  {props.message}</text>
        <text fg="gray">{"\n"}  [y] Yes  [n/Esc] No</text>
      </box>
    </CenteredDialog>
  )
}
