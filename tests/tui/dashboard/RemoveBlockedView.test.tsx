/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { RemoveBlockedView } from "../../../packages/tui/src/RemoveBlockedView"

const renderOpts = { kittyKeyboard: true }

describe("RemoveBlockedView", () => {
  test("renders repo name in header with referenced-by message", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RemoveBlockedView
          repoName="my-repo"
          refTemplates={[{ name: "template-a" }]}
          refWorkspaces={[]}
          onBack={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain('Cannot remove "my-repo"')
    expect(frame).toContain("referenced by")
  })

  test("renders template references with template: prefix", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RemoveBlockedView
          repoName="api"
          refTemplates={[{ name: "template-a" }, { name: "template-b" }]}
          refWorkspaces={[]}
          onBack={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("template: template-a")
    expect(frame).toContain("template: template-b")
  })

  test("renders workspace references with workspace: prefix", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RemoveBlockedView
          repoName="api"
          refTemplates={[]}
          refWorkspaces={[{ name: "feature-x" }]}
          onBack={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("workspace: feature-x")
  })

  test("renders footer instruction text", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RemoveBlockedView
          repoName="api"
          refTemplates={[{ name: "tpl" }]}
          refWorkspaces={[]}
          onBack={() => {}}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Remove these references first")
  })

  test("pressing Escape calls onBack", async () => {
    let backCalled = false
    const { mockInput, renderOnce } = await testRender(
      () => (
        <RemoveBlockedView
          repoName="api"
          refTemplates={[{ name: "tpl" }]}
          refWorkspaces={[]}
          onBack={() => { backCalled = true }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressEscape()
    await renderOnce()
    expect(backCalled).toBe(true)
  })
})
