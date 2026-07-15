/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { BatchBar } from "../../../../packages/tui/src/BatchBar"

const renderOpts = { kittyKeyboard: true, width: 80, height: 24 }

describe("BatchBar snapshots", () => {
  test("renders with count and default action text", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <BatchBar count={3} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders with count and custom action text", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <BatchBar count={1} actions="[d] Delete" />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })
})
