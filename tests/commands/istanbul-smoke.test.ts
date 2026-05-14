import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { cleanup, makeTmpDir } from "../helpers"
import { runIstanbulCompletionSmoke } from "../support/istanbul-smoke"

describe("Istanbul subprocess smoke", () => {
  test("captures mergeable coverage from an instrumented completion bash subprocess", () => {
    const baseDir = makeTmpDir("istanbul-smoke")
    try {
      const result = runIstanbulCompletionSmoke(baseDir)

      expect(result.argv).toContain("completion")
      expect(result.argv).toContain("bash")
      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe("")
      expect(result.stdout).toContain("complete -F _git_stacks_complete git-stacks")
      expect(existsSync(result.coveragePath)).toBe(true)
      expect(result.summary.files.some((file) => file.endsWith("src/commands/completion.ts"))).toBe(true)
      expect(result.summary.statementsCovered).toBeGreaterThan(0)
      expect(result.summary.functionsCovered).toBeGreaterThan(0)
    } finally {
      cleanup(baseDir)
    }
  })
})
