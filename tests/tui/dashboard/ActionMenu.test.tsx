/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import type { WebWorkspaceAction, WebWorkspaceActionId } from "@git-stacks/protocol"
import { ActionMenu } from "../../../packages/tui/src/ActionMenu"

const renderOpts = { kittyKeyboard: true }
const workspaceId = "00000000-0000-4000-8000-000000000001"

function descriptor(action_id: WebWorkspaceActionId, available = true): WebWorkspaceAction {
  return {
    action_id,
    subject: action_id === "operation.cancel"
      ? { kind: "operation", workspace_id: workspaceId, operation_id: "op_1234567890123456" }
      : { kind: "workspace", workspace_id: workspaceId },
    availability: available
      ? { available: true }
      : { available: false, reason: "capability_unavailable", message: "Unavailable for this workspace." },
    confirmation: action_id === "workspace.force-remove"
      ? "exact-name"
      : action_id === "workspace.remove" || action_id === "workspace.merge" || action_id === "workspace.notes.clear"
        ? "confirm"
        : "none",
  }
}

const canonical = [
  descriptor("workspace.open"),
  descriptor("workspace.close"),
  descriptor("workspace.rename"),
  descriptor("workspace.archive"),
  descriptor("workspace.remove"),
  descriptor("workspace.merge"),
  descriptor("workspace.sync"),
  descriptor("workspace.push"),
]

function menuProps(overrides: Record<string, unknown> = {}) {
  return {
    workspaceName: "ws",
    inventoryState: "ready" as const,
    descriptors: canonical,
    onInvoke: () => {},
    onAction: () => {},
    onCancel: () => {},
    ...overrides,
  }
}

describe("ActionMenu", () => {
  test("renders canonical and adapted action labels", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu {...menuProps()} />,
      renderOpts,
    )
    await renderOnce()
    const frame = captureCharFrame()
    for (const label of ["Open workspace", "Close workspace", "Rename workspace", "Edit", "Clean", "Archive workspace", "Remove workspace", "Merge workspace", "Sync workspace", "Push workspace", "Issue...", "Commands..."]) {
      expect(frame).toContain(label)
    }
  })

  test("shows the first canonical row and moves the cursor", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu {...menuProps()} />,
      renderOpts,
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("> [o] Open workspace")
    mockInput.pressArrow("down")
    await renderOnce()
    expect(captureCharFrame()).toContain("> [x] Close workspace")
    mockInput.pressArrow("up")
    await renderOnce()
    expect(captureCharFrame()).toContain("> [o] Open workspace")
  })

  test("Enter and canonical letter shortcuts use onInvoke", async () => {
    const invoked: string[] = []
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu {...menuProps({ onInvoke: (actionId: string) => { invoked.push(actionId) } })} />,
      renderOpts,
    )
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    mockInput.pressKey("r")
    await renderOnce()
    mockInput.pressKey("s")
    await renderOnce()
    mockInput.pressKey("p")
    await renderOnce()
    expect(invoked).toEqual(["workspace.open", "workspace.remove", "workspace.sync", "workspace.push"])
  })

  test("escape calls onCancel", async () => {
    let cancelled = false
    const { mockInput, renderOnce } = await testRender(
      () => <ActionMenu {...menuProps({ onCancel: () => { cancelled = true } })} />,
      renderOpts,
    )
    await renderOnce()
    mockInput.pressEscape()
    await renderOnce()
    expect(cancelled).toBe(true)
  })

  test("adapted issue and command rows dispatch only when enabled", async () => {
    const dispatched: string[] = []
    const enabled = await testRender(
      () => <ActionMenu {...menuProps({ onAction: (action: string) => { dispatched.push(action) } })} />,
      renderOpts,
    )
    await enabled.renderOnce()
    enabled.mockInput.pressKey("i")
    enabled.mockInput.pressKey("d")
    await enabled.renderOnce()
    expect(dispatched).toEqual(["issue", "commands"])

    const disabled = await testRender(
      () => <ActionMenu {...menuProps({ issueDisabledReason: "none linked", commandsDisabledReason: "none configured", onAction: (action: string) => { dispatched.push(action) } })} />,
      renderOpts,
    )
    await disabled.renderOnce()
    expect(disabled.captureCharFrame()).toContain("Issue... (none linked)")
    expect(disabled.captureCharFrame()).toContain("Commands... (none configured)")
    disabled.mockInput.pressKey("i")
    disabled.mockInput.pressKey("d")
    await disabled.renderOnce()
    expect(dispatched).toEqual(["issue", "commands"])
  })

  test("undefined inventory is explicit and every legacy action key dispatches zero requests", async () => {
    const requests: string[] = []
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" onAction={(action) => { requests.push(action) }} onInvoke={(action) => { requests.push(action) }} onCancel={() => {}} />,
      renderOpts,
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Workspace actions could not be loaded")
    expect(captureCharFrame()).not.toContain("[o] Open")
    for (const key of ["o", "x", "n", "e", "c", "a", "r", "m", "s", "p", "i", "d", "u", "return"]) {
      key === "return" ? mockInput.pressEnter() : mockInput.pressKey(key)
    }
    await renderOnce()
    expect(requests).toEqual([])
  })

  test("malformed ready inventory is explicit and non-actionable", async () => {
    const requests: string[] = []
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <ActionMenu workspaceName="ws" inventoryState="ready" descriptors={undefined} onInvoke={(action) => { requests.push(action) }} onCancel={() => {}} />,
      renderOpts,
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Workspace actions could not be loaded")
    mockInput.pressKey("o")
    mockInput.pressEnter()
    await renderOnce()
    expect(requests).toEqual([])
  })
})
