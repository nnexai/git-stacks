import { availableParallelism } from "node:os"
import { mapLimited } from "../packages/core/src/concurrency"

export function defaultIntegrationWorkers(coreCount = availableParallelism()): number {
  // Integration files each spawn a Bun/CLI process tree. Beyond eight workers
  // CPU-count scaling increases per-test latency enough to trip otherwise
  // healthy five-second subprocess contracts on developer machines and CI.
  return Math.min(8, Math.max(1, coreCount - 2))
}

export const DEFAULT_INTEGRATION_WORKERS = defaultIntegrationWorkers()

export const serialOnlyFiles: Record<string, string> = {}

export interface RunnerArgs {
  runUnit: boolean
  runInteg: boolean
  workers: number
}

export interface IsolatedRunResult {
  file: string
  exitCode: number
  stdout: string
  stderr: string
}

export interface IsolatedPoolResult {
  passed: number
  failed: number
  results: IsolatedRunResult[]
}

export interface IsolatedPoolOptions {
  workers: number
  runFile: (file: string) => Promise<IsolatedRunResult>
}

export function parseRunnerArgs(args: string[]): RunnerArgs {
  let workers = DEFAULT_INTEGRATION_WORKERS
  const modes = new Set<string>()

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--workers") {
      const value = args[index + 1]
      if (value === undefined) {
        throw new Error("--workers requires a value")
      }
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--workers must be a positive integer")
      }
      workers = parsed
      index++
      continue
    }
    if (arg === "--unit" || arg === "--integ" || arg === "--all") {
      modes.add(arg)
      continue
    }
    throw new Error(`Unknown test runner argument: ${arg}`)
  }

  const runUnit = modes.size === 0 || modes.has("--all") || modes.has("--unit")
  const runInteg = modes.size === 0 || modes.has("--all") || modes.has("--integ")

  return { runUnit, runInteg, workers }
}

export async function runIsolatedPool(
  files: string[],
  options: IsolatedPoolOptions
): Promise<IsolatedPoolResult> {
  const workers = Math.max(1, options.workers)
  const completed: IsolatedRunResult[] = []

  await mapLimited(
    files,
    async (file) => {
      const result = await options.runFile(file)
      completed.push(result)
      return result
    },
    workers
  )

  return {
    passed: completed.filter((entry) => entry.exitCode === 0).length,
    failed: completed.filter((entry) => entry.exitCode !== 0).length,
    results: completed,
  }
}

export function summarizeFailures(failures: IsolatedRunResult[], tailLines = 8): string {
  if (failures.length === 0) {
    return ""
  }

  const lines = ["", "=== Integration Failure Summary ==="]
  for (const failure of failures) {
    lines.push(`\n[FAIL] ${failure.file} (exit ${failure.exitCode})`)
    const combined = `${failure.stdout}${failure.stderr}`.trim()
    if (combined.length > 0) {
      lines.push(combined.split(/\r?\n/).slice(-tailLines).join("\n"))
    } else {
      lines.push("(no output captured)")
    }
  }
  return lines.join("\n")
}

export function formatIntegrationSummary(result: Pick<IsolatedPoolResult, "passed" | "failed">): string {
  const total = result.passed + result.failed
  return `${result.passed}/${total} integration files passed`
}
