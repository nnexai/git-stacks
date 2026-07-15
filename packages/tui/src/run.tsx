/** @jsxImportSource @opentui/solid */

import { render } from "@opentui/solid"
import App from "./App"
import { stopCoreState } from "./core-store"

export async function runDashboard() {
  try {
    await render(() => <App />, {
      targetFps: 30,
      exitOnCtrlC: false,
      screenMode: "alternate-screen",
    })
  } finally {
    stopCoreState()
  }
}
