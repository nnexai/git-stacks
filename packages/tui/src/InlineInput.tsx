/** @jsxImportSource @opentui/solid */

import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { InputRenderable } from "@opentui/core"
import { CenteredDialog } from "./CenteredDialog"

type Props = {
  label: string
  title?: string
  prefill: string
  onConfirm: (value: string) => void | Promise<void>
  onCancel: () => void
  ref?: (el: InputRenderable) => void
  focused?: boolean
}

export function InlineInput(props: Props) {
  const [settled, setSettled] = createSignal(false)
  useKeyboard((key) => {
    if (key.name === "escape" && !settled()) { setSettled(true); props.onCancel() }
  })

  return (
    <CenteredDialog title={props.title ?? props.label} size="small">
      <box flexDirection="row" paddingLeft={1}>
        <text fg="cyan">  {props.label}: </text>
        <input
          ref={props.ref}
          value={props.prefill}
          focused={props.focused ?? true}
          onSubmit={(v) => {
            if (settled()) return
            setSettled(true)
            void props.onConfirm(v as string)
          }}
        />
      </box>
    </CenteredDialog>
  )
}
