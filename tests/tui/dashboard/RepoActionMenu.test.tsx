/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { RepoActionMenu } from "../../../src/tui/dashboard/RepoActionMenu"

const renderOpts = { kittyKeyboard: true }

describe("RepoActionMenu", () => {
  test("renders all three action labels in single-select mode (selectionCount=0)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("[w] Create workspace")
    expect(frame).toContain("[t] Create template")
    expect(frame).toContain("[r] Remove")
    expect(frame).toContain("[Esc] Back")
  })

  test("renders selection-aware labels when selectionCount=3", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={3}
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("[w] Create workspace (3 repos)")
    expect(frame).toContain("[t] Create template (3 repos)")
    expect(frame).toContain("[r] Remove (3)")
  })

  test("pressing w calls onAction with create-workspace", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
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

  test("pressing t calls onAction with create-template", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
          onAction={(a) => { received = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressKey("t")
    await renderOnce()
    expect(received).toBe("create-template")
  })

  test("pressing r calls onAction with remove", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
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

  test("pressing Escape calls onCancel", async () => {
    let cancelled = false
    const { mockInput, renderOnce } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
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

  test("shows cursor on first item by default", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
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
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
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
    expect(frame).toContain("> [t]")
  })

  test("clamps cursor at bottom (down 3 times stays on last item)", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
          onAction={() => {}}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    for (let i = 0; i < 3; i++) {
      mockInput.pressArrow("down")
      await renderOnce()
    }
    const frame = captureCharFrame()
    expect(frame).toContain("> [r]")
  })

  test("enter dispatches cursor action (second item)", async () => {
    let received = ""
    const { mockInput, renderOnce } = await testRender(
      () => (
        <RepoActionMenu
          repoName="my-repo"
          selectionCount={0}
          onAction={(a) => { received = a }}
          onCancel={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressArrow("down")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(received).toBe("create-template")
  })
})
