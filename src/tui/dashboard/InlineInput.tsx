/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"

type Props = {
  label: string
  prefill: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function InlineInput(props: Props) {
  const [value, setValue] = createSignal(props.prefill)

  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "return") { props.onConfirm(value()); return }
    if (key.name === "backspace") { setValue(v => v.slice(0, -1)); return }
    if (key.name.length === 1 && !key.ctrl && !key.meta) { setValue(v => v + key.name); return }
  })

  return (
    <text fg="cyan">  {props.label}: {value()}_</text>
  )
}
