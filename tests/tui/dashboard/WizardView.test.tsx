/** @jsxImportSource @opentui/solid */
import { describe, test, expect, mock } from "bun:test"
import { testRender } from "@opentui/solid"
import { WizardView, type WizardStep } from "../../../packages/tui/src/WizardView"

// Use kitty keyboard protocol so escape sends \x1B[27u (unambiguous CSI)
// instead of bare \x1B which the parser holds to disambiguate from escape
// sequence prefixes. This eliminates the flaky setTimeout delay entirely.
const renderOpts = { kittyKeyboard: true }

type TestData = { name: string; branch: string }

const steps: WizardStep<TestData>[] = [
  { kind: "text", label: "Workspace name", key: "name" },
  { kind: "text", label: "Branch", key: "branch", prefill: () => "feature/test" },
  { kind: "confirm", buildMessage: (d) => `Create workspace '${d.name}' on branch '${d.branch}'?` },
]

describe("WizardView", () => {
  test("renders first text step label", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <WizardView
          steps={steps}
          onComplete={mock()}
          onCancel={mock()}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Workspace name")
  })

  test("advancing steps on input confirm shows second step", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <WizardView
          steps={steps}
          onComplete={mock()}
          onCancel={mock()}
        />
      ),
      renderOpts
    )
    await renderOnce()
    await mockInput.typeText("my-ws")
    mockInput.pressEnter()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Branch")
  })

  test("escape at non-first step goes back to first step", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <WizardView
          steps={steps}
          onComplete={mock()}
          onCancel={mock()}
        />
      ),
      renderOpts
    )
    await renderOnce()
    // Advance to step 2
    await mockInput.typeText("my-ws")
    mockInput.pressEnter()
    await renderOnce()
    // Go back
    mockInput.pressEscape()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Workspace name")
  })

  test("escape at first step calls onCancel", async () => {
    const onCancel = mock()
    const { mockInput, renderOnce } = await testRender(
      () => (
        <WizardView
          steps={steps}
          onComplete={mock()}
          onCancel={onCancel}
        />
      ),
      renderOpts
    )
    await renderOnce()
    mockInput.pressEscape()
    // kitty keyboard sends \x1B[27u — parser recognizes it immediately, no delay needed
    await renderOnce()
    expect(onCancel).toHaveBeenCalled()
  })

  test("confirm step renders summary message and hints", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => (
        <WizardView
          steps={steps}
          onComplete={mock()}
          onCancel={mock()}
        />
      ),
      renderOpts
    )
    await renderOnce()
    // Step 1: type name and confirm
    await mockInput.typeText("my-ws")
    mockInput.pressEnter()
    await renderOnce()
    // Wait for deferred focus setTimeout to fire before interacting with step 2
    await new Promise(r => setTimeout(r, 0))
    await renderOnce()
    // Step 2: confirm branch prefill
    mockInput.pressEnter()
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Create workspace")
    expect(frame).toContain("[y]")
  })

  test("y at confirm step calls onComplete with accumulated data", async () => {
    const onComplete = mock()
    const { mockInput, renderOnce } = await testRender(
      () => (
        <WizardView
          steps={steps}
          onComplete={onComplete}
          onCancel={mock()}
        />
      ),
      renderOpts
    )
    await renderOnce()
    // Step 1: workspace name
    await mockInput.typeText("my-ws")
    mockInput.pressEnter()
    await renderOnce()
    // Wait for deferred focus setTimeout to fire before interacting with step 2
    await new Promise(r => setTimeout(r, 0))
    await renderOnce()
    // Step 2: branch (use prefill "feature/test")
    mockInput.pressEnter()
    await renderOnce()
    // Step 3: confirm
    mockInput.pressKey("y")
    await renderOnce()
    expect(onComplete).toHaveBeenCalledWith({ name: "my-ws", branch: "feature/test" })
  })
})
