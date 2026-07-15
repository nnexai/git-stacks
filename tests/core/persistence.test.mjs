import assert from "node:assert/strict"
import { chmod, mkdtemp, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import test from "node:test"
import { atomicReplaceSync, withMutationLeaseSync } from "../../packages/core/dist/persistence.js"

async function child(argv) {
  await new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    childProcess.stderr.on("data", (chunk) => { stderr += chunk })
    childProcess.once("error", reject)
    childProcess.once("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)))
  })
}

test("atomic replacement preserves complete content, mode, and cleans temporary files", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-atomic-"))
  const path = join(root, "state.json")
  await writeFile(path, "old\n", { mode: 0o640 })
  atomicReplaceSync(path, "new\n")
  assert.equal(await readFile(path, "utf8"), "new\n")
  assert.equal((await stat(path)).mode & 0o777, 0o640)
  assert.deepEqual(await readdir(root), ["state.json"])
})

test("per-target leases merge concurrent process intents without a global lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-lease-"))
  const path = join(root, "counter.json")
  await writeFile(path, '{"count":0}\n', { mode: 0o600 })
  const worker = new URL("./persistence-worker.mjs", import.meta.url).pathname
  await Promise.all(Array.from({ length: 6 }, () => child([worker, path, "15"])))
  assert.equal(JSON.parse(await readFile(path, "utf8")).count, 90)
  assert.equal((await readdir(root)).some((name) => name.includes(".lock") || name.includes(".tmp")), false)
})

test("dead stale owners recover while live owners produce bounded diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-stale-"))
  const path = join(root, "state.json")
  const lock = `${path}.lock`
  await writeFile(path, "{}\n")
  await writeFile(lock, JSON.stringify({ pid: 99999999, nonce: "dead", createdAt: 1, target: path }))
  await utimes(lock, new Date(0), new Date(0))
  assert.equal(withMutationLeaseSync(path, () => "recovered", { staleMs: 1 }), "recovered")

  await writeFile(lock, JSON.stringify({ pid: process.pid, nonce: "live", createdAt: Date.now(), target: path }))
  await chmod(lock, 0o600)
  assert.throws(
    () => withMutationLeaseSync(path, () => undefined, { timeoutMs: 5, retryMs: 1, staleMs: 1 }),
    /owner pid/,
  )
})
