/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"
import type { Tab } from "./types"

type Props = {
  tab: Tab
  onClose: () => void
}

export function HelpOverlay(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "?") props.onClose()
  })

  return (
    <box border title="Keybindings" flexDirection="column" width="70%">
      <text fg="white">{"\n"}  Global:</text>
      <text fg="gray">    1 / 2 / 3   Switch tabs (Workspaces / Templates / Repos)</text>
      <text fg="gray">    [ / ]       Previous / next tab</text>
      <text fg="gray">    R           Refresh current tab</text>
      <text fg="gray">    ?           Toggle this help</text>
      <text fg="gray">    q           Quit (from list view only)</text>
      <text fg="white">{"\n"}  Navigation:</text>
      <text fg="gray">    ↑ ↓ / j k   Move cursor</text>
      <text fg="gray">    /           Start filter</text>
      <text fg="gray">    Esc         Back / clear filter / close overlay</text>
      <text fg="white">{"\n"}  Workspaces tab:</text>
      <text fg="gray">    Enter       Open action menu</text>
      <text fg="gray">    Space       Select for batch operation</text>
      <text fg="gray">    o=Open  e=Edit  n=Rename  u=Run  m=Merge  c=Clean  r=Remove</text>
      <text fg="white">{"\n"}  Templates tab:</text>
      <text fg="gray">    Enter       Open action menu</text>
      <text fg="gray">    e=Edit($EDITOR)  c=Clone  r=Remove</text>
      <text fg="white">{"\n"}  Repos tab:</text>
      <text fg="gray">    (read-only — no actions)</text>
      <text fg="gray">{"\n"}  Press Esc or ? to close</text>
    </box>
  )
}
