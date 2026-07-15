import { describe, test, expect } from "bun:test"
import { matchesLabels } from "../../packages/core/src/labels"
import { WorkspaceSchema } from "../../packages/core/src/config"

function makeWs(labels?: string[]) {
  return WorkspaceSchema.parse({
    name: "test-ws",
    branch: "feature/test",
    created: "2026-01-01",
    labels,
  })
}

describe("matchesLabels", () => {
  test("returns true when terms is empty", () => {
    expect(matchesLabels(makeWs(["backend"]), [])).toBe(true)
  })

  test("returns true when workspace has no labels and terms is empty", () => {
    expect(matchesLabels(makeWs(), [])).toBe(true)
  })

  test("returns false when workspace has no labels but terms are given", () => {
    expect(matchesLabels(makeWs(), ["backend"])).toBe(false)
  })

  test("matches single label", () => {
    expect(matchesLabels(makeWs(["backend", "sprint:14"]), ["backend"])).toBe(true)
  })

  test("AND logic requires all labels", () => {
    expect(matchesLabels(makeWs(["backend", "sprint:14"]), ["backend", "sprint:14"])).toBe(true)
    expect(matchesLabels(makeWs(["backend"]), ["backend", "sprint:14"])).toBe(false)
  })

  test("matching is case-sensitive", () => {
    expect(matchesLabels(makeWs(["Backend"]), ["backend"])).toBe(false)
    expect(matchesLabels(makeWs(["backend"]), ["Backend"])).toBe(false)
  })

  test("supports namespaced labels", () => {
    expect(matchesLabels(makeWs(["sprint:14", "client:acme"]), ["sprint:14"])).toBe(true)
  })
})
