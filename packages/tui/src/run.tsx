/** @jsxImportSource @opentui/solid */

import { render } from "@opentui/solid"
import { closeServiceClient } from "@git-stacks/service/client"
import App from "./App"
import { stopCoreState } from "./core-store"

export async function runDashboard() {
  let destroyed!: () => void
  const rendererDestroyed = new Promise<void>((resolve) => { destroyed = resolve })
  try {
    await render(() => <App />, {
      targetFps: 30,
      // Keep a renderer-level emergency exit even if App fails before its
      // keyboard handler mounts. OpenTUI restores the terminal on destroy.
      exitOnCtrlC: true,
      screenMode: "alternate-screen",
      onDestroy: destroyed,
    })
    // OpenTUI's render promise resolves after mounting. Keep the launcher alive
    // until q, Ctrl+C, or an error actually destroys the renderer.
    await rendererDestroyed
  } finally {
    stopCoreState()
    await closeServiceClient("TUI closed")
  }
}
