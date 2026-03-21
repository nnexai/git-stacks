/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { FilterIndicator } from "../../../src/tui/dashboard/FilterIndicator"

describe("FilterIndicator", () => {
  test("shows input when filtering is active", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      () => <FilterIndicator filtering={true} filterFocused={true} filter="" onInput={() => {}} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("filter:")
  })

  test("shows filter indicator with value after enter", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      () => <FilterIndicator filtering={false} filterFocused={false} filter="foo" onInput={() => {}} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain('filter: "foo"')
    expect(frame).toContain("/ edit")
    expect(frame).toContain("esc clear")
  })

  test("shows nothing when no filter and not filtering", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      () => <FilterIndicator filtering={false} filterFocused={false} filter="" onInput={() => {}} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("filter")
  })

  test("typing in filter input calls onInput with value", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <FilterIndicator filtering={true} filterFocused={true} filter="" onInput={(v) => { received = v }} />
    )
    await renderOnce()
    await mockInput.typeText("bar")
    await renderOnce()
    expect(received).toBeTruthy()
  })
})
