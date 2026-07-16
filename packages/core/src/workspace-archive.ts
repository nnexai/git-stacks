import { updateWorkspace, type Workspace } from "./config"

export function archiveWorkspace(
  name: string,
  options: { clock?: () => Date } = {},
): Workspace {
  return updateWorkspace(name, (current) => {
    if (current.archived === true) return current
    return {
      ...current,
      archived: true,
      archived_at: (options.clock ?? (() => new Date()))().toISOString(),
    }
  })
}

export function unarchiveWorkspace(name: string): Workspace {
  return updateWorkspace(name, (current) => {
    if (current.archived !== true) return current
    const { archived: _archived, archived_at: _archivedAt, ...active } = current
    return active
  })
}
