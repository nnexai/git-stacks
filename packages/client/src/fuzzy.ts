export const FUZZY_FIELD_WEIGHT = Object.freeze({
  workspace: 3,
  repository: 2,
  branch: 1,
  primary: 3,
  secondary: 2,
  tertiary: 1,
})

export type FuzzyField = {
  text: string
  weight: number
}

export type FuzzyRankOptions<T> = {
  stableId(item: T): string
  fields(item: T): readonly FuzzyField[]
  recency?(item: T): number | string
  defaultOrder?(left: T, right: T): number
}

export type FuzzyRankedItem<T> = {
  item: T
  score: number
  active: boolean
}

export type FuzzyMovement = "next" | "previous" | "home" | "end"

const EXACT_TIER = 500_000
const PREFIX_TIER = 400_000
const WORD_BOUNDARY_TIER = 300_000
const CONTIGUOUS_TIER = 200_000
const SUBSEQUENCE_TIER = 100_000
const FIELD_WEIGHT_SCALE = 1_000_000

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isWordBoundary(text: string, index: number): boolean {
  if (index === 0) return true
  const previous = text.charCodeAt(index - 1)
  const alphanumeric = (previous >= 48 && previous <= 57)
    || (previous >= 65 && previous <= 90)
    || (previous >= 97 && previous <= 122)
  return !alphanumeric
}

/**
 * Score one query against one field without constructing a user-controlled
 * regular expression. Higher is better; null means the query is not a
 * subsequence of the field.
 */
export function fuzzyScore(query: string, value: string): number | null {
  const needle = query.trim().toLowerCase()
  const haystack = value.toLowerCase()
  if (!needle) return 0
  if (!haystack) return null

  if (haystack === needle) return EXACT_TIER
  if (haystack.startsWith(needle)) return PREFIX_TIER - Math.min(10_000, haystack.length - needle.length)

  const contiguousIndex = haystack.indexOf(needle)
  if (contiguousIndex !== -1) {
    const tier = isWordBoundary(haystack, contiguousIndex) ? WORD_BOUNDARY_TIER : CONTIGUOUS_TIER
    return tier - Math.min(10_000, contiguousIndex * 16 + haystack.length - needle.length)
  }

  let needleIndex = 0
  let firstMatch = -1
  let lastMatch = -1
  let adjacentMatches = 0
  for (let index = 0; index < haystack.length && needleIndex < needle.length; index += 1) {
    if (haystack[index] !== needle[needleIndex]) continue
    if (firstMatch === -1) firstMatch = index
    if (lastMatch === index - 1) adjacentMatches += 1
    lastMatch = index
    needleIndex += 1
  }
  if (needleIndex !== needle.length) return null

  const span = lastMatch - firstMatch + 1
  const gaps = span - needle.length
  const leadingPenalty = Math.max(0, firstMatch)
  return SUBSEQUENCE_TIER
    - Math.min(40_000, gaps * 32 + leadingPenalty * 8 + Math.max(0, haystack.length - span))
    + adjacentMatches * 4
}

function recencyValue(value: number | string | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function rankFuzzyItems<T>(
  items: readonly T[],
  query: string,
  options: FuzzyRankOptions<T>,
): FuzzyRankedItem<T>[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    const ordered = [...items].sort((left, right) => {
      const defaultResult = options.defaultOrder?.(left, right) ?? 0
      return defaultResult || lexicalCompare(options.stableId(left), options.stableId(right))
    })
    return ordered.map((item, index) => ({ item, score: 0, active: index === 0 }))
  }

  const matches = items.flatMap((item) => {
    let score: number | null = null
    for (const field of options.fields(item)) {
      const fieldScore = fuzzyScore(normalizedQuery, field.text)
      if (fieldScore === null) continue
      const weightedScore = Math.trunc(field.weight) * FIELD_WEIGHT_SCALE + fieldScore
      if (score === null || weightedScore > score) score = weightedScore
    }
    return score === null ? [] : [{ item, score }]
  })

  matches.sort((left, right) => right.score - left.score
    || recencyValue(options.recency?.(right.item)) - recencyValue(options.recency?.(left.item))
    || lexicalCompare(options.stableId(left.item), options.stableId(right.item)))

  return matches.map(({ item, score }, index) => ({ item, score, active: index === 0 }))
}

export function moveFuzzyActiveIndex(current: number, resultCount: number, movement: FuzzyMovement): number {
  if (resultCount <= 0) return -1
  if (movement === "home") return 0
  if (movement === "end") return resultCount - 1
  if (current < 0 || current >= resultCount) return movement === "next" ? 0 : resultCount - 1
  if (movement === "next") return (current + 1) % resultCount
  return (current - 1 + resultCount) % resultCount
}
