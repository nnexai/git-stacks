import { describe, expect, test } from "@test/api"
import {
  E2E_INVENTORY,
  getDuplicateInventoryIds,
  getExcludedItems,
  getInScopeItems,
  getInventoryItem,
  getUnmappedInScopeItems,
  validateE2EInventory,
  type E2EInventoryItem,
} from "../e2e-inventory"

const requiredExclusions = [
  "exclude.tui.manage",
  "exclude.integration.behavior",
  "exclude.editor.workspace-edit-yaml",
  "exclude.editor.template-edit-yaml",
  "exclude.editor.config-yaml",
  "exclude.editor.repo-yaml",
  "exclude.audit.rollback-visibility",
  "exclude.wizard.repo-scan",
  "exclude.wizard.template-new",
  "exclude.wizard.template-edit",
  "exclude.wizard.config",
] as const

function item(overrides: Partial<E2EInventoryItem> = {}): E2EInventoryItem {
  return {
    id: "sample.mapped",
    family: "workspace",
    flowType: "command",
    title: "Sample mapped item",
    commands: ["sample"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/sample.test.ts"],
    rationale: "Synthetic fixture for selector tests.",
    ...overrides,
  }
}

describe("e2e inventory", () => {
  test("has required exclusions", () => {
    const excludedIds = new Set(getExcludedItems().map((entry) => entry.id))

    for (const id of requiredExclusions) {
      expect(excludedIds.has(id)).toBe(true)
      expect(getInventoryItem(id)?.scopeStatus).toBe("excluded")
    }
  })

  test("detects duplicate ids", () => {
    expect(getDuplicateInventoryIds()).toEqual([])

    const duplicateFixture = [
      item({ id: "dupe.id" }),
      item({ id: "unique.id" }),
      item({ id: "dupe.id", title: "Duplicate item" }),
      item({ id: "another.dupe" }),
      item({ id: "another.dupe", title: "Another duplicate item" }),
    ]

    expect(getDuplicateInventoryIds(duplicateFixture)).toEqual(["another.dupe", "dupe.id"])
  })

  test("lists unmapped in-scope items", () => {
    const fixture = [
      item({ id: "mapped.in.scope", scopeStatus: "in-scope", mappedTests: ["tests/mapped.test.ts"] }),
      item({ id: "unmapped.in.scope", scopeStatus: "in-scope", mappedTests: [] }),
      item({ id: "unmapped.excluded", scopeStatus: "excluded", mappedTests: [] }),
    ]

    expect(getUnmappedInScopeItems(fixture).map((entry) => entry.id)).toEqual(["unmapped.in.scope"])
  })

  test("validateE2EInventory returns duplicate and unmapped ids", () => {
    const fixture = [
      item({ id: "mapped.in.scope", mappedTests: ["tests/mapped.test.ts"] }),
      item({ id: "dupe.id", mappedTests: [] }),
      item({ id: "dupe.id", title: "Duplicate item", mappedTests: ["tests/dupe.test.ts"] }),
      item({ id: "excluded.empty", scopeStatus: "excluded", mappedTests: [] }),
    ]

    expect(validateE2EInventory(fixture)).toEqual({
      valid: false,
      duplicateIds: ["dupe.id"],
      unmappedInScopeIds: ["dupe.id"],
    })
  })

  test("shipped inventory has complete required fields and repo-relative test mappings", () => {
    expect(E2E_INVENTORY.length).toBeGreaterThan(requiredExclusions.length)
    expect(getInScopeItems().length).toBeGreaterThan(0)

    for (const entry of E2E_INVENTORY) {
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.commands.length).toBeGreaterThan(0)
      expect(entry.rationale.length).toBeGreaterThan(0)
      for (const mappedTest of entry.mappedTests) {
        expect(mappedTest.startsWith("tests/")).toBe(true)
      }
    }
  })
})
