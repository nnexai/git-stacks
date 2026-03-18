import { describe, test, expect } from "bun:test"

describe("doctor --json", () => {
  test.todo("emits pure JSON with { healthy, issues } shape")
  test.todo("healthy is true when issues array is empty")
  test.todo("healthy is false when issues exist")
  test.todo("issues array mirrors Issue interface: icon, entity, message, fix?")
  test.todo("no human-readable text mixed with JSON output")
})
