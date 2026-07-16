/** @jsxImportSource @opentui/solid */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { testRender } from "@opentui/solid"
import { createWorkspaceActionRegistry } from "@git-stacks/client"
import type { WebOperationSummary, WebWorkspaceAction } from "@git-stacks/protocol"

import { ActionMenu } from "../../../packages/tui/src/ActionMenu"
import { WorkspaceOperationView } from "../../../packages/tui/src/WorkspaceOperationView"
import { WorkspaceNotesDialog } from "../../../packages/tui/src/WorkspaceNotesDialog"
import { WorkspaceFileStatusDialog } from "../../../packages/tui/src/WorkspaceFileStatusDialog"
import { createWorkspaceActionInventoryGate, createWorkspaceNotesResponseGate } from "../../../packages/tui/src/workspace-action-inventory"

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
  test("App routes canonical invocations through the shared action registry policy", () => {
    const appSource = readFileSync(new URL("../../../packages/tui/src/App.tsx", import.meta.url), "utf8")
    expect(appSource).toContain("createWorkspaceActionRegistry")
    expect(appSource).toContain("registry.invoke(actionId, \"menu\")")
  })

  test("inventory generations reject workspace-switch, reorder, late, and subject-mismatch results", () => {
    const gate = createWorkspaceActionInventoryGate()
    const first = gate.begin(workspaceId)
    const reordered = gate.begin(workspaceId)
    expect(gate.accepts(first, workspaceId, [descriptor("workspace.open")])).toBe(false)
    expect(gate.accepts(reordered, workspaceId, [descriptor("workspace.open")])).toBe(true)

    const otherWorkspace = "00000000-0000-4000-8000-000000000127"
    const switched = gate.begin(otherWorkspace)
    expect(gate.accepts(reordered, workspaceId, [descriptor("workspace.open")])).toBe(false)
    expect(gate.accepts(switched, otherWorkspace, [descriptor("workspace.open")])).toBe(false)
    expect(gate.isCurrent(switched, otherWorkspace)).toBe(true)
  })

  test("fails closed while canonical inventory is loading or unavailable", async () => {
    let legacyDispatches = 0
    const loading = await testRender(
      () => (
        <ActionMenu
          workspaceName="parity-ws"
          inventoryState="loading"
          onAction={() => { legacyDispatches += 1 }}
          onInvoke={() => { legacyDispatches += 1 }}
          onCancel={() => {}}
        />
      ),
      renderOptions,
    )
    await loading.renderOnce()
    expect(loading.captureCharFrame()).toContain("Loading authoritative workspace actions")
    expect(loading.captureCharFrame()).not.toContain("[o] Open")
    loading.mockInput.pressKey("o")
    await loading.renderOnce()
    expect(legacyDispatches).toBe(0)

    const failed = await testRender(
      () => (
        <ActionMenu
          workspaceName="parity-ws"
          inventoryState="error"
          inventoryError="Workspace actions could not be loaded."
          onAction={() => { legacyDispatches += 1 }}
          onInvoke={() => { legacyDispatches += 1 }}
          onCancel={() => {}}
        />
      ),
      renderOptions,
    )
    await failed.renderOnce()
    expect(failed.captureCharFrame()).toContain("Workspace actions could not be loaded")
    expect(failed.captureCharFrame()).not.toContain("[o] Open")
    failed.mockInput.pressKey("o")
    await failed.renderOnce()
    expect(legacyDispatches).toBe(0)
  })

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
          inventoryState="ready"
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

  test("canonical rendering retains adapted legacy-only actions with unique shortcuts", async () => {
    const legacy: string[] = []
    let runs = 0
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => (
        <ActionMenu
          workspaceName="parity-ws"
          inventoryState="ready"
          descriptors={[descriptor("workspace.pin"), descriptor("workspace.unpin", false, "Workspace is not pinned.")]}
          onInvoke={() => {}}
          onAction={(action) => { legacy.push(action) }}
          onRun={() => { runs += 1 }}
          onCancel={() => {}}
        />
      ),
      renderOptions,
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Edit ($EDITOR)")
    expect(frame).toContain("Clean")
    expect(frame).toContain("Run")
    expect(frame).toContain("Issue...")
    expect(frame).toContain("Commands...")
    expect(frame.match(/\[v\]/g)?.length).toBe(1)

    mockInput.pressKey("e")
    mockInput.pressKey("u")
    await renderOnce()
    expect(legacy).toEqual(["edit"])
    expect(runs).toBe(1)
  })

  test("letter and Enter activation share one callback and rapid keys submit once", async () => {
    let calls = 0
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const pull = descriptor("workspace.pull")
    const registry = createWorkspaceActionRegistry([pull], {
      "workspace.pull": async () => { calls += 1; await pending; return { kind: "terminal" } },
    } as Parameters<typeof createWorkspaceActionRegistry>[1])
    const { renderOnce, mockInput } = await testRender(
      () => (
        <ActionMenu
          workspaceName="parity-ws"
          inventoryState="ready"
          descriptors={[pull]}
          onInvoke={(actionId) => registry.invoke(actionId, "menu").then(() => undefined)}
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
    expect(frame).not.toContain("[Enter/Esc] Back")
    mockInput.pressEscape()
    await renderOnce()
    expect(reconnects).toBe(0)
    mockInput.pressKey("r")
    await renderOnce()
    expect(reconnects).toBe(1)
  })

  test("submit-unknown advertises and accepts Back recovery without replay", async () => {
    let backs = 0
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => (
        <WorkspaceOperationView
          state={{ phase: "submit-unknown", error: new Error("response lost") }}
          operations={[]}
          onCancel={() => {}}
          onReconnect={() => {}}
          onRetryRefresh={() => {}}
          onBack={() => { backs += 1 }}
        />
      ),
      renderOptions,
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("submission outcome is unknown")
    expect(captureCharFrame()).toContain("[Enter/Esc] Back")
    mockInput.pressEscape()
    await renderOnce()
    expect(backs).toBe(1)
  })
})

describe("OpenTUI authoritative workspace details", () => {
  test("notes responses are keyed by workspace and authoritative revision", () => {
    const gate = createWorkspaceNotesResponseGate()
    const first = gate.begin(workspaceId, "7")
    const response = { workspace_id: workspaceId, revision: "7", notes_revision: "notes-7", count: 0, records: [] }
    expect(gate.accepts(first, response)).toBe(true)
    const switched = gate.begin("00000000-0000-4000-8000-000000000127", "8")
    expect(gate.accepts(first, response)).toBe(false)
    expect(gate.accepts(switched, response)).toBe(false)
    expect(gate.accepts(switched, { ...response, workspace_id: switched.workspaceId, revision: "wrong" })).toBe(false)
    expect(gate.accepts(switched, { ...response, workspace_id: switched.workspaceId, revision: switched.revision })).toBe(true)
  })

  test("notes load failure rejects Add before transport", async () => {
    let adds = 0
    const failed = await testRender(
      () => <WorkspaceNotesDialog workspaceName="parity-ws" error="Workspace notes could not be loaded." onAdd={() => { adds += 1 }} onClear={() => {}} onRetry={() => {}} onBack={() => {}} />,
      renderOptions,
    )
    await failed.renderOnce()
    failed.mockInput.pressKey("a")
    await failed.renderOnce()
    expect(failed.captureCharFrame()).not.toContain("New workspace note")
    expect(adds).toBe(0)
  })

  test("notes retain a stable empty frame and validate note input before transport", async () => {
    let adds = 0
    const response = {
      workspace_id: workspaceId,
      revision: "7",
      notes_revision: "notes-7",
      count: 0,
      records: [],
    }
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => <WorkspaceNotesDialog workspaceName="parity-ws" response={response} onAdd={() => { adds += 1 }} onClear={() => {}} onRetry={() => {}} onBack={() => {}} />,
      renderOptions,
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("No workspace notes")
    expect(captureCharFrame()).toContain("Add an operator note")
    mockInput.pressKey("a")
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(captureCharFrame()).toContain("Workspace notes cannot be blank")
    expect(adds).toBe(0)
  })

  test("note add and clear rejections remain handled and recoverable", async () => {
    const response = {
      workspace_id: workspaceId,
      revision: "7",
      notes_revision: "notes-7",
      count: 1,
      records: [{ text: "Existing context", created_at: "2026-07-16T12:00:00.000Z" }],
    }
    let addAttempts = 0
    const add = await testRender(
      () => <WorkspaceNotesDialog workspaceName="parity-ws" response={response} onAdd={async () => { addAttempts += 1; throw new Error("add failed") }} onClear={async () => { throw new Error("clear failed") }} onRetry={() => {}} onBack={() => {}} />,
      renderOptions,
    )
    await add.renderOnce()
    add.mockInput.pressKey("a")
    await add.renderOnce()
    await Bun.sleep(1)
    await add.renderOnce()
    await add.mockInput.typeText("operator note")
    add.mockInput.pressEnter()
    await Bun.sleep(1)
    await add.renderOnce()
    expect(addAttempts).toBe(1)
    expect(add.captureCharFrame()).toContain("New workspace note")

    add.mockInput.pressEscape()
    add.mockInput.pressKey("x")
    await add.renderOnce()
    add.mockInput.pressKey("y")
    await Bun.sleep(1)
    await add.renderOnce()
    expect(add.captureCharFrame()).toContain("Clear all workspace notes")
  })

  test("notes show authoritative newest-first count and confirm clear safely", async () => {
    let clears = 0
    const response = {
      workspace_id: workspaceId,
      revision: "7",
      notes_revision: "notes-7",
      count: 2,
      records: [
        { text: "Newest operator context", created_at: "2026-07-16T12:00:00.000Z" },
        { text: "Older operator context", created_at: "2026-07-15T12:00:00.000Z" },
      ],
    }
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => <WorkspaceNotesDialog workspaceName="parity-ws" response={response} onAdd={() => {}} onClear={() => { clears += 1 }} onRetry={() => {}} onBack={() => {}} />,
      renderOptions,
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Workspace notes — parity-ws (2)")
    expect(frame.indexOf("Newest operator context")).toBeLessThan(frame.indexOf("Older operator context"))
    mockInput.pressKey("x")
    await renderOnce()
    expect(captureCharFrame()).toContain("Clear all workspace notes for parity-ws?")
    mockInput.pressKey("y")
    await renderOnce()
    expect(clears).toBe(1)
  })

  test("file status renders shared states, groups, counts and no host path canary", async () => {
    const response = {
      workspace_id: workspaceId,
      revision: "7",
      generated_at: "2026-07-16T12:00:00.000Z",
      summary: { total: 2, ok: 0, warnings: 1, errors: 1, attention: 2 },
      groups: [
        {
          scope: "workspace" as const,
          name: "Workspace files",
          summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
          entries: [{ id: "file_1234567890123456", target: ".env.local", type: "copy" as const, state: "missing" as const, severity: "warning" as const, needs_attention: true, reason: "target_missing" as const, message: "Configured target is missing." }],
        },
        {
          scope: "repository" as const,
          repository_id: "00000000-0000-4000-8000-000000000777",
          name: "api",
          summary: { total: 1, ok: 0, warnings: 0, errors: 1, attention: 1 },
          entries: [{ id: "file_abcdefghijklmnop", target: "config/app.yml", type: "sync" as const, state: "diverged" as const, severity: "error" as const, needs_attention: true, reason: "diverged" as const, message: "Source and target both changed.", counts: { equal: 1, source_only: 1, target_only: 1, differing: 1, errors: 0 } }],
        },
      ],
    }
    const { renderOnce, captureCharFrame } = await testRender(
      () => <WorkspaceFileStatusDialog workspaceName="parity-ws" response={response} onRetry={() => {}} onBack={() => {}} />,
      renderOptions,
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("2 entries, 2 need attention")
    expect(frame).toContain("missing")
    expect(frame).toContain("diverged")
    expect(frame).toContain("config/app.yml")
    expect(frame).not.toContain("/home/secret")
    expect(frame).not.toContain("main_path")
    expect(frame).not.toContain("task_path")
  })

  test("file status preserves stable loading and retryable error frames", async () => {
    const loading = await testRender(
      () => <WorkspaceFileStatusDialog workspaceName="parity-ws" loading onRetry={() => {}} onBack={() => {}} />,
      renderOptions,
    )
    await loading.renderOnce()
    expect(loading.captureCharFrame()).toContain("Loading workspace file status")

    let retries = 0
    const failed = await testRender(
      () => <WorkspaceFileStatusDialog workspaceName="parity-ws" error="Workspace file status could not be loaded." onRetry={() => { retries += 1 }} onBack={() => {}} />,
      renderOptions,
    )
    await failed.renderOnce()
    expect(failed.captureCharFrame()).toContain("[r] Retry")
    failed.mockInput.pressKey("r")
    await failed.renderOnce()
    expect(retries).toBe(1)
  })
})
