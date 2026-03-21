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
          lines={["Cloned repo-a", "Cloned repo-b"]}
          done={true}
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
          lines={["Cloning repo-a", "Cloning repo-b"]}
          done={false}
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
})
