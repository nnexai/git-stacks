#!/usr/bin/env node
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(import.meta.dirname, "..")

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
  if (!scripts.coverage) {
    problems.push({ surface: "coverage", message: "missing package.json script: coverage" })
  }

  const gitignore = existsSync(join(ROOT, ".gitignore"))
    ? readFileSync(join(ROOT, ".gitignore"), "utf8")
    : ""
  if (!gitignore.split(/\r?\n/).includes(".coverage/")) {
    problems.push({ surface: "coverage", message: "missing .coverage/ entry in .gitignore" })
  }

  const vitestConfig = existsSync(join(ROOT, "vitest.config.ts"))
    ? readFileSync(join(ROOT, "vitest.config.ts"), "utf8")
    : ""
  if (!vitestConfig.includes('provider: "v8"')) {
    problems.push({ surface: "coverage", message: "Vitest V8 coverage is not configured" })
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { devDependencies?: Record<string, string> }
  if (!pkg.devDependencies?.["@vitest/coverage-v8"]) {
    problems.push({ surface: "coverage", message: "missing @vitest/coverage-v8 dependency" })
  }

  return problems
}

async function runInventoryTests(): Promise<number> {
  const proc = spawn(process.execPath, [join(ROOT, "node_modules/vitest/vitest.mjs"), "run", "tests/lib/e2e-inventory.test.ts"], {
    cwd: ROOT,
    stdio: "inherit",
  })
  return new Promise<number>((done, reject) => {
    proc.once("error", reject)
    proc.once("exit", (code) => done(code ?? 1))
  })
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
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
