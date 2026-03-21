/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"
import type { InputRenderable } from "@opentui/core"

type Props = {
  label: string
  prefill: string
  onConfirm: (value: string) => void
  onCancel: () => void
  ref?: (el: InputRenderable) => void
}

export function InlineInput(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
  })

  return (
    <box flexDirection="row">
      <text fg="cyan">  {props.label}: </text>
      <input
        ref={props.ref}
        value={props.prefill}
        focused={true}
        onSubmit={(v) => props.onConfirm(v as string)}
      />
    </box>
  )
}
