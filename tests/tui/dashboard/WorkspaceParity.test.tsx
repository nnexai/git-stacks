/** @jsxImportSource @opentui/solid */

import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { WebOperationSummary, WebWorkspaceAction } from "@git-stacks/protocol"

import { ActionMenu } from "../../../packages/tui/src/ActionMenu"
import { WorkspaceOperationView } from "../../../packages/tui/src/WorkspaceOperationView"

const renderOptions = { width: 92, height: 30, kittyKeyboard: true }
const workspaceId = "00000000-0000-4000-8000-000000000126"

function descriptor(
  actionId: WebWorkspaceAction["action_id"],
  available = true,
  message = "Unavailable for this workspace.",
): WebWorkspaceAction {
  return {
    action_id: actionId,
    subject: actionId === "operation.cancel"
      ? { kind: "operation", workspace_id: workspaceId, operation_id: "op_1234567890123456" }
      : { kind: "workspace", workspace_id: workspaceId },
    availability: available
      ? { available: true }
      : { available: false, reason: "capability_unavailable", message },
    confirmation: actionId === "workspace.force-remove"
      ? "exact-name"
      : actionId === "workspace.remove" || actionId === "workspace.merge" || actionId === "workspace.notes.clear"
        ? "confirm"
        : "none",
  }
}

describe("OpenTUI workspace parity", () => {
  test("renders canonical grouped actions including Pull and Pin while retaining unavailable reasons", async () => {
    const actions = [
      descriptor("workspace.open"),
      descriptor("workspace.close", false, "Workspace is already closed."),
      descriptor("workspace.pin"),
      descriptor("workspace.unpin", false, "Workspace is not pinned."),
      descriptor("workspace.pull"),
      descriptor("workspace.push"),
      descriptor("workspace.notes.list"),
      descriptor("workspace.files.inspect"),
    ]
    const invoked: string[] = []
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => (
        <ActionMenu
          workspaceName="parity-ws"
          descriptors={actions}
          onInvoke={(actionId) => { invoked.push(actionId) }}
          onCancel={() => {}}
        />
      ),
      renderOptions,
    )

    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Workspace")
    expect(frame).toContain("Git")
    expect(frame).toContain("Details")
    expect(frame).toContain("Pull")
    expect(frame).toContain("Pin")
    expect(frame).toContain("Workspace is already closed.")

    mockInput.pressKey("l")
    await renderOnce()
    expect(invoked).toEqual(["workspace.pull"])

    mockInput.pressKey("x")
    await renderOnce()
    expect(invoked).toEqual(["workspace.pull"])
  })

  test("letter and Enter activation share one callback and rapid keys submit once", async () => {
    let calls = 0
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const { renderOnce, mockInput } = await testRender(
      () => (
        <ActionMenu
          workspaceName="parity-ws"
          descriptors={[descriptor("workspace.pull")]}
          onInvoke={async () => { calls += 1; await pending }}
          onCancel={() => {}}
        />
      ),
      renderOptions,
    )

    await renderOnce()
    mockInput.pressEnter()
    mockInput.pressKey("l")
    await renderOnce()
    expect(calls).toBe(1)
    release()
  })

  test("operation view names action, workspace, stages and emits Cancel once only while available", async () => {
    const operation: WebOperationSummary = {
      operation_id: "op_1234567890123456",
      action_id: "workspace.pull",
      workspace_id: workspaceId,
      workspace_name: "parity-ws",
      state: "running",
      accepted_at: "2026-07-16T10:00:00.000Z",
      started_at: "2026-07-16T10:00:01.000Z",
      progress: { stage: "executing", message: "Pulling api", completed: 1, total: 2 },
      cancellation: { state: "available" },
    }
    let cancels = 0
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => (
        <WorkspaceOperationView
          state={{ phase: "observing", operationId: operation.operation_id }}
          operations={[operation]}
          onCancel={async () => { cancels += 1; await pending }}
          onReconnect={() => {}}
          onRetryRefresh={() => {}}
          onBack={() => {}}
        />
      ),
      renderOptions,
    )

    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Pull workspace")
    expect(frame).toContain("parity-ws")
    expect(frame).toContain("executing")
    expect(frame).toContain("api")
    expect(frame).toContain("[c] Cancel")
    mockInput.pressKey("c")
    mockInput.pressKey("c")
    await renderOnce()
    expect(cancels).toBe(1)
    release()
  })

  test("reconnect observes the known operation and terminal outcomes require authoritative refresh", async () => {
    const failed: WebOperationSummary = {
      operation_id: "op_1234567890123456",
      action_id: "workspace.pull",
      workspace_id: workspaceId,
      workspace_name: "parity-ws",
      state: "failed",
      accepted_at: "2026-07-16T10:00:00.000Z",
      finished_at: "2026-07-16T10:00:02.000Z",
      cancellation: { state: "unavailable", reason: "finished" },
      error: { code: "pull_failed", message: "Pull failed safely.", retryable: true },
    }
    let reconnects = 0
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => (
        <WorkspaceOperationView
          state={{ phase: "refresh-failed", operationId: failed.operation_id, outcome: "failed", error: new Error("refresh") }}
          operations={[failed]}
          onCancel={() => {}}
          onReconnect={() => { reconnects += 1 }}
          onRetryRefresh={() => { reconnects += 1 }}
          onBack={() => {}}
        />
      ),
      renderOptions,
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Pull failed safely.")
    expect(frame).toContain("Authoritative refresh failed")
    expect(frame).not.toContain("[c] Cancel")
    mockInput.pressKey("r")
    await renderOnce()
    expect(reconnects).toBe(1)
  })
})
