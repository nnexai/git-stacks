import { describe, expect, test, vi } from "vitest"

import { createWorkspaceActionRegistry } from "@git-stacks/client"
import { WEB_WORKSPACE_ACTION_IDS, type WebWorkspaceAction, type WebWorkspaceActionId } from "@git-stacks/protocol"

const workspaceId = "11111111-1111-4111-8111-111111111111"

const descriptors = (): WebWorkspaceAction[] => WEB_WORKSPACE_ACTION_IDS
  .filter((actionId) => actionId !== "operation.cancel")
  .map((action_id) => ({
    action_id,
    subject: { kind: "workspace", workspace_id: workspaceId },
    availability: { available: true },
    confirmation: action_id === "workspace.force-remove"
      ? "exact-name"
      : action_id === "workspace.remove" || action_id === "workspace.merge" || action_id === "workspace.notes.clear"
        ? "confirm"
        : "none",
  }))

describe("shared workspace action registry", () => {
  test("preserves the canonical inventory and one callback identity for every invoker", async () => {
    const callback = vi.fn(async () => ({ kind: "terminal" as const }))
    const callbacks = Object.fromEntries(WEB_WORKSPACE_ACTION_IDS.map((id) => [id, callback])) as Record<WebWorkspaceActionId, typeof callback>
    const registry = createWorkspaceActionRegistry(descriptors(), callbacks)

    expect(registry.entries().map((entry) => entry.actionId)).toEqual(WEB_WORKSPACE_ACTION_IDS.filter((id) => id !== "operation.cancel"))
    const entry = registry.entry("workspace.open")!
    expect(entry.pointer.callback).toBe(entry.menu.callback)
    expect(entry.menu.callback).toBe(entry.keyboard.callback)

    await entry.pointer.callback()
    await registry.invoke("workspace.open", "menu")
    await registry.invoke("workspace.open", "keyboard")
    expect(callback).toHaveBeenCalledTimes(3)
  })

  test("keeps confirmation and authoritative disabled reasons identical across placements", async () => {
    const transport = vi.fn(async () => ({ kind: "terminal" as const }))
    const confirm = vi.fn(async () => true)
    const rows = descriptors().map((row) => row.action_id === "workspace.remove"
      ? { ...row, availability: { available: false as const, reason: "dirty_worktree" as const, message: "Workspace has changes." } }
      : row)
    const registry = createWorkspaceActionRegistry(rows, Object.fromEntries(WEB_WORKSPACE_ACTION_IDS.map((id) => [id, transport])) as never, { confirm })
    const entry = registry.entry("workspace.remove")!

    expect(entry.confirmation).toBe("confirm")
    expect(entry.pointer.disabledReason).toBe("Workspace has changes.")
    expect(entry.menu.disabledReason).toBe(entry.pointer.disabledReason)
    expect(entry.keyboard.disabledReason).toBe(entry.pointer.disabledReason)
    await entry.pointer.callback()
    expect(transport).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  test("allows only surface-local blocking and never weakens authoritative policy", async () => {
    const transport = vi.fn(async () => ({ kind: "terminal" as const }))
    const rows = descriptors().map((row) => row.action_id === "workspace.push"
      ? { ...row, availability: { available: false as const, reason: "nothing_to_push" as const, message: "Nothing to push." } }
      : row)
    const registry = createWorkspaceActionRegistry(rows, Object.fromEntries(WEB_WORKSPACE_ACTION_IDS.map((id) => [id, transport])) as never, {
      localAvailability: (descriptor) => descriptor.action_id === "workspace.open" ? { available: false, reason: "A dialog is open." } : { available: true },
    })

    expect(registry.entry("workspace.open")?.availability).toEqual({ available: false, reason: "A dialog is open." })
    expect(registry.entry("workspace.push")?.disabledReason).toBe("Nothing to push.")
    await registry.invoke("workspace.open", "pointer")
    await registry.invoke("workspace.push", "keyboard")
    expect(transport).not.toHaveBeenCalled()
  })

  test("latches before confirmation await so rapid mixed invokers submit only once", async () => {
    let releaseConfirmation!: (value: boolean) => void
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { releaseConfirmation = resolve }))
    const transport = vi.fn(async () => ({ kind: "operation" as const, operationId: "op_1234567890abcdef" }))
    const registry = createWorkspaceActionRegistry(descriptors(), Object.fromEntries(WEB_WORKSPACE_ACTION_IDS.map((id) => [id, transport])) as never, { confirm })

    const pointer = registry.invoke("workspace.remove", "pointer")
    const enter = registry.invoke("workspace.remove", "menu")
    const key = registry.invoke("workspace.remove", "keyboard")
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(transport).not.toHaveBeenCalled()
    releaseConfirmation(true)
    expect(await Promise.all([pointer, enter, key])).toEqual([
      { status: "submitted", operationId: "op_1234567890abcdef" },
      { status: "pending" },
      { status: "pending" },
    ])
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
