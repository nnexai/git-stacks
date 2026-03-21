/** @jsxImportSource @opentui/solid */
type Props = {
  count: number
  actions?: string
}

export function BatchBar(props: Props) {
  return (
    <box height={1} flexDirection="row">
      <text fg="cyan">
        {`  ${props.count} selected  `}
      </text>
      <text fg="gray">
        {props.actions ?? "[c] Clean All  [r] Remove All"}  [Esc] Deselect All
      </text>
    </box>
  )
}
