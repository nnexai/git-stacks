import { describe, test, expect } from "bun:test"
import { formatError } from "../../packages/core/src/errors"

describe("formatError", () => {
  test("message-only format: prefixes with 'error: '", () => {
    expect(formatError("Workspace 'foo' not found")).toBe("error: Workspace 'foo' not found")
  })

  test("message + hint format: appends hint on next line with '  -> ' prefix", () => {
    expect(formatError("Workspace 'foo' not found", "run: git-stacks list")).toBe(
      "error: Workspace 'foo' not found\n  -> run: git-stacks list"
    )
  })

  test("undefined hint: same result as message-only", () => {
    expect(formatError("Workspace 'foo' not found", undefined)).toBe(
      "error: Workspace 'foo' not found"
    )
  })

  test("empty string hint: same result as message-only (no bare arrow line)", () => {
    expect(formatError("Workspace 'foo' not found", "")).toBe("error: Workspace 'foo' not found")
  })
})
