#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs"
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
  const productionAllowlist = new Set(["native/terminal/vt_adapter.zig", "native/build.zig"])
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
  const required = [
    "TerminalRuntime.init(allocator, commandForLaunch()",
    "gtk_event_controller_key_new()",
    '"key-pressed"',
    "gtk_im_multicontext_new()",
    "gtk_gesture_drag_new()",
    "gdk_clipboard_read_text_async",
    "gdk_display_get_primary_clipboard",
    '"preedit-changed"',
    '"resize"',
    "state.runtime.resizeViewport(grid.columns, grid.rows",
    "g_timeout_add(8, pumpTimer",
  ]
  for (const seam of required) {
    if (!app.includes(seam)) throw new Error(`production terminal composition missing: ${seam}`)
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
  await verify("terminal-api-smoke")
  await verify("terminal-host-test")
  await verify("lifecycle-stress")
}

async function verifyRestore(): Promise<void> {
  await verify("restore-test")
}

async function verifyLifecycle(): Promise<void> {
  await verify("lifecycle-test")
}
async function verifyStress(): Promise<void> { await verify("lifecycle-stress") }

async function verifyTerminalHost(): Promise<void> {
  verifyNativeSourceBoundaries()
  await verify("terminal-host-test")
}

async function verifyVt(): Promise<void> {
  verifyNativeSourceBoundaries()
  await verify("vt-test")
}

async function verifyGraphical(target: "renderer-test" | "widget-test"): Promise<void> {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    await verify(target)
    return
  }
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
    try { await verify(target) } finally {
      if (previousRuntime === undefined) delete process.env.XDG_RUNTIME_DIR; else process.env.XDG_RUNTIME_DIR = previousRuntime
      if (previousDisplay === undefined) delete process.env.WAYLAND_DISPLAY; else process.env.WAYLAND_DISPLAY = previousDisplay
    }
  } finally {
    compositor.kill("SIGTERM")
    await Promise.race([compositor.exited, Bun.sleep(3000)])
    rmSync(runtime, { recursive: true, force: true })
  }
}

async function buildApp(): Promise<string> {
  verifyProductionTerminalComposition()
  await verify("build-app")
  const artifact = join(NATIVE, "zig-out", "bin", "git-stacks-native")
  if (!existsSync(artifact)) throw new Error(`production GTK artifact missing: ${artifact}`)
  return artifact
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
  if (!stderr.includes("GIT_STACKS_NATIVE_READY") || !stderr.includes("composition=pty-runtime") || !stderr.includes("input=gtk-controller") || !/font_family=.+ actual_font_family=.+ font_size=\d+\.\d{2} cell=\d+\.\d{2}x\d+\.\d{2}/.test(stderr) || !/draws=[1-9]\d* painted_cells=[1-9]\d* cursor_draws=[1-9]\d*/.test(stderr)) throw new Error(`production GTK PTY composition/font/cursor evidence missing: ${stderr || stdout}`)
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
  if (outcome.code !== 0 || !stderr.includes("GIT_STACKS_TERMINAL_ROUNDTRIP") || !stderr.includes("DA_RESPONSE_OK") || !stderr.includes("input=gtk-commit-path") || !stderr.includes("composition=pty-runtime") || !/font_family=.+ actual_font_family=.+ font_size=\d+\.\d{2} cell=\d+\.\d{2}x\d+\.\d{2}/.test(stderr) || !/draws=[1-9]\d* painted_cells=[1-9]\d* cursor_draws=[1-9]\d*/.test(stderr)) throw new Error(`terminal visible production-input/query/font/cursor roundtrip failed (${outcome.code}): ${stderr}`)
  console.log("native terminal smoke passed: PTY input/output, alternate-screen parsing, resize/reflow, and clean exit verified")
}

function verifyAccessibilityContract(): void {
  const acceptancePath = join(ROOT, "docs", "native-terminal-acceptance.md")
  const accessibilityPath = join(ROOT, "docs", "native-terminal-accessibility.md")
  for (const path of [acceptancePath, accessibilityPath]) {
    if (!existsSync(path)) throw new Error(`native evidence template missing: ${path}`)
    const source = readFileSync(path, "utf8")
    if (!source.includes("Status: NOT YET OBSERVED")) throw new Error(`${path} must remain explicitly unverified before human evidence`)
    if (!source.includes("Observer:") || !source.includes("Date:")) throw new Error(`${path} lacks fillable evidence identity fields`)
  }
  const accessibility = readFileSync(accessibilityPath, "utf8")
  for (const required of ["Focus", "Keyboard and IME", "Selection and clipboard", "Visible focus", "Cell-level screen-reader output"]) {
    if (!accessibility.includes(required)) throw new Error(`accessibility contract missing observation row: ${required}`)
  }
  if (!accessibility.includes("unsupported/unverified")) throw new Error("accessibility contract must explicitly permit truthful unsupported/unverified cell semantics")
}

async function verifyAccessibility(): Promise<void> {
  verifyAccessibilityContract()
  await verify("accessibility-test")
  console.log("native accessibility evidence templates verified; human observations remain required")
}
async function verifyGhosttyConfig(): Promise<void> { await verify("config-test") }
async function verifyAll(): Promise<void> {
  await verifyQuick(); await verifyGhosttyConfig(); await verify("vt-test"); await verify("pty-test");
  await verifyGraphical("renderer-test"); await verifyGraphical("widget-test");
  await verify("input-test"); await verify("interaction-test"); await verify("runtime-test"); await verifyStress();
  await verifyAccessibility(); await buildApp(); await smokeApp(); await smokeTerminal();
}

const mode = process.argv[2] ?? "verify"
if (mode === "setup") await setup()
else if (mode === "audit-ghostty") await auditGhostty()
else if (mode === "surface-abi") { await buildGhostty(); await verify("surface-abi") }
else if (mode === "audit-production-graph") auditProductionGraph()
else if (mode === "model") await verifyModel()
else if (mode === "restore") await verifyRestore()
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
else if (mode === "run-app") await verify("run-app")
else if (mode === "smoke-app") await smokeApp()
else if (mode === "smoke-terminal") await smokeTerminal()
else if (mode === "accessibility") await verifyAccessibility()
else if (mode === "config") await verifyGhosttyConfig()
else if (mode === "quick") await verifyQuick()
else if (mode === "verify") await verifyAll()
else if (mode === "terminal-build") await verify()
else throw new Error(`unknown native verification mode: ${mode}`)
