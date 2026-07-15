// Canonical implementation owned by @git-stacks/core.
export type LabeledEntity = { labels?: string[] }

export function matchesLabels(entity: LabeledEntity, terms: string[]): boolean {
  if (terms.length === 0) return true
  const labels = entity.labels ?? []
  return terms.every(term => labels.includes(term))
}
