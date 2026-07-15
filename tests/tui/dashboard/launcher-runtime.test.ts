import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

describe("published TUI launcher", () => {
  test("loads the reactive Solid runtime without relying on the caller's bunfig", async () => {
    const launcher = resolve("packages/tui/dist/index.js")
    const child = Bun.spawn([process.execPath, launcher], {
      cwd: "/tmp",
      env: { ...process.env, GIT_STACKS_TUI_RUNTIME_PROBE: "1" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])

    expect(exitCode, stderr).toBe(0)
    expect(stdout.trim()).toBe("git-stacks-tui runtime: client")
    expect(stderr).toBe("")
  })

  test("retains renderer-level Ctrl+C cleanup for startup failures", async () => {
    const source = await Bun.file(resolve("packages/tui/src/run.tsx")).text()
    expect(source).toContain("exitOnCtrlC: true")
    expect(source).toContain("onDestroy: destroyed")
    expect(source).toContain("await rendererDestroyed")
    expect(source).toContain('await closeServiceClient("TUI closed")')
  })
})
