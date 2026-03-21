/** @jsxImportSource @opentui/solid */
import type { JSX } from "solid-js"

type Size = "small" | "medium" | "large"

type Props = {
  title: string
  size?: Size
  children: JSX.Element
}

const widths: Record<Size, `${number}%`> = {
  small: "50%",
  medium: "70%",
  large: "90%",
}

export function CenteredDialog(props: Props) {
  const size = () => props.size ?? "small"

  return (
    <box
      position="absolute"
      height="100%"
      width="100%"
      justifyContent="center"
      alignItems="center"
    >
      <box
        border
        title={` ${props.title} `}
        flexDirection="column"
        width={widths[size()]}
        minWidth={40}
        backgroundColor="#000000"
      >
        {props.children}
      </box>
    </box>
  )
}
