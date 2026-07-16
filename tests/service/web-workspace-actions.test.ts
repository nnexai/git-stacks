import { describe, expect, test } from "@test/api"
import { createWorkspaceActionRegistry } from "../../packages/client/src/workspace-actions"
import {
  WEB_WORKSPACE_ACTION_GROUPS,
  validateWorkspaceNoteDraft,
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

  test("caches one registry and latch for every authoritative workspace inventory generation", () => {
    expect(appSource).toContain("workspaceActionRegistryCache")
    expect(appSource).toContain("inventoryGeneration")
    expect(appSource).not.toMatch(/function actionRegistryFor[\s\S]{0,300}return createWorkspaceActionRegistry/)
    expect(appSource).not.toContain("showDirtyRemovalFailure(current, details)")
  })

  test("hydrates pending operations and reconnects them by identity on reload and stream closure", () => {
    expect(appSource).toContain("operationTracker.hydrate")
    expect(appSource).toContain("reconnectKnownOperation")
    expect(appSource).toMatch(/subscribeSecureEvents[\s\S]*reconnectKnownOperation/)
    expect(appSource).not.toMatch(/operation\.get[\s\S]{0,500}summarizeOperation/)
  })

  test("uses stable rename intent and restores concrete context-menu and overlay nodes", () => {
    expect(appSource).toContain('kind: "workspace.rename"')
    expect(appSource).toContain("new_name: nextName")
    expect(appSource).not.toContain('request: { workspace: workspace.name, new_name: nextName }')
    expect(appSource).toContain("contextMenuInvoker")
    expect(appSource).toContain("requestAnimationFrame")
    expect(appSource).toContain("focusInvalidForgeField")
  })
})

describe("web authoritative notes and path-free file details", () => {
  test("rejects blank and over-limit notes before transport with UTF-8 byte accounting", () => {
    expect(validateWorkspaceNoteDraft("   ")).toEqual({ valid: false, message: "Enter a workspace note." })
    expect(validateWorkspaceNoteDraft("é".repeat(2_048))).toEqual({ valid: true, text: "é".repeat(2_048) })
    expect(validateWorkspaceNoteDraft("é".repeat(2_049))).toEqual({ valid: false, message: "Workspace notes must be 4096 bytes or fewer." })
  })

  test("wires append-only list add clear and keeps failures authoritative", () => {
    for (const seam of [
      "Workspace notes —",
      "workspace.notes.list",
      "workspace.notes.add",
      "workspace.notes.clear",
      "expected_notes_revision",
      "New workspace note",
      "Add note",
      "Keep notes",
      "Clear workspace notes",
      "The note was not added",
      "Workspace notes were not cleared",
    ]) expect(appSource).toContain(seam)
    expect(appSource).not.toMatch(/(?:localStorage|sessionStorage)[\s\S]{0,100}note/i)
  })

  test("renders lazy grouped file status from safe DTO fields only", () => {
    for (const seam of [
      "Workspace file status —",
      "workspace.files.inspect",
      "Loading workspace file status…",
      "aria-expanded",
      "file-status-entry",
      "entry.target",
      "entry.type",
      "entry.state",
      "entry.severity",
      "entry.message",
      "Retry the service check",
    ]) expect(appSource).toContain(seam)
    expect(appSource).not.toMatch(/entry\.(?:path|source_path|target_path|main_path|task_path|root|raw_error)/)
    expect(appSource).not.toContain("innerHTML = entry")
  })
})
