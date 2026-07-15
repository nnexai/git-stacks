/** @jsxImportSource @opentui/solid */

import { createSignal, onCleanup } from "solid-js"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

export function Spinner() {
  const [frame, setFrame] = createSignal(0)
  const timer = setInterval(() => setFrame((current) => (current + 1) % FRAMES.length), 80)
  onCleanup(() => clearInterval(timer))

  return <text fg="cyan">{FRAMES[frame()]}</text>
}
