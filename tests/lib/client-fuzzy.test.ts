import { describe, expect, test } from "vitest"

import {
  FUZZY_FIELD_WEIGHT,
  fuzzyScore,
  moveFuzzyActiveIndex,
  rankFuzzyItems,
} from "@git-stacks/client"

type Item = {
  id: string
  workspace: string
  repository?: string
  branch?: string
  recent?: number
  order?: number
}

const rank = (items: Item[], query: string) => rankFuzzyItems(items, query, {
  stableId: (item) => item.id,
  fields: (item) => [
    { text: item.workspace, weight: FUZZY_FIELD_WEIGHT.workspace },
    { text: item.repository ?? "", weight: FUZZY_FIELD_WEIGHT.repository },
    { text: item.branch ?? "", weight: FUZZY_FIELD_WEIGHT.branch },
  ],
  recency: (item) => item.recent ?? 0,
  defaultOrder: (left, right) => (left.order ?? 0) - (right.order ?? 0),
})

describe("client fuzzy ranking", () => {
  test("orders exact, prefix, word-boundary, contiguous, and subsequence quality", () => {
    const labels = ["alpha", "alphabet", "red alpha", "xxalphayy", "a-l-p-h-a"]
    const scores = labels.map((label) => fuzzyScore("alpha", label))
    expect(scores.every((score) => score !== null)).toBe(true)
    expect(scores).toEqual([...scores].sort((left, right) => right! - left!))
  })

  test("gives workspace matches stronger weight than repository and branch matches", () => {
    const results = rank([
      { id: "repository-exact", workspace: "unrelated", repository: "needle", branch: "other" },
      { id: "branch-exact", workspace: "unrelated", repository: "other", branch: "needle" },
      { id: "workspace-partial", workspace: "n-e-e-d-l-e", repository: "other", branch: "other" },
    ], "needle")

    expect(results.map(({ item }) => item.id)).toEqual(["workspace-partial", "repository-exact", "branch-exact"])
  })

  test("consults recency only after equal match score, then stable ID", () => {
    const results = rank([
      { id: "z", workspace: "alpha", recent: 10 },
      { id: "b", workspace: "alpha", recent: 20 },
      { id: "a", workspace: "alpha", recent: 20 },
      { id: "prefix-new", workspace: "alphabet", recent: 99 },
    ], "alpha")

    expect(results.map(({ item }) => item.id)).toEqual(["a", "b", "z", "prefix-new"])
    expect(results[0]).toMatchObject({ active: true })
    expect(results.slice(1).every(({ active }) => !active)).toBe(true)
  })

  test("uses the same caller-supplied scorer for command rows and top partial Enter", () => {
    const commands = [
      { id: "test", workspace: "Run tests" },
      { id: "type", workspace: "Typecheck workspace" },
      { id: "deploy", workspace: "Deploy preview" },
    ]
    const results = rank(commands, "typwrk")
    expect(results.map(({ item }) => item.id)).toEqual(["type"])
    expect(results[0]?.active).toBe(true)
  })

  test("provides deterministic empty/default and no-match states", () => {
    const items = [
      { id: "z", workspace: "Zulu", order: 2 },
      { id: "a", workspace: "Alpha", order: 1 },
      { id: "b", workspace: "Beta", order: 1 },
    ]
    expect(rank(items, "").map(({ item }) => item.id)).toEqual(["a", "b", "z"])
    expect(rank(items, "zz-no-match")).toEqual([])
  })

  test("wraps arrows and jumps with Home and End for zero, one, and many rows", () => {
    expect(moveFuzzyActiveIndex(-1, 0, "next")).toBe(-1)
    expect(moveFuzzyActiveIndex(0, 1, "next")).toBe(0)
    expect(moveFuzzyActiveIndex(0, 3, "previous")).toBe(2)
    expect(moveFuzzyActiveIndex(2, 3, "next")).toBe(0)
    expect(moveFuzzyActiveIndex(1, 3, "home")).toBe(0)
    expect(moveFuzzyActiveIndex(1, 3, "end")).toBe(2)
    expect(moveFuzzyActiveIndex(-1, 3, "next")).toBe(0)
    expect(moveFuzzyActiveIndex(-1, 3, "previous")).toBe(2)
  })
})
