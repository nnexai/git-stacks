import { describe, test } from "bun:test"

describe("run --parallel", () => {
  test.todo("executes command in all worktree repos simultaneously", () => {})
  test.todo("shows per-repo result with checkmark or cross", () => {})
  test.todo("flushes failed repo output after all complete", () => {})
  test.todo("exits 1 if any repo fails, 0 if all pass", () => {})
  test.todo("--parallel --json emits per-repo JSON array", () => {})
  test.todo("--parallel --json includes repo, exit_code, stdout, stderr per entry", () => {})
})
