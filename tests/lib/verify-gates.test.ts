import { afterEach, describe, expect, test } from "@test/api"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join, relative } from "path"
import { tmpdir } from "os"
import { collectVerifyGateReport, formatVerifyGateReport } from "../../scripts/verify-gates"
import type { E2EInventoryItem } from "../e2e-inventory"
import { FUNCTIONAL_READINESS_AREAS } from "../functional-readiness-inventory"
import type { CompletionCoverageReport } from "../../packages/cli/src/lib/completion-audit"

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
    "packages/cli/src/index.ts": coverageEntry("packages/cli/src/index.ts"),
    "packages/client/src/signal-state.ts": coverageEntry("packages/client/src/signal-state.ts"),
    "packages/service/src/web/terminal-manager.ts": coverageEntry("packages/service/src/web/terminal-manager.ts"),
    ...Object.fromEntries(
      FUNCTIONAL_READINESS_AREAS.flatMap((area) => area.sourceTargets).map((path) => [
        path,
        coverageEntry(path),
      ])
    ),
  }
): void {
  const coverageDir = join(root, ".coverage")
  mkdirSync(coverageDir, { recursive: true })
  writeFileSync(join(coverageDir, "coverage-final.json"), JSON.stringify(coverageFinal))
  writeFileSync(
    join(coverageDir, "coverage-summary.json"),
    JSON.stringify({ total: { statements: { total: 1, covered: 1, skipped: 0, pct: 100 } } })
  )
  writeFileSync(join(coverageDir, "lcov.info"), "TN:\nSF:packages/cli/src/index.ts\nend_of_record\n")
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

function completionCoverage(
  missing: Partial<Record<"bash" | "zsh" | "fish", string[]>> = {}
): CompletionCoverageReport {
  const paths = ["new", "files status"]
  const shells = {
    bash: { shell: "bash" as const, checkedPaths: paths, missingPaths: missing.bash ?? [] },
    zsh: { shell: "zsh" as const, checkedPaths: paths, missingPaths: missing.zsh ?? [] },
    fish: { shell: "fish" as const, checkedPaths: paths, missingPaths: missing.fish ?? [] },
  }
  return {
    ok: Object.values(shells).every((report) => report.missingPaths.length === 0),
    paths,
    shells,
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
      completionCoverage: completionCoverage(),
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
      completionCoverage: completionCoverage(),
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
      completionCoverage: completionCoverage(),
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
      completionCoverage: completionCoverage(),
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
      "packages/client/src/signal-state.ts": coverageEntry("packages/client/src/signal-state.ts", 0),
      "packages/service/src/web/terminal-manager.ts": coverageEntry("packages/service/src/web/terminal-manager.ts"),
    })
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
      completionCoverage: completionCoverage(),
    })

    expect(report.ok).toBe(false)
    expect(report.coverageSentinels).toEqual([
      { path: "packages/client/src/signal-state.ts", problem: "zero hits" },
    ])
    expect(formatVerifyGateReport(report)).toContain("Coverage sentinel problems:")
  })

  test("reports zero-hit service coverage sentinel", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root, {
      "packages/client/src/signal-state.ts": coverageEntry("packages/client/src/signal-state.ts"),
      "packages/service/src/web/terminal-manager.ts": coverageEntry("packages/service/src/web/terminal-manager.ts", 0),
    })
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
      completionCoverage: completionCoverage(),
    })

    expect(report.ok).toBe(false)
    expect(report.coverageSentinels).toEqual([
      { path: "packages/service/src/web/terminal-manager.ts", problem: "zero hits" },
    ])
  })

  test("reports missing sentinels and aggregates artifact problems", () => {
    const root = makeRoot()
    const coverageDir = join(root, ".coverage")
    mkdirSync(coverageDir, { recursive: true })
    writeFileSync(
      join(coverageDir, "coverage-final.json"),
      JSON.stringify({ "packages/client/src/signal-state.ts": coverageEntry("packages/client/src/signal-state.ts", 0) })
    )
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
      completionCoverage: completionCoverage(),
    })

    expect(report.ok).toBe(false)
    expect(report.coverageArtifacts).toEqual([
      { path: ".coverage/coverage-summary.json", problem: "missing" },
      { path: ".coverage/lcov.info", problem: "missing" },
    ])
    expect(report.coverageSentinels).toEqual([
      { path: "packages/client/src/signal-state.ts", problem: "zero hits" },
      { path: "packages/service/src/web/terminal-manager.ts", problem: "missing" },
    ])
  })

  test("reports coverage entries outside the canonical source tree", () => {
    const root = makeRoot()
    const externalFixture = join(tmpdir(), "external-coverage-fixture", "packages/cli/src/commands/completion.ts")
    writeCoverageArtifacts(root, {
      [externalFixture]: coverageEntry(externalFixture),
      "packages/client/src/signal-state.ts": coverageEntry("packages/client/src/signal-state.ts"),
      "packages/service/src/web/terminal-manager.ts": coverageEntry("packages/service/src/web/terminal-manager.ts"),
    })
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
      completionCoverage: completionCoverage(),
    })

    expect(report.ok).toBe(false)
    expect(report.coverageSentinels).toEqual([
      {
        path: relative(root, externalFixture),
        problem: "outside source tree",
      },
    ])
    expect(formatVerifyGateReport(report)).toContain("outside source tree")
  })

  test("aggregates functional readiness must-fix findings with existing gate findings", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root, {
      "packages/client/src/signal-state.ts": coverageEntry("packages/client/src/signal-state.ts"),
      "packages/service/src/web/terminal-manager.ts": coverageEntry("packages/service/src/web/terminal-manager.ts"),
      "packages/core/src/git.ts": coverageEntry("packages/core/src/git.ts", 0),
    })

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new", "unmapped"],
      inventory: [item()],
      completionCoverage: completionCoverage(),
    })

    expect(report.ok).toBe(false)
    expect(report.inventoryDrift.missingFromInventory).toEqual(["unmapped"])
    expect(report.functionalReadiness.mustFix).toContainEqual({
      id: "phase85.core-real-fixtures",
      title: "Core real-fixture workspace, git, lifecycle, files, env, secrets, ports, and config coverage",
      missingTargets: [
        "packages/core/src/workspace-lifecycle.ts",
        "packages/core/src/workspace-git.ts",
        "packages/core/src/lifecycle.ts",
        "packages/core/src/files.ts",
        "packages/core/src/env.ts",
        "packages/core/src/secrets.ts",
        "packages/core/src/ports.ts",
        "packages/core/src/config.ts",
      ],
      zeroHitTargets: ["packages/core/src/git.ts"],
    })
    expect(formatVerifyGateReport(report)).toContain("Functional readiness problems:")
  })

  test("keeps accepted and deferred functional readiness items visible without failing gates", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root, {
      "packages/client/src/signal-state.ts": coverageEntry("packages/client/src/signal-state.ts"),
      "packages/service/src/web/terminal-manager.ts": coverageEntry("packages/service/src/web/terminal-manager.ts"),
      "packages/core/src/git.ts": coverageEntry("packages/core/src/git.ts"),
    })
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
      completionCoverage: completionCoverage(),
      functionalReadinessAreas: [
        {
          id: "accepted.failure-matrix",
          phase: "88",
          title: "Representative failure matrix",
          category: "accepted-gap",
          sourceTargets: [],
          rationale: "Synthetic accepted gap.",
        },
        {
          id: "deferred.live-forge",
          phase: "88",
          title: "Live forge auth",
          category: "deferred-external-environment",
          sourceTargets: [],
          rationale: "Synthetic deferred gap.",
        },
      ],
    })

    expect(report.ok).toBe(true)
    expect(report.functionalReadiness.groups["accepted-gap"].map((area) => area.id)).toEqual([
      "accepted.failure-matrix",
    ])
    expect(report.functionalReadiness.groups["deferred-external-environment"].map((area) => area.id)).toEqual([
      "deferred.live-forge",
    ])
  })

  test("reports completion drift per shell and aggregates with existing findings", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root)
    writeTest(root, "tests/commands/new.test.ts")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new", "unmapped"],
      inventory: [item()],
      completionCoverage: completionCoverage({
        bash: ["files status"],
        zsh: ["command run"],
        fish: ["notes add"],
      }),
    })

    expect(report.ok).toBe(false)
    expect(report.inventoryDrift.missingFromInventory).toEqual(["unmapped"])
    expect(report.completionCoverage.shells.bash.missingPaths).toEqual(["files status"])
    const formatted = formatVerifyGateReport(report)
    expect(formatted).toContain("Completion coverage drift:")
    expect(formatted).toContain("bash:")
    expect(formatted).toContain("files status")
    expect(formatted).toContain("zsh:")
    expect(formatted).toContain("command run")
    expect(formatted).toContain("fish:")
    expect(formatted).toContain("notes add")
  })

  test("blocks retired message and structured-attention transport symbols", () => {
    const root = makeRoot()
    writeCoverageArtifacts(root)
    writeTest(root, "tests/commands/new.test.ts")
    const sourceDir = join(root, "src")
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, "legacy.ts"), "const endpoint = '/v1/attention'\n")

    const report = collectVerifyGateReport({
      root,
      liveCommands: ["new"],
      inventory: [item()],
      completionCoverage: completionCoverage(),
    })

    expect(report.ok).toBe(false)
    expect(report.forbiddenLegacySymbols).toEqual([
      { path: "src/legacy.ts", line: 1, symbol: "/v1/attention" },
    ])
    expect(formatVerifyGateReport(report)).toContain("Forbidden legacy signal/message symbols:")
  })
})
