import { describe, expect, test } from "@test/api"
import { createWorkspaceActionRegistry } from "../../packages/client/src/workspace-actions"
import {
  WEB_WORKSPACE_ACTION_GROUPS,
  workspaceActionMenuRows,
} from "../../packages/web/src/navigation"
import type {
  WebWorkspaceAction,
  WebWorkspaceActionId,
} from "../../packages/protocol/src/web"
import { readFileSync } from "node:fs"

const appSource = readFileSync(new URL("../../packages/web/src/app.ts", import.meta.url), "utf8")
const workspaceId = "018f47f4-5ab1-7c2d-8e90-123456789abc"

function descriptor(
  action_id: WebWorkspaceActionId,
  availability: WebWorkspaceAction["availability"] = { available: true },
): WebWorkspaceAction {
  return {
    action_id,
    subject: action_id === "operation.cancel"
      ? { kind: "operation", workspace_id: workspaceId, operation_id: "op_1234567890abcdef" }
      : { kind: "workspace", workspace_id: workspaceId },
    availability,
    confirmation: action_id === "workspace.force-remove"
      ? "exact-name"
      : ["workspace.remove", "workspace.merge", "workspace.notes.clear"].includes(action_id)
        ? "confirm"
        : "none",
    ...(availability.available || availability.reason !== "operation_in_progress"
      ? {}
      : { pending_operation_id: "op_1234567890abcdef" }),
  }
}

describe("web canonical workspace action surface", () => {
  test("groups the canonical descriptor vocabulary without replacing callback identity", () => {
    const calls: string[] = []
    const callbacks = Object.fromEntries([
      "workspace.open",
      "workspace.pull",
      "workspace.notes.list",
      "workspace.archive",
    ].map((actionId) => [actionId, async () => {
      calls.push(actionId)
      return { kind: "terminal" as const }
    }])) as never
    const registry = createWorkspaceActionRegistry([
      descriptor("workspace.open"),
      descriptor("workspace.pull"),
      descriptor("workspace.notes.list"),
      descriptor("workspace.archive"),
    ], callbacks)

    const rows = workspaceActionMenuRows(registry)
    expect(WEB_WORKSPACE_ACTION_GROUPS.map(({ label }) => label)).toEqual(["Workspace", "Git", "Details", "Lifecycle"])
    expect(rows.map(({ actionId, group }) => ({ actionId, group }))).toEqual([
      { actionId: "workspace.open", group: "Workspace" },
      { actionId: "workspace.pull", group: "Git" },
      { actionId: "workspace.notes.list", group: "Details" },
      { actionId: "workspace.archive", group: "Lifecycle" },
    ])
    for (const row of rows) expect(row.callback).toBe(registry.entry(row.actionId)?.menu.callback)
    expect(calls).toEqual([])
  })

  test("keeps unavailable rows focusable with an announced reason and zero transport", async () => {
    let calls = 0
    const registry = createWorkspaceActionRegistry([
      descriptor("workspace.push", { available: false, reason: "remote_missing", message: "No remote is configured." }),
    ], { "workspace.push": async () => { calls += 1; return { kind: "terminal" } } } as never)
    const row = workspaceActionMenuRows(registry)[0]!

    expect(row.disabledReason).toBe("No remote is configured.")
    expect(row.ariaDisabled).toBe("true")
    expect(row.tabIndex).toBe(0)
    await row.callback()
    expect(calls).toBe(0)
  })

  test("integrates descriptor authority, operation tracking, and authoritative refresh in the web shell", () => {
    for (const seam of [
      "createWorkspaceActionRegistry",
      "workspace.actions",
      "workspaceActionMenuRows",
      "createOperationTracker",
      "operation.cancel",
      "retryRefresh",
      "Workspace actions",
      "aria-disabled",
    ]) expect(appSource).toContain(seam)
    expect(appSource).not.toMatch(/workspace\.pull[\s\S]{0,120}(?:child_process|spawn|exec)/)
  })
})
