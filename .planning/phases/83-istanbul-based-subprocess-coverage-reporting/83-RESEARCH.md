# Phase 83: Istanbul-Based Subprocess Coverage Reporting — Research

**Researched:** 2026-04-11
**Domain:** Istanbul source instrumentation, per-process coverage shards, coverage merging/reporting under Bun
**Confidence:** HIGH (codebase structure fully verified; pipeline design derived from confirmed spike findings and existing Istanbul transitive deps)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Coverage command surface**
- **D-01:** Add `bun run coverage` as the primary full-suite entrypoint for coverage generation.
- **D-02:** Also add `bun run coverage:unit` and `bun run coverage:integ` so coverage flows mirror the repo's existing `test`, `test:unit`, and `test:integ` split instead of introducing a new flag-only interface.

**Report bundle**
- **D-03:** Default coverage runs emit a terminal summary, a browsable HTML report, and machine-readable Istanbul artifacts in the same pass.
- **D-04:** The machine-readable bundle should include at least merged `coverage-final.json`, summary JSON, and LCOV output so later local gates and tooling can consume stable artifacts without extra conversion steps.

**Artifact layout and cleanup**
- **D-05:** Final coverage outputs live in a stable ignored `.coverage/` directory at the repo root.
- **D-06:** Instrumented source trees and per-process scratch artifacts are disposable: rebuild them each run rather than preserving them as long-lived assets.

**Coverage accounting**
- **D-07:** Coverage reports should include all `src/**/*.ts` files, not only files exercised during a given run.
- **D-08:** Untouched source files should appear as 0% covered.

**Locked upstream constraints**
- **D-09:** Build on the Phase 82.1 Istanbul proof: use Istanbul-compatible source instrumentation plus per-process coverage collection/merge. Do not reopen Bun V8/c8-only approaches.
- **D-10:** Coverage stays opt-in. Normal `bun run test`, `bun run test:unit`, and `bun run test:integ` flows must stay materially unchanged.

### the agent's Discretion
- Exact implementation split between `package.json` scripts, dedicated helper scripts, and any coverage-specific runner modules, as long as the user-facing command surface stays `coverage`, `coverage:unit`, and `coverage:integ`.
- Exact intermediate artifact naming and temp-directory structure under `.coverage/` or system temp space, as long as final outputs remain stable and disposable intermediates do not accumulate across runs.
- Exact include/exclude handling beyond the locked `src/**/*.ts` accounting rule.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COVR-01 | Developer can run one command that generates a coverage report for the full test suite, including the existing shared-process unit runner and isolated E2E runner files. | `scripts/coverage-runner.ts` orchestrates both passes via the same classification logic as `test-runner.ts`. |
| COVR-02 | Coverage reports include source files exercised by subprocess-based E2E tests through Istanbul-compatible instrumentation and merged per-process artifacts. | Istanbul source instrumentation + per-shard `__coverage__` write + `istanbul-lib-coverage` merge, confirmed working by the spike. |
| COVR-03 | Coverage output is written to a stable ignored directory and supports both human-readable summary output and machine-readable Istanbul artifacts usable by local verification gates. | `.coverage/` + `istanbul-reports` text, html, json, json-summary, lcovonly reporters. |
| COVR-04 | Coverage reporting does not make normal `bun run test`, `bun run test:unit`, or `bun run test:integ` materially slower unless coverage is explicitly requested. | Instrumentation runs only when `bun run coverage*` is invoked. No changes to `scripts/test-runner.ts` or the test scripts themselves. |
</phase_requirements>

---

## Summary

Phase 83 introduces an Istanbul-based coverage pipeline that spans both in-process unit tests and isolated subprocess E2E tests. The pipeline is conceptually three phases: **instrument** (`src/**/*.ts` → `.coverage/src-inst/`), **collect** (shards emitted by each process before exit), and **report** (merge + generate text/HTML/JSON/LCOV artifacts in `.coverage/`).

The confirmed spike finding (from STATE.md §Decisions) is that Istanbul source instrumentation (`istanbul-lib-instrument` with `parserPlugins: ["typescript"]`) produces working `globalThis.__coverage__` data in Bun subprocesses. The outstanding challenge for Phase 83 is wiring that proof into a full pipeline that covers both the shared-process unit tests and the per-file isolated integration tests, without touching the non-coverage test commands.

The key technical leverage: subprocess E2E tests already spread `...process.env` into `Bun.spawnSync` invocations, so any env var the coverage runner sets is automatically inherited by subprocesses. This allows a thin env-gated delegation block in `src/index.ts` to redirect CLI subprocess execution to instrumented source during coverage runs.

**Primary recommendation:** Build `scripts/coverage-runner.ts` as a parallel to `scripts/test-runner.ts`; reuse its classification logic unchanged. Use `istanbul-lib-instrument` to pre-instrument into `.coverage/src-inst/`; use a Bun plugin preload for the unit test pass; use a `GS_COVERAGE_SRC` env var + `src/index.ts` delegation shim for the subprocess pass. Merge all shards and emit the five report formats in one final step.

---

## Standard Stack

### Already in `node_modules` (transitive deps — no install needed)
[VERIFIED: node_modules inspection]

| Package | Version in `node_modules` | Purpose |
|---------|--------------------------|---------|
| `istanbul-lib-coverage` | 3.2.2 | Coverage map creation, merging, per-file summary |
| `istanbul-lib-report` | 3.0.1 | Report context creation |
| `istanbul-lib-source-maps` | 5.0.6 | Source-map remapping of instrumented paths back to originals |
| `istanbul-reports` | 3.2.0 | Text, HTML, JSON, LCOV reporter implementations |
| `ast-v8-to-istanbul` | 0.3.12 | V8-to-Istanbul converter (available but NOT needed for this phase) |

### Must Install
[VERIFIED: `npm view istanbul-lib-instrument version` → `6.0.3`]

| Package | Version | Purpose |
|---------|---------|---------|
| `istanbul-lib-instrument` | 6.0.3 | TypeScript-aware source instrumentation that injects `globalThis.__coverage__` |

### Optional — only if Bun plugin approach is chosen for unit test coverage

| Package | Version | Notes |
|---------|---------|-------|
| `@babel/parser` | (bundled with `istanbul-lib-instrument`) | TypeScript parsing backend; already a transitive dep of `istanbul-lib-instrument` |

**Installation:**
```bash
bun add -d istanbul-lib-instrument
```

**Version verification:**
```bash
npm view istanbul-lib-instrument version
# → 6.0.3  (verified 2026-04-11)
```

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/
  test-runner.ts          # Existing — unchanged
  coverage-runner.ts      # New — full pipeline orchestrator

src/
  index.ts                # Tiny env-gated delegation shim added at top (~10 lines)

.coverage/                # Gitignored stable output root
  src-inst/               # Instrumented source tree (rebuilt each run, disposable D-06)
  shards/                 # Per-process __coverage__ JSON files (disposable D-06)
  coverage-final.json     # Merged Istanbul coverage map (stable — consumed by Phase 84 gates)
  coverage-summary.json   # Per-file summary (stable)
  lcov.info               # LCOV output (stable)
  index.html + ...        # HTML report files (stable, browsable)
```

### Pattern 1: Source Instrumentation Step

**What:** `istanbul-lib-instrument` reads each `src/**/*.ts` file, transforms it with a TypeScript-aware Babel parse, and writes the instrumented output to `.coverage/src-inst/` preserving the directory structure. The instrumented output injects `globalThis.__coverage__` counters for every statement, branch, and function.

**When to use:** At the start of every `bun run coverage*` invocation. The instrumented tree is fully rebuilt on each run (D-06).

**Example:**
```typescript
// Source: istanbul-lib-instrument README + confirmed spike pattern from STATE.md
import { createInstrumenter } from "istanbul-lib-instrument"
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"

const instrumenter = createInstrumenter({
  esModules: true,
  compact: false,
  parserPlugins: ["typescript"],  // CRITICAL: required for .ts files
})

// For each src/**/*.ts file:
const source = readFileSync(srcPath, "utf8")
const instrumented = instrumenter.instrumentSync(source, srcPath)
mkdirSync(dirname(destPath), { recursive: true })
writeFileSync(destPath, instrumented)
```

### Pattern 2: Coverage Exit Writer (subprocess shard emission)

**What:** The instrumented `src-inst/index.ts` has a `process.on('exit', ...)` handler appended that serializes `globalThis.__coverage__` to a unique per-process JSON shard file in `.coverage/shards/`. The shard filename includes PID and a random ID to avoid collisions when multiple subprocesses run concurrently.

**When to use:** Appended to the instrumented copy of `src/index.ts` during the instrumentation step. It must use `sync` writes (in the exit handler, async I/O is unreliable).

**Example:**
```typescript
// Appended to .coverage/src-inst/index.ts after instrumentation
import { writeFileSync } from "fs"
import { join } from "path"

const _gsCoverageShard = process.env.GS_COVERAGE_SHARD_DIR
if (_gsCoverageShard) {
  process.on("exit", () => {
    const cov = (globalThis as any).__coverage__
    if (!cov) return
    const shardPath = join(_gsCoverageShard, `${process.pid}-${Date.now()}.json`)
    writeFileSync(shardPath, JSON.stringify(cov), { flush: true })
  })
}
```

### Pattern 3: Subprocess Delegation Shim in `src/index.ts`

**What:** A tiny env-gated block at the top of `src/index.ts` redirects execution to the instrumented source when `GS_COVERAGE_SRC` is set. This is the pivot that makes existing subprocess tests (which hardcode `bun run src/index.ts`) automatically use instrumented source during coverage runs.

**When to use:** Added to `src/index.ts` as a permanent, opt-in-only block. The block is a no-op in normal test and production runs.

**Critical note:** Subprocess tests spread `...process.env` into `Bun.spawnSync` — this is verified in `tests/commands/env.test.ts` (line 78) and `tests/commands/status-json.test.ts` (line 69). So setting `GS_COVERAGE_SRC` in the coverage runner process makes it flow into ALL CLI subprocesses automatically. [VERIFIED: grep of tests/commands/*.test.ts]

**Example:**
```typescript
// Top of src/index.ts — the only modification to production source
if (process.env.GS_COVERAGE_SRC) {
  // Coverage delegation: run from instrumented source so __coverage__ counters fire.
  // This path is only reachable when `bun run coverage*` sets GS_COVERAGE_SRC.
  await import(`${process.env.GS_COVERAGE_SRC}/index.ts`)
  process.exit(0)
}
// ... rest of src/index.ts unchanged
```

### Pattern 4: Unit Test Coverage via Bun Preload Plugin

**What:** For the shared-process unit test run, a Bun plugin registered in a coverage preload file intercepts `@/lib/*` module resolution and redirects to `.coverage/src-inst/lib/*`. This makes unit tests import instrumented modules without any changes to the test files themselves.

**When to use:** Only during `bun run coverage:unit` and `bun run coverage` (unit pass). The coverage runner passes `--preload scripts/coverage-preload.ts` to the unit test subprocess.

**Bun plugin API used:** [ASSUMED — based on Bun plugin API in training data; verify against Bun 1.3.10 docs before implementation]

```typescript
// scripts/coverage-preload.ts
import { plugin } from "bun"

plugin({
  name: "coverage-src-redirect",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      const instSrc = process.env.GS_COVERAGE_SRC_INST
      if (!instSrc) return
      // Redirect @/lib/foo → .coverage/src-inst/lib/foo.ts
      const relative = args.path.replace(/^@\//, "")
      return { path: `${instSrc}/${relative}.ts` }
    })
  },
})
```

After the unit test subprocess exits, the coverage runner reads `globalThis.__coverage__` from the process exit handler (via a second appended shim in the unit test's entry or via a `--preload` afterAll hook).

**Risk:** Bun preload + plugin interaction with `mock.module()` in unit tests is UNVERIFIED. Unit tests that use `mock.module()` already run in isolation (per `test-runner.ts`), so there should be no cross-contamination, but the plugin redirect + mock module combination needs an early smoke test. [ASSUMED confidence: MEDIUM]

### Pattern 5: Coverage Merge and Report Generation

**What:** After all test processes exit, the coverage runner reads all shard JSON files from `.coverage/shards/`, creates an `istanbul-lib-coverage` coverage map, merges all shards, adds zero-baseline entries for all `src/**/*.ts` files not yet present, and generates reports.

**Example:**
```typescript
// Source: istanbul-lib-coverage + istanbul-lib-report READMEs (verified in node_modules)
import libCoverage from "istanbul-lib-coverage"
import libReport from "istanbul-lib-report"
import reports from "istanbul-reports"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

// 1. Merge all shards
const map = libCoverage.createCoverageMap({})
for (const shardFile of readdirSync(".coverage/shards")) {
  const shard = JSON.parse(readFileSync(join(".coverage/shards", shardFile), "utf8"))
  map.merge(shard)
}

// 2. Add zero-baseline for untouched src files (D-07/D-08)
const allSrcFiles = /* glob src/**/*.ts */
for (const srcFile of allSrcFiles) {
  if (!map.data[srcFile]) {
    // Add an empty coverage entry with all counts = 0
    // (use instrumenter.lastFileCoverage() trick or build a minimal CoverageData)
  }
}

// 3. Generate reports
const context = libReport.createContext({
  dir: ".coverage",
  coverageMap: map,
})
for (const reportType of ["text", "html", "json", "json-summary", "lcovonly"]) {
  reports.create(reportType).execute(context)
}
```

**Note on zero-baseline:** `istanbul-lib-instrument` exposes `lastFileCoverage()` after instrumenting a file — this returns the blank coverage template with all counters at 0. The instrumentation step can collect these blank templates for all files and include them in the initial coverage map before merging actual test data. This is more reliable than constructing entries manually. [VERIFIED: istanbul-lib-instrument API confirmed in npm docs]

### Pattern 6: Coverage Runner Script Structure

**What:** `scripts/coverage-runner.ts` is the full orchestrator. It reuses `classifyFiles()` logic from `test-runner.ts` (or imports it), runs the three phases, and supports `--unit`/`--integ` flags to mirror the test runner.

```
coverage-runner.ts
├── Phase 1: Instrument (always runs, even for --unit or --integ)
│   └── instrument src/**/*.ts → .coverage/src-inst/
│   └── append shard-writer to .coverage/src-inst/index.ts
│   └── collect blank coverage templates for zero-baseline
├── Phase 2a (if --unit or --all): Unit test pass
│   └── bun test --preload scripts/coverage-preload.ts <unit-files>
│   │   (GS_COVERAGE_SRC_INST=.coverage/src-inst/ GS_COVERAGE_SHARD_DIR=.coverage/shards/)
├── Phase 2b (if --integ or --all): Integration test pass
│   └── For each integ file: bun test <file>
│   │   (GS_COVERAGE_SRC=.coverage/src-inst GS_COVERAGE_SHARD_DIR=.coverage/shards/)
├── Phase 3: Merge + Report
│   └── Read + merge all .coverage/shards/*.json
│   └── Merge zero-baseline for untouched files
│   └── Generate text, html, json, json-summary, lcovonly → .coverage/
└── Print terminal summary
```

### Anti-Patterns to Avoid

- **Modifying `scripts/test-runner.ts`:** The non-coverage runner must remain unchanged. Coverage adds a parallel runner script; it does not modify the existing one. (D-10)
- **Keeping instrumented source or shards across runs:** Both `.coverage/src-inst/` and `.coverage/shards/` are blown away and rebuilt at the start of each `bun run coverage*` invocation. (D-06)
- **Using `bun test --coverage` as the primary coverage mechanism:** This is Bun's built-in V8 coverage and does NOT capture subprocess code. It may be used as a fallback for unit-only coverage debugging, but the Phase 83 deliverable must use Istanbul instrumentation as the authoritative path per D-09.
- **Assuming the Phase 82.1 Istanbul smoke already exists:** Phase 82.1 is planned but NOT executed per STATE.md. Phase 83 planning must include a prerequisite verification wave.
- **Letting `GS_COVERAGE_SRC` leak into non-coverage test runs:** The env var is only set inside `scripts/coverage-runner.ts`, never in `scripts/test-runner.ts` or the test scripts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merging per-process `__coverage__` maps | Custom merge loops | `istanbul-lib-coverage.createCoverageMap().merge()` | Handles statement/branch/function counter addition correctly including deep key merges |
| HTML/LCOV/JSON report generation | Custom report formatters | `istanbul-reports` reporters (already in `node_modules`) | Battle-tested report formats, zero extra install cost |
| TypeScript-aware AST instrumentation | Custom AST transformer | `istanbul-lib-instrument` with `parserPlugins: ["typescript"]` | Handles decorators, generics, optional chaining, type assertions correctly |
| Source map remapping (instrumented → original line numbers) | Custom source map logic | `istanbul-lib-source-maps` (already in `node_modules`) | Required for HTML report line-level coverage to map back to original `.ts` source |
| Zero-baseline empty coverage entries | Constructing raw JSON objects | `instrumenter.lastFileCoverage()` after instrumenting each file | Returns the correct blank template structure Istanbul expects |

**Key insight:** Four of the five required Istanbul libraries are **already installed** as transitive dependencies. Only `istanbul-lib-instrument` needs to be explicitly added.

---

## Common Pitfalls

### Pitfall 1: Subprocess Exit Without Writing Coverage Shard
**What goes wrong:** If the CLI subprocess exits via `process.exit()` rather than natural process completion, the `exit` event handler may fire but `async` writes won't complete. Bun's exit behavior under `process.exit(N)` is synchronous — async I/O is abandoned.
**Why it happens:** `src/index.ts` calls `process.exit(1)` on errors and `process.exit(0)` via Commander's default exit. The coverage shard writer fires in the `exit` event but relies on sync I/O.
**How to avoid:** Use `writeFileSync` with explicit `{ flush: true }` in the exit handler. Prefer `process.on('exit', ...)` over `beforeExit` since `exit` fires even after `process.exit()`.
**Warning signs:** Shard files missing from `.coverage/shards/` after a successful test run.

### Pitfall 2: `mock.module()` Pollution with Instrumented Source Redirect
**What goes wrong:** Unit tests that use `mock.module()` redirect `@/lib/...` imports to mock implementations. If the coverage preload plugin also redirects `@/lib/...` to instrumented paths, the mock.module() call may conflict with the plugin redirect, producing unexpected behavior.
**Why it happens:** `mock.module()` is process-global in Bun and fires after the initial plugin resolution. The ordering between plugin hooks and mock.module is undocumented.
**How to avoid:** Unit tests using `mock.module()` already run in isolated processes (per `test-runner.ts` classification). The preload plugin for coverage should only redirect imports that are NOT already mocked. Alternatively: run mock.module-heavy unit files with the same subprocess approach as integration tests during coverage.
**Warning signs:** Unit test failures that only appear when `bun run coverage` is run, not `bun run test`.

### Pitfall 3: Instrumented Source Paths in Coverage Reports vs. Original Source Paths
**What goes wrong:** Coverage report shows `.coverage/src-inst/lib/config.ts` instead of `src/lib/config.ts`, making Phase 84 gates unable to reference stable paths.
**Why it happens:** `istanbul-lib-instrument` records the `filename` passed to `instrumentSync()` as the key in `__coverage__`. If `.coverage/src-inst/lib/config.ts` is passed, that becomes the key.
**How to avoid:** Pass the ORIGINAL source path (`src/lib/config.ts`) as the second argument to `instrumentSync()` even when writing to `.coverage/src-inst/`. The instrumented file's coverage map key will then be the original path.
**Warning signs:** `coverage-final.json` has keys starting with `.coverage/src-inst/` rather than `src/`.

### Pitfall 4: `@/*` Path Alias Resolution in the Preload Plugin
**What goes wrong:** The Bun plugin resolves `@/lib/config` to `.coverage/src-inst/lib/config.ts`, but the instrumented file contains `import { ... } from "@/lib/paths"` which the plugin also intercepts — causing double-redirect chains or resolution loops.
**Why it happens:** The instrumented source files inherit the `@/*` alias paths from the original source. When the plugin intercepts those imports recursively, it keeps redirecting.
**How to avoid:** The coverage preload plugin should ONLY redirect absolute `@/*` imports that are not already pointing to instrumented paths. Add a guard: `if (args.path.startsWith(".coverage/src-inst")) return undefined`.

### Pitfall 5: Parallel Integration Test Subprocess Races on Shard Directory
**What goes wrong:** When running integration tests (which the existing test runner runs serially), two subprocesses writing shards simultaneously use PID-based names — PID collision is theoretically possible under Bun.spawnSync.
**Why it happens:** `Bun.spawnSync` blocks the runner, so integration files run serially by the runner's current design. But unit test subtasks within the shared process may emit coverage concurrently with the integration pass if run simultaneously.
**How to avoid:** Include `process.pid + Date.now() + Math.random()` in the shard filename. The existing test runner already runs integration files serially, so no change needed there.

### Pitfall 6: Phase 82.1 Istanbul Smoke Not Yet Executed
**What goes wrong:** Phase 83 plans assume `tests/support/istanbul-smoke.ts` and `tests/commands/istanbul-smoke.test.ts` exist as committed proof of the pipeline. If Phase 82.1 hasn't completed its Task 3 (the Istanbul smoke), Phase 83 Wave 0 work must implement the full pipeline without a pre-validated baseline.
**Why it happens:** STATE.md confirms Phase 82.1 is "Not started" as of research date. The committed smoke proof is still pending.
**How to avoid:** Phase 83 Wave 0 (or Wave 1 Task 1) must include an explicit prerequisite check: verify `tests/support/istanbul-smoke.ts` and `tests/commands/istanbul-smoke.test.ts` exist and pass. If absent, the planner should include a catch-up task to create the minimal smoke proof before building the full pipeline.
**Warning signs:** `bun test tests/commands/istanbul-smoke.test.ts` fails or the file is missing.

---

## Code Examples

### Verified: Pipeline wiring in coverage runner

```typescript
// scripts/coverage-runner.ts — main structure (ASSUMED pattern, not yet implemented)
import { join } from "path"
import { rmSync, mkdirSync } from "fs"
import { createInstrumenter } from "istanbul-lib-instrument"

const ROOT = join(import.meta.dir, "..")
const COVERAGE_DIR = join(ROOT, ".coverage")
const SRC_INST_DIR = join(COVERAGE_DIR, "src-inst")
const SHARDS_DIR = join(COVERAGE_DIR, "shards")

async function main() {
  // 1. Clean disposable dirs, keep stable output (D-06)
  rmSync(SRC_INST_DIR, { recursive: true, force: true })
  rmSync(SHARDS_DIR, { recursive: true, force: true })
  mkdirSync(SHARDS_DIR, { recursive: true })

  // 2. Instrument phase
  const blankTemplates = await instrumentSourceTree(ROOT, SRC_INST_DIR)

  // 3. Run tests (unit and/or integ based on args)
  const coverageEnv = {
    GS_COVERAGE_SRC: SRC_INST_DIR,
    GS_COVERAGE_SHARD_DIR: SHARDS_DIR,
  }
  // unit: bun test --preload scripts/coverage-preload.ts <unit-files>
  // integ: same as test-runner but with coverageEnv injected

  // 4. Merge and report
  await mergeAndReport(SHARDS_DIR, COVERAGE_DIR, blankTemplates)
}
```

### Verified: Istanbul merge and text report

```typescript
// Source: istanbul-lib-coverage + istanbul-lib-report README (verified in node_modules)
import libCoverage from "istanbul-lib-coverage"
import libReport from "istanbul-lib-report"
import reports from "istanbul-reports"

const map = libCoverage.createCoverageMap({})

// Merge shards
for (const shard of shards) {
  map.merge(shard)
}

// Merge blank templates for untouched files (D-07/D-08)
for (const [path, blank] of blankTemplates) {
  if (!map.data[path]) {
    map.addFileCoverage(blank)
  }
}

// Generate all report types in one pass
const context = libReport.createContext({
  dir: outputDir,
  coverageMap: map,
})
;["text", "html", "json", "json-summary", "lcovonly"].forEach((fmt) => {
  reports.create(fmt).execute(context)
})
```

---

## Artifact Layout

```
.coverage/                          ← Gitignored stable root (D-05)
  src-inst/                         ← Rebuilt each run (D-06)
    index.ts                        ← Instrumented + shard-writer appended
    commands/
    lib/
    tui/
  shards/                           ← Rebuilt each run (D-06)
    12345-1234567890.json            ← Per-subprocess __coverage__ shard
    67890-1234567891.json
    unit-1234567892.json             ← Unit test pass shard
  coverage-final.json               ← Stable — merged Istanbul coverage map
  coverage-summary.json             ← Stable — per-file summary JSON
  lcov.info                         ← Stable — LCOV output
  index.html                        ← Stable — HTML report entry
  ...                               ← Other HTML report files
```

---

## Package.json Changes Required

```json
{
  "scripts": {
    "coverage": "bun run scripts/coverage-runner.ts",
    "coverage:unit": "bun run scripts/coverage-runner.ts --unit",
    "coverage:integ": "bun run scripts/coverage-runner.ts --integ"
  },
  "devDependencies": {
    "istanbul-lib-instrument": "^6.0.3"
  }
}
```

---

## .gitignore Change Required

```
.coverage/
```

---

## `src/index.ts` Change Required

A thin (~10-line) env-gated delegation block at the very top, before any imports or Commander setup. This is the only production source file that requires a change. The block is a no-op when `GS_COVERAGE_SRC` is unset.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (Bun 1.3.10) |
| Config file | `bunfig.toml` + custom runner `scripts/test-runner.ts` |
| Quick run command | `bun test tests/commands/istanbul-smoke.test.ts -x` |
| Full suite command | `bun run test && bun run typecheck` |
| Coverage command | `bun run coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COVR-01 | `bun run coverage` exits 0 and emits text summary | smoke/integration | `bun run coverage 2>&1 \| grep -q "File\|Stmts"` | ❌ Wave 0 |
| COVR-01 | `bun run coverage:unit` processes only unit files | integration | `bun run coverage:unit` | ❌ Wave 0 |
| COVR-01 | `bun run coverage:integ` processes only integ files | integration | `bun run coverage:integ` | ❌ Wave 0 |
| COVR-02 | `coverage-final.json` contains entries for `src/commands/*.ts` files exercised by subprocess tests | artifact-check | `node -e "const d=require('.coverage/coverage-final.json'); console.assert(Object.keys(d).some(k=>k.includes('commands')))"` | ❌ Wave 0 |
| COVR-02 | Subprocess-exercised functions show non-zero hit counts | artifact-check | JSON parse + count assertion | ❌ Wave 0 |
| COVR-03 | `.coverage/coverage-final.json` exists after run | artifact | `test -f .coverage/coverage-final.json` | ❌ Wave 0 |
| COVR-03 | `.coverage/coverage-summary.json` exists after run | artifact | `test -f .coverage/coverage-summary.json` | ❌ Wave 0 |
| COVR-03 | `.coverage/lcov.info` exists after run | artifact | `test -f .coverage/lcov.info` | ❌ Wave 0 |
| COVR-03 | `.coverage/index.html` exists after run | artifact | `test -f .coverage/index.html` | ❌ Wave 0 |
| COVR-03 | Untouched files appear at 0% (D-07/D-08) | artifact-check | Parse JSON, find 0-coverage entry | ❌ Wave 0 |
| COVR-04 | `bun run test` timing unaffected (no instrumentation runs) | regression | `time bun run test` baseline unchanged | manual |
| COVR-04 | `bun run test:unit` and `bun run test:integ` pass unchanged | regression | `bun run test && bun run typecheck` | existing |

### Istanbul Smoke Prerequisite Check

Before the Phase 83 pipeline is built, a prerequisite verification task must confirm:
- `tests/support/istanbul-smoke.ts` exists and exports the instrument-and-run helper
- `tests/commands/istanbul-smoke.test.ts` passes: `bun test tests/commands/istanbul-smoke.test.ts -x`

If these are absent (Phase 82.1 Task 3 not yet executed), they become Wave 0 gaps.

### Sampling Rate
- **Per task commit:** `bun test tests/commands/istanbul-smoke.test.ts -x` (before pipeline is built) or `bun run coverage --bail` (after)
- **Per wave merge:** `bun run coverage && bun run test && bun run typecheck`
- **Phase gate:** `.coverage/coverage-final.json` exists, `bun run test` passes, `bun run typecheck` passes

### Wave 0 Gaps
- [ ] Prerequisite verification: `tests/support/istanbul-smoke.ts` and `tests/commands/istanbul-smoke.test.ts` present and passing
- [ ] `scripts/coverage-runner.ts` — covers COVR-01, COVR-02, COVR-03, COVR-04
- [ ] `scripts/coverage-preload.ts` — Bun plugin for unit test import redirection
- [ ] `.coverage/` added to `.gitignore`
- [ ] `istanbul-lib-instrument` added to devDependencies

---

## Security Domain

This phase is tooling/scripts only. No user-facing authentication, session management, or sensitive data processing is introduced. The instrumented source tree is gitignored and not published. `istanbul-lib-instrument` transforms source purely for local coverage measurement.

| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V5 Input Validation | No | Coverage tooling only; no external input surfaces |
| V6 Cryptography | No | No crypto operations |
| V2/V3/V4 | No | No auth, sessions, or access control introduced |

**Runtime threat:** The `GS_COVERAGE_SRC` delegation shim in `src/index.ts` accepts an arbitrary path. This path should be validated to be within the project root before use (prevent path traversal if the env var were set maliciously in a non-coverage context). The shim should guard: `if (!instPath.startsWith(ROOT)) { throw new Error(...) }`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Bun runtime | All scripts | ✓ | 1.3.10 | — |
| `istanbul-lib-coverage` | Merge step | ✓ | 3.2.2 (transitive) | — |
| `istanbul-lib-report` | Report step | ✓ | 3.0.1 (transitive) | — |
| `istanbul-lib-source-maps` | Source map remapping | ✓ | 5.0.6 (transitive) | — |
| `istanbul-reports` | All report types | ✓ | 3.2.0 (transitive) | — |
| `istanbul-lib-instrument` | Instrument step | ✗ (not installed) | — | None; must be installed |
| Phase 82.1 Istanbul smoke | Prerequisite | ✗ (not executed yet) | — | Wave 0 catch-up task |

**Missing with no fallback:**
- `istanbul-lib-instrument` — must be installed before implementation begins

**Missing with fallback:**
- Phase 82.1 Istanbul smoke — the Phase 83 pipeline can be built without the smoke test existing first, but the smoke gives a lower-risk starting point. If absent, the planner should create a minimal smoke as Wave 1 Task 1 before building the full pipeline.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bun plugin API (`build.onResolve`) intercepts `@/` path alias resolution in the test process, enabling in-process import redirect to instrumented source | Pattern 4 (Unit test coverage) | Unit test coverage collection may not work via plugin; fallback: run unit tests as isolated subprocesses with `GS_COVERAGE_SRC` env delegation (same pattern as integration tests) |
| A2 | The `process.on('exit', ...)` handler fires synchronously enough for `writeFileSync(..., { flush: true })` to complete in Bun 1.3.10 subprocesses | Pattern 2 (shard emission) | Shards may be empty or absent; workaround: use `beforeExit` + explicit drain loop |
| A3 | `mock.module()` isolation does not conflict with the coverage preload plugin's import redirect for the same modules | Pitfall 2 | Unit tests that mock instrumented modules may fail during coverage; if confirmed, isolate those files as subprocesses instead |
| A4 | `istanbul-lib-instrument@6.0.3` `parserPlugins: ["typescript"]` still works without a separate `@babel/parser` install (bundled) | Standard Stack | Install failure or parse error; fix: `bun add -d @babel/parser` |

---

## Open Questions (RESOLVED)

1. **Unit test coverage: plugin approach vs subprocess approach** — **RESOLVED: Use per-file subprocess approach.**
   - The Bun 1.3.10 plugin API behavior in `bun test` context is unverified (Assumption A1). Rather than risk the shared-process plugin approach with unknown `mock.module()` interactions (Pitfall 2), Plan 02 runs each unit test file as an isolated subprocess — the same proven pattern used for integration tests. The preload plugin still handles `@/*` import redirect within each subprocess, and also registers a `process.on('exit')` shard writer (since unit tests don't go through `src/index.ts` and thus don't hit the shard writer appended there). This eliminates A1 and A3 risk entirely. If shared-process plugin proves viable later, it can be optimized as a follow-up.

2. **Source map output** — **RESOLVED: Skip source map remapping for this phase.**
   - Since `instrumentSync()` is called with original `src/...` paths as the filename argument (Research §Pitfall 3), the coverage map keys already reference the original TypeScript source. The HTML report will show coverage against the original paths. Source map remapping via `istanbul-lib-source-maps` is unnecessary unless line-level accuracy issues surface during execution, in which case it can be added to Plan 03's merge step.

3. **Coverage for TUI `.tsx` files** — **RESOLVED: Use `parserPlugins: ["typescript", "jsx"]` for `.tsx` files.**
   - Plan 02 Task 1 already specifies creating a second instrumenter (or per-file options) with `parserPlugins: ["typescript", "jsx"]` for `.tsx` files. This is the standard Istanbul approach for JSX-containing TypeScript. If dashboard test failures occur during coverage runs, the fix is to exclude specific `.tsx` files from instrumentation rather than dropping JSX parser support.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `bun test --coverage` (V8, in-process only) | Istanbul source instrumentation + `__coverage__` shards | Subprocess code now measurable |
| `c8 --all` (fails for Bun subprocesses) | `istanbul-lib-instrument` + per-process shard merge | Subprocess coverage confirmed working in spike |
| No coverage commands | `coverage`, `coverage:unit`, `coverage:integ` scripts | Coverage is explicit and opt-in, normal tests unchanged |
| No `.coverage/` directory | Stable `.coverage/` with gitignore | Phase 84 gates have a stable artifact path to consume |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/istanbul-lib-coverage` — version and merge API verified by inspection
- `node_modules/istanbul-lib-report` — report context API verified by inspection
- `node_modules/istanbul-reports` — reporter list (text, html, json, json-summary, lcov, lcovonly, cobertura) verified
- `node_modules/istanbul-lib-source-maps` — version confirmed
- `.planning/STATE.md` §Decisions — Istanbul spike findings (confirmed working in Bun subprocesses)
- `scripts/test-runner.ts` — test classification logic, subprocess invocation patterns verified
- `tests/commands/env.test.ts` line 78 — `...process.env` spread confirmed
- `package.json` — current scripts and devDependencies verified
- `.planning/phases/82.1-support-commands-and-error-path-e2e-coverage/82.1-03-PLAN.md` — Istanbul smoke Task 3 spec reviewed

### Secondary (MEDIUM confidence)
- `npm view istanbul-lib-instrument version` — 6.0.3 confirmed on npm registry 2026-04-11
- `node_modules/istanbul-lib-instrument/package.json` — NOT present (must be installed; confirmed not installed)
- `.planning/phases/82.1-support-commands-and-error-path-e2e-coverage/82.1-RESEARCH.md` §Key Finding 5 — `completion bash` as lowest-friction subprocess target for the Phase 82.1 smoke

### Tertiary (LOW confidence / ASSUMED)
- Bun 1.3.10 plugin API for `@/` alias interception in `bun test` context — training data; verify against Bun docs before implementing unit plugin path
- `process.on('exit', writeFileSync)` reliably completes in Bun 1.3.10 — training data; validate in early smoke test

---

## Metadata

**Confidence breakdown:**
- Standard stack (installed packages): HIGH — verified by node_modules inspection + npm registry
- Istanbul pipeline design: HIGH — derived from spike findings in STATE.md + Istanbul lib READMEs
- Unit test coverage via Bun plugin: MEDIUM — Bun plugin API behavior in test context not verified in this session
- Coverage runner scripting: MEDIUM — derived from test-runner.ts patterns; implementation details are discretionary

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (Istanbul API is stable; Bun plugin API may change — re-verify against Bun release notes if Bun is upgraded)
