/** @jsxImportSource @opentui/solid */
import type { JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"

type Size = "small" | "medium" | "large"

type Props = {
  title: string
  size?: Size
  height?: number
  children: JSX.Element
}

const widths: Record<Size, number> = {
  small: 0.5,
  medium: 0.7,
  large: 0.9,
}

export function CenteredDialog(props: Props) {
  const dims = useTerminalDimensions()
  const size = () => props.size ?? "small"
  const dialogWidth = () => {
    const terminalWidth = dims().width
    const available = Math.max(1, terminalWidth - 4)
    const preferred = Math.floor(terminalWidth * widths[size()])
    const minimum = Math.min(40, available)
    return Math.max(minimum, Math.min(available, preferred))
  }
  const dialogHeight = () => {
    const requested = props.height
    if (requested === undefined) return undefined
    const available = Math.max(3, dims().height - 2)
    return Math.max(3, Math.min(available, requested))
  }

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
        width={dialogWidth()}
        height={dialogHeight()}
        backgroundColor="#000000"
      >
        {props.children}
      </box>
    </box>
  )
}
