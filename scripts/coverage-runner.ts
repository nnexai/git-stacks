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

const require = createRequire(import.meta.url)
const libCoverage = require("istanbul-lib-coverage")
const libReport = require("istanbul-lib-report")
const reports = require("istanbul-reports")

const ROOT = join(import.meta.dir, "..")
const TESTS_DIR = join(ROOT, "tests")
const COVERAGE_DIR = join(ROOT, ".coverage")
const RUNTIME_ROOT = join(COVERAGE_DIR, "runtime-root")
const RUNTIME_TESTS_DIR = join(RUNTIME_ROOT, "tests")
const SRC_INST_DIR = join(RUNTIME_ROOT, "src")
const SHARDS_DIR = join(COVERAGE_DIR, "shards")
const BLANK_TEMPLATES_PATH = join(COVERAGE_DIR, "blank-templates.json")
const KEEP_WORKDIR = process.env.GS_COVERAGE_KEEP_WORKDIR === "1"

type TestResult = { passed: number; failed: number }
type CoverageOptions = {
  runUnitMode: boolean
  runIntegMode: boolean
  filters: string[]
  timeoutMs: number
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
  const modeSpecified = args.includes("--unit") || args.includes("--integ")
  const runUnitMode = args.includes("--unit") || !modeSpecified
  const runIntegMode = args.includes("--integ") || !modeSpecified
  const timeoutArg = args.find((arg) => arg.startsWith("--timeout-ms="))
  const timeoutMs = timeoutArg ? Number(timeoutArg.split("=")[1]) : 60_000
  const filters = args.filter((arg) => !arg.startsWith("--"))

  return {
    runUnitMode,
    runIntegMode,
    filters,
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

function instrumentSourceTree(): number {
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  const blankTemplates: Record<string, unknown> = {}
  let count = 0

  for (const rel of glob.scanSync({ cwd: join(ROOT, "src"), onlyFiles: true })) {
    const absPath = join(ROOT, "src", rel)
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

  appendFileSync(
    join(SRC_INST_DIR, "index.ts"),
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
  for (const path of ["package.json", "tsconfig.json", "bunfig.toml", "bun.lock", ".gitignore"]) {
    copyIfExists(path)
  }
  symlinkIfExists("node_modules")
  symlinkIfExists("scripts")
}

async function runTests(
  label: "unit" | "integ",
  files: string[],
  timeoutMs: number
): Promise<TestResult> {
  if (files.length === 0) {
    console.log(`No ${label} test files found.`)
    return { passed: 0, failed: 0 }
  }

  console.log(`\n=== Coverage: ${label === "unit" ? "Unit" : "Integration"} Tests (${files.length} files, isolated processes) ===`)

  let passed = 0
  let failed = 0
  const preload = join(ROOT, "scripts", "coverage-preload.ts")
  const env = {
    ...process.env,
    GS_COVERAGE_ROOT: RUNTIME_ROOT,
    GS_COVERAGE_SRC_INST: SRC_INST_DIR,
    GS_COVERAGE_SHARD_DIR: SHARDS_DIR,
    GS_COVERAGE_CLI_ENTRY: join(SRC_INST_DIR, "index.ts"),
  }

  for (const file of files) {
    const relPath = relative(ROOT, file)
    const runtimeFile = join(RUNTIME_ROOT, relPath)
    console.log(`\n--- [coverage:${label}] ${relPath} ---`)

    const proc = Bun.spawn(
      ["bun", "test", "--preload", "@opentui/solid/preload", "--preload", preload, runtimeFile],
      {
        cwd: RUNTIME_ROOT,
        stdio: ["inherit", "inherit", "inherit"],
        env,
      }
    )

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      proc.kill()
    }, timeoutMs)

    const exitCode = await proc.exited
    clearTimeout(timeout)
    if (exitCode === 0) {
      passed++
    } else {
      if (timedOut) {
        console.error(`Timed out after ${timeoutMs}ms: ${relPath}`)
      }
      failed++
    }
  }

  return { passed, failed }
}

function readShardData(): unknown[] {
  if (!existsSync(SHARDS_DIR)) return []

  const shards: unknown[] = []
  for (const name of readdirSync(SHARDS_DIR)) {
    if (!name.endsWith(".json")) continue
    const shardPath = join(SHARDS_DIR, name)
    try {
      shards.push(JSON.parse(readFileSync(shardPath, "utf8")))
    } catch (err) {
      console.warn(`Skipping malformed coverage shard ${relative(ROOT, shardPath)}:`, err)
    }
  }
  return shards
}

function mergeAndReport(): void {
  const map = libCoverage.createCoverageMap({})
  const blankTemplates = JSON.parse(readFileSync(BLANK_TEMPLATES_PATH, "utf8")) as Record<
    string,
    unknown
  >
  const allowedFiles = new Set(Object.keys(blankTemplates))

  for (const shard of readShardData()) {
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
  const integResult = options.runIntegMode ? await runTests("integ", integ, options.timeoutMs) : null

  console.log("\nPhase 3: Generating reports...")
  mergeAndReport()

  if (!KEEP_WORKDIR) {
    rmSync(SRC_INST_DIR, { recursive: true, force: true })
    rmSync(RUNTIME_ROOT, { recursive: true, force: true })
    rmSync(SHARDS_DIR, { recursive: true, force: true })
    rmSync(BLANK_TEMPLATES_PATH, { force: true })
  }

  console.log("\n=== Coverage Test Results ===")
  if (unitResult) {
    console.log(`Unit tests:        ${unitResult.passed}/${unitResult.passed + unitResult.failed} passed${unitResult.failed > 0 ? " (FAIL)" : ""}`)
  }
  if (integResult) {
    console.log(`Integration tests: ${integResult.passed}/${integResult.passed + integResult.failed} passed${integResult.failed > 0 ? " (FAIL)" : ""}`)
  }

  const allPassed =
    (!unitResult || unitResult.failed === 0) && (!integResult || integResult.failed === 0)
  process.exit(allPassed ? 0 : 1)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Coverage runner error:", err)
    process.exit(1)
  })
}
