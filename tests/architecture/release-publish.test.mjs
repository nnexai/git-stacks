import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

import { assertPublishedArtifact, releaseDistTag } from "../../scripts/publish-release.mjs"

const root = resolve(import.meta.dirname, "../..")

test("release publication uses GitHub OIDC without a durable npm token", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/release-publish.yml"), "utf8")
  assert.match(workflow, /release:\s*\n\s*types: \[published\]/)
  assert.match(workflow, /id-token: write/)
  assert.match(workflow, /node scripts\/publish-release\.mjs/)
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/)
})

test("release versions select locked npm dist-tags", () => {
  assert.equal(releaseDistTag("0.21.0-rc.5"), "next")
  assert.equal(releaseDistTag("0.21.0"), "latest")
})

test("idempotent publication only accepts identical immutable bytes", () => {
  const artifact = { name: "@git-stacks/tui", version: "0.21.0-rc.5", integrity: "sha512-good", shasum: "good" }
  assert.doesNotThrow(() => assertPublishedArtifact(artifact, { dist: { integrity: "sha512-good", shasum: "good" } }))
  assert.throws(
    () => assertPublishedArtifact(artifact, { dist: { integrity: "sha512-other", shasum: "other" } }),
    /different release bytes/,
  )
})
