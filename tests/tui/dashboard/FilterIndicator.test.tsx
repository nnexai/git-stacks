/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { FilterIndicator } from "../../../src/tui/dashboard/FilterIndicator"

describe("FilterIndicator", () => {
  test("shows filter label and input when filtering", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      () => <FilterIndicator filtering={true} filterFocused={true} filter="" onInput={() => {}} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("filter:")
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

  test("help bar shows filter indicator text when filter active but not editing", async () => {
    // This tests the help bar pattern used in App.tsx:
    // a single <text> with computed content instead of <Show> swapping
    const { captureCharFrame, renderOnce } = await testRender(
      () => {
        const filter = () => "foo"
        const filtering = () => false
        return (
          <box width={80} height={1} flexDirection="row">
            <text fg="cyan">{`  filter: "${filter()}" `}</text>
            <text fg="gray">{!filtering() && filter() ? "/ edit · esc clear" : ""}</text>
            <box flexGrow={1} />
            <text>X</text>
          </box>
        )
      }
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain('filter: "foo"')
    expect(frame).toContain("/ edit")
    expect(frame).toContain("esc clear")
    // Verify left-aligned: filter text starts near the beginning
    const filterPos = frame.indexOf("filter:")
    expect(filterPos).toBeLessThan(10)
  })

  test("help bar shows default help text when no filter", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      () => {
        const filter = () => ""
        const helpText = "  1/2/3 Tabs  / Filter"
        return (
          <box width={80} height={1} flexDirection="row">
            <text fg="gray">{filter() ? `  filter: "${filter()}" ` : helpText}</text>
            <box flexGrow={1} />
            <text>X</text>
          </box>
        )
      }
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("1/2/3 Tabs")
    expect(frame).not.toContain('filter: "')
  })
})
