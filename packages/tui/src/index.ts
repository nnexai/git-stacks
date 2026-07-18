#!/usr/bin/env bun

function launchMode() {
  if (process.env.GIT_STACKS_TUI_FATAL_MOUNT_PROBE === "1") return "fatal-mount-probe"
  if (process.env.GIT_STACKS_TUI_LIFECYCLE_PROBE === "1") return "lifecycle-probe"
  if (process.env.GIT_STACKS_TUI_RUNTIME_PROBE === "1") return "runtime-probe"
  return "dashboard"
}

try {
  // A globally installed bin runs with the caller's working directory, so the
  // package-local bunfig.toml is not discovered. Load OpenTUI's runtime plugin
  // before Solid or any dashboard module can resolve.
  // @ts-expect-error OpenTUI exposes the preload entrypoint without declarations.
  await import("@opentui/solid/preload")

  const mode = launchMode()
  const { runDashboard } = await import("./run.js")
  await runDashboard(mode)
  if (mode === "runtime-probe") {
    await new Promise((resolve) => {
      process.stdout.write("git-stacks-tui renderer probe: reactive\n", () => resolve(undefined))
    })
  }
  // This file is the executable boundary. Renderer and owned client cleanup
  // are complete (or bounded) at this point; do not let unrelated async work
  // from a completed command keep the user's foreground shell occupied.
  process.exit(0)
} catch (error) {
  // runDashboard does not reject until renderer, core-state, and service-client
  // cleanup has completed. Print one bounded diagnostic, then terminate any
  // unrelated runtime handles without skipping owned asynchronous cleanup.
  const message = error instanceof Error ? error.message : String(error)
  await new Promise((resolve) => {
    process.stderr.write(`git-stacks-tui: ${message}\n`, () => resolve(undefined))
  })
  process.exit(1)
}

export {}
