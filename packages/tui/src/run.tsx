/** @jsxImportSource @opentui/solid */

import { CliRenderEvents, createCliRenderer, type CliRenderer } from "@opentui/core"
import { render, useKeyboard, useRenderer } from "@opentui/solid"
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { closeServiceClient, prepareLocalServiceEnvironment } from "@git-stacks/service/client"
import App from "./App"
import { stopCoreState } from "./core-store"

export type DashboardLaunchMode = "dashboard" | "runtime-probe" | "lifecycle-probe" | "fatal-mount-probe"

function assertReactiveOpenTuiRuntime(): void {
  const [value, setValue] = createSignal(1)
  const doubled = createMemo(() => value() * 2)
  setValue(2)
  if (doubled() !== 4) {
    throw new Error(
      "Unsupported TUI runtime: launch dist/index.js with Bun so @opentui/solid/preload is installed before Solid; direct dist/run.js requires an explicit preload.",
    )
  }
}

// Importing the compiled run module directly is unsupported unless the caller
// installed OpenTUI's preload first. Fail before service or renderer side effects.
assertReactiveOpenTuiRuntime()

function RuntimeProbe(props: { autoExit: boolean }) {
  const renderer = useRenderer()
  const [hidden] = createSignal(false)
  const staleView = createMemo(() => "initial stale view")
  useKeyboard((key) => {
    if (key.name === "q") renderer.destroy()
  })
  onMount(() => {
    if (props.autoExit) renderer.once(CliRenderEvents.FRAME, () => renderer.destroy())
  })
  return (
    <box flexDirection="column">
      <Show when={hidden()}>
        <text>unexpected visible branch</text>
      </Show>
      <text>{staleView()}</text>
    </box>
  )
}

function FatalMountProbe() {
  const orphanText = "fatal mount orphan fixture"
  return <box>{orphanText}</box>
}

function dashboardNode(mode: DashboardLaunchMode) {
  if (mode === "runtime-probe") return <RuntimeProbe autoExit />
  if (mode === "lifecycle-probe") return <RuntimeProbe autoExit={false} />
  if (mode === "fatal-mount-probe") return <FatalMountProbe />
  return <App />
}

export async function runDashboard(mode: DashboardLaunchMode = "dashboard") {
  let renderer: CliRenderer | undefined
  let destroyed!: () => void
  const rendererDestroyed = new Promise<void>((resolve) => { destroyed = resolve })
  let failed = false
  let failure: unknown
  try {
    if (mode === "dashboard") await prepareLocalServiceEnvironment()
    renderer = await createCliRenderer({
      targetFps: 30,
      // Keep a renderer-level emergency exit even if App fails before its
      // keyboard handler mounts. OpenTUI restores the terminal on destroy.
      exitOnCtrlC: true,
      screenMode: "alternate-screen",
      onDestroy: destroyed,
    })
    await render(() => dashboardNode(mode), renderer)
    // OpenTUI's render promise resolves after mounting. Keep the launcher alive
    // until q, Ctrl+C, a signal, or an error destroys the renderer.
    await rendererDestroyed
  } catch (error) {
    failed = true
    failure = error
  } finally {
    let cleanupFailed = false
    let cleanupFailure: unknown
    try {
      // The launcher owns the renderer, including the mount-failure path.
      renderer?.destroy()
    } catch (error) {
      if (!cleanupFailed) {
        cleanupFailed = true
        cleanupFailure = error
      }
    }
    try {
      stopCoreState()
    } catch (error) {
      if (!cleanupFailed) {
        cleanupFailed = true
        cleanupFailure = error
      }
    }
    try {
      await closeServiceClient("TUI closed")
    } catch (error) {
      if (!cleanupFailed) {
        cleanupFailed = true
        cleanupFailure = error
      }
    }
    if (failed) throw failure
    if (cleanupFailed) throw cleanupFailure
  }
}
