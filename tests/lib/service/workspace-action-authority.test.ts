import { describe, expect, test } from "@test/api"

import type { CoreState } from "../../../packages/service/src/policy/core-contract"
import {
  CANONICAL_WORKSPACE_ACTION_IDS,
  deriveWorkspaceActionInventory,
} from "../../../packages/service/src/policy/workspace-actions"

const ACTIVE_ID = "11111111-1111-4111-8111-111111111111"
const ARCHIVED_ID = "22222222-2222-4222-8222-222222222222"

function state(overrides: {
  dirty?: boolean
  ahead?: number
  behind?: number
  remote?: "available" | "missing" | "not_applicable"
  mode?: "worktree" | "trunk" | "dir"
  pinned?: boolean
} = {}): CoreState {
  const mode = overrides.mode ?? "worktree"
  const remote = overrides.remote ?? "available"
  return {
    revision: "7",
    generated_at: "2026-07-16T00:00:00.000Z",
    config: { workspace_root: "/private/workspaces" },
    templates: [],
    repositories: [],
    archived_workspaces: [{ id: ARCHIVED_ID, name: "archived", activity_at: "2026-07-15T00:00:00.000Z" }],
    workspaces: [{
      definition: {
        id: ACTIVE_ID,
        name: "active",
        schema_version: "1",
        branch: "feature/active",
        created: "2026-07-16",
        repos: [{
          id: "33333333-3333-4333-8333-333333333333",
          name: "repo",
          mode,
          main_path: "/private/source",
          task_path: "/private/workspaces/active/repo",
        }],
        ...(overrides.pinned ? { pinned: true } : {}),
      },
      projection: {
        id: ACTIVE_ID,
        name: "active",
        branch: "feature/active",
        activity_at: "2026-07-16T00:00:00.000Z",
        repositories: [{
          id: "33333333-3333-4333-8333-333333333333",
          name: "repo",
          mode,
          path: "/private/workspaces/active/repo",
        }],
        launch: { commands: [], environment: {}, redacted: [], references: {} },
        status: [{
          repository_id: "33333333-3333-4333-8333-333333333333",
          name: "repo",
          exists: true,
          dirty: overrides.dirty ?? false,
          branch: "feature/active",
          default_branch: "main",
          mode,
          ahead: overrides.ahead ?? 1,
          behind: overrides.behind ?? 1,
          additions: 0,
          removals: 0,
          remote,
          degraded: false,
        }],
      },
    }],
  } as CoreState
}

function byId(inventory: ReturnType<typeof deriveWorkspaceActionInventory>, id: string) {
  const action = inventory.find((candidate) => candidate.action_id === id)
  if (!action) throw new Error(`missing ${id}`)
  return action
}

describe("canonical workspace action authority", () => {
  test("returns one stable descriptor for every action with lifecycle confirmations", () => {
    const inventory = deriveWorkspaceActionInventory({ state: state(), workspaceId: ACTIVE_ID })

    expect(inventory.map(({ action_id }) => action_id)).toEqual(CANONICAL_WORKSPACE_ACTION_IDS)
    expect(byId(inventory, "workspace.archive")).toMatchObject({ availability: { available: true }, confirmation: "none" })
    expect(byId(inventory, "workspace.remove")).toMatchObject({ availability: { available: true }, confirmation: "confirm" })
    expect(byId(inventory, "workspace.force-remove")).toMatchObject({
      availability: { available: false, reason: "dirty_worktree" },
      confirmation: "exact-name",
    })
    expect(byId(inventory, "workspace.unarchive").availability).toMatchObject({ available: false, reason: "workspace_active" })
  })

  test("keeps archived actions explicit but permits only Unarchive", () => {
    const inventory = deriveWorkspaceActionInventory({ state: state(), workspaceId: ARCHIVED_ID })

    expect(byId(inventory, "workspace.unarchive").availability).toEqual({ available: true })
    for (const action of inventory) {
      if (action.action_id === "workspace.unarchive") continue
      expect(action.availability.available).toBe(false)
      expect(action.availability).toMatchObject({ reason: "workspace_archived" })
    }
  })

  test("derives Git, pin, capability, stale, and in-flight reasons from authoritative inputs", () => {
    const noRemote = deriveWorkspaceActionInventory({ state: state({ remote: "missing", pinned: true }), workspaceId: ACTIVE_ID })
    expect(byId(noRemote, "workspace.pin").availability).toMatchObject({ available: false, reason: "workspace_active" })
    expect(byId(noRemote, "workspace.unpin").availability).toEqual({ available: true })
    expect(byId(noRemote, "workspace.pull").availability).toMatchObject({ available: false, reason: "remote_unavailable" })

    const idle = deriveWorkspaceActionInventory({ state: state({ ahead: 0, behind: 0 }), workspaceId: ACTIVE_ID })
    expect(byId(idle, "workspace.pull").availability).toMatchObject({ available: false, reason: "nothing_to_pull" })
    expect(byId(idle, "workspace.push").availability).toMatchObject({ available: false, reason: "nothing_to_push" })

    const constrained = deriveWorkspaceActionInventory({
      state: state(),
      workspaceId: ACTIVE_ID,
      staleRevision: true,
      capabilities: { "workspace.notes.add": false },
      operations: [{
        operation_id: "op_1234567890abcdef",
        workspace_id: ACTIVE_ID,
        action_id: "workspace.sync",
        state: "running",
        cancellation: { state: "available" },
      }],
    })
    expect(byId(constrained, "workspace.rename").availability).toMatchObject({ available: false, reason: "operation_in_progress" })
    expect(byId(constrained, "workspace.notes.add").availability).toMatchObject({ available: false, reason: "capability_unavailable" })
    expect(byId(constrained, "operation.cancel")).toMatchObject({
      availability: { available: true },
      pending_operation_id: "op_1234567890abcdef",
    })

    const stale = deriveWorkspaceActionInventory({ state: state(), workspaceId: ACTIVE_ID, staleRevision: true })
    expect(byId(stale, "workspace.remove").availability).toMatchObject({ available: false, reason: "stale_revision" })
  })

  test("keeps missing, non-worktree, dirty, and closed states explicit", () => {
    const missing = deriveWorkspaceActionInventory({
      state: state(),
      workspaceId: "44444444-4444-4444-8444-444444444444",
    })
    expect(missing.every(({ availability }) =>
      availability.available === false && availability.reason === "workspace_unavailable")).toBe(true)

    const nonWorktree = deriveWorkspaceActionInventory({ state: state({ mode: "dir", remote: "not_applicable" }), workspaceId: ACTIVE_ID })
    expect(byId(nonWorktree, "workspace.sync").availability).toMatchObject({ available: false })
    expect(byId(nonWorktree, "workspace.merge").availability).toMatchObject({ available: false, reason: "merge_unavailable" })

    const dirty = deriveWorkspaceActionInventory({ state: state({ dirty: true }), workspaceId: ACTIVE_ID })
    expect(byId(dirty, "workspace.merge").availability).toMatchObject({ available: false, reason: "merge_unavailable" })

    const closed = deriveWorkspaceActionInventory({ state: state(), workspaceId: ACTIVE_ID, openState: "closed" })
    expect(byId(closed, "workspace.open").availability).toEqual({ available: true })
    expect(byId(closed, "workspace.close").availability).toMatchObject({ available: false, reason: "workspace_closed" })
  })

  test("exposes Force Remove only from a fresh typed dirty inspection after terminals stopped", () => {
    const failures = [
      undefined,
      { kind: "terminal_cleanup_failed", terminals_stopped: false, force_allowed: false },
      { kind: "workspace_dirty", terminals_stopped: false, force_allowed: true },
      { kind: "operation_failed", terminals_stopped: true, force_allowed: true },
    ] as const
    for (const removal of failures) {
      const inventory = deriveWorkspaceActionInventory({ state: state({ dirty: true }), workspaceId: ACTIVE_ID, removal })
      expect(byId(inventory, "workspace.force-remove").availability.available).toBe(false)
    }

    const eligible = deriveWorkspaceActionInventory({
      state: state({ dirty: true }),
      workspaceId: ACTIVE_ID,
      removal: {
        kind: "workspace_dirty",
        terminals_stopped: true,
        force_allowed: true,
        blocking_repositories: ["repo"],
      },
    })
    expect(byId(eligible, "workspace.force-remove").availability).toEqual({ available: true })
  })

  test("is consumer-neutral: web and TUI receive the same immutable action result", () => {
    const input = { state: state(), workspaceId: ACTIVE_ID } as const
    const web = deriveWorkspaceActionInventory(input)
    const tui = deriveWorkspaceActionInventory(input)
    expect(tui).toEqual(web)
    expect(Object.isFrozen(web)).toBe(true)
    expect(web.every(Object.isFrozen)).toBe(true)
  })
})
