import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
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
