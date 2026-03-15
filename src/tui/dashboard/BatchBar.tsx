type Props = {
  count: number
}

export function BatchBar(props: Props) {
  return (
    <box height={1} flexDirection="row">
      <text fg="cyan">
        {`  ${props.count} selected  `}
      </text>
      <text fg="gray">
        [c] Clean All  [r] Remove All  [Esc] Deselect All
      </text>
    </box>
  )
}
