import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import {
  cleanupCoveragePaths,
  mergeableShardDirs,
  parseArgs,
  readShardData,
  shouldPreserveCoverageWorkdirs,
} from "../../scripts/coverage-runner"
import { DEFAULT_INTEGRATION_WORKERS } from "../../scripts/test-runner-core"
import { cleanup, makeTmpDir } from "../helpers"

describe("coverage runner parallel integration contract", () => {
  test("parses worker args and keeps mode selection stable", () => {
    expect(parseArgs([])).toMatchObject({
      runUnitMode: true,
      runIntegMode: true,
      workers: DEFAULT_INTEGRATION_WORKERS,
      keepWorkdir: false,
    })

    expect(parseArgs(["--integ", "--workers", "2"])).toMatchObject({
      runUnitMode: false,
      runIntegMode: true,
      workers: 2,
    })

    expect(parseArgs(["--unit", "tests/lib/service/signal-state.test.ts"])).toMatchObject({
      runUnitMode: true,
      runIntegMode: false,
      filters: ["tests/lib/service/signal-state.test.ts"],
      workers: DEFAULT_INTEGRATION_WORKERS,
    })
  })

  test("successful shard directories remain mergeable after one worker fails", () => {
    const baseDir = makeTmpDir("coverage-runner")
    try {
      const okShard = join(baseDir, "ok-shard")
      const failedShard = join(baseDir, "failed-shard")
      mkdirSync(okShard, { recursive: true })
      mkdirSync(failedShard, { recursive: true })
      writeFileSync(join(okShard, "coverage.json"), JSON.stringify({ "src/a.ts": { path: "src/a.ts" } }))
      writeFileSync(join(failedShard, "coverage.json"), JSON.stringify({ "src/b.ts": { path: "src/b.ts" } }))

      const mergeable = mergeableShardDirs([
        { exitCode: 0, shardDir: okShard },
        { exitCode: 1, shardDir: failedShard },
      ])

      expect(mergeable).toEqual([okShard])
      expect(readShardData(mergeable)).toEqual([{ "src/a.ts": { path: "src/a.ts" } }])
    } finally {
      cleanup(baseDir)
    }
  })

  test("cleanup removes worker dirs only on success without keep-workdir", () => {
    const baseDir = makeTmpDir("coverage-cleanup")
    const successDir = join(baseDir, "success")
    const failureDir = join(baseDir, "failure")
    const keptDir = join(baseDir, "kept")
    mkdirSync(successDir, { recursive: true })
    mkdirSync(failureDir, { recursive: true })
    mkdirSync(keptDir, { recursive: true })

    try {
      cleanupCoveragePaths([successDir], { keepWorkdir: false, hadFailure: false })
      cleanupCoveragePaths([failureDir], { keepWorkdir: false, hadFailure: true })
      cleanupCoveragePaths([keptDir], { keepWorkdir: true, hadFailure: false })

      expect(existsSync(successDir)).toBe(false)
      expect(existsSync(failureDir)).toBe(true)
      expect(existsSync(keptDir)).toBe(true)
      expect(shouldPreserveCoverageWorkdirs({ keepWorkdir: false, hadFailure: true })).toBe(true)
    } finally {
      cleanup(baseDir)
    }
  })
})
