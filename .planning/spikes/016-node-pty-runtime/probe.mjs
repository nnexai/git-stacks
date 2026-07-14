import * as pty from "node-pty"
import { execFileSync } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"

const events = []
const startedAt = Date.now()

function record(category, detail = {}) {
  events.push({ at: new Date().toISOString(), elapsedMs: Date.now() - startedAt, category, ...detail })
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

function exited(terminal, timeoutMs = 5_000) {
  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      try { terminal.kill() } catch {}
      resolve({ exitCode: null, signal: null, timedOut: true })
    }, timeoutMs)
    terminal.onExit((event) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(event)
    })
  })
}

async function interactiveResizeAndExit() {
  let output = ""
  const shell = "/bin/bash"
  const terminal = pty.spawn(shell, ["--noprofile", "--norc"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env, PS1: "" },
  })
  terminal.onData((chunk) => { output += chunk })
  const exitPromise = exited(terminal)
  terminal.write("printf '__PTY_READY__\\n'\r")
  await waitFor(() => output.includes("__PTY_READY__"), 5_000, "interactive shell output")
  terminal.resize(132, 43)
  terminal.write("printf '__PTY_SIZE__'; stty size\r")
  try {
    await waitFor(() => /__PTY_SIZE__43\s+132/.test(output), 5_000, "resized PTY dimensions")
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error}; output=${JSON.stringify(output)}`)
  }
  terminal.write("exit\r")
  const exit = await exitPromise
  const result = { passed: exit.exitCode === 0 && /__PTY_SIZE__43\s+132/.test(output), exit }
  record("interactive-resize-exit", result)
  return result
}

async function eofExit() {
  let output = ""
  const terminal = pty.spawn("/bin/sh", [], {
    name: "xterm-256color", cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
  })
  terminal.onData((chunk) => { output += chunk })
  const exitPromise = exited(terminal)
  terminal.write("printf '__EOF_READY__\\n'\r")
  await waitFor(() => output.includes("__EOF_READY__"), 5_000, "EOF shell readiness")
  terminal.write("\x04")
  const exit = await exitPromise
  const result = { passed: exit.exitCode === 0, exit }
  record("ctrl-d-exit", result)
  return result
}

async function detachedRetention() {
  const retainedLimit = 1024 * 1024
  let retained = ""
  let totalBytes = 0
  let attachmentVisible = false
  let liveBytes = 0
  const terminal = pty.spawn("/bin/sh", ["-c", "printf before; sleep 0.15; printf hidden; sleep 0.15; printf after"], {
    name: "xterm-256color", cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
  })
  terminal.onData((chunk) => {
    totalBytes += Buffer.byteLength(chunk)
    retained = (retained + chunk).slice(-retainedLimit)
    if (attachmentVisible) liveBytes += Buffer.byteLength(chunk)
  })
  const exitPromise = exited(terminal)
  await waitFor(() => retained.includes("hidden"), 5_000, "hidden output")
  attachmentVisible = true
  const exit = await exitPromise
  const result = {
    passed: retained.includes("beforehiddenafter") && totalBytes > liveBytes && exit.exitCode === 0,
    retained,
    totalBytes,
    liveBytes,
  }
  record("detached-retention", result)
  return result
}

async function boundedHighVolume() {
  const retainedLimit = 1024 * 1024
  let retained = Buffer.alloc(0)
  let totalBytes = 0
  let peakRss = process.memoryUsage().rss
  const beforeRss = peakRss
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }, 5)
  const terminal = pty.spawn("/bin/sh", ["-c", "yes 0123456789abcdef | head -c 16777216"], {
    name: "xterm-256color", cols: 120, rows: 40, cwd: process.cwd(), env: process.env,
  })
  terminal.onData((chunk) => {
    const bytes = Buffer.from(chunk)
    totalBytes += bytes.length
    retained = Buffer.concat([retained, bytes]).subarray(-retainedLimit)
  })
  const exit = await exited(terminal, 15_000)
  clearInterval(sampler)
  const result = {
    passed: totalBytes >= 16 * 1024 * 1024 && retained.length <= retainedLimit && exit.exitCode === 0,
    totalBytes,
    retainedBytes: retained.length,
    elapsedMs: events.length ? Date.now() - startedAt : 0,
    beforeRss,
    peakRss,
    rssGrowth: peakRss - beforeRss,
  }
  record("bounded-high-volume", result)
  return result
}

function processState(pid) {
  try {
    return execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

async function processGroupCleanup() {
  if (process.platform === "win32") {
    const result = { passed: true, skipped: "POSIX process-group probe" }
    record("process-group-cleanup", result)
    return result
  }
  let output = ""
  const terminal = pty.spawn("/bin/sh", ["-c", "sleep 30 & child=$!; printf 'CHILD:%s\\n' \"$child\"; wait"], {
    name: "xterm-256color", cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
  })
  terminal.onData((chunk) => { output += chunk })
  const exitPromise = exited(terminal)
  const childPid = Number(await waitFor(() => output.match(/CHILD:(\d+)/)?.[1], 5_000, "child process id"))
  process.kill(-terminal.pid, "SIGTERM")
  await exitPromise
  await delay(100)
  const state = processState(childPid)
  const result = { passed: state === "" || state.startsWith("Z"), terminalPid: terminal.pid, childPid, childState: state || "gone" }
  if (!result.passed) {
    try { process.kill(childPid, "SIGKILL") } catch {}
  }
  record("process-group-cleanup", result)
  return result
}

const checks = []
for (const check of [interactiveResizeAndExit, eofExit, detachedRetention, boundedHighVolume, processGroupCleanup]) {
  process.stderr.write(`running ${check.name}\n`)
  try {
    checks.push({ name: check.name, ...(await check()) })
  } catch (error) {
    const failed = { name: check.name, passed: false, error: error instanceof Error ? error.stack : String(error) }
    checks.push(failed)
    record(check.name, failed)
  }
}

const report = {
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  nodePtyVersion: "1.2.0-beta.14",
  passed: checks.every((check) => check.passed),
  durationMs: Date.now() - startedAt,
  checks,
  events,
}

console.log(JSON.stringify(report, null, 2))
process.exitCode = report.passed ? 0 : 1
