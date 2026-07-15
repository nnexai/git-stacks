// Canonical implementation owned by @git-stacks/core.
import { listWorkspacesUncached, updateWorkspace, type Workspace } from "./config"

export type WorkspacePriority = { workspace_id: string; priority: number }

export type WorkspacePriorityDependencies = {
  listWorkspaces(): Workspace[]
  writeWorkspace(workspace: Workspace): void
}

export function setWorkspacePriorities(
  priorities: WorkspacePriority[],
  dependencies: WorkspacePriorityDependencies = {
    listWorkspaces: listWorkspacesUncached,
    writeWorkspace: (workspace) => updateWorkspace(workspace.name, (current) => {
      const { priority: _priority, ...definition } = current
      return workspace.priority === undefined ? definition : { ...definition, priority: workspace.priority }
    }),
  },
): void {
  const workspaces = dependencies.listWorkspaces()
  const byId = new Map(workspaces.flatMap((workspace) => workspace.id ? [[workspace.id, workspace] as const] : []))
  for (const { workspace_id: id } of priorities) if (!byId.has(id)) throw new Error(`Unknown workspace identity: ${id}`)

  for (const { workspace_id: id, priority } of priorities) {
    const workspace = byId.get(id)!
    const normalized = priority === 0 ? undefined : priority
    if (workspace.priority === normalized) continue
    const { priority: _priority, ...definition } = workspace
    dependencies.writeWorkspace(normalized === undefined ? definition : { ...definition, priority: normalized })
  }
}
