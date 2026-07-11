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
  if (!stderr.includes("GIT_STACKS_NATIVE_READY") || !stderr.includes("text=git-stacks-native-terminal-ready")) throw new Error(`production GTK readiness evidence missing: ${stderr || stdout}`)
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
  if (outcome.code !== 0 || !stderr.includes("GIT_STACKS_TERMINAL_ROUNDTRIP") || !stderr.includes("SHELL_RESULT_UNIQUE")) throw new Error(`terminal roundtrip failed (${outcome.code}): ${stderr}`)
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
  console.log("native accessibility evidence templates verified; human observations remain required")
}

const mode = process.argv[2] ?? "verify"
if (mode === "setup") await setup()
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
else if (mode === "quick" || mode === "verify") await verifyQuick()
else if (mode === "terminal-build") await verify()
else throw new Error(`unknown native verification mode: ${mode}`)
