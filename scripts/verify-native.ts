#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs"
import { arch, homedir, platform } from "os"
import { basename, join } from "path"

const ROOT = join(import.meta.dir, "..")
const NATIVE = join(ROOT, "native")
const LOCK_PATH = join(NATIVE, "deps", "ghostty.lock")
const CACHE = process.env.GIT_STACKS_NATIVE_CACHE ?? join(homedir(), ".cache", "git-stacks", "native")

type Artifact = { url: string; sha256: string }
type NativeLock = {
  schema: number
  repository: string
  version: string
  annotated_tag: string
  tag_object: string
  peeled_commit: string
  source_tree_sha256: string
  minimum_zig_version: string
  zig: { version: string; artifacts: Record<string, Artifact> }
}

const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as NativeLock
const hostArch = arch() === "arm64" ? "aarch64" : arch() === "x64" ? "x86_64" : arch()
const platformKey = `${platform() === "darwin" ? "darwin" : platform()}-${hostArch}`
const artifact = lock.zig.artifacts[platformKey]
const ghosttyDir = process.env.GIT_STACKS_GHOSTTY_SOURCE ?? join(CACHE, `ghostty-${lock.peeled_commit}`)
const zigDir = join(CACHE, `zig-${platformKey}-${lock.zig.version}`)
const zigExe = process.env.GIT_STACKS_ZIG ?? join(zigDir, "zig")
const zigArchive = artifact ? join(CACHE, basename(new URL(artifact.url).pathname)) : ""

type Result = { code: number; stdout: string; stderr: string }
async function run(command: string[], cwd = ROOT): Promise<Result> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe", env: process.env })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

async function requireSuccess(command: string[], cwd = ROOT): Promise<string> {
  const result = await run(command, cwd)
  if (result.code !== 0) throw new Error(`${command.join(" ")} failed (${result.code}): ${result.stderr || result.stdout}`)
  return result.stdout
}

async function sha256(path: string): Promise<string> {
  return new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex")
}

const fixtureSource = join(ROOT, "tests", "fixtures", "service-v1")
const fixtureExport = join(NATIVE, "tests", "fixtures")
const fixtureNames = ["discovery.json", "request-timeout-error.json", "workspace-snapshot.json"]

async function verifyFixtureExport(): Promise<void> {
  for (const name of fixtureNames) {
    const source = join(fixtureSource, name)
    const exported = join(fixtureExport, name)
    if (!existsSync(exported)) throw new Error(`native fixture export missing: ${name}`)
    const [sourceHash, exportHash] = await Promise.all([sha256(source), sha256(exported)])
    if (sourceHash !== exportHash) throw new Error(`native fixture drift: ${name} differs from tests/fixtures/service-v1/${name}`)
  }
  const extras = Array.from(new Bun.Glob("*.json").scanSync(fixtureExport)).filter((name) => !fixtureNames.includes(name))
  if (extras.length) throw new Error(`native fixture export has non-canonical files: ${extras.join(", ")}`)
}

async function verifyHeaderPortability(): Promise<void> {
  const compiler = process.env.CC ?? "clang"
  const result = await run([
    compiler, "-std=c11", "-pedantic-errors", "-Wall", "-Wextra", "-Werror", "-fsyntax-only",
    "-x", "c", join(NATIVE, "include", "git_stacks_native_v1.h"),
  ])
  if (result.code !== 0) throw new Error(`public ABI portability diagnostics failed with ${compiler}: ${result.stderr || result.stdout}`)
}

async function setup(): Promise<void> {
  if (!artifact) throw new Error(`unsupported native platform ${platformKey}; no pinned Zig artifact`)
  mkdirSync(CACHE, { recursive: true })

  if (!existsSync(zigExe)) {
    const archive = zigArchive
    await requireSuccess(["curl", "-fL", artifact.url, "-o", archive])
    const actual = await sha256(archive)
    if (actual !== artifact.sha256) throw new Error(`Zig artifact checksum mismatch: expected ${artifact.sha256}, got ${actual}`)
    const unpack = join(CACHE, `.zig-unpack-${process.pid}`)
    rmSync(unpack, { recursive: true, force: true })
    mkdirSync(unpack)
    await requireSuccess(["tar", "-xf", archive, "--strip-components=1", "-C", unpack])
    await requireSuccess(["mv", unpack, zigDir])
  }

  if (!existsSync(join(ghosttyDir, ".git"))) {
    const temporary = `${ghosttyDir}.tmp-${process.pid}`
    rmSync(temporary, { recursive: true, force: true })
    await requireSuccess(["git", "clone", "--no-checkout", "--filter=blob:none", lock.repository, temporary])
    await requireSuccess(["git", "checkout", "--detach", lock.peeled_commit], temporary)
    await requireSuccess(["mv", temporary, ghosttyDir])
  }
  console.log(`native setup ready: ${platformKey}, Zig ${lock.zig.version}, Ghostty ${lock.peeled_commit}`)
}

async function collectProblems(): Promise<string[]> {
  const problems: string[] = []
  if (lock.schema !== 1) problems.push(`unsupported lock schema ${lock.schema}`)
  if (!artifact) problems.push(`no Zig artifact pin for ${platformKey}`)
  if (!existsSync(zigExe)) problems.push(`missing repo-provisioned Zig ${lock.zig.version}; run bun run native:setup`)
  if (!process.env.GIT_STACKS_ZIG && artifact && !existsSync(zigArchive)) problems.push(`missing pinned Zig artifact provenance: ${zigArchive}`)
  if (!existsSync(join(ghosttyDir, ".git"))) problems.push(`missing pinned Ghostty checkout; run bun run native:setup`)
  if (problems.length) return problems

  const zigVersion = await run([zigExe, "version"])
  if (zigVersion.code !== 0 || zigVersion.stdout !== lock.zig.version) problems.push(`Zig must be exactly ${lock.zig.version}, got ${zigVersion.stdout || zigVersion.stderr}`)
  if (!process.env.GIT_STACKS_ZIG && artifact && existsSync(zigArchive)) {
    const actual = await sha256(zigArchive)
    if (actual !== artifact.sha256) problems.push(`Zig artifact checksum mismatch: expected ${artifact.sha256}, got ${actual}`)
  }

  const origin = await run(["git", "remote", "get-url", "origin"], ghosttyDir)
  if (origin.stdout !== lock.repository) problems.push(`Ghostty origin must be ${lock.repository}, got ${origin.stdout}`)
  const head = await run(["git", "rev-parse", "HEAD"], ghosttyDir)
  if (head.stdout !== lock.peeled_commit) problems.push(`Ghostty HEAD must be ${lock.peeled_commit}, got ${head.stdout}`)
  const dirty = await run(["git", "status", "--porcelain", "--untracked-files=no"], ghosttyDir)
  if (dirty.stdout) problems.push("Ghostty tracked source differs from the pinned commit")
  const tag = await run(["git", "rev-parse", lock.annotated_tag], ghosttyDir)
  if (tag.stdout !== lock.tag_object) problems.push(`Ghostty tag object must be ${lock.tag_object}, got ${tag.stdout}`)
  const peeled = await run(["git", "rev-parse", `${lock.annotated_tag}^{}`], ghosttyDir)
  if (peeled.stdout !== lock.peeled_commit) problems.push(`Ghostty peeled tag must be ${lock.peeled_commit}, got ${peeled.stdout}`)
  const tree = await run(["git", "ls-tree", "-r", "--full-tree", "HEAD"], ghosttyDir)
  const treeHash = new Bun.CryptoHasher("sha256").update(tree.stdout + "\n").digest("hex")
  if (treeHash !== lock.source_tree_sha256) problems.push(`Ghostty source tree checksum mismatch: expected ${lock.source_tree_sha256}, got ${treeHash}`)

  const zonPath = join(ghosttyDir, "build.zig.zon")
  if (!existsSync(zonPath)) {
    problems.push("Ghostty checkout is missing build.zig.zon")
  } else {
    const zon = readFileSync(zonPath, "utf8")
    if (!zon.includes(`.version = "${lock.version}"`)) problems.push(`Ghostty manifest version is not ${lock.version}`)
    if (!zon.includes(`.minimum_zig_version = "${lock.minimum_zig_version}"`)) problems.push(`Ghostty minimum Zig is not ${lock.minimum_zig_version}`)
  }
  return problems
}

async function verify(target = "terminal-api-smoke"): Promise<void> {
  const problems = await collectProblems()
  if (problems.length) {
    console.error("native verification failed before compilation:")
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  const output = await requireSuccess([
    zigExe, "build", target, `-Dghostty-source=${ghosttyDir}`,
    "--build-file", join(NATIVE, "build.zig"),
    "--cache-dir", join(CACHE, "zig-local-cache"),
    "--global-cache-dir", join(CACHE, "zig-global-cache"),
    "--summary", "all",
  ], NATIVE)
  if (output) console.log(output)
  console.log(target === "model-test"
    ? `native model verified: Zig ${lock.zig.version}; opaque ABI lifecycle and validation passed`
    : `native feasibility verified: Zig ${lock.zig.version}; Ghostty tag ${lock.tag_object}; peeled ${lock.peeled_commit}; full surface API seams present`)
}

async function verifyModel(): Promise<void> {
  await verifyFixtureExport()
  await verifyHeaderPortability()
  await requireSuccess(["bun", "test", "tests/lib/service/contract.test.ts"])
  await verify("model-test")
}

async function verifyQuick(): Promise<void> {
  await verifyModel()
  await verify("terminal-api-smoke")
}

async function verifyRestore(): Promise<void> {
  await verify("restore-test")
}

async function verifyLifecycle(): Promise<void> {
  await verify("lifecycle-test")
}

const mode = process.argv[2] ?? "verify"
if (mode === "setup") await setup()
else if (mode === "model") await verifyModel()
else if (mode === "restore") await verifyRestore()
else if (mode === "lifecycle") await verifyLifecycle()
else if (mode === "quick" || mode === "verify") await verifyQuick()
else if (mode === "terminal-build") await verify()
else throw new Error(`unknown native verification mode: ${mode}`)
