/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { TemplateActionMenu } from "../../../packages/tui/src/TemplateActionMenu"

const renderOpts = { kittyKeyboard: true }

describe("TemplateActionMenu", () => {
  test("renders all four action labels", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("[w] Create workspace")
    expect(frame).toContain("[e] Edit")
    expect(frame).toContain("[c] Clone")
    expect(frame).toContain("[r] Remove")
    expect(frame).toContain("[Esc] Back")
  })

  test("shows cursor on first item by default", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("> [w]")
  })

  test("down arrow moves cursor to second item", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("> [e]")
  })

  test("clamps cursor at top (up at index 0 stays at 0)", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressArrow("up")
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("> [w]")
  })

  test("clamps cursor at bottom (down 4 times stays on last item)", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    for (let i = 0; i < 4; i++) {
      mockInput.pressArrow("down")
      await renderOnce()
    }
    const frame = captureCharFrame()
    expect(frame).toContain("> [r]")
  })

  test("enter dispatches action at cursor (third item after two downs)", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={(a) => { received = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(received).toBe("clone")
  })

  test("letter shortcut w dispatches create-workspace", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={(a) => { received = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("w")
    await renderOnce()
    expect(received).toBe("create-workspace")
  })

  test("letter shortcut e dispatches edit", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={(a) => { received = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("e")
    await renderOnce()
    expect(received).toBe("edit")
  })

  test("letter shortcut c dispatches clone", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={(a) => { received = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("c")
    await renderOnce()
    expect(received).toBe("clone")
  })

  test("letter shortcut r dispatches remove", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={(a) => { received = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("r")
    await renderOnce()
    expect(received).toBe("remove")
  })

  test("escape calls onCancel", async () => {
    let cancelled = false
    const { mockInput, renderOnce } = await testRender(
      () => (
        <TemplateActionMenu
          templateName="my-template"
          onAction={() => {}}
          onCancel={() => { cancelled = true }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressEscape()
    await renderOnce()
    expect(cancelled).toBe(true)
  })
})
