import { execFileSync } from "node:child_process"
import { access, readFile, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const names = ["protocol", "client", "core", "web", "service", "cli", "tui"]
const manifests = new Map()
const failures = []
const nativeOnly = process.argv.includes("--native-only")

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}

for (const name of names) {
  manifests.set(name, await readJson(join(root, "packages", name, "package.json")))
}
const facade = await readJson(join(root, "package.json"))
const version = facade.version
const repositoryUrl = "git+https://github.com/nnexai/git-stacks.git"

function validateBin(packageName, manifest, executable, expectedTarget) {
  const target = manifest.bin?.[executable]
  if (target !== expectedTarget) failures.push(`${packageName}: ${executable} bin must be ${expectedTarget}, found ${String(target)}`)
  if (typeof target === "string" && target.startsWith("./")) failures.push(`${packageName}: npm publish rejects bin targets beginning with ./`)
}

validateBin("facade", facade, "git-stacks", "bin/git-stacks.js")
validateBin("cli", manifests.get("cli"), "git-stacks", "dist/index.js")
validateBin("tui", manifests.get("tui"), "git-stacks-tui", "dist/index.js")

for (const [name, manifest] of manifests) {
  if (manifest.version !== version) failures.push(`${name}: version ${manifest.version} does not match ${version}`)
  if (manifest.license !== "MIT") failures.push(`${name}: package license must be MIT`)
  if (manifest.publishConfig?.access !== "public") failures.push(`${name}: publishConfig.access must be public`)
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) failures.push(`${name}: files allowlist is required`)
  if (manifest.repository?.url !== repositoryUrl) failures.push(`${name}: repository.url must identify the trusted-publishing repository`)
  for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
    if (dependency.startsWith("@git-stacks/") && range !== version) {
      failures.push(`${name}: ${dependency} must use exact workspace version ${version}, found ${range}`)
    }
  }
}
if (facade.repository?.url !== repositoryUrl) failures.push("facade: repository.url must identify the trusted-publishing repository")

const service = manifests.get("service")
if (service.dependencies["node-pty"] !== "1.2.0-beta.14") failures.push("service: node-pty must remain exact-pinned at 1.2.0-beta.14")
if (service.dependencies["@fails-components/webtransport"] !== "1.6.6") failures.push("service: WebTransport must remain exact-pinned at 1.6.6")
if (service.dependencies["@fails-components/webtransport-transport-http3-quiche"] !== "1.6.6") failures.push("service: native HTTP/3 transport must remain exact-pinned at 1.6.6")
if (service.dependencies["@napi-rs/keyring"] !== "1.3.0") failures.push("service: native OS credential store must remain exact-pinned at 1.3.0")
const tui = manifests.get("tui")
if (tui.dependencies["@opentui/core"] !== "0.4.3" || tui.dependencies["@opentui/solid"] !== "0.4.3") {
  failures.push("tui: OpenTUI packages must remain exact-pinned at 0.4.3")
}
if (!nativeOnly) {
  try {
    const tuiDist = join(root, "packages", "tui", "dist")
    const launcher = await readFile(join(tuiDist, "index.js"), "utf8")
    const preloadIndex = launcher.indexOf('await import("@opentui/solid/preload")')
    const dashboardIndex = launcher.indexOf('await import("./run.js")')
    if (preloadIndex < 0 || dashboardIndex < 0 || preloadIndex > dashboardIndex) {
      failures.push("tui: launcher must await the OpenTUI preload before importing the dashboard")
    }
    for (const entry of await readdir(tuiDist)) {
      if (!entry.endsWith(".js")) continue
      const bundle = await readFile(join(tuiDist, entry), "utf8")
      if (bundle.includes("@opentui/solid/jsx-runtime") || bundle.includes("@opentui/solid/jsx-dev-runtime")) {
        failures.push(`tui: ${entry} was built without the required OpenTUI Solid compiler plugin`)
      }
    }
  } catch {
    failures.push("tui: built entrypoint is unavailable for compiler validation")
  }
}

function walkInternal(packageName, seen = new Set()) {
  if (seen.has(packageName)) return seen
  seen.add(packageName)
  const manifest = packageName === "git-stacks" ? facade : manifests.get(packageName)
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (dependency === "git-stacks") continue
    if (dependency.startsWith("@git-stacks/")) walkInternal(dependency.slice("@git-stacks/".length), seen)
  }
  return seen
}
const defaultGraph = walkInternal("git-stacks")
if (defaultGraph.has("tui")) failures.push("default package graph must not include the optional TUI")

const requiredPrebuilds = [
  "prebuilds/linux-x64/pty.node",
  "prebuilds/linux-arm64/pty.node",
  "prebuilds/darwin-x64/pty.node",
  "prebuilds/darwin-arm64/pty.node",
]
for (const path of requiredPrebuilds) {
  try { await access(join(root, "node_modules", "node-pty", path)) }
  catch { failures.push(`node-pty: missing packaged prebuild ${path}`) }
}
try { await access(join(root, "node_modules", "@fails-components", "webtransport-transport-http3-quiche", "build", "Release", "webtransport.node")) }
catch { failures.push("WebTransport: native HTTP/3 addon is unavailable for the current release platform") }
const keyringPlatform = `${process.platform}-${process.arch}`
const keyringAddons = {
  "linux-x64": ["keyring-linux-x64-gnu", "keyring.linux-x64-gnu.node"],
  "linux-arm64": ["keyring-linux-arm64-gnu", "keyring.linux-arm64-gnu.node"],
  "darwin-x64": ["keyring-darwin-x64", "keyring.darwin-x64.node"],
  "darwin-arm64": ["keyring-darwin-arm64", "keyring.darwin-arm64.node"],
}
const keyringAddon = keyringAddons[keyringPlatform]
if (!keyringAddon) failures.push(`OS credential store: unsupported release platform ${keyringPlatform}`)
else {
  try { await access(join(root, "node_modules", "@napi-rs", keyringAddon[0], keyringAddon[1])) }
  catch { failures.push(`OS credential store: native addon is unavailable for ${keyringPlatform}`) }
}

if (nativeOnly) {
  if (failures.length > 0) {
    console.error("Native runtime validation failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"))
    process.exit(1)
  }
  await import("@napi-rs/keyring")
  console.log(`Native runtime artifacts: OK (${keyringPlatform})`)
  process.exit(0)
}

const packTargets = [".", ...names.map((name) => `packages/${name}`)]
for (const target of packTargets) {
  let result
  try {
    result = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
      cwd: resolve(root, target),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }))
  } catch (error) {
    failures.push(`${target}: npm pack --dry-run failed: ${error.stderr?.toString().trim() ?? error.message}`)
    continue
  }
  const files = new Set((result[0]?.files ?? []).map((entry) => entry.path))
  if (!files.has("package.json")) failures.push(`${target}: package.json missing from tarball`)
  if (target === "." && !files.has("bin/git-stacks.js")) failures.push("facade: bin/git-stacks.js missing from tarball")
  if (target.includes("/web") && !files.has("dist/manifest.json")) failures.push("web: asset manifest missing from tarball")
  if (target.includes("/cli") && !files.has("dist/index.js")) failures.push("cli: built entrypoint missing from tarball")
  if (target.includes("/service") && !files.has("dist/index.js")) failures.push("service: built entrypoint missing from tarball")
  if (target.includes("/service") && !files.has("dist/daemon.js")) failures.push("service: managed daemon entrypoint missing from tarball")
  if (target.includes("/tui") && !files.has("dist/index.js")) failures.push("tui: built entrypoint missing from tarball")
  if (target.includes("/tui") && !files.has("dist/run.js")) failures.push("tui: compiled dashboard missing from tarball")
  for (const path of files) {
    if (path.startsWith("src/") && target === ".") failures.push(`facade: legacy source leaked into tarball (${path})`)
    if (path.includes(".coverage") || path.includes(".planning")) failures.push(`${target}: development artifact leaked into tarball (${path})`)
  }
}

if (failures.length > 0) {
  console.error("Package validation failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"))
  process.exit(1)
}

console.log(`Package artifacts: OK (${packTargets.length} dry-run tarballs; default graph excludes TUI)`)
