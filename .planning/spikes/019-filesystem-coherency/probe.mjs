import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  watch,
  writeFileSync,
  writeSync,
} from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const startedAt = Date.now()
const events = []
function record(category, detail = {}) {
  events.push({ at: new Date().toISOString(), elapsedMs: Date.now() - startedAt, category, ...detail })
}

function walk(path) {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name)
    return entry.isDirectory() ? walk(child) : [child]
  })
}

function metadataFingerprint(path) {
  if (!existsSync(path)) return "missing"
  return walk(path).map((file) => {
    const stat = statSync(file)
    return `${relative(path, file)}\0${stat.size}\0${stat.mtimeMs}`
  }).sort().join("\n")
}

function contentFingerprint(path) {
  const hash = createHash("sha256")
  if (!existsSync(path)) return "missing"
  for (const file of walk(path).sort()) {
    hash.update(relative(path, file)).update("\0").update(readFileSync(file)).update("\0")
  }
  return hash.digest("hex")
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  const descriptor = openSync(temporary, "wx", 0o600)
  try {
    writeSync(descriptor, value, 0, "utf8")
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, path)
}

function waitFor(predicate, timeoutMs = 5_000, label = "condition") {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const poll = () => {
      const value = predicate()
      if (value) return resolve(value)
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for ${label}`))
      setTimeout(poll, 10)
    }
    poll()
  })
}

function createMonitor(root, { watchEvents = true, debounceMs = 30, reconcileMs = 75 } = {}) {
  let watcher
  let timer
  let disposed = false
  let fingerprint = contentFingerprint(root)
  let invalidations = 0
  let watchSignals = 0
  let reconciliationSignals = 0
  const revisions = []

  const rebuild = (source) => {
    if (disposed) return
    const next = contentFingerprint(root)
    if (next === fingerprint) return
    fingerprint = next
    invalidations += 1
    revisions.push(next)
    if (source === "watch") watchSignals += 1
    else reconciliationSignals += 1
  }
  const schedule = () => {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(() => rebuild("watch"), debounceMs)
  }
  if (watchEvents) watcher = watch(root, { recursive: true }, schedule)
  const interval = setInterval(() => rebuild("reconcile"), reconcileMs)
  return {
    get state() { return { invalidations, watchSignals, reconciliationSignals, revisions: [...revisions] } },
    close() {
      disposed = true
      clearTimeout(timer)
      clearInterval(interval)
      watcher?.close()
    },
  }
}

function runWriter(path, count) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, "writer.mjs"), path, String(count)], { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`writer exited ${code}: ${stderr}`)))
  })
}

async function externalWriterObservation(root) {
  const target = join(root, "workspaces", "alpha.json")
  const monitor = createMonitor(root)
  await runWriter(target, 100)
  await waitFor(() => monitor.state.invalidations > 0, 5_000, "external writer invalidation")
  const parsed = JSON.parse(readFileSync(target, "utf8"))
  await delay(100)
  const state = monitor.state
  monitor.close()
  const result = {
    passed: parsed.version === 100 && state.invalidations < 100 && state.watchSignals >= 1,
    finalVersion: parsed.version,
    writes: 100,
    ...state,
  }
  record("external-writer-observation", result)
  return result
}

async function droppedEventReconciliation(root) {
  const target = join(root, "workspaces", "reconcile.json")
  atomicWrite(target, '{"value":"AAAA"}\n')
  const before = statSync(target)
  const metadataBefore = metadataFingerprint(root)
  const contentBefore = contentFingerprint(root)
  const monitor = createMonitor(root, { watchEvents: false })
  atomicWrite(target, '{"value":"BBBB"}\n')
  utimesSync(target, before.atimeMs / 1_000, before.mtimeMs / 1_000)
  const metadataAfter = metadataFingerprint(root)
  const contentAfter = contentFingerprint(root)
  await waitFor(() => monitor.state.reconciliationSignals > 0, 5_000, "content reconciliation")
  const state = monitor.state
  monitor.close()
  const result = {
    passed: metadataBefore === metadataAfter && contentBefore !== contentAfter && state.reconciliationSignals === 1,
    metadataCollision: metadataBefore === metadataAfter,
    metadataBefore,
    metadataAfter,
    contentChanged: contentBefore !== contentAfter,
    ...state,
  }
  record("dropped-event-reconciliation", result)
  return result
}

function fixedTemporaryPathRace(root) {
  const target = join(root, "race-fixed.json")
  const temporary = `${target}.tmp`
  const first = openSync(temporary, "w")
  const second = openSync(temporary, "w")
  const longValue = `${JSON.stringify({ label: "A".repeat(2048), priority: 1 })}\n`
  const shortValue = `${JSON.stringify({ priority: 2 })}\n`
  writeSync(first, longValue, 0, "utf8")
  fsyncSync(first)
  renameSync(temporary, target)
  writeSync(second, shortValue, 0, "utf8")
  fsyncSync(second)
  closeSync(first)
  closeSync(second)
  let parseable = true
  try { JSON.parse(readFileSync(target, "utf8")) } catch { parseable = false }
  const result = { passed: !parseable, parseable, targetBytes: statSync(target).size }
  record("fixed-temporary-path-race", result)
  return result
}

function uniqueTemporaryPaths(root) {
  const target = join(root, "race-unique.json")
  atomicWrite(target, `${JSON.stringify({ label: "safe", priority: 1 })}\n`)
  atomicWrite(target, `${JSON.stringify({ label: "safe", priority: 2 })}\n`)
  const value = JSON.parse(readFileSync(target, "utf8"))
  const result = { passed: value.label === "safe" && value.priority === 2, value }
  record("unique-temporary-paths", result)
  return result
}

function lostUpdate(root) {
  const target = join(root, "lost-update.json")
  atomicWrite(target, `${JSON.stringify({ labels: [], priority: 0 })}\n`)
  const firstRead = JSON.parse(readFileSync(target, "utf8"))
  const secondRead = JSON.parse(readFileSync(target, "utf8"))
  atomicWrite(target, `${JSON.stringify({ ...firstRead, labels: ["important"] })}\n`)
  atomicWrite(target, `${JSON.stringify({ ...secondRead, priority: 100 })}\n`)
  const final = JSON.parse(readFileSync(target, "utf8"))
  const result = {
    passed: final.priority === 100 && final.labels.length === 0,
    demonstratedLostUpdate: final.labels.length === 0,
    final,
  }
  record("lost-update", result)
  return result
}

const root = mkdtempSync(join(tmpdir(), "git-stacks-fs-coherency-"))
mkdirSync(join(root, "workspaces"), { recursive: true })
const checks = []
for (const check of [externalWriterObservation, droppedEventReconciliation, fixedTemporaryPathRace, uniqueTemporaryPaths, lostUpdate]) {
  process.stderr.write(`running ${check.name}\n`)
  try {
    checks.push({ name: check.name, ...(await check(root)) })
  } catch (error) {
    const failure = { name: check.name, passed: false, error: error instanceof Error ? error.stack : String(error) }
    checks.push(failure)
    record(check.name, failure)
  }
}
rmSync(root, { recursive: true, force: true })

const report = {
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  passed: checks.every((check) => check.passed),
  durationMs: Date.now() - startedAt,
  checks,
  events,
}
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.passed ? 0 : 1
