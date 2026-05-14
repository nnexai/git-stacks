#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { Command } from "commander"
import { E2E_INVENTORY, type E2EInventoryItem } from "../tests/e2e-inventory"
import { registerWorkspaceCommands } from "../src/commands/workspace"
import { configCommand } from "../src/commands/config"
import { createCompletionCommand } from "../src/commands/completion"
import { doctorCommand } from "../src/commands/doctor"
import { repoCommand } from "../src/commands/repo"
import { templateCommand } from "../src/commands/template"
import { messageCommand } from "../src/commands/message"
import { installCommand } from "../src/commands/install"
import { integrationCommand } from "../src/commands/integration"
import { labelCommand } from "../src/commands/label"

export type MissingMappedTest = {
  id: string
  path: string
}

export type CoverageArtifactProblem = {
  path: string
  problem: "missing" | "invalid JSON" | "empty"
}

export type CoverageSentinelProblem = {
  path: string
  problem: "missing" | "zero hits"
}

export type VerifyGateReport = {
  ok: boolean
  inventoryDrift: {
    missingFromInventory: string[]
  }
  unmappedInScopeItems: string[]
  missingMappedTests: MissingMappedTest[]
  coverageArtifacts: CoverageArtifactProblem[]
  coverageSentinels: CoverageSentinelProblem[]
}

type CollectOptions = {
  root?: string
  inventory?: readonly E2EInventoryItem[]
  liveCommands?: readonly string[]
}

const ROOT = join(import.meta.dir, "..")
const JSON_COVERAGE_ARTIFACTS = [
  ".coverage/coverage-final.json",
  ".coverage/coverage-summary.json",
] as const
const COVERAGE_SENTINELS = [
  "src/lib/messages.ts",
  "src/tui/dashboard/ActionMenu.tsx",
] as const

function buildProgram(): Command {
  const program = new Command()
  program.name("git-stacks").enablePositionalOptions()
  registerWorkspaceCommands(program)
  program.addCommand(configCommand)
  program.command("manage").description("Interactive workspace dashboard")
  program.addCommand(doctorCommand)
  program.addCommand(repoCommand)
  program.addCommand(templateCommand)
  program.addCommand(messageCommand)
  program.addCommand(installCommand)
  program.addCommand(integrationCommand)
  program.addCommand(labelCommand)
  program.addCommand(createCompletionCommand(program))
  return program
}

function collectCommandPaths(command: Command, parents: string[] = []): string[] {
  const paths: string[] = []

  for (const child of command.commands) {
    const path = [...parents, child.name()]
    if (child.commands.length === 0) {
      paths.push(path.join(" "))
    } else {
      paths.push(...collectCommandPaths(child, path))
    }
  }

  return paths
}

export function getLiveCommandSurface(): string[] {
  const program = buildProgram()
  return [...new Set([...collectCommandPaths(program), "--version", "-V"])].sort()
}

function tokenize(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
}

function normalizeLiteralCommand(command: string): string {
  const tokens = tokenize(command)
    .filter((token) => !token.startsWith("-"))
    .filter((token) => !/^[[<].+[\]>]$/.test(token))
  return tokens.join(" ")
}

function commandMatchesSpec(liveCommand: string, spec: string): boolean {
  if (liveCommand === spec) return true

  const liveTokens = tokenize(liveCommand)
  const specTokens = tokenize(spec).filter((token) => !token.startsWith("-"))

  if (specTokens.length === 0) {
    return liveCommand === spec
  }

  let liveIndex = 0
  for (let specIndex = 0; specIndex < specTokens.length; specIndex++) {
    const specToken = specTokens[specIndex]
    if (specToken.startsWith("<") || specToken.startsWith("[")) {
      if (liveIndex >= liveTokens.length) return false
      if (specIndex === specTokens.length - 1) return true
      liveIndex++
      continue
    }
    if (liveTokens[liveIndex] !== specToken) return false
    liveIndex++
  }

  return liveIndex === liveTokens.length
}

function isCommandCovered(liveCommand: string, inventory: readonly E2EInventoryItem[]): boolean {
  const normalizedLive = normalizeLiteralCommand(liveCommand)

  return inventory.some((item) =>
    item.commands.some((command) => {
      const normalizedSpec = normalizeLiteralCommand(command)
      if (normalizedSpec === normalizedLive) return true
      if (commandMatchesSpec(liveCommand, command)) return true

      // Inventory entries with option variants cover their base command path.
      return normalizedSpec.length > 0 && normalizedSpec === normalizedLive
    })
  )
}

function collectInventoryDrift(
  liveCommands: readonly string[],
  inventory: readonly E2EInventoryItem[]
): string[] {
  return liveCommands
    .filter((command) => !isCommandCovered(command, inventory))
    .map(normalizeLiteralCommand)
    .filter((command) => command.length > 0)
    .filter((command, index, commands) => commands.indexOf(command) === index)
    .sort()
}

function collectUnmappedInScopeItems(inventory: readonly E2EInventoryItem[]): string[] {
  return inventory
    .filter((item) => item.scopeStatus === "in-scope" && item.mappedTests.length === 0)
    .map((item) => item.id)
    .sort()
}

function collectMissingMappedTests(
  root: string,
  inventory: readonly E2EInventoryItem[]
): MissingMappedTest[] {
  const missing: MissingMappedTest[] = []

  for (const item of inventory) {
    if (item.scopeStatus !== "in-scope") continue
    for (const mappedTest of item.mappedTests) {
      if (!existsSync(join(root, mappedTest))) {
        missing.push({ id: item.id, path: mappedTest })
      }
    }
  }

  return missing.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path))
}

function collectCoverageArtifactProblems(root: string): CoverageArtifactProblem[] {
  const problems: CoverageArtifactProblem[] = []

  for (const path of JSON_COVERAGE_ARTIFACTS) {
    const fullPath = join(root, path)
    if (!existsSync(fullPath)) {
      problems.push({ path, problem: "missing" })
      continue
    }
    const content = readFileSync(fullPath, "utf8")
    if (content.trim().length === 0) {
      problems.push({ path, problem: "empty" })
      continue
    }
    try {
      JSON.parse(content)
    } catch {
      problems.push({ path, problem: "invalid JSON" })
    }
  }

  const lcovPath = ".coverage/lcov.info"
  const fullLcovPath = join(root, lcovPath)
  if (!existsSync(fullLcovPath)) {
    problems.push({ path: lcovPath, problem: "missing" })
  } else if (readFileSync(fullLcovPath, "utf8").trim().length === 0) {
    problems.push({ path: lcovPath, problem: "empty" })
  }

  return problems
}

function readCoverageFinal(root: string): Record<string, { s?: Record<string, number>; f?: Record<string, number> }> | null {
  const fullPath = join(root, ".coverage/coverage-final.json")
  if (!existsSync(fullPath)) return null
  const content = readFileSync(fullPath, "utf8")
  if (content.trim().length === 0) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

function hasStatementOrFunctionHit(entry: { s?: Record<string, number>; f?: Record<string, number> }): boolean {
  const statementHits = Object.values(entry.s ?? {}).reduce((sum, count) => sum + count, 0)
  const functionHits = Object.values(entry.f ?? {}).reduce((sum, count) => sum + count, 0)
  return statementHits > 0 || functionHits > 0
}

function collectCoverageSentinelProblems(root: string): CoverageSentinelProblem[] {
  const coverage = readCoverageFinal(root)
  if (!coverage) return []

  const problems: CoverageSentinelProblem[] = []
  for (const path of COVERAGE_SENTINELS) {
    const entry = coverage[path]
    if (!entry) {
      problems.push({ path, problem: "missing" })
    } else if (!hasStatementOrFunctionHit(entry)) {
      problems.push({ path, problem: "zero hits" })
    }
  }
  return problems
}

export function collectVerifyGateReport(options: CollectOptions = {}): VerifyGateReport {
  const root = options.root ?? ROOT
  const inventory = options.inventory ?? E2E_INVENTORY
  const liveCommands = options.liveCommands ?? getLiveCommandSurface()

  const missingFromInventory = collectInventoryDrift(liveCommands, inventory)
  const unmappedInScopeItems = collectUnmappedInScopeItems(inventory)
  const missingMappedTests = collectMissingMappedTests(root, inventory)
  const coverageArtifacts = collectCoverageArtifactProblems(root)
  const coverageSentinels = collectCoverageSentinelProblems(root)

  return {
    ok:
      missingFromInventory.length === 0 &&
      unmappedInScopeItems.length === 0 &&
      missingMappedTests.length === 0 &&
      coverageArtifacts.length === 0 &&
      coverageSentinels.length === 0,
    inventoryDrift: {
      missingFromInventory,
    },
    unmappedInScopeItems,
    missingMappedTests,
    coverageArtifacts,
    coverageSentinels,
  }
}

export function formatVerifyGateReport(report: VerifyGateReport): string {
  if (report.ok) {
    return "verify:gates passed: inventory, mapped tests, and coverage artifacts are aligned."
  }

  const lines = ["verify:gates failed: local verification drift detected."]

  if (report.inventoryDrift.missingFromInventory.length > 0) {
    lines.push("", "Inventory drift: live commands missing from canonical inventory:")
    for (const command of report.inventoryDrift.missingFromInventory) {
      lines.push(`  - ${command}`)
    }
  }

  if (report.unmappedInScopeItems.length > 0) {
    lines.push("", "Unmapped in-scope inventory items:")
    for (const id of report.unmappedInScopeItems) {
      lines.push(`  - ${id}`)
    }
  }

  if (report.missingMappedTests.length > 0) {
    lines.push("", "Broken mapped test paths:")
    for (const missing of report.missingMappedTests) {
      lines.push(`  - ${missing.id}: ${missing.path}`)
    }
  }

  if (report.coverageArtifacts.length > 0) {
    lines.push("", "Coverage artifact problems:")
    for (const artifact of report.coverageArtifacts) {
      lines.push(`  - ${artifact.path}: ${artifact.problem}`)
    }
  }

  if (report.coverageSentinels.length > 0) {
    lines.push("", "Coverage sentinel problems:")
    for (const sentinel of report.coverageSentinels) {
      lines.push(`  - ${sentinel.path}: ${sentinel.problem}`)
    }
  }

  return lines.join("\n")
}

if (import.meta.main) {
  const report = collectVerifyGateReport()
  const output = formatVerifyGateReport(report)
  if (report.ok) {
    console.log(output)
  } else {
    console.error(output)
  }
  process.exit(report.ok ? 0 : 1)
}
