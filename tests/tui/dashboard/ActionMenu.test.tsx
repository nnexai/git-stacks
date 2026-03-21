/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { ActionMenu } from "../../../src/tui/dashboard/ActionMenu"

describe("ActionMenu", () => {
  test("renders all action labels", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Open")
    expect(frame).toContain("Rename")
    expect(frame).toContain("Edit")
    expect(frame).toContain("Clean")
    expect(frame).toContain("Remove")
    expect(frame).toContain("Merge")
  })

  test("shows cursor indicator on first item initially", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("> [o] Open")
  })

  test("down arrow moves cursor to second item", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("> [n] Rename")
  })

  test("up arrow after multiple downs moves cursor back", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    for (let i = 0; i < 5; i++) {
      mockInput.pressArrow("down")
      await renderOnce()
    }
    mockInput.pressArrow("up")
    await renderOnce()
    const frame = captureCharFrame()
    // cursor should be at index 4 (Remove) after 5 downs then 1 up
    expect(frame).toContain("> [r] Remove")
  })

  test("enter dispatches action at cursor position (first item)", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(received).toBe("open")
  })

  test("enter dispatches action at moved cursor position", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(received).toBe("edit")
  })

  test("escape calls onCancel", async () => {
    let cancelled = false
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => { cancelled = true }} />
    )
    await renderOnce()
    mockInput.pressEscape()
    // pressEscape sends \x1B which needs a brief parser timeout before firing
    await new Promise((r) => setTimeout(r, 50))
    await renderOnce()
    expect(cancelled).toBe(true)
  })

  test("letter shortcut r dispatches remove", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressKey("r")
    await renderOnce()
    expect(received).toBe("remove")
  })

  test("letter shortcut o dispatches open", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressKey("o")
    await renderOnce()
    expect(received).toBe("open")
  })
})
