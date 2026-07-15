import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  collectFunctionalCoverageReadiness,
  formatFunctionalCoverageReadiness,
} from "../../scripts/functional-coverage-readiness"
import type { FunctionalReadinessArea } from "../functional-readiness-inventory"

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "functional-readiness-test-"))
  tempRoots.push(root)
  return root
}

function coverageEntry(path: string, hits = 1): Record<string, unknown> {
  return {
    path,
    statementMap: {},
    fnMap: {},
    s: { "0": hits },
    f: { "0": hits },
  }
}

function writeCoverage(root: string, coverage: Record<string, unknown>): void {
  const coverageDir = join(root, ".coverage")
  mkdirSync(coverageDir, { recursive: true })
  writeFileSync(join(coverageDir, "coverage-final.json"), JSON.stringify(coverage))
}

function area(overrides: Partial<FunctionalReadinessArea> = {}): FunctionalReadinessArea {
  return {
    id: "phase85.core",
    phase: "85",
    title: "Phase 85 core real-fixture coverage",
    category: "covered",
    sourceTargets: ["packages/core/src/git.ts", "packages/core/src/config.ts"],
    rationale: "Synthetic readiness fixture.",
    ...overrides,
  }
}

describe("functional coverage readiness", () => {
  test("passes covered required areas when every source target has statement or function hits", () => {
    const root = makeRoot()
    writeCoverage(root, {
      "packages/core/src/git.ts": coverageEntry("packages/core/src/git.ts"),
      "packages/core/src/config.ts": coverageEntry("packages/core/src/config.ts"),
    })

    const report = collectFunctionalCoverageReadiness({
      root,
      areas: [area()],
    })

    expect(report.ok).toBe(true)
    expect(report.groups.covered.map((item) => item.id)).toEqual(["phase85.core"])
    expect(report.mustFix).toEqual([])
    expect(report.problems).toEqual([])
  })

  test("returns required areas with zero or missing hits as must-fix-before-release", () => {
    const root = makeRoot()
    writeCoverage(root, {
      "packages/core/src/git.ts": coverageEntry("packages/core/src/git.ts", 0),
    })

    const report = collectFunctionalCoverageReadiness({
      root,
      areas: [area()],
    })

    expect(report.ok).toBe(false)
    expect(report.mustFix).toEqual([
      {
        id: "phase85.core",
        title: "Phase 85 core real-fixture coverage",
        missingTargets: ["packages/core/src/config.ts"],
        zeroHitTargets: ["packages/core/src/git.ts"],
      },
    ])
    expect(formatFunctionalCoverageReadiness(report)).toContain("must-fix-before-release")
  })

  test("keeps accepted and deferred gaps visible without failing readiness", () => {
    const root = makeRoot()
    writeCoverage(root, {})

    const report = collectFunctionalCoverageReadiness({
      root,
      areas: [
        area({
          id: "accepted.failure-matrix",
          category: "accepted-gap",
          sourceTargets: [],
          title: "Representative failure matrix",
        }),
        area({
          id: "deferred.live-forge",
          category: "deferred-external-environment",
          sourceTargets: [],
          title: "Live forge auth",
        }),
      ],
    })

    expect(report.ok).toBe(true)
    expect(report.groups["accepted-gap"].map((item) => item.id)).toEqual(["accepted.failure-matrix"])
    expect(report.groups["deferred-external-environment"].map((item) => item.id)).toEqual([
      "deferred.live-forge",
    ])
    const formatted = formatFunctionalCoverageReadiness(report)
    expect(formatted).toContain("accepted-gap")
    expect(formatted).toContain("deferred-external-environment")
  })

  test("reports malformed coverage input instead of throwing", () => {
    const root = makeRoot()
    const coverageDir = join(root, ".coverage")
    mkdirSync(coverageDir, { recursive: true })
    writeFileSync(join(coverageDir, "coverage-final.json"), "{not json")

    const report = collectFunctionalCoverageReadiness({
      root,
      areas: [area()],
    })

    expect(report.ok).toBe(false)
    expect(report.problems).toEqual([
      { path: ".coverage/coverage-final.json", problem: "invalid JSON" },
    ])
    expect(report.mustFix).toEqual([])
  })

  test("reports missing coverage input as actionable gate problem", () => {
    const root = makeRoot()

    const report = collectFunctionalCoverageReadiness({
      root,
      areas: [area()],
    })

    expect(report.ok).toBe(false)
    expect(report.problems).toEqual([
      { path: ".coverage/coverage-final.json", problem: "missing" },
    ])
    expect(formatFunctionalCoverageReadiness(report)).toContain("Run bun run coverage")
  })
})
