import { mkdirSync, writeFileSync } from "fs"
import { dirname, join, relative, resolve } from "path"
import { plugin } from "bun"
import { afterAll } from "bun:test"

const root = process.env.GS_COVERAGE_ROOT
const instSrc = process.env.GS_COVERAGE_SRC_INST
const shardDir = process.env.GS_COVERAGE_SHARD_DIR
const cliEntry = process.env.GS_COVERAGE_CLI_ENTRY
const originalCliEntry = root ? join(root, "packages", "cli", "dist", "index.js") : undefined

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

afterAll(writeCoverageShard)
process.on("exit", writeCoverageShard)

function toInstrumentedPath(importPath: string, importer?: string): string | undefined {
  if (!root || !instSrc) return undefined

  let resolvedPath: string | undefined
  if (importPath.startsWith("@git-stacks/")) {
    const match = importPath.match(/^@git-stacks\/([^/]+)(?:\/(.*))?$/)
    if (!match) return undefined
    const [, packageName, subpath] = match
    const candidate = join(instSrc, packageName, "src", (subpath ?? "index").replace(/\.js$/, ""))
    for (const path of [candidate, `${candidate}.ts`, `${candidate}.tsx`, join(candidate, "index.ts"), join(candidate, "index.tsx")]) {
      if (Bun.file(path).size !== 0) return path
    }
    return undefined
  } else if (importPath.startsWith("@/")) {
    return undefined
  } else if (importPath.startsWith(".")) {
    if (!importer) return undefined
    resolvedPath = resolve(dirname(importer), importPath).replace(/\.js$/, "")
  }

  if (!resolvedPath) return undefined

  const relToPackages = relative(join(root, "packages"), resolvedPath)
  if (relToPackages.startsWith("..") || relToPackages === "") return undefined
  const candidate = join(instSrc, relToPackages)
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
      build.onResolve({ filter: /^@git-stacks\// }, (args) => {
        const redirected = toInstrumentedPath(args.path, args.importer)
        return redirected ? { path: redirected } : undefined
      })

      // Resolve package-source imports from tests at any depth and canonicalize
      // NodeNext-style .js specifiers to one explicit instrumented TS module.
      build.onResolve({ filter: /^\./ }, (args) => {
        const redirected = toInstrumentedPath(args.path, args.importer)
        return redirected ? { path: redirected } : undefined
      })
    },
  })
}

function rewriteCliArgv(argv: string[]): string[] {
  if (!cliEntry || !originalCliEntry || argv.length < 3) return argv
  const sourceInvocation = argv[0] === "bun" && argv[1] === "run"
  const builtNodeInvocation = argv[0] === "node"
  if (!sourceInvocation && !builtNodeInvocation) return argv

  const candidate = argv[sourceInvocation ? 2 : 1]
  const absoluteCandidate = candidate.startsWith("/") ? candidate : join(root ?? process.cwd(), candidate)
  if (resolve(absoluteCandidate) !== resolve(originalCliEntry)) return argv

  return ["bun", "run", cliEntry, ...argv.slice(sourceInvocation ? 3 : 2)]
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
