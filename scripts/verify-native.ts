#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs"
import { arch, homedir, platform } from "os"
import { basename, join } from "path"
import { startManagedService } from "../src/service/main"

const ROOT = join(import.meta.dir, "..")
const NATIVE = join(ROOT, "native")
const LOCK_PATH = join(NATIVE, "deps", "ghostty.lock")
const CACHE = process.env.GIT_STACKS_NATIVE_CACHE ?? join(homedir(), ".cache", "git-stacks", "native")

type Artifact = { url: string; sha256: string }
type NativeLock = {
  schema: number
  repository: string
  upstream_repository: string
  version: string
  base_commit: string
  base_git_tree: string
  base_source_tree_sha256: string
  patch_path: string
  patch_sha256: string
  derived_source_tree_sha256: string
  upstream_merge_base: string
  recorded_fork_head: string
  recorded_ahead: number
  recorded_behind: number
  expected_symbols: string[]
  minimum_zig_version: string
  zig: { version: string; artifacts: Record<string, Artifact> }
}

const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as NativeLock
const hostArch = arch() === "arm64" ? "aarch64" : arch() === "x64" ? "x86_64" : arch()
const platformKey = `${platform() === "darwin" ? "darwin" : platform()}-${hostArch}`
const artifact = lock.zig.artifacts[platformKey]
const baseDir = join(CACHE, `ghostty-base-${lock.base_commit}`)
const ghosttyDir = process.env.GIT_STACKS_GHOSTTY_SOURCE ?? join(CACHE, `ghostty-derived-${lock.base_commit}-${lock.patch_sha256.slice(0, 12)}`)
const patchPath = join(ROOT, lock.patch_path)
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

async function sourceTreeSha(path: string): Promise<string> {
  const files = (await requireSuccess(["git", "ls-files", "-z"], path)).split("\0").filter(Boolean).sort()
  let manifest = ""
  for (const file of files) manifest += `${await sha256(join(path, file))}  ${file}\n`
  return new Bun.CryptoHasher("sha256").update(manifest).digest("hex")
}

async function pristineTreeSha(path: string): Promise<string> {
  const tree = await requireSuccess(["git", "ls-tree", "-r", "--full-tree", "HEAD"], path)
  return new Bun.CryptoHasher("sha256").update(tree + "\n").digest("hex")
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

function verifyNativeSourceBoundaries(): void {
  const productionAllowlist = new Set(["native/terminal/vt_adapter.zig", "native/terminal/ghostty_process_control.zig", "native/linux/app.zig", "native/linux/ghostty_runtime.zig", "native/linux/ghostty_surface.zig", "native/linux/ghostty_input.zig", "native/linux/ghostty_clipboard.zig", "native/tests/accessibility_test.zig", "native/tests/ghostty_surface_abi.zig", "native/tests/ghostty_surface_test.zig", "native/tests/ghostty_interaction_test.zig", "native/build.zig"])
  const upstreamPattern = /(?:@cInclude\(["<]ghostty\.h[">]\)|\bghostty_(?:surface|app|runtime|config|input|clipboard)\w*|\blibghostty\b)/i
  const platformPattern = /\b(?:Gtk|Gdk|Adw)[A-Z]\w*|@cInclude\(["<](?:gtk|adwaita)\//
  const violations: string[] = []
  const files = Array.from(new Bun.Glob("native/**/*.{zig,h,c}").scanSync(ROOT)).sort()
  for (const relative of files) {
    const normalized = relative.replaceAll("\\", "/")
    const source = readFileSync(join(ROOT, relative), "utf8")
    if (upstreamPattern.test(source) && !productionAllowlist.has(normalized)) {
      violations.push(`${normalized}: unclassified pinned-terminal API reference`)
    }
    if ((normalized.startsWith("native/core/") || normalized === "native/include/git_stacks_native_v1.h") && platformPattern.test(source)) {
      violations.push(`${normalized}: platform toolkit type leaked into product ABI/core`)
    }
    if ((normalized.startsWith("native/core/") || normalized === "native/include/git_stacks_native_v1.h") && upstreamPattern.test(source)) {
      violations.push(`${normalized}: terminal implementation type leaked into product ABI/core`)
    }
  }
  if (violations.length) throw new Error(`native source boundary audit failed:\n  - ${violations.join("\n  - ")}`)
}

function verifyProductionTerminalComposition(): void {
  const app = readFileSync(join(NATIVE, "linux", "app.zig"), "utf8")
  const surface = readFileSync(join(NATIVE, "linux", "ghostty_surface.zig"), "utf8")
  const runtime = readFileSync(join(NATIVE, "linux", "ghostty_runtime.zig"), "utf8")
  const production = `${app}\n${surface}\n${runtime}`
  const required = [
    "Runtime.init(allocator)",
    "Surface.create(runtime, &state.registry)",
    "gtk_gl_area_new()",
    "ghostty_surface_new",
    "ghostty_surface_draw",
    "ghostty_surface_display_realized",
    "ghostty_surface_display_unrealized",
    '"resize"',
    "ghostty_surface_set_size",
    "ghostty_config_load_default_files",
    "ghostty_config_load_recursive_files",
    "ghostty_config_load_cli_args",
    "ghostty_config_finalize",
    "ProductionGraph.initFromEnvironment(allocator)",
    "state.graph.assertWired()",
  ]
  for (const seam of required) {
    if (!production.includes(seam)) throw new Error(`production terminal composition missing: ${seam}`)
  }
  if (/else\s*\{[\s\S]{0,300}VtAdapter\.init/.test(app)) {
    throw new Error("production launch must not fall back to a static VT-only composition")
  }
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

  if (!existsSync(join(baseDir, ".git"))) {
    const temporary = `${baseDir}.tmp-${process.pid}`
    rmSync(temporary, { recursive: true, force: true })
    await requireSuccess(["git", "clone", "--no-checkout", "--filter=blob:none", lock.repository, temporary])
    await requireSuccess(["git", "checkout", "--detach", lock.base_commit], temporary)
    await requireSuccess(["mv", temporary, baseDir])
  }
  const upstream = await run(["git", "remote", "get-url", "upstream"], baseDir)
  if (upstream.code !== 0) await requireSuccess(["git", "remote", "add", "upstream", lock.upstream_repository], baseDir)
  else if (upstream.stdout !== lock.upstream_repository) throw new Error(`Ghostty upstream remote must be ${lock.upstream_repository}, got ${upstream.stdout}`)
  await requireSuccess(["git", "fetch", "--no-tags", "upstream", "main"], baseDir)
  const baseProblems = await collectBaseProblems()
  if (baseProblems.length) throw new Error(`immutable Ghostty base rejected:\n  - ${baseProblems.join("\n  - ")}`)
  if (await sha256(patchPath) !== lock.patch_sha256) throw new Error("repository Ghostty patch digest differs from lock")

  if (!process.env.GIT_STACKS_GHOSTTY_SOURCE) {
    const temporary = `${ghosttyDir}.tmp-${process.pid}`
    rmSync(temporary, { recursive: true, force: true })
    cpSync(baseDir, temporary, { recursive: true, dereference: false })
    await requireSuccess(["git", "apply", "--check", "--whitespace=error-all", patchPath], temporary)
    await requireSuccess(["git", "apply", "--whitespace=error-all", patchPath], temporary)
    const derived = await sourceTreeSha(temporary)
    if (derived !== lock.derived_source_tree_sha256) {
      rmSync(temporary, { recursive: true, force: true })
      throw new Error(`derived Ghostty tree checksum mismatch: expected ${lock.derived_source_tree_sha256}, got ${derived}`)
    }
    rmSync(ghosttyDir, { recursive: true, force: true })
    await requireSuccess(["mv", temporary, ghosttyDir])
  }
  console.log(`native setup ready: ${platformKey}, Zig ${lock.zig.version}, Ghostty base ${lock.base_commit}, patch ${lock.patch_sha256}`)
}

async function collectBaseProblems(): Promise<string[]> {
  const problems: string[] = []
  if (!existsSync(join(baseDir, ".git"))) return ["missing immutable base checkout"]
  const origin = await run(["git", "remote", "get-url", "origin"], baseDir)
  if (origin.stdout !== lock.repository) problems.push(`base origin must be ${lock.repository}, got ${origin.stdout}`)
  const upstream = await run(["git", "remote", "get-url", "upstream"], baseDir)
  if (upstream.stdout !== lock.upstream_repository) problems.push(`upstream remote must be ${lock.upstream_repository}, got ${upstream.stdout || "missing"}`)
  const head = await run(["git", "rev-parse", "HEAD"], baseDir)
  if (head.stdout !== lock.base_commit) problems.push(`base HEAD must be ${lock.base_commit}, got ${head.stdout}`)
  const treeObject = await run(["git", "rev-parse", "HEAD^{tree}"], baseDir)
  if (treeObject.stdout !== lock.base_git_tree) problems.push(`base Git tree must be ${lock.base_git_tree}, got ${treeObject.stdout}`)
  const dirty = await run(["git", "status", "--porcelain", "--untracked-files=all"], baseDir)
  if (dirty.stdout) problems.push("immutable base checkout is dirty")
  const digest = await pristineTreeSha(baseDir)
  if (digest !== lock.base_source_tree_sha256) problems.push(`base source tree checksum mismatch: expected ${lock.base_source_tree_sha256}, got ${digest}`)
  return problems
}

async function collectProblems(): Promise<string[]> {
  const problems: string[] = []
  if (lock.schema !== 2) problems.push(`unsupported lock schema ${lock.schema}`)
  if (!artifact) problems.push(`no Zig artifact pin for ${platformKey}`)
  if (!existsSync(zigExe)) problems.push(`missing repo-provisioned Zig ${lock.zig.version}; run bun run native:setup`)
  if (!process.env.GIT_STACKS_ZIG && artifact && !existsSync(zigArchive)) problems.push(`missing pinned Zig artifact provenance: ${zigArchive}`)
  if (!existsSync(join(baseDir, ".git")) || !existsSync(join(ghosttyDir, ".git"))) problems.push(`missing pinned Ghostty base/derived checkout; run bun run native:setup`)
  if (problems.length) return problems

  const zigVersion = await run([zigExe, "version"])
  if (zigVersion.code !== 0 || zigVersion.stdout !== lock.zig.version) problems.push(`Zig must be exactly ${lock.zig.version}, got ${zigVersion.stdout || zigVersion.stderr}`)
  if (!process.env.GIT_STACKS_ZIG && artifact && existsSync(zigArchive)) {
    const actual = await sha256(zigArchive)
    if (actual !== artifact.sha256) problems.push(`Zig artifact checksum mismatch: expected ${artifact.sha256}, got ${actual}`)
  }

  problems.push(...await collectBaseProblems())
  if (await sha256(patchPath) !== lock.patch_sha256) problems.push("repository Ghostty patch digest differs from lock")
  const head = await run(["git", "rev-parse", "HEAD"], ghosttyDir)
  if (head.stdout !== lock.base_commit) problems.push(`derived HEAD must remain at base ${lock.base_commit}, got ${head.stdout}`)
  const derived = await sourceTreeSha(ghosttyDir)
  if (derived !== lock.derived_source_tree_sha256) problems.push(`derived source tree checksum mismatch: expected ${lock.derived_source_tree_sha256}, got ${derived}`)

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
    : `native feasibility verified: Zig ${lock.zig.version}; Ghostty base ${lock.base_commit}; full surface API seams present`)
}

async function buildGhostty(): Promise<void> {
  const problems = await collectProblems()
  if (problems.length) throw new Error(`Ghostty provenance rejected before build:\n  - ${problems.join("\n  - ")}`)
  await requireSuccess([
    zigExe, "build", "-Dapp-runtime=none", "-Doptimize=ReleaseFast",
    "-Demit-terminfo=false", "-Demit-termcap=false", "-Demit-themes=false",
    "-Demit-helpgen=false", "-Demit-docs=false", "--summary", "failures",
  ], ghosttyDir)
  const library = join(ghosttyDir, "zig-out", "lib", "libghostty.so")
  if (!existsSync(library)) throw new Error(`full libghostty build artifact missing: ${library}`)
  const symbols = await requireSuccess(["nm", "-D", "--defined-only", library])
  for (const symbol of lock.expected_symbols) {
    if (!new RegExp(`\\b${symbol}$`, "m").test(symbols)) throw new Error(`full libghostty ABI missing expected export: ${symbol}`)
  }
}

async function auditGhostty(): Promise<void> {
  const problems = await collectProblems()
  if (problems.length) throw new Error(`Ghostty audit failed:\n  - ${problems.join("\n  - ")}`)
  const central = await requireSuccess(["git", "diff", "--stat", `${lock.upstream_merge_base}..${lock.base_commit}`, "--", "include/ghostty.h", "src/apprt/embedded.zig"], baseDir)
  const mergeBase = await requireSuccess(["git", "merge-base", lock.base_commit, "upstream/main"], baseDir)
  if (mergeBase !== lock.upstream_merge_base) throw new Error(`upstream merge-base drift: expected ${lock.upstream_merge_base}, got ${mergeBase}`)
  const counts = await requireSuccess(["git", "rev-list", "--left-right", "--count", `${lock.base_commit}...upstream/main`], baseDir)
  console.log(`Ghostty drift audit: base=${lock.base_commit} merge_base=${lock.upstream_merge_base} ahead/behind=${counts}\n${central}`)
  await buildGhostty()
}

function auditProductionGraph(): void {
  const build = readFileSync(join(NATIVE, "build.zig"), "utf8")
  const forbidden = ["lib_vt.zig", "vt_adapter", "terminal/pty.zig", "terminal/runtime.zig", "linux/renderer.zig", "terminal_widget", "appearance_config", "linux/input.zig"]
  for (const seam of forbidden) if (build.includes(seam)) throw new Error(`production build graph retains competing terminal module: ${seam}`)
  for (const required of ["ghostty", "ghostty_surface_abi.zig"]) if (!build.includes(required)) throw new Error(`production build graph missing full Ghostty seam: ${required}`)
  console.log("production graph audit passed: Ghostty is sole renderer/configuration/PTY owner")
}

async function verifyModel(): Promise<void> {
  await verifyFixtureExport()
  await verifyHeaderPortability()
  await requireSuccess(["bun", "test", "tests/lib/service/contract.test.ts"])
  await verify("model-test")
}

async function verifyQuick(): Promise<void> {
  verifyNativeSourceBoundaries()
  verifyAccessibilityContract()
  await verifyModel()
  await verifyRestore()
  await verifyLifecycle()
  auditProductionGraph()
}

async function verifyRestore(): Promise<void> {
  await verify("restore-test")
}

async function verifyLifecycle(): Promise<void> {
  await verify("lifecycle-test")
}

type StressSample = {
  cycle: number; surfaces: number; callbacks: number; clipboard: number; gl_areas: number;
  gl_contexts: number; children: number; rss_bytes: number; fd_count: number; thread_count: number;
}

async function withGraphicalSession<T>(operation: () => Promise<T>): Promise<T> {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) return operation()
  const runtime = join(CACHE, `wayland-${process.pid}`)
  mkdirSync(runtime, { recursive: true, mode: 0o700 })
  const socket = `git-stacks-${process.pid}`
  const westonLog = join(runtime, "weston.log")
  const compositor = Bun.spawn(["weston", "--backend=headless-backend.so", `--socket=${socket}`, "--idle-time=0", `--log=${westonLog}`], { stdout: "pipe", stderr: "pipe", env: { ...process.env, XDG_RUNTIME_DIR: runtime } })
  await Bun.sleep(750)
  try {
    if (compositor.exitCode !== null) throw new Error(`display prerequisite failed: ${readFileSync(westonLog, "utf8")}`)
    const previousRuntime = process.env.XDG_RUNTIME_DIR
    const previousDisplay = process.env.WAYLAND_DISPLAY
    process.env.XDG_RUNTIME_DIR = runtime
    process.env.WAYLAND_DISPLAY = socket
    try { return await operation() } finally {
      if (previousRuntime === undefined) delete process.env.XDG_RUNTIME_DIR; else process.env.XDG_RUNTIME_DIR = previousRuntime
      if (previousDisplay === undefined) delete process.env.WAYLAND_DISPLAY; else process.env.WAYLAND_DISPLAY = previousDisplay
    }
  } finally {
    compositor.kill("SIGTERM")
    await Promise.race([compositor.exited, Bun.sleep(3000)])
    rmSync(runtime, { recursive: true, force: true })
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function slope(values: number[]): number {
  const n = values.length
  const sumX = n * (n - 1) / 2
  const sumY = values.reduce((sum, value) => sum + value, 0)
  const sumXY = values.reduce((sum, value, index) => sum + index * value, 0)
  const sumXX = values.reduce((sum, _value, index) => sum + index * index, 0)
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
}

async function verifyStress(): Promise<void> {
  await verify("lifecycle-stress")
  const artifact = await buildApp()
  const extended = process.env.GIT_STACKS_NATIVE_EXTENDED_STRESS === "1"
  const cycles = extended ? 250 : 25
  const samples: StressSample[] = []
  await withGraphicalSession(async () => {
    for (let cycle = 1; cycle <= cycles; cycle++) {
      const child = Bun.spawn([artifact], {
        stdout: "pipe", stderr: "pipe",
        env: {
          ...process.env,
          GIT_STACKS_NATIVE_SMOKE: "1",
          GIT_STACKS_NATIVE_STRESS_CYCLE: String(cycle),
          ...(cycle % 2 === 0 ? { GIT_STACKS_NATIVE_MULTISURFACE_SMOKE: "1" } : {}),
          ...(cycle % 4 < 2 ? { GIT_STACKS_NATIVE_DESTROY_FORWARD: "1" } : {}),
        },
      })
      const outcome = await Promise.race([child.exited.then((code) => ({ code })), Bun.sleep(15_000).then(() => "timeout" as const)])
      if (outcome === "timeout") { child.kill("SIGKILL"); throw new Error(`production stress cycle ${cycle} timed out`) }
      const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
      if (outcome.code !== 0) throw new Error(`production stress cycle ${cycle} exited ${outcome.code}: ${stderr || stdout}`)
      const line = stderr.split("\n").find((candidate) => candidate.startsWith("GIT_STACKS_STRESS_SAMPLE "))
      if (!line) throw new Error(`production stress cycle ${cycle} omitted teardown diagnostics: ${stderr || stdout}`)
      const fields = Object.fromEntries(line.slice("GIT_STACKS_STRESS_SAMPLE ".length).split(" ").map((field) => {
        const [key, value] = field.split("="); return [key, Number(value)]
      })) as StressSample
      for (const key of ["surfaces", "callbacks", "clipboard", "gl_areas", "gl_contexts", "children"] as const) {
        if (fields[key] !== 0) throw new Error(`production stress cycle ${cycle} leaked ${key}=${fields[key]}: ${line}`)
      }
      if (fields.cycle !== cycle || fields.rss_bytes <= 0 || fields.fd_count <= 0 || fields.thread_count <= 0) throw new Error(`invalid production stress metadata: ${line}`)
      samples.push(fields)
    }
  })
  const measured = samples.slice(Math.min(5, samples.length - 2))
  const rssValues = measured.map((sample) => sample.rss_bytes)
  const rssRange = Math.max(...rssValues) - Math.min(...rssValues)
  const rssSlope = slope(rssValues)
  const fdRange = Math.max(...measured.map((sample) => sample.fd_count)) - Math.min(...measured.map((sample) => sample.fd_count))
  const threadRange = Math.max(...measured.map((sample) => sample.thread_count)) - Math.min(...measured.map((sample) => sample.thread_count))
  if (rssRange > 64 * 1024 * 1024 || rssSlope > 512 * 1024 || fdRange > 4 || threadRange > 4) {
    throw new Error(`production stress trend exceeded bounds: rss_range=${rssRange} rss_slope=${rssSlope} fd_range=${fdRange} thread_range=${threadRange}`)
  }
  console.log(JSON.stringify({ kind: "native-production-stress", lane: extended ? "extended" : "ordinary", cycles, warmup: Math.min(5, samples.length - 2), rss_median: median(rssValues), rss_range: rssRange, rss_slope: rssSlope, fd_range: fdRange, thread_range: threadRange, exact_zero: true }))
}

async function verifyTerminalHost(): Promise<void> {
  verifyNativeSourceBoundaries()
  await verify("terminal-host-test")
}

async function verifyVt(): Promise<void> {
  verifyNativeSourceBoundaries()
  await verify("vt-test")
}

async function verifyGraphical(target: "renderer-test" | "widget-test"): Promise<void> {
  await withGraphicalSession(() => verify(target))
}

async function buildApp(): Promise<string> {
  verifyProductionTerminalComposition()
  await verify("build-app")
  const artifact = join(NATIVE, "zig-out", "bin", "git-stacks-native")
  if (!existsSync(artifact)) throw new Error(`production GTK artifact missing: ${artifact}`)
  return artifact
}

async function runInteractiveApp(): Promise<void> {
  const artifact = await buildApp()
  const service = await startManagedService()
  try {
    const child = Bun.spawn([artifact], { cwd: ROOT, stdin: "inherit", stdout: "inherit", stderr: "inherit", env: process.env })
    const code = await child.exited
    if (code !== 0) throw new Error(`production native executable exited ${code}`)
  } finally {
    await service.stop()
  }
}

async function smokeApp(): Promise<void> {
  const artifact = await buildApp()
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error("display prerequisite unavailable: set DISPLAY/WAYLAND_DISPLAY or install a supported virtual display")
  const child = Bun.spawn([artifact], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_STACKS_NATIVE_SMOKE: "1" } })
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), 30_000) })
  const outcome = await Promise.race([child.exited.then((code) => ({ code })), timeout])
  clearTimeout(timer!)
  if (outcome === "timeout") { child.kill("SIGKILL"); throw new Error("production GTK smoke timed out after 30 seconds") }
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (outcome.code !== 0) throw new Error(`production GTK smoke exited ${outcome.code}: ${stderr || stdout}`)
  if (!stderr.includes("GIT_STACKS_NATIVE_READY") || !stderr.includes("composition=ghostty-surface") || !stderr.includes("input=ghostty") || !/rows=[1-9]\d* columns=[1-9]\d*/.test(stderr) || !/draws=[1-9]\d*/.test(stderr)) throw new Error(`production Ghostty surface evidence missing: ${stderr || stdout}`)
  console.log(`native GTK smoke passed: backend=${process.env.GDK_BACKEND ?? "auto"} display=${process.env.WAYLAND_DISPLAY ?? process.env.DISPLAY} clean-exit=true`)
}
async function smokeTerminal(): Promise<void> {
  const artifact = await buildApp()
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error("display prerequisite unavailable for terminal roundtrip")
  const child = Bun.spawn([artifact], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_STACKS_NATIVE_SMOKE: "1", GIT_STACKS_NATIVE_TERMINAL_SMOKE: "1" } })
  let timer: ReturnType<typeof setTimeout>; const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), 45_000) })
  const outcome = await Promise.race([child.exited.then((code) => ({ code })), timeout]); clearTimeout(timer!)
  if (outcome === "timeout") { child.kill("SIGKILL"); throw new Error("terminal shell roundtrip timed out after 45 seconds") }
  const stderr = await new Response(child.stderr).text()
  if (outcome.code !== 0 || !stderr.includes("GIT_STACKS_TERMINAL_ROUNDTRIP") || !stderr.includes("renderer=ghostty") || !stderr.includes("input=gtk-controller") || !stderr.includes("ime=gtk-im-context") || !stderr.includes("clipboard=system+primary") || !stderr.includes("alternate_screen=true") || !stderr.includes("unicode=true") || !stderr.includes("term_ghostty=true") || !stderr.includes("truecolor=true") || !stderr.includes("terminfo=true") || !stderr.includes("no_color=false") || !/draws=[1-9]\d*/.test(stderr)) throw new Error(`terminal visible Ghostty interaction/capability roundtrip failed (${outcome.code}): ${stderr}`)
  console.log("native terminal smoke passed: Ghostty PTY/render path accepted input, alternate-screen, Unicode, query, resize, and clean exit")
}

async function smokeMultisurface(): Promise<void> {
  const artifact = await buildApp()
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error("display prerequisite unavailable for multisurface smoke")
  const child = Bun.spawn([artifact], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_STACKS_NATIVE_SMOKE: "1", GIT_STACKS_NATIVE_MULTISURFACE_SMOKE: "1" } })
  let timer: ReturnType<typeof setTimeout>; const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), 45_000) })
  const outcome = await Promise.race([child.exited.then((code) => ({ code })), timeout]); clearTimeout(timer!)
  if (outcome === "timeout") { child.kill("SIGKILL"); throw new Error("multisurface smoke timed out after 45 seconds") }
  const stderr = await new Response(child.stderr).text()
  if (outcome.code !== 0 || !stderr.includes("GIT_STACKS_MULTISURFACE_READY surfaces=2") || !stderr.includes("ids_distinct=true") || !/left_rows=[1-9]\d* left_columns=[1-9]\d* right_rows=[1-9]\d* right_columns=[1-9]\d*/.test(stderr) || !/left_draws=[1-9]\d* right_draws=[1-9]\d*/.test(stderr) || !stderr.includes("registrations=2")) throw new Error(`independent Ghostty surface evidence missing (${outcome.code}): ${stderr}`)
  console.log("native multisurface smoke passed: two independently identified, sized, rendered, registered Ghostty leaves")
}

function verifyAccessibilityContract(): void {
  const acceptancePath = join(ROOT, "docs", "native-terminal-acceptance.md")
  const accessibilityPath = join(ROOT, "docs", "native-terminal-accessibility.md")
  for (const path of [acceptancePath, accessibilityPath]) {
    if (!existsSync(path)) throw new Error(`native evidence template missing: ${path}`)
    const source = readFileSync(path, "utf8")
    if (!source.includes("Status: NOT YET OBSERVED") && !source.includes("Status: PASS")) throw new Error(`${path} must state an explicit pending or approved evidence status`)
    if (!source.includes("Observer:") || !source.includes("Date:")) throw new Error(`${path} lacks fillable evidence identity fields`)
  }
  const accessibility = readFileSync(accessibilityPath, "utf8")
  const acceptance = readFileSync(acceptancePath, "utf8")
  for (const required of [lock.base_commit, lock.patch_sha256, "Ghostty-owned PTY", "Fish starts without terminal-query timeout", "Full-screen TUI uses the complete pane", "Two-surface isolation"]) {
    if (!acceptance.includes(required)) throw new Error(`acceptance contract missing production evidence seam: ${required}`)
  }
  if (acceptance.includes("product-owned compatibility reader") || acceptance.includes("embeds pinned `ghostty-vt`")) throw new Error("acceptance contract still describes the superseded custom renderer")
  for (const required of ["Focus", "Keyboard and IME", "Selection and clipboard", "Visible focus", "Cell-level text, caret, and selection", "GTK accessible role", "GENERIC"]) {
    if (!accessibility.includes(required)) throw new Error(`accessibility contract missing observation row: ${required}`)
  }
  if (!accessibility.includes("unsupported/unverified")) throw new Error("accessibility contract must explicitly permit truthful unsupported/unverified cell semantics")
}

async function verifyAccessibility(): Promise<void> {
  verifyAccessibilityContract()
  await withGraphicalSession(() => verify("accessibility-test"))
  console.log("native accessibility evidence templates verified; human observations remain required")
}
async function verifyAll(): Promise<void> {
  await buildGhostty()
  verifyNativeSourceBoundaries()
  auditProductionGraph()
  await verifyModel()
  await verifyRestore()
  await verifyLifecycle()
  await verify("surface-abi")
  await verify("surface-test")
  await verify("interaction-test")
  await verifyStress()
  await verifyAccessibility()
  await withGraphicalSession(async () => {
    await smokeApp()
    await smokeTerminal()
    await smokeMultisurface()
  })
}

const mode = process.argv[2] ?? "verify"
if (mode === "setup") await setup()
else if (mode === "audit-ghostty") await auditGhostty()
else if (mode === "surface-abi") { await buildGhostty(); await verify("surface-abi") }
else if (mode === "surface") { await buildGhostty(); await verify("surface-test") }
else if (mode === "audit-production-graph") auditProductionGraph()
else if (mode === "model") await verifyModel()
else if (mode === "restore") await verifyRestore()
else if (mode === "attention") await verify("attention-test")
else if (mode === "workspace-ui") await verify("workspace-ui-test")
else if (mode === "application-actions") await verify("application-actions-test")
else if (mode === "tabs") await verify("tabs-test")
else if (mode === "service-client") await verify("service-client-test")
else if (mode === "app-graph") await verify("app-graph-test")
else if (mode === "lifecycle") await verifyLifecycle()
else if (mode === "stress") await verifyStress()
else if (mode === "terminal-host") await verifyTerminalHost()
else if (mode === "vt") await verifyVt()
else if (mode === "pty") await verify("pty-test")
else if (mode === "runtime") await verify("runtime-test")
else if (mode === "input") await verify("input-test")
else if (mode === "interaction") await verify("interaction-test")
else if (mode === "renderer") await verifyGraphical("renderer-test")
else if (mode === "widget") await verifyGraphical("widget-test")
else if (mode === "build-app") await buildApp()
else if (mode === "run-app") await runInteractiveApp()
else if (mode === "smoke-app") await smokeApp()
else if (mode === "smoke-terminal") await smokeTerminal()
else if (mode === "smoke-multisurface") await smokeMultisurface()
else if (mode === "accessibility") await verifyAccessibility()
else if (mode === "config") throw new Error("Ghostty configuration is verified through the production runtime; use native:verify")
else if (mode === "quick") await verifyQuick()
else if (mode === "verify") await verifyAll()
else if (mode === "terminal-build") await verify()
else throw new Error(`unknown native verification mode: ${mode}`)
