/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { InlineInput } from "../../../src/tui/dashboard/InlineInput"

describe("InlineInput", () => {
  test("typing appends characters and confirms correctly", async () => {
    let confirmed = ""
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <InlineInput label="Name" prefill="" onConfirm={(v) => { confirmed = v }} onCancel={() => {}} />
    )
    await renderOnce()
    await mockInput.typeText("hello")
    await renderOnce()
    // Built-in input cursor may obscure some characters in the char frame,
    // so verify via onConfirm instead of captureCharFrame for full value
    mockInput.pressEnter()
    await renderOnce()
    expect(confirmed).toBe("hello")
  })

  test("backspace removes last character", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <InlineInput label="Name" prefill="ab" onConfirm={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressBackspace()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("a")
    expect(frame).not.toContain("ab")
  })

  test("escape calls onCancel", async () => {
    let cancelled = false
    const { mockInput, renderOnce } = await testRender(
      () => <InlineInput label="Name" prefill="" onConfirm={() => {}} onCancel={() => { cancelled = true }} />
    )
    await renderOnce()
    mockInput.pressEscape()
    // pressEscape sends \x1B — parser waits to distinguish from escape sequence prefix
    await new Promise((r) => setTimeout(r, 150))
    await renderOnce()
    expect(cancelled).toBe(true)
  })

  test("enter calls onConfirm with current value", async () => {
    let confirmed = ""
    const { mockInput, renderOnce } = await testRender(
      () => <InlineInput label="Name" prefill="hello" onConfirm={(v) => { confirmed = v }} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(confirmed).toBe("hello")
  })

  test("enter confirms typed text appended to prefill", async () => {
    let confirmed = ""
    const { mockInput, renderOnce } = await testRender(
      () => <InlineInput label="Name" prefill="hello" onConfirm={(v) => { confirmed = v }} onCancel={() => {}} />
    )
    await renderOnce()
    await mockInput.typeText("world")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(confirmed).toBe("helloworld")
  })

  test("label appears in rendered frame", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <InlineInput label="Branch" prefill="" onConfirm={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Branch")
  })

  test("left-arrow then type inserts character at cursor position", async () => {
    let confirmed = ""
    const { mockInput, renderOnce } = await testRender(
      () => <InlineInput label="Name" prefill="ac" onConfirm={(v) => { confirmed = v }} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressArrow("left")   // cursor moves before "c"
    await renderOnce()
    await mockInput.typeText("b")  // inserts "b" at cursor → "abc"
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(confirmed).toBe("abc")
  })
})
