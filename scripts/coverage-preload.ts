import { mkdirSync, writeFileSync } from "fs"
import { dirname, join, relative, resolve } from "path"
import { plugin } from "bun"

const root = process.env.GS_COVERAGE_ROOT
const instSrc = process.env.GS_COVERAGE_SRC_INST
const shardDir = process.env.GS_COVERAGE_SHARD_DIR
const cliEntry = process.env.GS_COVERAGE_CLI_ENTRY
const originalCliEntry = root ? join(root, "src", "index.ts") : undefined

function writeCoverageShard() {
  if (!shardDir) return
  const coverage = (globalThis as { __coverage__?: unknown }).__coverage__
  if (!coverage) return

  mkdirSync(shardDir, { recursive: true })
  const shardPath = join(
    shardDir,
    `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  )
  writeFileSync(shardPath, JSON.stringify(coverage), { flush: true })
}

process.on("exit", writeCoverageShard)

function toInstrumentedPath(importPath: string, importer?: string): string | undefined {
  if (!root || !instSrc) return undefined

  let resolvedPath: string | undefined
  if (importPath.startsWith("@/")) {
    resolvedPath = join(root, "src", importPath.slice(2))
  } else if (importPath.startsWith(".")) {
    if (!importer) return undefined
    resolvedPath = resolve(dirname(importer), importPath)
  }

  if (!resolvedPath) return undefined

  const relToSrc = relative(join(root, "src"), resolvedPath)
  if (relToSrc.startsWith("..") || relToSrc === "") return undefined
  const candidate = join(instSrc, relToSrc)
  for (const path of [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    join(candidate, "index.ts"),
    join(candidate, "index.tsx"),
  ]) {
    if (Bun.file(path).size !== 0) return path
  }
  return undefined
}

if (root && instSrc) {
  plugin({
    name: "coverage-src-redirect",
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        const redirected = toInstrumentedPath(args.path, args.importer)
        return redirected ? { path: redirected } : undefined
      })

      build.onResolve({ filter: /^\.\.\/\.\.\/src\// }, (args) => {
        const redirected = toInstrumentedPath(args.path, args.importer)
        return redirected ? { path: redirected } : undefined
      })

      build.onResolve({ filter: /^\.\.\/src\// }, (args) => {
        const redirected = toInstrumentedPath(args.path, args.importer)
        return redirected ? { path: redirected } : undefined
      })
    },
  })
}

function rewriteCliArgv(argv: string[]): string[] {
  if (!cliEntry || !originalCliEntry || argv.length < 3) return argv
  if (argv[0] !== "bun" || argv[1] !== "run") return argv

  const candidate = argv[2]
  const absoluteCandidate = candidate.startsWith("/") ? candidate : join(root ?? process.cwd(), candidate)
  if (resolve(absoluteCandidate) !== resolve(originalCliEntry)) return argv

  return [argv[0], argv[1], cliEntry, ...argv.slice(3)]
}

function withCoverageEnv(env?: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    ...process.env,
    ...env,
    GS_COVERAGE_SHARD_DIR: shardDir,
  }
}

const originalSpawnSync = Bun.spawnSync.bind(Bun)
Bun.spawnSync = ((argv: string[], options?: Parameters<typeof Bun.spawnSync>[1]) => {
  const rewritten = rewriteCliArgv(argv)
  const nextOptions = rewritten === argv ? options : { ...options, env: withCoverageEnv(options?.env) }
  return originalSpawnSync(rewritten, nextOptions)
}) as typeof Bun.spawnSync

const originalSpawn = Bun.spawn.bind(Bun)
Bun.spawn = ((argv: string[], options?: Parameters<typeof Bun.spawn>[1]) => {
  const rewritten = rewriteCliArgv(argv)
  const nextOptions = rewritten === argv ? options : { ...options, env: withCoverageEnv(options?.env) }
  return originalSpawn(rewritten, nextOptions)
}) as typeof Bun.spawn
