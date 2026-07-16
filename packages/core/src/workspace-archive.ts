import {
  inspectWorkspaceDefinition,
  updateWorkspaceGuarded,
  type Workspace,
} from "./config"

export function archiveWorkspace(
  name: string,
  options: { clock?: () => Date; expectedId?: string } = {},
): Workspace {
  const guard = inspectWorkspaceDefinition(name, options.expectedId)
  return updateWorkspaceGuarded(guard, (current) => {
    if (current.archived === true) return current
    return {
      ...current,
      archived: true,
      archived_at: (options.clock ?? (() => new Date()))().toISOString(),
    }
  })
}

export function unarchiveWorkspace(name: string, options: { expectedId?: string } = {}): Workspace {
  const guard = inspectWorkspaceDefinition(name, options.expectedId)
  return updateWorkspaceGuarded(guard, (current) => {
    if (current.archived !== true) return current
    const { archived: _archived, archived_at: _archivedAt, ...active } = current
    return active
  })
}
