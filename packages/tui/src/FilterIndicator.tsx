/** @jsxImportSource @opentui/solid */


type Props = {
  filtering: boolean
  filterFocused: boolean
  filter: string
  onInput: (value: string) => void
}

export function FilterIndicator(props: Props) {
  return (
    <box flexDirection="row" flexGrow={1}>
      <text fg="cyan">  filter: </text>
      <input
        focused={props.filterFocused}
        value={props.filter}
        flexGrow={1}
        onInput={(v) => props.onInput(typeof v === "string" ? v : "")}
      />
    </box>
  )
}
