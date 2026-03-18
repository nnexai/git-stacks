import { describe, test, expect } from "bun:test"

describe("sync --json", () => {
  test.todo("emits per-repo sync result JSON")
  test.todo("per-repo objects include name, strategy, result, commits_behind_before, error")
  test.todo("result values match: up-to-date | rebased | merged | failed")
  test.todo("--all --json emits array of per-workspace results")
})
