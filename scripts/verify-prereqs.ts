#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs"
import { join } from "path"

const ROOT = join(import.meta.dir, "..")

type PrereqProblem = {
  surface: "inventory" | "coverage"
  message: string
}

function packageScripts(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>
  }
  return pkg.scripts ?? {}
}

function collectPrereqProblems(): PrereqProblem[] {
  const problems: PrereqProblem[] = []

  if (!existsSync(join(ROOT, "tests/e2e-inventory.ts"))) {
    problems.push({ surface: "inventory", message: "missing tests/e2e-inventory.ts" })
  }
  if (!existsSync(join(ROOT, "tests/lib/e2e-inventory.test.ts"))) {
    problems.push({ surface: "inventory", message: "missing tests/lib/e2e-inventory.test.ts" })
  }

  const scripts = packageScripts()
  for (const script of ["coverage", "coverage:unit", "coverage:integ"] as const) {
    if (!scripts[script]) {
      problems.push({ surface: "coverage", message: `missing package.json script: ${script}` })
    }
  }

  const gitignore = existsSync(join(ROOT, ".gitignore"))
    ? readFileSync(join(ROOT, ".gitignore"), "utf8")
    : ""
  if (!gitignore.split(/\r?\n/).includes(".coverage/")) {
    problems.push({ surface: "coverage", message: "missing .coverage/ entry in .gitignore" })
  }

  const coverageRunner = existsSync(join(ROOT, "scripts/coverage-runner.ts"))
    ? readFileSync(join(ROOT, "scripts/coverage-runner.ts"), "utf8")
    : ""
  for (const artifact of [
    "coverage-final.json",
    "coverage-summary.json",
    "lcov.info",
    "index.html",
  ] as const) {
    if (!coverageRunner.includes(artifact)) {
      problems.push({ surface: "coverage", message: `coverage runner does not mention ${artifact}` })
    }
  }

  return problems
}

async function runInventoryTests(): Promise<number> {
  const proc = Bun.spawn(["bun", "test", "tests/lib/e2e-inventory.test.ts"], {
    cwd: ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  })
  return proc.exited
}

function printProblems(problems: PrereqProblem[]): void {
  console.error("verify:prereqs failed: prerequisite surfaces are incomplete.")
  for (const surface of ["inventory", "coverage"] as const) {
    const scoped = problems.filter((problem) => problem.surface === surface)
    if (scoped.length === 0) continue
    console.error("")
    console.error(`${surface}:`)
    for (const problem of scoped) {
      console.error(`  - ${problem.message}`)
    }
  }
}

if (import.meta.main) {
  const problems = collectPrereqProblems()
  if (problems.length > 0) {
    printProblems(problems)
    process.exit(1)
  }

  const testExitCode = await runInventoryTests()
  if (testExitCode !== 0) {
    console.error("verify:prereqs failed: inventory validation test failed.")
    process.exit(testExitCode)
  }

  console.log("verify:prereqs passed: inventory and coverage prerequisite surfaces are present.")
}
