import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { serialOnlyFiles } from "../../scripts/test-runner-core"

const root = join(import.meta.dir, "..", "..")
const hardenedFiles = [
  "tests/commands/workspace-edit.test.ts",
  "tests/tui/workspace-clone.test.ts",
  "tests/tui/workspace-wizard.test.ts",
]

describe("integration fixture collision guards", () => {
  test("known real-write integration files do not share fixed /tmp roots", () => {
    for (const file of hardenedFiles) {
      const content = readFileSync(join(root, file), "utf8")
      expect(content).not.toContain("/tmp/test-workspaces")
      expect(content).not.toContain("/tmp/test.yml")
    }
  })

  test("serial-only exceptions are named and documented", () => {
    expect(serialOnlyFiles).toEqual({})

    for (const [file, reason] of Object.entries(serialOnlyFiles)) {
      expect(file.trim().length).toBeGreaterThan(0)
      expect(reason.trim().length).toBeGreaterThan(12)
    }
  })

  test("mock-only placeholder editor paths remain isolated to dashboard mocks", () => {
    const allowedMockFiles = [
      "tests/tui/dashboard/integ-action-menu.test.tsx",
      "tests/tui/dashboard/integ-sync-progress.test.tsx",
      "tests/tui/dashboard/integ-tab-switching.test.tsx",
      "tests/tui/dashboard/integ-wizard.test.tsx",
    ]

    for (const file of allowedMockFiles) {
      const content = readFileSync(join(root, file), "utf8")
      expect(content).toContain("/tmp/fake.yml")
      expect(content).not.toContain("writeFileSync")
    }
  })
})
