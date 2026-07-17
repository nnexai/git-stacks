import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

import { assertPublishedArtifact, registryRequestUrl, releaseDistTag } from "../../scripts/publish-release.mjs"

const root = resolve(import.meta.dirname, "../..")

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

test("default installation excludes optional TUI, Bun, and OpenTUI authority", async () => {
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
  const packSource = await readFile(resolve(root, "scripts/pack-release.mjs"), "utf8")
  const defaultRuntimeNames = Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
  })

  assert.equal(packageJson.dependencies?.["@git-stacks/cli"], packageJson.version)
  assert.deepEqual(defaultRuntimeNames.filter((name) => /(?:@git-stacks\/tui|bun|opentui)/i.test(name)), [])
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
  assert.equal(releaseDistTag("0.21.0-rc.5"), "next")
  assert.equal(releaseDistTag("0.21.0"), "latest")
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
