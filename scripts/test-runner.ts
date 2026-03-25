/**
 * Custom test runner: separates unit tests (shared bun test process) from
 * integration tests (per-file isolated bun test processes).
 *
 * Unit tests: tests/lib/, tests/lib/integrations/, tests/tui/dashboard/ (excluding integ-*.test.tsx)
 * Integration tests: tests/commands/, tests/tui/*.test.ts, tests/tui/dashboard/integ-*.test.tsx
 *
 * Usage:
 *   bun run scripts/test-runner.ts           -- run all
 *   bun run scripts/test-runner.ts --unit    -- run unit tests only
 *   bun run scripts/test-runner.ts --integ   -- run integration tests only
 */

import { join, relative, basename } from "path"

const ROOT = join(import.meta.dir, "..")
const TESTS_DIR = join(ROOT, "tests")

// --- File discovery ---

function discoverTests(): string[] {
  const glob = new Bun.Glob("**/*.test.{ts,tsx}")
  return Array.from(glob.scanSync({ cwd: TESTS_DIR, onlyFiles: true })).map(
    (rel) => join(TESTS_DIR, rel)
  )
}

function classifyFiles(): { unit: string[]; integ: string[] } {
  const unit: string[] = []
  const integ: string[] = []

  for (const file of discoverTests()) {
    const rel = relative(TESTS_DIR, file)
    const name = basename(file)

    // Integration: tests/commands/*.test.ts
    if (rel.startsWith("commands/")) {
      integ.push(file)
      continue
    }

    // Integration: tests/tui/*.test.ts (direct children of tui/, not subdirs)
    if (rel.startsWith("tui/") && !rel.startsWith("tui/dashboard/")) {
      integ.push(file)
      continue
    }

    // Integration: tests/tui/dashboard/integ-*.test.tsx
    if (rel.startsWith("tui/dashboard/") && name.startsWith("integ-")) {
      integ.push(file)
      continue
    }

    // Unit: tests/lib/*.test.ts and tests/lib/integrations/*.test.ts
    if (rel.startsWith("lib/")) {
      unit.push(file)
      continue
    }

    // Unit: tests/tui/dashboard/*.test.tsx (not integ-, caught above)
    if (rel.startsWith("tui/dashboard/")) {
      unit.push(file)
      continue
    }

    // Fallback: treat as unit test
    unit.push(file)
  }

  return { unit, integ }
}

// --- Execution ---

async function runUnit(files: string[]): Promise<boolean> {
  if (files.length === 0) {
    console.log("No unit test files found.")
    return true
  }

  console.log(`\n=== Unit Tests (${files.length} files in shared process) ===\n`)

  const proc = Bun.spawn(["bun", "test", ...files], {
    cwd: ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  })

  const exitCode = await proc.exited
  return exitCode === 0
}

async function runInteg(files: string[]): Promise<{ passed: number; failed: number }> {
  if (files.length === 0) {
    console.log("No integration test files found.")
    return { passed: 0, failed: 0 }
  }

  console.log(`\n=== Integration Tests (${files.length} files, isolated processes) ===`)

  let passed = 0
  let failed = 0

  for (const file of files) {
    const relPath = relative(ROOT, file)
    console.log(`\n--- [integ] ${relPath} ---`)

    const proc = Bun.spawn(["bun", "test", file], {
      cwd: ROOT,
      stdio: ["inherit", "inherit", "inherit"],
    })

    const exitCode = await proc.exited
    if (exitCode === 0) {
      passed++
    } else {
      failed++
    }
  }

  return { passed, failed }
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2)
  const runUnitMode = args.includes("--unit") || args.includes("--all") || args.length === 0
  const runIntegMode = args.includes("--integ") || args.includes("--all") || args.length === 0

  const { unit, integ } = classifyFiles()

  let unitPassed: boolean | null = null
  let integResult: { passed: number; failed: number } | null = null

  if (runUnitMode) {
    unitPassed = await runUnit(unit)
  }

  if (runIntegMode) {
    integResult = await runInteg(integ)
  }

  // --- Summary ---
  console.log("\n=== Test Results ===")

  if (unitPassed !== null) {
    console.log(`Unit tests:        ${unitPassed ? "PASS" : "FAIL"}`)
  }

  if (integResult !== null) {
    const { passed, failed } = integResult
    const total = passed + failed
    console.log(`Integration tests: ${passed}/${total} passed${failed > 0 ? " (FAIL)" : ""}`)
  }

  const allPassed =
    (unitPassed === null || unitPassed === true) &&
    (integResult === null || integResult.failed === 0)

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error("Test runner error:", err)
  process.exit(1)
})
