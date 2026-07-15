/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { HelpOverlay } from "../../../../packages/tui/src/HelpOverlay"

const renderOpts = { kittyKeyboard: true, width: 80, height: 24 }
const noop = () => {}

describe("HelpOverlay snapshots", () => {
  test("renders full keybinding reference for workspaces tab", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <HelpOverlay tab="workspaces" onClose={noop} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })
})
