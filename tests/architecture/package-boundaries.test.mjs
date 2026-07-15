import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const checker = join(root, "scripts/check-architecture.mjs")

async function fixture(importer, source) {
  const parent = await mkdtemp(join(tmpdir(), "git-stacks-architecture-"))
  const packageRoot = join(parent, importer, "src")
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, "index.ts"), source)
  return parent
}

test("the real package graph respects declared boundaries", () => {
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
})

for (const sample of [
  { importer: "web", source: 'import "node:fs"', expected: "Node builtin node:fs" },
  { importer: "client", source: 'import "@git-stacks/core"', expected: "must not import @git-stacks/core" },
  { importer: "core", source: 'import "@git-stacks/protocol"', expected: "must not import @git-stacks/protocol" },
  { importer: "cli", source: 'await import("@git-stacks/service")', expected: "must not import @git-stacks/service" },
  { importer: "tui", source: 'import "@git-stacks/service"', expected: "may only import @git-stacks/service/client" },
]) {
  test(`rejects ${sample.importer} forbidden import`, async () => {
    const packages = await fixture(sample.importer, sample.source)
    try {
      const result = spawnSync(process.execPath, [checker], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GS_ARCH_PACKAGES_ROOT: packages },
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, new RegExp(sample.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    } finally {
      await rm(packages, { recursive: true, force: true })
    }
  })
}
