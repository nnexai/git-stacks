/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { ProgressView } from "../../../../src/tui/dashboard/ProgressView"

const renderOpts = { kittyKeyboard: true, width: 80, height: 24 }

describe("ProgressView snapshots", () => {
  test("renders done state with lines and completion message", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <ProgressView
          title="Creating workspace"
          output={{
            status: "success",
            omittedCount: 0,
            lines: [
              { text: "Cloned repo-a", stream: "system" },
              { text: "Cloned repo-b", stream: "system" },
            ],
          }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("in-progress state contains working text and lines", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <ProgressView
          title="Creating workspace"
          output={{
            status: "running",
            omittedCount: 0,
            lines: [
              { text: "Cloning repo-a", stream: "system" },
              { text: "Cloning repo-b", stream: "system" },
            ],
          }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    // Use toContain instead of toMatchSnapshot for in-progress state
    // because the spinner frame is non-deterministic between runs.
    expect(frame).toContain("Working")
    expect(frame).toContain("Cloning repo-a")
    expect(frame).toContain("Cloning repo-b")
  })

  test("renders empty running state", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <ProgressView
          title="Running command verify"
          output={{ status: "running", omittedCount: 0, lines: [] }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("No command output yet")
  })

  test("renders omitted marker and stderr failure state", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <ProgressView
          title="Running command verify"
          output={{
            status: "failed",
            omittedCount: 12,
            lines: [{ text: "stderr detail", stream: "stderr" }],
          }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Command failed")
    expect(frame).toContain("... 12 earlier lines omitted ...")
    expect(frame).toContain("stderr detail")
  })
})
