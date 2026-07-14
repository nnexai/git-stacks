import { realRunHooks } from "../helpers"
import { describe, expect, test } from "bun:test"
import { buildCliProgram, collectCommandPaths } from "../../src/lib/cli-program"

// Keep this alphabetically early suite importing the shared helper first. The
// unit runner intentionally shares one process, and helpers capture selected
// real modules before later suites install mock.module replacements.
describe("coding-agent hook command boundary", () => {
  test("exposes only the signal-based hook lifecycle", () => {
    expect(typeof realRunHooks).toBe("function")
    const paths = collectCommandPaths(buildCliProgram())
    expect(paths).toContain("hooks install")
    expect(paths).toContain("hooks update")
    expect(paths).toContain("hooks uninstall")
    expect(paths).not.toContain("install")
  })
})
