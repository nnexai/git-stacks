import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { createCoverageMap, type CoverageMapData } from "istanbul-lib-coverage"
import { createInstrumenter } from "istanbul-lib-instrument"

export type IstanbulSmokeFailureKind = "child-failure" | "missing-artifact" | "malformed-coverage"

export type IstanbulSmokeOptions = {
  runtimeNodeModulesPath?: string
  emitCoverageArtifact?: boolean
  coverageArtifactContents?: string
}

type IstanbulSmokeFailureDetails = {
  argv: string[]
  coveragePath: string
  exitCode: number
  stdout: string
  stderr: string
}

const failureTitles: Record<IstanbulSmokeFailureKind, string> = {
  "child-failure": "Istanbul smoke child process failed",
  "missing-artifact": "Istanbul smoke coverage artifact is missing",
  "malformed-coverage": "Istanbul smoke coverage artifact is malformed",
}

function formatFailure(
  kind: IstanbulSmokeFailureKind,
  details: IstanbulSmokeFailureDetails,
  cause?: unknown
): string {
  const lines = [
    failureTitles[kind],
    `argv: ${JSON.stringify(details.argv)}`,
    `exitCode: ${details.exitCode}`,
    `coveragePath: ${details.coveragePath}`,
    "stdout:",
    details.stdout,
    "stderr:",
    details.stderr,
  ]

  if (cause !== undefined) {
    lines.push(`cause: ${cause instanceof Error ? cause.message : String(cause)}`)
  }

  return lines.join("\n")
}

export class IstanbulSmokeError extends Error {
  readonly argv: string[]
  readonly coveragePath: string
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string

  constructor(
    readonly kind: IstanbulSmokeFailureKind,
    details: IstanbulSmokeFailureDetails,
    cause?: unknown
  ) {
    super(formatFailure(kind, details, cause), cause === undefined ? undefined : { cause })
    this.name = "IstanbulSmokeError"
    this.argv = details.argv
    this.coveragePath = details.coveragePath
    this.exitCode = details.exitCode
    this.stdout = details.stdout
    this.stderr = details.stderr
  }
}

export type IstanbulSmokeResult = {
  argv: string[]
  coveragePath: string
  exitCode: number
  stdout: string
  stderr: string
  summary: {
    files: string[]
    statementsCovered: number
    functionsCovered: number
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export function runIstanbulCompletionSmoke(
  baseDir: string,
  options: IstanbulSmokeOptions = {}
): IstanbulSmokeResult {
  const projectRoot = join(import.meta.dir, "..", "..")
  const fixtureRoot = join(baseDir, "instrumented")
  const fixturePackages = join(fixtureRoot, "packages")
  const fixtureSrc = join(fixturePackages, "cli", "src")
  const coveragePath = join(baseDir, "coverage", "completion-coverage.json")

  mkdirSync(dirname(coveragePath), { recursive: true })
  cpSync(join(projectRoot, "packages"), fixturePackages, { recursive: true })
  cpSync(join(projectRoot, "package.json"), join(fixtureRoot, "package.json"))
  symlinkSync(
    options.runtimeNodeModulesPath ?? join(projectRoot, "node_modules"),
    join(fixtureRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  )

  const completionPath = join(fixtureSrc, "commands", "completion.ts")
  const completionSource = readFileSync(completionPath, "utf8")
  const instrumenter = createInstrumenter({
    coverageVariable: "__coverage__",
    esModules: true,
    parserPlugins: ["typescript"],
  })
  writeFileSync(completionPath, instrumenter.instrumentSync(completionSource, completionPath))

  const indexPath = join(fixtureSrc, "index.ts")
  const indexSource = readFileSync(indexPath, "utf8")
  if (options.emitCoverageArtifact !== false) {
    const coverageContents = options.coverageArtifactContents === undefined
      ? "JSON.stringify((globalThis as { __coverage__?: unknown }).__coverage__ ?? {}, null, 2)"
      : JSON.stringify(options.coverageArtifactContents)
    writeFileSync(
      indexPath,
      `${indexSource}

const __coverageOut = process.env.GIT_STACKS_ISTANBUL_COVERAGE
if (__coverageOut) {
  await Bun.write(__coverageOut, ${coverageContents})
}
`
    )
  }

  const argv = ["bun", "run", indexPath, "completion", "bash"]
  const result = Bun.spawnSync(argv, {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      GIT_STACKS_ISTANBUL_COVERAGE: coveragePath,
    },
    stdio: ["pipe", "pipe", "pipe"],
  })

  const exitCode = result.exitCode
  const stdout = decode(result.stdout)
  const stderr = decode(result.stderr)
  const failureDetails = { argv, coveragePath, exitCode, stdout, stderr }

  if (exitCode !== 0) {
    throw new IstanbulSmokeError("child-failure", failureDetails)
  }

  if (!existsSync(coveragePath)) {
    throw new IstanbulSmokeError("missing-artifact", failureDetails)
  }

  let map
  let summary
  try {
    const rawCoverage = JSON.parse(readFileSync(coveragePath, "utf8")) as CoverageMapData
    map = createCoverageMap({})
    map.merge(rawCoverage)
    summary = map.getCoverageSummary().toJSON()
  } catch (error) {
    throw new IstanbulSmokeError("malformed-coverage", failureDetails, error)
  }

  return {
    argv,
    coveragePath,
    exitCode,
    stdout,
    stderr,
    summary: {
      files: map.files(),
      statementsCovered: summary.statements.covered,
      functionsCovered: summary.functions.covered,
    },
  }
}
