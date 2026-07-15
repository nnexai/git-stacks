import { createRequire } from "module"
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs"
import { basename, dirname, join, relative } from "path"
import { createInstrumenter } from "istanbul-lib-instrument"
import { parseRunnerArgs, runIsolatedPool, summarizeFailures } from "./test-runner-core"

const require = createRequire(import.meta.url)
const libCoverage = require("istanbul-lib-coverage")
const libReport = require("istanbul-lib-report")
const reports = require("istanbul-reports")

const ROOT = join(import.meta.dir, "..")
const TESTS_DIR = join(ROOT, "tests")
const COVERAGE_DIR = join(ROOT, ".coverage")
const RUNTIME_ROOT = join(COVERAGE_DIR, "runtime-root")
const RUNTIME_TESTS_DIR = join(RUNTIME_ROOT, "tests")
const SRC_INST_DIR = join(RUNTIME_ROOT, "packages")
const SHARDS_DIR = join(COVERAGE_DIR, "shards")
const BLANK_TEMPLATES_PATH = join(COVERAGE_DIR, "blank-templates.json")

// Bun's process-global module mocks bind to the original source module identity.
// These tests replace package modules directly, which cannot be preserved after
// Istanbul copies the package graph into RUNTIME_ROOT. Keep the exception narrow:
// the files still run and must pass, but do not contribute coverage shards.
const NON_INSTRUMENTABLE_MOCK_TESTS = new Set([
  "tests/commands/repo-add.test.ts",
  "tests/commands/workspace-edit.test.ts",
  "tests/lib/integrations/wizard-helpers.test.ts",
  "tests/lib/paths-command.test.ts",
  "tests/lib/service/identity.test.ts",
  "tests/tui/dashboard/integ-action-menu.test.tsx",
  "tests/tui/dashboard/integ-sync-progress.test.tsx",
  "tests/tui/dashboard/integ-tab-switching.test.tsx",
  "tests/tui/dashboard/integ-wizard.test.tsx",
  "tests/tui/workspace-clone.test.ts",
  "tests/tui/workspace-wizard.test.ts",
])

type TestResult = { passed: number; failed: number; mergeableShardDirs: string[] }
export type CoverageOptions = {
  runUnitMode: boolean
  runIntegMode: boolean
  filters: string[]
  timeoutMs: number
  workers: number
  keepWorkdir: boolean
}

function discoverTests(): string[] {
  const glob = new Bun.Glob("**/*.test.{ts,tsx}")
  return Array.from(glob.scanSync({ cwd: TESTS_DIR, onlyFiles: true })).map((rel) =>
    join(TESTS_DIR, rel)
  )
}

function fileUsesMockModule(filePath: string): boolean {
  try {
    return readFileSync(filePath, "utf8").includes("mock.module(")
  } catch {
    return false
  }
}

function classifyFiles(): { unit: string[]; integ: string[] } {
  const unit: string[] = []
  const integ: string[] = []

  for (const file of discoverTests()) {
    const rel = relative(TESTS_DIR, file)
    const name = basename(file)

    if (rel.startsWith("commands/")) {
      integ.push(file)
    } else if (rel.startsWith("tui/") && !rel.startsWith("tui/dashboard/")) {
      integ.push(file)
    } else if (rel.startsWith("tui/dashboard/") && name.startsWith("integ-")) {
      integ.push(file)
    } else if (rel === "lib/files.test.ts") {
      integ.push(file)
    } else if (rel.startsWith("lib/integrations/")) {
      unit.push(file)
    } else if (rel.startsWith("lib/") && fileUsesMockModule(file)) {
      integ.push(file)
    } else if (rel.startsWith("lib/")) {
      unit.push(file)
    } else if (rel.startsWith("tui/dashboard/") && fileUsesMockModule(file)) {
      integ.push(file)
    } else if (rel.startsWith("tui/dashboard/")) {
      unit.push(file)
    } else {
      unit.push(file)
    }
  }

  return { unit, integ }
}

export function parseArgs(args: string[]): CoverageOptions {
  const runnerArgs: string[] = []
  const filters: string[] = []
  let timeoutMs = 60_000
  let keepWorkdir = process.env.GS_COVERAGE_KEEP_WORKDIR === "1"

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--unit" || arg === "--integ" || arg === "--all") {
      runnerArgs.push(arg)
      continue
    }
    if (arg === "--workers") {
      runnerArgs.push(arg)
      runnerArgs.push(args[index + 1] ?? "")
      index++
      continue
    }
    if (arg === "--keep-workdir") {
      keepWorkdir = true
      continue
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = Number(arg.split("=")[1])
      continue
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown coverage argument: ${arg}`)
    }
    filters.push(arg)
  }

  const parsedRunner = parseRunnerArgs(runnerArgs)

  return {
    runUnitMode: parsedRunner.runUnit,
    runIntegMode: parsedRunner.runInteg,
    filters,
    workers: parsedRunner.workers,
    keepWorkdir,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
  }
}

function applyFilters(files: string[], filters: string[]): string[] {
  if (filters.length === 0) return files
  return files.filter((file) => {
    const rel = relative(ROOT, file)
    return filters.some((filter) => rel.includes(filter) || file.includes(filter))
  })
}

export function shouldInstrumentCoverageTest(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/")
  const testsIndex = normalized.lastIndexOf("/tests/")
  const relPath = testsIndex >= 0 ? normalized.slice(testsIndex + 1) : relative(ROOT, filePath).replaceAll("\\", "/")
  return !NON_INSTRUMENTABLE_MOCK_TESTS.has(relPath)
}

function instrumentSourceTree(): number {
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  const blankTemplates: Record<string, unknown> = {}
  let count = 0

  for (const rel of glob.scanSync({ cwd: join(ROOT, "packages"), onlyFiles: true })) {
    if (!/(?:^|\/)src\//.test(rel)) continue
    const absPath = join(ROOT, "packages", rel)
    const originalPath = relative(ROOT, absPath)
    const outPath = join(SRC_INST_DIR, rel)
    const source = readFileSync(absPath, "utf8")
    const instrumenter = createInstrumenter({
      coverageVariable: "__coverage__",
      esModules: true,
      compact: false,
      parserPlugins: rel.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"],
    })

    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, instrumenter.instrumentSync(source, originalPath))
    blankTemplates[originalPath] = instrumenter.lastFileCoverage()
    count++
  }

  copyFileSync(join(ROOT, "package.json"), join(RUNTIME_ROOT, "package.json"))
  for (const packageName of readdirSync(join(ROOT, "packages"))) {
    const manifest = join(ROOT, "packages", packageName, "package.json")
    if (!existsSync(manifest)) continue
    copyFileSync(manifest, join(SRC_INST_DIR, packageName, "package.json"))
  }

  appendFileSync(
    join(SRC_INST_DIR, "cli", "src", "index.ts"),
    `

// --- Coverage shard writer (appended by coverage-runner.ts) ---
import { writeFileSync as _gsWriteSync, mkdirSync as _gsMkdirSync } from "fs";
import { join as _gsJoin } from "path";
const _gsShardDir = process.env.GS_COVERAGE_SHARD_DIR;
if (_gsShardDir) {
  process.on("exit", () => {
    const _gsCov = (globalThis as { __coverage__?: unknown }).__coverage__;
    if (!_gsCov) return;
    _gsMkdirSync(_gsShardDir, { recursive: true });
    const _gsPath = _gsJoin(_gsShardDir, \`\${process.pid}-\${Date.now()}-\${Math.random().toString(36).slice(2)}.json\`);
    _gsWriteSync(_gsPath, JSON.stringify(_gsCov), { flush: true });
  });
}
`
  )

  writeFileSync(BLANK_TEMPLATES_PATH, JSON.stringify(blankTemplates, null, 2))
  return count
}

function copyIfExists(path: string): void {
  const from = join(ROOT, path)
  if (!existsSync(from)) return
  const to = join(RUNTIME_ROOT, path)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

function symlinkIfExists(path: string): void {
  const from = join(ROOT, path)
  if (!existsSync(from)) return
  const to = join(RUNTIME_ROOT, path)
  rmSync(to, { recursive: true, force: true })
  symlinkSync(from, to, lstatSync(from).isDirectory() ? "dir" : "file")
}

function prepareRuntimeRoot(): void {
  mkdirSync(RUNTIME_ROOT, { recursive: true })
  cpSync(TESTS_DIR, RUNTIME_TESTS_DIR, { recursive: true })
  for (const path of ["package.json", "package-lock.json", "tsconfig.json", "bunfig.toml", ".gitignore"]) {
    copyIfExists(path)
  }
  symlinkIfExists("node_modules")
  symlinkIfExists("scripts")
}

async function runTests(
  label: "unit" | "integ",
  files: string[],
  timeoutMs: number,
  workers = 1
): Promise<TestResult> {
  if (files.length === 0) {
    console.log(`No ${label} test files found.`)
    return { passed: 0, failed: 0, mergeableShardDirs: [] }
  }

  const effectiveWorkers = label === "integ" ? workers : 1
  console.log(`\n=== Coverage: ${label === "unit" ? "Unit" : "Integration"} Tests (${files.length} files, isolated processes, ${effectiveWorkers} workers) ===`)

  const preload = join(ROOT, "scripts", "coverage-preload.ts")

  const result = await runIsolatedPool(files, {
    workers: effectiveWorkers,
    runFile: async (file) => {
      const relPath = relative(ROOT, file)
      const instrument = shouldInstrumentCoverageTest(file)
      const testFile = instrument ? join(RUNTIME_ROOT, relPath) : file
      const shardDir = instrument ? join(SHARDS_DIR, shardNameForFile(relPath)) : undefined
      const env = instrument
        ? {
            ...process.env,
            GS_COVERAGE_ROOT: RUNTIME_ROOT,
            GS_COVERAGE_SRC_INST: SRC_INST_DIR,
            GS_COVERAGE_SHARD_DIR: shardDir,
            GS_COVERAGE_CLI_ENTRY: join(SRC_INST_DIR, "cli", "src", "index.ts"),
          }
        : process.env

      const argv = ["bun", "test", "--preload", "@opentui/solid/preload"]
      if (instrument) argv.push("--preload", preload)
      argv.push(testFile)

      const proc = Bun.spawn(argv, {
        cwd: instrument ? RUNTIME_ROOT : ROOT,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "inherit",
        env,
      })

      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        proc.kill()
      }, timeoutMs)

      const [stdout, stderr, exitCode] = await Promise.all([
        readStream(proc.stdout),
        readStream(proc.stderr),
        proc.exited,
      ])
      clearTimeout(timeout)

      const nextStderr =
        timedOut && exitCode !== 0 ? `${stderr}\nTimed out after ${timeoutMs}ms: ${relPath}\n` : stderr
      const completed = { file: relPath, exitCode, stdout, stderr: nextStderr, shardDir }
      console.log(`\n--- [coverage:${label}] ${relPath} ---`)
      if (!instrument) {
        console.log("(executed without instrumentation: package module mocks require original module identity)")
      }
      if (stdout.length > 0) process.stdout.write(stdout)
      if (nextStderr.length > 0) process.stderr.write(nextStderr)
      return completed
    },
  })

  const failures = result.results.filter((entry) => entry.exitCode !== 0)
  const failureSummary = summarizeFailures(failures)
  if (failureSummary.length > 0) {
    console.log(failureSummary)
  }

  return {
    passed: result.passed,
    failed: result.failed,
    mergeableShardDirs: mergeableShardDirs(
      result.results as Array<{ exitCode: number; shardDir?: string }>
    ),
  }
}

function shardNameForFile(relPath: string): string {
  return relPath.replace(/[^A-Za-z0-9._-]+/g, "__")
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    return ""
  }
  return await new Response(stream).text()
}

function collectShardFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (lstatSync(path).isDirectory()) {
      files.push(...collectShardFiles(path))
    } else if (name.endsWith(".json")) {
      files.push(path)
    }
  }
  return files
}

export function mergeableShardDirs(
  results: Array<{ exitCode: number; shardDir?: string }>
): string[] {
  return results
    .filter((entry) => entry.exitCode === 0 && entry.shardDir)
    .map((entry) => entry.shardDir as string)
}

export function readShardData(shardDirs: string[] = [SHARDS_DIR]): unknown[] {
  if (shardDirs.length === 0) return []

  const shards: unknown[] = []
  for (const dir of shardDirs) {
    if (!existsSync(dir)) continue
    for (const shardPath of collectShardFiles(dir)) {
      try {
        shards.push(JSON.parse(readFileSync(shardPath, "utf8")))
      } catch (err) {
        console.warn(`Skipping malformed coverage shard ${relative(ROOT, shardPath)}:`, err)
      }
    }
  }
  return shards
}

export function shouldPreserveCoverageWorkdirs(options: {
  keepWorkdir: boolean
  hadFailure: boolean
}): boolean {
  return options.keepWorkdir || options.hadFailure
}

export function cleanupCoverageWorkdirs(options: { keepWorkdir: boolean; hadFailure: boolean }): void {
  cleanupCoveragePaths([SRC_INST_DIR, RUNTIME_ROOT, SHARDS_DIR, BLANK_TEMPLATES_PATH], options)
}

export function cleanupCoveragePaths(
  paths: string[],
  options: { keepWorkdir: boolean; hadFailure: boolean }
): void {
  if (shouldPreserveCoverageWorkdirs(options)) return
  for (const path of paths) {
    rmSync(path, { recursive: true, force: true })
  }
}

function mergeAndReport(shardDirs?: string[]): void {
  const map = libCoverage.createCoverageMap({})
  const blankTemplates = JSON.parse(readFileSync(BLANK_TEMPLATES_PATH, "utf8")) as Record<
    string,
    unknown
  >
  const allowedFiles = new Set(Object.keys(blankTemplates))

  for (const shard of readShardData(shardDirs)) {
    const shardMap = libCoverage.createCoverageMap(shard)
    const filteredShard: Record<string, unknown> = {}
    for (const filePath of shardMap.files()) {
      if (allowedFiles.has(filePath)) {
        filteredShard[filePath] = shardMap.fileCoverageFor(filePath).toJSON()
      }
    }
    map.merge(filteredShard)
  }

  for (const [filePath, template] of Object.entries(blankTemplates)) {
    if (!map.data[filePath]) {
      map.addFileCoverage(template)
    }
  }

  const context = libReport.createContext({
    dir: COVERAGE_DIR,
    coverageMap: map,
    defaultSummarizer: "nested",
  })

  reports.create("text").execute(context)
  reports.create("html").execute(context)
  reports.create("json").execute(context)
  reports.create("json-summary").execute(context)
  reports.create("lcovonly").execute(context)

  console.log(`Coverage reports written to .coverage/
  HTML:         .coverage/index.html
  JSON:         .coverage/coverage-final.json
  JSON Summary: .coverage/coverage-summary.json
  LCOV:         .coverage/lcov.info`)
}

function cleanWorkingDirs() {
  rmSync(RUNTIME_ROOT, { recursive: true, force: true })
  rmSync(SRC_INST_DIR, { recursive: true, force: true })
  rmSync(SHARDS_DIR, { recursive: true, force: true })
  rmSync(BLANK_TEMPLATES_PATH, { force: true })
  mkdirSync(RUNTIME_ROOT, { recursive: true })
  mkdirSync(SRC_INST_DIR, { recursive: true })
  mkdirSync(SHARDS_DIR, { recursive: true })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  cleanWorkingDirs()

  console.log("Phase 1: Instrumenting source...")
  const instrumentedCount = instrumentSourceTree()
  prepareRuntimeRoot()
  console.log(`Instrumented ${instrumentedCount} source files.`)

  console.log("\nPhase 2: Running tests...")
  const classified = classifyFiles()
  const unit = applyFilters(classified.unit, options.filters)
  const integ = applyFilters(classified.integ, options.filters)
  const unitResult = options.runUnitMode ? await runTests("unit", unit, options.timeoutMs) : null
  const integResult = options.runIntegMode
    ? await runTests("integ", integ, options.timeoutMs, options.workers)
    : null

  console.log("\nPhase 3: Generating reports...")
  mergeAndReport([
    ...(unitResult?.mergeableShardDirs ?? []),
    ...(integResult?.mergeableShardDirs ?? []),
  ])

  console.log("\n=== Coverage Test Results ===")
  if (unitResult) {
    console.log(`Unit tests:        ${unitResult.passed}/${unitResult.passed + unitResult.failed} passed${unitResult.failed > 0 ? " (FAIL)" : ""}`)
  }
  if (integResult) {
    console.log(`Integration tests: ${integResult.passed}/${integResult.passed + integResult.failed} passed${integResult.failed > 0 ? " (FAIL)" : ""}`)
  }

  const allPassed =
    (!unitResult || unitResult.failed === 0) && (!integResult || integResult.failed === 0)
  cleanupCoverageWorkdirs({ keepWorkdir: options.keepWorkdir, hadFailure: !allPassed })
  process.exit(allPassed ? 0 : 1)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Coverage runner error:", err)
    process.exit(1)
  })
}
