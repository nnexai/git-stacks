import type { WebNotesResponse, WebWorkspaceAction } from "@git-stacks/protocol"

export type WorkspaceActionInventoryToken = Readonly<{ generation: number; workspaceId: string }>

export type WorkspaceNotesResponseToken = Readonly<{ generation: number; workspaceId: string; revision: string }>

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
