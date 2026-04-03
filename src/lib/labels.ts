import type { Workspace } from "./config"

export function matchesLabels(workspace: Workspace, terms: string[]): boolean {
  if (terms.length === 0) return true
  const wsLabels = workspace.labels ?? []
  return terms.every(term => wsLabels.includes(term))
}
