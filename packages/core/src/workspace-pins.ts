// Canonical implementation owned by @git-stacks/core.
import { listWorkspacesUncached, updateWorkspace, type Workspace } from "./config"

export type WorkspacePinDependencies = {
  listWorkspaces(): Workspace[]
  writeWorkspace(workspace: Workspace): void
}

export function setWorkspacePins(
  workspaceIds: string[],
  dependencies: WorkspacePinDependencies = {
    listWorkspaces: listWorkspacesUncached,
    writeWorkspace: (workspace) => updateWorkspace(workspace.name, (current) => {
      const { pinned: _pinned, ...definition } = current
      return workspace.pinned === true ? { ...definition, pinned: true } : definition
    }),
  },
): void {
  const workspaces = dependencies.listWorkspaces()
  const activeWorkspaces = workspaces.filter((workspace) => workspace.archived !== true)
  const known = new Set(activeWorkspaces.map((workspace) => workspace.id).filter((id): id is string => Boolean(id)))
  for (const id of workspaceIds) if (!known.has(id)) throw new Error(`Unknown workspace identity: ${id}`)
  const pinned = new Set(workspaceIds)

  for (const workspace of activeWorkspaces) {
    const { pinned: _pinned, ...definition } = workspace
    const shouldPin = Boolean(workspace.id && pinned.has(workspace.id))
    if (shouldPin === (workspace.pinned === true) && workspace.pinned !== false) continue
    dependencies.writeWorkspace(shouldPin ? { ...definition, pinned: true } : definition)
  }
}
