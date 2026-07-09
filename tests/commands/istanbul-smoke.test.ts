import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync } from "fs"
import { join } from "path"
import { cleanup, makeTmpDir } from "../helpers"
import { IstanbulSmokeError, runIstanbulCompletionSmoke } from "../support/istanbul-smoke"

function captureSmokeError(run: () => unknown): IstanbulSmokeError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(IstanbulSmokeError)
    return error as IstanbulSmokeError
  }

  throw new Error("Expected Istanbul smoke execution to fail")
}

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

  test("surfaces child stderr before looking for coverage when runtime dependencies cannot resolve", () => {
    const baseDir = makeTmpDir("istanbul-smoke-module-failure")
    const emptyNodeModules = join(baseDir, "empty-node-modules")
    mkdirSync(emptyNodeModules)

    try {
      const error = captureSmokeError(() =>
        runIstanbulCompletionSmoke(baseDir, { runtimeNodeModulesPath: emptyNodeModules })
      )

      expect(error.kind).toBe("child-failure")
      expect(error.exitCode).not.toBe(0)
      expect(error.argv).toContain("completion")
      expect(error.stderr).toMatch(/cannot find package|could not resolve|module not found/i)
      expect(error.message).toContain(`argv: ${JSON.stringify(error.argv)}`)
      expect(error.message).toContain(`exitCode: ${error.exitCode}`)
      expect(error.message).toContain(error.stderr.trim())
      expect(error.message).not.toMatch(/ENOENT.*completion-coverage\.json/i)
      expect(existsSync(error.coveragePath)).toBe(false)
    } finally {
      cleanup(baseDir)
    }
  })

  test("reports a distinct missing-artifact failure when a successful child omits coverage", () => {
    const baseDir = makeTmpDir("istanbul-smoke-missing-artifact")

    try {
      const error = captureSmokeError(() =>
        runIstanbulCompletionSmoke(baseDir, { emitCoverageArtifact: false })
      )

      expect(error.kind).toBe("missing-artifact")
      expect(error.exitCode).toBe(0)
      expect(error.stderr).toBe("")
      expect(error.argv).toContain("completion")
      expect(error.message).toContain("coverage artifact is missing")
      expect(error.message).toContain(`argv: ${JSON.stringify(error.argv)}`)
      expect(error.message).toContain("exitCode: 0")
      expect(existsSync(error.coveragePath)).toBe(false)
    } finally {
      cleanup(baseDir)
    }
  })

  test("reports a distinct malformed-coverage failure after a successful child writes invalid JSON", () => {
    const baseDir = makeTmpDir("istanbul-smoke-malformed-artifact")

    try {
      const error = captureSmokeError(() =>
        runIstanbulCompletionSmoke(baseDir, { coverageArtifactContents: "not-json" })
      )

      expect(error.kind).toBe("malformed-coverage")
      expect(error.exitCode).toBe(0)
      expect(error.stderr).toBe("")
      expect(error.message).toContain("coverage artifact is malformed")
      expect(error.message).toContain("cause:")
      expect(existsSync(error.coveragePath)).toBe(true)
    } finally {
      cleanup(baseDir)
    }
  })
})
