/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { ActionMenu } from "../../../src/tui/dashboard/ActionMenu"

// Use kitty keyboard protocol so escape sends \x1B[27u (unambiguous CSI)
// instead of bare \x1B which the parser holds to disambiguate from escape
// sequence prefixes. This eliminates the flaky setTimeout delay entirely.
const renderOpts = { kittyKeyboard: true }

describe("ActionMenu", () => {
  test("renders all action labels", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Open")
    expect(frame).toContain("Close")
    expect(frame).toContain("Rename")
    expect(frame).toContain("Edit")
    expect(frame).toContain("Clean")
    expect(frame).toContain("Remove")
    expect(frame).toContain("Merge")
    expect(frame).toContain("Sync")
    expect(frame).toContain("Push")
    expect(frame).toContain("Issue...")
    expect(frame).toContain("Commands...")
  })

  test("shows cursor indicator on first item initially", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("> [o] Open")
  })

  test("down arrow moves cursor to second item", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("> [x] Close")
  })

  test("up arrow after multiple downs moves cursor back", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    for (let i = 0; i < 5; i++) {
      mockInput.pressArrow("down")
      await renderOnce()
    }
    mockInput.pressArrow("up")
    await renderOnce()
    const frame = captureCharFrame()
    // cursor should be at index 4 (Clean) after 5 downs (→ Remove at idx 5) then 1 up
    expect(frame).toContain("> [c] Clean")
  })

  test("enter dispatches action at cursor position (first item)", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(received).toBe("open")
  })

  test("enter dispatches action at moved cursor position", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    // 3 downs from open(0): close(1) -> rename(2) -> edit(3)
    mockInput.pressArrow("down")
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
      () => <ActionMenu workspaceName="ws" onAction={() => {}} onCancel={() => { cancelled = true }} />,
      renderOpts
    )
    await renderOnce()
    mockInput.pressEscape()
    // kitty keyboard sends \x1B[27u — parser recognizes it immediately, no delay needed
    await renderOnce()
    expect(cancelled).toBe(true)
  })

  test("letter shortcut r dispatches remove", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("r")
    await renderOnce()
    expect(received).toBe("remove")
  })

  test("letter shortcut o dispatches open", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { received = a }} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("o")
    await renderOnce()
    expect(received).toBe("open")
  })

  test("s key dispatches sync action", async () => {
    let dispatched = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { dispatched = a }} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("s")
    await renderOnce()
    expect(dispatched).toBe("sync")
  })

  test("p key dispatches push action", async () => {
    let dispatched = ""
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(a) => { dispatched = a }} onCancel={() => {}} />,
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("p")
    await renderOnce()
    expect(dispatched).toBe("push")
  })

  test("renders enabled issue row and dispatches i shortcut", async () => {
    let dispatched = ""
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <ActionMenu
          workspaceName="ws"
          issueDisabledReason={undefined}
          onAction={(a) => { dispatched = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("[i] Issue...")
    mockInput.pressKey("i")
    await renderOnce()
    expect(dispatched).toBe("issue")
  })

  test("disabled issue row is visible and cannot be activated", async () => {
    let dispatched = ""
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <ActionMenu
          workspaceName="ws"
          issueDisabledReason="none linked"
          onAction={(a) => { dispatched = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("[i] Issue... (none linked)")
    mockInput.pressKey("i")
    await renderOnce()
    expect(dispatched).toBe("")
  })

  test("renders enabled commands row and dispatches d shortcut", async () => {
    let dispatched = ""
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <ActionMenu
          workspaceName="ws"
          commandsDisabledReason={undefined}
          onAction={(a) => { dispatched = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("[d] Commands...")
    mockInput.pressKey("d")
    await renderOnce()
    expect(dispatched).toBe("commands")
  })

  test("disabled commands row is visible and cannot be activated", async () => {
    let dispatched = ""
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <ActionMenu
          workspaceName="ws"
          commandsDisabledReason="none configured"
          onAction={(a) => { dispatched = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("[d] Commands... (none configured)")
    mockInput.pressKey("d")
    await renderOnce()
    expect(dispatched).toBe("")
  })
})
