#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  FUNCTIONAL_READINESS_AREAS,
  type FunctionalReadinessArea,
  type FunctionalReadinessCategory,
} from "../tests/functional-readiness-inventory"

type CoverageEntry = {
  s?: Record<string, number>
  f?: Record<string, number>
}

export type FunctionalCoverageInputProblem = {
  path: string
  problem: "missing" | "empty" | "invalid JSON" | "invalid shape"
}

export type FunctionalReadinessAreaResult = FunctionalReadinessArea & {
  statementHits: number
  functionHits: number
  missingTargets: string[]
  zeroHitTargets: string[]
}

export type FunctionalReadinessMustFix = {
  id: string
  title: string
  missingTargets: string[]
  zeroHitTargets: string[]
}

export type FunctionalCoverageReadinessReport = {
  ok: boolean
  coveragePath: string
  problems: FunctionalCoverageInputProblem[]
  groups: Record<FunctionalReadinessCategory, FunctionalReadinessAreaResult[]>
  mustFix: FunctionalReadinessMustFix[]
}

export type CollectFunctionalCoverageReadinessOptions = {
  root?: string
  coveragePath?: string
  areas?: readonly FunctionalReadinessArea[]
}

const ROOT = join(import.meta.dir, "..")
const DEFAULT_COVERAGE_PATH = ".coverage/coverage-final.json"
const CATEGORIES: readonly FunctionalReadinessCategory[] = [
  "covered",
  "accepted-gap",
  "deferred-external-environment",
  "must-fix-before-release",
] as const

function emptyGroups(): Record<FunctionalReadinessCategory, FunctionalReadinessAreaResult[]> {
  return {
    covered: [],
    "accepted-gap": [],
    "deferred-external-environment": [],
    "must-fix-before-release": [],
  }
}

function readCoverageMap(
  root: string,
  coveragePath: string
): { coverage: Record<string, CoverageEntry> | null; problems: FunctionalCoverageInputProblem[] } {
  const fullPath = join(root, coveragePath)
  if (!existsSync(fullPath)) {
    return { coverage: null, problems: [{ path: coveragePath, problem: "missing" }] }
  }

  const content = readFileSync(fullPath, "utf8")
  if (content.trim().length === 0) {
    return { coverage: null, problems: [{ path: coveragePath, problem: "empty" }] }
  }

  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { coverage: null, problems: [{ path: coveragePath, problem: "invalid shape" }] }
    }
    return { coverage: parsed as Record<string, CoverageEntry>, problems: [] }
  } catch {
    return { coverage: null, problems: [{ path: coveragePath, problem: "invalid JSON" }] }
  }
}

function sumHits(hits: Record<string, number> | undefined): number {
  return Object.values(hits ?? {}).reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0)
}

function evaluateArea(
  area: FunctionalReadinessArea,
  coverage: Record<string, CoverageEntry> | null
): FunctionalReadinessAreaResult {
  let statementHits = 0
  let functionHits = 0
  const missingTargets: string[] = []
  const zeroHitTargets: string[] = []

  for (const target of area.sourceTargets) {
    const entry = coverage?.[target]
    if (!entry) {
      missingTargets.push(target)
      continue
    }

    const targetStatementHits = sumHits(entry.s)
    const targetFunctionHits = sumHits(entry.f)
    statementHits += targetStatementHits
    functionHits += targetFunctionHits
    if (targetStatementHits + targetFunctionHits === 0) {
      zeroHitTargets.push(target)
    }
  }

  return {
    ...area,
    statementHits,
    functionHits,
    missingTargets,
    zeroHitTargets,
  }
}

function isRequiredCoveredArea(area: FunctionalReadinessArea): boolean {
  return area.category === "covered" && area.sourceTargets.length > 0
}

export function collectFunctionalCoverageReadiness(
  options: CollectFunctionalCoverageReadinessOptions = {}
): FunctionalCoverageReadinessReport {
  const root = options.root ?? ROOT
  const coveragePath = options.coveragePath ?? DEFAULT_COVERAGE_PATH
  const areas = options.areas ?? FUNCTIONAL_READINESS_AREAS
  const { coverage, problems } = readCoverageMap(root, coveragePath)
  const groups = emptyGroups()
  const mustFix: FunctionalReadinessMustFix[] = []

  for (const area of areas) {
    const result = evaluateArea(area, coverage)
    groups[area.category].push(result)

    if (
      coverage &&
      isRequiredCoveredArea(area) &&
      (result.missingTargets.length > 0 || result.zeroHitTargets.length > 0)
    ) {
      mustFix.push({
        id: area.id,
        title: area.title,
        missingTargets: result.missingTargets,
        zeroHitTargets: result.zeroHitTargets,
      })
    }
  }

  return {
    ok: problems.length === 0 && mustFix.length === 0,
    coveragePath,
    problems,
    groups,
    mustFix,
  }
}

function appendAreaLines(lines: string[], heading: string, areas: readonly FunctionalReadinessAreaResult[]): void {
  lines.push("", `${heading}:`)
  if (areas.length === 0) {
    lines.push("  - none")
    return
  }

  for (const area of areas) {
    const targetText =
      area.sourceTargets.length > 0
        ? ` (${area.sourceTargets.length} targets, statements=${area.statementHits}, functions=${area.functionHits})`
        : ""
    lines.push(`  - ${area.id}: ${area.title}${targetText}`)
  }
}

export function formatFunctionalCoverageReadiness(
  report: FunctionalCoverageReadinessReport
): string {
  const lines = [
    report.ok
      ? "functional readiness passed: covered source targets and accepted/deferred gaps are classified."
      : "functional readiness failed: release-readiness gaps require attention.",
    `Coverage source: ${report.coveragePath}`,
  ]

  if (report.problems.length > 0) {
    lines.push("", "Coverage input problems:")
    for (const problem of report.problems) {
      lines.push(`  - ${problem.path}: ${problem.problem}`)
    }
    lines.push("  - Run bun run coverage to regenerate the canonical coverage-final.json artifact.")
  }

  if (report.mustFix.length > 0) {
    lines.push("", "must-fix-before-release:")
    for (const item of report.mustFix) {
      lines.push(`  - ${item.id}: ${item.title}`)
      for (const target of item.missingTargets) {
        lines.push(`    - missing: ${target}`)
      }
      for (const target of item.zeroHitTargets) {
        lines.push(`    - zero hits: ${target}`)
      }
    }
  }

  for (const category of CATEGORIES) {
    appendAreaLines(lines, category, report.groups[category])
  }

  return lines.join("\n")
}

if (import.meta.main) {
  const report = collectFunctionalCoverageReadiness()
  const output = formatFunctionalCoverageReadiness(report)
  if (report.ok) {
    console.log(output)
  } else {
    console.error(output)
  }
  process.exit(report.ok ? 0 : 1)
}
