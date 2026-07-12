import { describe, expect, test } from "bun:test"
import {
  DEFAULT_INTEGRATION_WORKERS,
  defaultIntegrationWorkers,
  formatIntegrationSummary,
  parseRunnerArgs,
  runIsolatedPool,
  serialOnlyFiles,
  summarizeFailures,
  type IsolatedRunResult,
} from "../../scripts/test-runner-core"

describe("test runner worker contract", () => {
  test("calculates default workers from core count minus reserved cores", () => {
    expect(defaultIntegrationWorkers(1)).toBe(1)
    expect(defaultIntegrationWorkers(2)).toBe(1)
    expect(defaultIntegrationWorkers(4)).toBe(2)
    expect(defaultIntegrationWorkers(16)).toBe(8)
    expect(defaultIntegrationWorkers(18)).toBe(8)
    expect(defaultIntegrationWorkers(64)).toBe(8)
  })

  test("parses worker defaults, serial override, and invalid counts", () => {
    expect(parseRunnerArgs([])).toEqual({
      runUnit: true,
      runInteg: true,
      workers: DEFAULT_INTEGRATION_WORKERS,
    })

    expect(parseRunnerArgs(["--integ", "--workers", "1"])).toEqual({
      runUnit: false,
      runInteg: true,
      workers: 1,
    })

    expect(() => parseRunnerArgs(["--workers", "0"])).toThrow("--workers must be a positive integer")
    expect(() => parseRunnerArgs(["--workers", "-1"])).toThrow("--workers must be a positive integer")
    expect(() => parseRunnerArgs(["--workers", "many"])).toThrow("--workers must be a positive integer")
    expect(() => parseRunnerArgs(["--workers"])).toThrow("--workers requires a value")
  })

  test("buffers per-file output, flushes in completion order, and drains after failures", async () => {
    const completionOrder: string[] = []
    const result = await runIsolatedPool(["slow.test.ts", "fail.test.ts", "fast.test.ts"], {
      workers: 2,
      runFile: async (file): Promise<IsolatedRunResult> => {
        if (file === "slow.test.ts") {
          await new Promise((resolve) => setTimeout(resolve, 30))
          completionOrder.push(file)
          return { file, exitCode: 0, stdout: "slow out\n", stderr: "" }
        }
        if (file === "fail.test.ts") {
          await new Promise((resolve) => setTimeout(resolve, 5))
          completionOrder.push(file)
          return { file, exitCode: 7, stdout: "fail out\n", stderr: "fail err\n" }
        }
        completionOrder.push(file)
        return { file, exitCode: 0, stdout: "fast out\n", stderr: "" }
      },
    })

    expect(completionOrder).toEqual(["fail.test.ts", "fast.test.ts", "slow.test.ts"])
    expect(result.results.map((entry) => entry.file)).toEqual(completionOrder)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.results.find((entry) => entry.file === "fast.test.ts")).toBeDefined()
  })

  test("summarizes failed files with path, exit code, excerpt, and final count", () => {
    const failed: IsolatedRunResult[] = [
      {
        file: "tests/commands/workspace.test.ts",
        exitCode: 2,
        stdout: "line 1\nline 2\n",
        stderr: "stack a\nstack b\nstack c\nstack d\n",
      },
    ]

    const summary = summarizeFailures(failed, 3)
    expect(summary).toContain("tests/commands/workspace.test.ts")
    expect(summary).toContain("exit 2")
    expect(summary).toContain("stack d")
    expect(summary).not.toContain("line 1")
    expect(formatIntegrationSummary({ passed: 2, failed: 1 })).toBe("2/3 integration files passed")
  })

  test("serial-only metadata is explicit and empty by default", () => {
    expect(serialOnlyFiles).toEqual({})
  })
})
