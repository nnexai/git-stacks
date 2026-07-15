#!/usr/bin/env bun

// A globally installed bin runs with the caller's working directory, so the
// package-local bunfig.toml is not discovered. Load OpenTUI's runtime plugin
// before Solid or any dashboard module can resolve.
// @ts-expect-error OpenTUI exposes the preload entrypoint without declarations.
await import("@opentui/solid/preload")

if (process.env.GIT_STACKS_TUI_RUNTIME_PROBE === "1") {
  const { createMemo, createSignal } = await import("solid-js")
  const [value, setValue] = createSignal(1)
  const doubled = createMemo(() => value() * 2)
  setValue(2)
  if (doubled() !== 4) throw new Error("OpenTUI loaded Solid's non-reactive server runtime")
  console.log("git-stacks-tui runtime: client")
} else {
  const { runDashboard } = await import("./run.js")
  await runDashboard()
}

export {}
