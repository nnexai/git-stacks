/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { ConfirmDialog } from "../../../../packages/tui/src/ConfirmDialog"

const renderOpts = { kittyKeyboard: true, width: 80, height: 24 }
const noop = () => {}

describe("ConfirmDialog snapshots", () => {
  test("renders with default title and message", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <ConfirmDialog
          message="Delete workspace?"
          onConfirm={noop}
          onCancel={noop}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders with custom title and message", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <ConfirmDialog
          message="Are you sure?"
          title="Remove Repo"
          onConfirm={noop}
          onCancel={noop}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })
})
