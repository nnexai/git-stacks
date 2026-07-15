import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { parseArgs } from "../../scripts/coverage-runner"
import { DEFAULT_INTEGRATION_WORKERS } from "../../scripts/test-runner-core"

const root = join(import.meta.dir, "..", "..")

describe("Phase 83 coverage command surface", () => {
  test("package.json exposes the required coverage scripts", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts.coverage).toBe("bun run scripts/coverage-runner.ts")
    expect(pkg.scripts["coverage:unit"]).toBe("bun run scripts/coverage-runner.ts --unit")
    expect(pkg.scripts["coverage:integ"]).toBe("bun run scripts/coverage-runner.ts --integ")
  })

  test(".coverage artifacts stay local-only", () => {
    const gitignore = readFileSync(join(root, ".gitignore"), "utf8")
    expect(gitignore.split(/\r?\n/)).toContain(".coverage/")
  })

  test("coverage runner writes the required stable report names", () => {
    const runner = readFileSync(join(root, "scripts", "coverage-runner.ts"), "utf8")

    expect(runner).toContain("coverage-final.json")
    expect(runner).toContain("coverage-summary.json")
    expect(runner).toContain("lcov.info")
    expect(runner).toContain("index.html")
    expect(runner).toContain("--workers")
    expect(runner).toContain("--keep-workdir")
    expect(runner).toContain("istanbul-lib-instrument")
  })

  test("coverage runner executes tests from an instrumented runtime root", () => {
    const runner = readFileSync(join(root, "scripts", "coverage-runner.ts"), "utf8")
    const preload = readFileSync(join(root, "scripts", "coverage-preload.ts"), "utf8")

    expect(runner).toContain("runtime-root")
    expect(runner).toContain("cpSync(TESTS_DIR, RUNTIME_TESTS_DIR")
    expect(runner).toContain("cwd: instrument ? RUNTIME_ROOT : ROOT")
    expect(runner).toContain("GS_COVERAGE_ROOT: RUNTIME_ROOT")
    expect(runner).toContain("GS_COVERAGE_SHARD_DIR: shardDir")
    expect(preload).toContain("afterAll(writeCoverageShard)")
  })

  test("coverage runner filters merged shards to the instrumented source tree", () => {
    const runner = readFileSync(join(root, "scripts", "coverage-runner.ts"), "utf8")

    expect(runner).toContain("const allowedFiles = new Set(Object.keys(blankTemplates))")
    expect(runner).toContain("if (allowedFiles.has(filePath))")
    expect(runner).toContain("map.merge(filteredShard)")
  })

  test("coverage runner keeps default modes when positional filters are supplied", () => {
    expect(parseArgs(["tests/lib/service/signal-state.test.ts"])).toMatchObject({
      runUnitMode: true,
      runIntegMode: true,
      filters: ["tests/lib/service/signal-state.test.ts"],
      workers: DEFAULT_INTEGRATION_WORKERS,
    })

    expect(parseArgs(["--unit", "tests/lib/service/signal-state.test.ts"])).toMatchObject({
      runUnitMode: true,
      runIntegMode: false,
      filters: ["tests/lib/service/signal-state.test.ts"],
    })

    expect(parseArgs(["--integ", "tests/service/events.test.ts"])).toMatchObject({
      runUnitMode: false,
      runIntegMode: true,
      filters: ["tests/service/events.test.ts"],
    })

    expect(parseArgs(["--integ", "--workers", "1", "--keep-workdir"])).toMatchObject({
      runUnitMode: false,
      runIntegMode: true,
      workers: 1,
      keepWorkdir: true,
    })
  })
})
