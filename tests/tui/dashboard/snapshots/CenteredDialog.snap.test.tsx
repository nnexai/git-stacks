/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { CenteredDialog } from "../../../../src/tui/dashboard/CenteredDialog"

const renderOpts = { kittyKeyboard: true, width: 80, height: 24 }

describe("CenteredDialog snapshots", () => {
  test("renders small dialog with title and text children", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <CenteredDialog title="Test Dialog">
          <text fg="white">  Dialog content here</text>
        </CenteredDialog>
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders large dialog with title and multi-line children", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <CenteredDialog title="Large Dialog" size="large">
          <box flexDirection="column">
            <text fg="white">  First line of content</text>
            <text fg="gray">  Second line of content</text>
            <text fg="gray">  Third line of content</text>
          </box>
        </CenteredDialog>
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })
})
