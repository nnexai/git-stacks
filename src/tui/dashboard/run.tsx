import { render } from "@opentui/solid"
import App from "./App"

export async function runDashboard() {
  await render(() => <App />, {
    targetFps: 30,
    exitOnCtrlC: false,
    useAlternateScreen: true,
  })
}
