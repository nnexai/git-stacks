/** @jsxImportSource @opentui/solid */

import { useKeyboard } from "@opentui/solid"
import type { InputRenderable } from "@opentui/core"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  label: string
  title?: string
  prefill: string
  onConfirm: (value: string) => void
  onCancel: () => void
  ref?: (el: InputRenderable) => void
  focused?: boolean
}

export function InlineInput(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
  })

  return (
    <CenteredDialog title={props.title ?? props.label} size="small">
      <box flexDirection="row" paddingLeft={1}>
        <text fg="cyan">  {props.label}: </text>
        <input
          ref={props.ref}
          value={props.prefill}
          focused={props.focused ?? true}
          onSubmit={(v) => props.onConfirm(v as string)}
        />
      </box>
    </CenteredDialog>
  )
}
