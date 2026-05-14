import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { collectVerifyGateReport, formatVerifyGateReport } from "../../scripts/verify-gates"
import type { E2EInventoryItem } from "../e2e-inventory"

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "verify-gates-test-"))
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

function writeCoverageArtifacts(
  root: string,
  coverageFinal: Record<string, unknown> = {
    "src/index.ts": coverageEntry("src/index.ts"),
    "src/lib/messages.ts": coverageEntry("src/lib/messages.ts"),
    "src/tui/dashboard/ActionMenu.tsx": coverageEntry("src/tui/dashboard/ActionMenu.tsx"),
  }
): void {
  const coverageDir = join(root, ".coverage")
  mkdirSync(coverageDir, { recursive: true })
  writeFileSync(join(coverageDir, "coverage-final.json"), JSON.stringify(coverageFinal))
  writeFileSync(
    join(coverageDir, "coverage-summary.json"),
    JSON.stringify({ total: { statements: { total: 1, covered: 1, skipped: 0, pct: 100 } } })
  )
  writeFileSync(join(coverageDir, "lcov.info"), "TN:\nSF:src/index.ts\nend_of_record\n")
}

function writeTest(root: string, path: string): void {
  const target = join(root, path)
  mkdirSync(join(target, ".."), { recursive: true })
  writeFileSync(target, "test placeholder\n")
}

function item(overrides: Partial<E2EInventoryItem> = {}): E2EInventoryItem {
  return {
    id: "workspace.new",
    family: "workspace",
    flowType: "command",
    title: "Workspace new",
    commands: ["new"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/new.test.ts"],
    rationale: "Synthetic verify-gates fixture.",
    ...overrides,
  }
}

describe("verify gate collector", () => {
  test("reports every live in-scope command missing from the canonical inventory", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root)
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new", "unmapped-one", "unmapped-two"],
      inventory: [item()],
    })

    expect(report.ok).toBe(false)
    expect(report.inventoryDrift.missingFromInventory).toEqual(["unmapped-one", "unmapped-two"])
    expect(formatVerifyGateReport(report)).toContain("unmapped-one")
    expect(formatVerifyGateReport(report)).toContain("unmapped-two")
  })

  test("reports all unmapped in-scope items and missing mapped test files together", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root)
    writeTest(root, "tests/commands/existing.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new", "status", "run"],
      inventory: [
        item({ id: "workspace.new", commands: ["new"], mappedTests: ["tests/commands/existing.test.ts"] }),
        item({ id: "workspace.status", commands: ["status"], mappedTests: [] }),
        item({ id: "workspace.run", commands: ["run"], mappedTests: ["tests/commands/missing.test.ts"] }),
      ],
    })

    expect(report.ok).toBe(false)
    expect(report.unmappedInScopeItems).toEqual(["workspace.status"])
    expect(report.missingMappedTests).toEqual([
      { id: "workspace.run", path: "tests/commands/missing.test.ts" },
    ])
  })

  test("reports every missing or invalid coverage artifact in the same run", () => {
    const root = makeRoot()
    writeTest(root, "tests/commands/new.test.ts")
    const coverageDir = join(root, ".coverage")
    mkdirSync(coverageDir, { recursive: true })
    writeFileSync(join(coverageDir, "coverage-final.json"), "{not json")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
    })

    expect(report.ok).toBe(false)
    expect(report.coverageArtifacts).toEqual([
      { path: ".coverage/coverage-final.json", problem: "invalid JSON" },
      { path: ".coverage/coverage-summary.json", problem: "missing" },
      { path: ".coverage/lcov.info", problem: "missing" },
    ])
  })

  test("passes with valid inventory mappings and coverage artifacts without threshold checks", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root)
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
    })

    expect(report).toMatchObject({
      ok: true,
      inventoryDrift: { missingFromInventory: [] },
      unmappedInScopeItems: [],
      missingMappedTests: [],
      coverageArtifacts: [],
      coverageSentinels: [],
    })
  })

  test("reports zero-hit regular TypeScript coverage sentinel", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root, {
      "src/lib/messages.ts": coverageEntry("src/lib/messages.ts", 0),
      "src/tui/dashboard/ActionMenu.tsx": coverageEntry("src/tui/dashboard/ActionMenu.tsx"),
    })
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
    })

    expect(report.ok).toBe(false)
    expect(report.coverageSentinels).toEqual([
      { path: "src/lib/messages.ts", problem: "zero hits" },
    ])
    expect(formatVerifyGateReport(report)).toContain("Coverage sentinel problems:")
  })

  test("reports zero-hit TUI TSX coverage sentinel", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root, {
      "src/lib/messages.ts": coverageEntry("src/lib/messages.ts"),
      "src/tui/dashboard/ActionMenu.tsx": coverageEntry("src/tui/dashboard/ActionMenu.tsx", 0),
    })
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
    })

    expect(report.ok).toBe(false)
    expect(report.coverageSentinels).toEqual([
      { path: "src/tui/dashboard/ActionMenu.tsx", problem: "zero hits" },
    ])
  })

  test("reports missing sentinels and aggregates artifact problems", () => {
    const root = makeRoot()
    const coverageDir = join(root, ".coverage")
    mkdirSync(coverageDir, { recursive: true })
    writeFileSync(
      join(coverageDir, "coverage-final.json"),
      JSON.stringify({ "src/lib/messages.ts": coverageEntry("src/lib/messages.ts", 0) })
    )
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
    })

    expect(report.ok).toBe(false)
    expect(report.coverageArtifacts).toEqual([
      { path: ".coverage/coverage-summary.json", problem: "missing" },
      { path: ".coverage/lcov.info", problem: "missing" },
    ])
    expect(report.coverageSentinels).toEqual([
      { path: "src/lib/messages.ts", problem: "zero hits" },
      { path: "src/tui/dashboard/ActionMenu.tsx", problem: "missing" },
    ])
  })

  test("reports coverage entries outside the canonical source tree", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root, {
      "/tmp/istanbul-smoke-fixture/instrumented/src/commands/completion.ts": coverageEntry(
        "/tmp/istanbul-smoke-fixture/instrumented/src/commands/completion.ts"
      ),
      "src/lib/messages.ts": coverageEntry("src/lib/messages.ts"),
      "src/tui/dashboard/ActionMenu.tsx": coverageEntry("src/tui/dashboard/ActionMenu.tsx"),
    })
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
    })

    expect(report.ok).toBe(false)
    expect(report.coverageSentinels).toEqual([
      {
        path: "/tmp/istanbul-smoke-fixture/instrumented/src/commands/completion.ts",
        problem: "outside source tree",
      },
    ])
    expect(formatVerifyGateReport(report)).toContain("outside source tree")
  })
})
