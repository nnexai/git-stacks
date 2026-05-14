import { cpSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { createCoverageMap, type CoverageMapData } from "istanbul-lib-coverage"
import { createInstrumenter } from "istanbul-lib-instrument"

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

export function runIstanbulCompletionSmoke(baseDir: string): IstanbulSmokeResult {
  const projectRoot = join(import.meta.dir, "..", "..")
  const fixtureRoot = join(baseDir, "instrumented")
  const fixtureSrc = join(fixtureRoot, "src")
  const coveragePath = join(baseDir, "coverage", "completion-coverage.json")

  mkdirSync(dirname(coveragePath), { recursive: true })
  cpSync(join(projectRoot, "src"), fixtureSrc, { recursive: true })
  cpSync(join(projectRoot, "package.json"), join(fixtureRoot, "package.json"))

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
  writeFileSync(
    indexPath,
    `${indexSource}

const __coverageOut = process.env.GIT_STACKS_ISTANBUL_COVERAGE
if (__coverageOut) {
  await Bun.write(__coverageOut, JSON.stringify((globalThis as { __coverage__?: unknown }).__coverage__ ?? {}, null, 2))
}
`
  )

  const argv = ["bun", "run", indexPath, "completion", "bash"]
  const result = Bun.spawnSync(argv, {
    cwd: projectRoot,
    env: {
      ...process.env,
      GIT_STACKS_ISTANBUL_COVERAGE: coveragePath,
    },
    stdio: ["pipe", "pipe", "pipe"],
  })

  const rawCoverage = JSON.parse(readFileSync(coveragePath, "utf8")) as CoverageMapData
  const map = createCoverageMap({})
  map.merge(rawCoverage)
  const summary = map.getCoverageSummary().toJSON()

  return {
    argv,
    coveragePath,
    exitCode: result.exitCode ?? 0,
    stdout: decode(result.stdout),
    stderr: decode(result.stderr),
    summary: {
      files: map.files(),
      statementsCovered: summary.statements.covered,
      functionsCovered: summary.functions.covered,
    },
  }
}
