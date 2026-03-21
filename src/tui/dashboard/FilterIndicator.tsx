/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"

type Props = {
  filtering: boolean
  filterFocused: boolean
  filter: string
  onInput: (value: string) => void
}

export function FilterIndicator(props: Props) {
  return (
    <>
      <Show when={props.filtering}>
        <box flexDirection="row" flexGrow={1}>
          <text fg="cyan">  filter: </text>
          <input
            focused={props.filterFocused}
            value={props.filter}
            flexGrow={1}
            onInput={(v) => props.onInput(typeof v === "string" ? v : "")}
          />
        </box>
      </Show>
      <Show when={!props.filtering && props.filter}>
        <text fg="cyan">  filter: "{props.filter}" </text>
        <text fg="gray">/ edit · esc clear</text>
      </Show>
    </>
  )
}
