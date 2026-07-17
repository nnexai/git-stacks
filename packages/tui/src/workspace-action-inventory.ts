import {
  createStaleWorkspaceLoadCoordinator,
  createStaleWorkspaceResponseGate,
  workspaceActionLabel,
} from "@git-stacks/client"
import type { WebNotesResponse, WebWorkspaceAction, WebWorkspaceActionId } from "@git-stacks/protocol"

export type TuiWorkspaceActionGroup = "Workspace" | "Git" | "Details" | "Lifecycle"

export const TUI_WORKSPACE_ACTION_PRESENTATION: Record<WebWorkspaceActionId, { key: string; group: TuiWorkspaceActionGroup }> = {
  "workspace.open": { key: "o", group: "Workspace" },
  "workspace.close": { key: "x", group: "Workspace" },
  "workspace.rename": { key: "n", group: "Workspace" },
  "workspace.pin": { key: "v", group: "Workspace" },
  "workspace.unpin": { key: "g", group: "Workspace" },
  "workspace.sync": { key: "s", group: "Git" },
  "workspace.pull": { key: "l", group: "Git" },
  "workspace.push": { key: "p", group: "Git" },
  "workspace.merge": { key: "m", group: "Git" },
  "workspace.notes.list": { key: "t", group: "Details" },
  "workspace.notes.add": { key: "+", group: "Details" },
  "workspace.notes.clear": { key: "z", group: "Details" },
  "workspace.files.inspect": { key: "f", group: "Details" },
  "workspace.archive": { key: "a", group: "Lifecycle" },
  "workspace.unarchive": { key: "h", group: "Lifecycle" },
  "workspace.remove": { key: "r", group: "Lifecycle" },
  "workspace.force-remove": { key: "!", group: "Lifecycle" },
  "operation.cancel": { key: "c", group: "Lifecycle" },
}

export function tuiWorkspaceActionRows(descriptors: readonly WebWorkspaceAction[]) {
  return descriptors.map((descriptor) => ({
    id: descriptor.action_id,
    actionId: descriptor.action_id,
    label: workspaceActionLabel(descriptor.action_id),
    ...TUI_WORKSPACE_ACTION_PRESENTATION[descriptor.action_id],
    ...(!descriptor.availability.available ? { disabledReason: descriptor.availability.message } : {}),
  }))
}

export type WorkspaceActionInventoryToken = Readonly<{ generation: number; workspaceId: string }>

export type WorkspaceNotesResponseToken = Readonly<{ generation: number; workspaceId: string; revision: string }>

/** TUI adapter over the browser-safe shared generation/revision gate. */
export function createStaleWorkspaceRequestGate() {
  return createStaleWorkspaceResponseGate()
}

/** TUI adapter over the shared one-conflict load coordinator. */
export function createStaleWorkspaceRequestCoordinator(
  options: Parameters<typeof createStaleWorkspaceLoadCoordinator>[0],
) {
  return createStaleWorkspaceLoadCoordinator(options)
}

export function createWorkspaceNotesResponseGate() {
  let generation = 0
  return {
    begin(workspaceId: string, revision: string): WorkspaceNotesResponseToken {
      generation += 1
      return Object.freeze({ generation, workspaceId, revision })
    },
    isCurrent(token: WorkspaceNotesResponseToken): boolean {
      return token.generation === generation
    },
    accepts(token: WorkspaceNotesResponseToken, response: WebNotesResponse): boolean {
      return token.generation === generation
        && response.workspace_id === token.workspaceId
        && response.revision === token.revision
    },
  }
}

export function createWorkspaceActionInventoryGate() {
  let generation = 0
  return {
    begin(workspaceId: string): WorkspaceActionInventoryToken {
      generation += 1
      return Object.freeze({ generation, workspaceId })
    },
    isCurrent(token: WorkspaceActionInventoryToken, workspaceId: string): boolean {
      return token.generation === generation && token.workspaceId === workspaceId
    },
    accepts(token: WorkspaceActionInventoryToken, workspaceId: string, descriptors: readonly WebWorkspaceAction[]): boolean {
      return token.generation === generation
        && token.workspaceId === workspaceId
        && descriptors.length > 0
        && descriptors.every((descriptor) => descriptor.subject.workspace_id === token.workspaceId)
    },
    invalidate(): void { generation += 1 },
  }
}
