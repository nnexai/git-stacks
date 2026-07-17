import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

import { assertPublishedArtifact, registryRequestUrl, releaseDistTag } from "../../scripts/publish-release.mjs"

const root = resolve(import.meta.dirname, "../..")
const rcVersion = "0.22.0-rc.1"
const rcTag = "v0.22.0-rc.1"
const manifestPaths = [
  "package.json",
  "packages/protocol/package.json",
  "packages/client/package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
  "packages/service/package.json",
  "packages/web/package.json",
  "packages/tui/package.json",
]
const internalDependencySections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"))
}

function internalDependencyEntries(manifest) {
  return internalDependencySections.flatMap((section) =>
    Object.entries(manifest[section] ?? {}).filter(([name]) => name.startsWith("@git-stacks/")),
  )
}

function lockPackageKey(manifestPath) {
  return manifestPath === "package.json" ? "" : manifestPath.slice(0, -"/package.json".length)
}

test("release publication uses GitHub OIDC without a durable npm token", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/release-publish.yml"), "utf8")
  assert.match(workflow, /release:\s*\n\s*types: \[published\]/)
  assert.match(workflow, /id-token: write/)
  assert.match(workflow, /node scripts\/publish-release\.mjs/)
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/)
})

test("the Node runtime matrix does not require optional TUI build artifacts", async () => {
  const source = await readFile(resolve(root, "scripts/check-packages.mjs"), "utf8")
  assert.match(source, /const nativeOnly = process\.argv\.includes\("--native-only"\)/)
  assert.match(source, /if \(!nativeOnly\) \{\s*try \{\s*const tuiDist/)
})

test("release candidate validation keeps tag creation behind the explicit --tag guard", async () => {
  const source = await readFile(resolve(root, "scripts/release-rc-check.mjs"), "utf8")
  const guardIndex = source.indexOf('if (process.argv.includes("--tag"))')
  const tagCalls = [...source.matchAll(/run\("git",\s*\["tag"/g)]

  assert.notEqual(guardIndex, -1)
  assert.equal(tagCalls.length, 1)
  assert.ok(tagCalls[0].index > guardIndex)
  assert.doesNotMatch(source, /run\("git",\s*\["push"/)
  assert.doesNotMatch(source, /run\("npm",\s*\["publish"/)
  assert.doesNotMatch(source, /run\("gh",\s*\["(?:release|workflow|api)"/)
  assert.match(source, /Verification only\. Pass --tag explicitly/)
})

test("Phase 127 RC metadata is one exact root and seven-workspace graph", async () => {
  const manifests = await Promise.all(manifestPaths.map(async (relativePath) => ({
    relativePath,
    manifest: await readJson(relativePath),
  })))
  assert.equal(manifests.length, 8)

  for (const { relativePath, manifest } of manifests) {
    assert.equal(manifest.version, rcVersion, `${relativePath} version`)
    for (const [name, version] of internalDependencyEntries(manifest)) {
      assert.equal(version, rcVersion, `${relativePath} ${name} range`)
    }
  }

  const lock = await readJson("package-lock.json")
  for (const { relativePath, manifest } of manifests) {
    const key = lockPackageKey(relativePath)
    const lockRecord = lock.packages?.[key]
    assert.ok(lockRecord, `${key || "root"} lockfile record`)
    assert.equal(lockRecord.name, manifest.name, `${key || "root"} lockfile name`)
    assert.equal(lockRecord.version, rcVersion, `${key || "root"} lockfile version`)
    for (const [name, version] of internalDependencyEntries(lockRecord)) {
      assert.equal(version, rcVersion, `${key || "root"} lockfile ${name} range`)
    }
  }

  assert.equal(`v${manifests[0].manifest.version}`, rcTag)
})

test("default installation excludes optional TUI, Bun, and OpenTUI authority", async () => {
  const manifests = await Promise.all(manifestPaths.map((relativePath) => readJson(relativePath)))
  const packageJson = manifests[0]
  const manifestsByName = new Map(manifests.map((manifest) => [manifest.name, manifest]))
  const visitedInternalPackages = new Set()
  const defaultRuntimeNames = new Set()
  const queue = [packageJson.name]

  while (queue.length > 0) {
    const packageName = queue.shift()
    if (!packageName || visitedInternalPackages.has(packageName)) continue
    visitedInternalPackages.add(packageName)
    const manifest = manifestsByName.get(packageName)
    assert.ok(manifest, `manifest for ${packageName}`)
    for (const dependencyName of Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    })) {
      defaultRuntimeNames.add(dependencyName)
      if (dependencyName.startsWith("@git-stacks/") && manifestsByName.has(dependencyName)) queue.push(dependencyName)
    }
  }

  const packSource = await readFile(resolve(root, "scripts/pack-release.mjs"), "utf8")
  assert.equal(packageJson.version, rcVersion)
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), ["@git-stacks/cli"])
  assert.equal(packageJson.dependencies?.["@git-stacks/cli"], rcVersion)
  assert.equal(visitedInternalPackages.has("@git-stacks/tui"), false)
  assert.deepEqual([...defaultRuntimeNames].filter((name) => /(?:@git-stacks\/tui|bun|opentui)/i.test(name)), [])
  assert.match(packSource, /"packages\/tui"/)
  assert.match(packSource, /npm_dist_tag: "next"/)
})

test("release preparation preserves every existing planning phase directory", async () => {
  const phaseRoot = resolve(root, ".planning/phases")
  const snapshot = async () => (await readdir(phaseRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const before = await snapshot()
  assert.ok(before.length > 0)
  assert.ok(before.includes("127-stale-workspace-intelligence-and-rc-closure"))

  const guardedFiles = [
    "package.json",
    "scripts/release-rc-check.mjs",
    "scripts/pack-release.mjs",
    "scripts/check-packages.mjs",
    "scripts/publish-release.mjs",
  ]
  for (const file of guardedFiles) {
    const source = await readFile(resolve(root, file), "utf8")
    assert.doesNotMatch(source, /\.planning[\\/]phases/)
    assert.doesNotMatch(source, /git\s+(?:clean|rm|reset\s+--hard)/)
  }

  for (const phase of before) {
    const entries = await readdir(resolve(phaseRoot, phase))
    assert.ok(Array.isArray(entries), `${phase} must remain readable`)
  }
  assert.deepEqual(await snapshot(), before)
})

test("release versions select locked npm dist-tags", () => {
  assert.equal(releaseDistTag(rcVersion), "next")
  assert.equal(releaseDistTag("0.22.0"), "latest")
})

test("registry verification bypasses stale CDN metadata", () => {
  const url = registryRequestUrl("%40git-stacks%2Fcore", "test-nonce")
  assert.equal(url.origin, "https://registry.npmjs.org")
  assert.equal(url.pathname, "/%40git-stacks%2Fcore")
  assert.equal(url.searchParams.get("git-stacks-cache-bust"), "test-nonce")
})

test("idempotent publication only accepts identical immutable bytes", () => {
  const artifact = { name: "@git-stacks/tui", version: "0.21.0-rc.5", integrity: "sha512-good", shasum: "good" }
  assert.doesNotThrow(() => assertPublishedArtifact(artifact, { dist: { integrity: "sha512-good", shasum: "good" } }))
  assert.throws(
    () => assertPublishedArtifact(artifact, { dist: { integrity: "sha512-other", shasum: "other" } }),
    /different release bytes/,
  )
})
