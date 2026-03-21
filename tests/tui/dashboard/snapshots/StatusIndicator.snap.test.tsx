/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { StatusIndicator } from "../../../../src/tui/dashboard/StatusIndicator"

const renderOpts = { kittyKeyboard: true, width: 80, height: 24 }

describe("StatusIndicator snapshots", () => {
  test("renders pending state (gray dot)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <StatusIndicator status={{ state: "pending" }} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders loaded state with no issues (green checkmark)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <StatusIndicator
          status={{ state: "loaded", repos: [], hasMissing: false, hasDirty: false }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders loaded state with missing repos (red X)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <StatusIndicator
          status={{ state: "loaded", repos: [], hasMissing: true, hasDirty: false }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders error state (red exclamation)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <StatusIndicator status={{ state: "error", message: "Failed to load" }} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })
})
