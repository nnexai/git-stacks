import { describe, expect, test } from "bun:test"
import { createWorkspaceChangeMonitor } from "../../../src/lib/service/workspace-change-monitor"

type Callback = () => void

function harness(onInvalidated: (revision: string) => void = () => {}) {
  const watches = new Map<string, Callback>()
  const closed: string[] = []
  const timeouts: Callback[] = []
  const intervals: Callback[] = []
  let workspaceExists = false
  let fingerprint = "missing"
  let revision = "1"
  let invalidations = 0
  let active = 0
  let maxActive = 0
  let blocked = false
  const releases: Array<() => void> = []
  const monitor = createWorkspaceChangeMonitor({
    configRoot: "/config",
    workspaceDir: "/config/workspaces",
    directoryExists: () => workspaceExists,
    watch: (path, callback) => {
      watches.set(path, callback)
      return { close: () => { closed.push(path); watches.delete(path) } }
    },
    setTimeout: (callback) => { timeouts.push(callback); return callback },
    clearTimeout: (handle) => { const index = timeouts.indexOf(handle as Callback); if (index >= 0) timeouts.splice(index, 1) },
    setInterval: (callback) => { intervals.push(callback); return callback },
    clearInterval: (handle) => { const index = intervals.indexOf(handle as Callback); if (index >= 0) intervals.splice(index, 1) },
    readFingerprint: async () => fingerprint,
    invalidateConfigCache: () => { invalidations++ },
    rebuild: async () => {
      active++
      maxActive = Math.max(maxActive, active)
      if (blocked) await new Promise<void>((resolve) => releases.push(resolve))
      active--
      return revision
    },
    onInvalidated,
  })
  return {
    monitor, watches, closed, timeouts, intervals,
    get invalidations() { return invalidations },
    get maxActive() { return maxActive },
    setExists(value: boolean) { workspaceExists = value },
    setFingerprint(value: string) { fingerprint = value },
    setRevision(value: string) { revision = value },
    block() { blocked = true },
    unblock() { blocked = false; for (const resolve of releases.splice(0)) resolve() },
  }
}

async function flush(callbacks: Callback[]) {
  const callback = callbacks.shift()
  callback?.()
  await Promise.resolve()
  await Promise.resolve()
}

describe("workspace change monitor", () => {
  test("watches root, binds a newly created workspace directory, and debounces bursts", async () => {
    const emitted: string[] = []
    const h = harness((revision) => emitted.push(revision))
    h.monitor.start()
    expect(h.watches.has("/config")).toBe(true)
    h.setExists(true)
    h.watches.get("/config")?.()
    h.watches.get("/config")?.()
    expect(h.timeouts).toHaveLength(1)
    await flush(h.timeouts)
    expect(h.watches.has("/config/workspaces")).toBe(true)
    expect(h.invalidations).toBe(1)
  })

  test("fingerprint recovery and explicit triggers emit only changed aggregate revisions", async () => {
    const emitted: string[] = []
    const h = harness((value) => emitted.push(value))
    h.monitor.start()
    await h.monitor.invalidate()
    await h.monitor.invalidate()
    h.setRevision("2")
    h.setFingerprint("changed")
    await flush(h.intervals)
    expect(emitted).toEqual(["1", "2"])
    await h.monitor.dispose()
  })

  test("single-flights rebuilds, schedules one trailing pass, and disposes idempotently", async () => {
    const h = harness()
    h.monitor.start()
    h.block()
    const first = h.monitor.invalidate()
    const second = h.monitor.invalidate()
    const third = h.monitor.invalidate()
    h.unblock()
    await Promise.all([first, second, third])
    expect(h.maxActive).toBe(1)
    expect(h.invalidations).toBe(2)
    await h.monitor.dispose()
    await h.monitor.dispose()
    expect(h.closed.filter((path) => path === "/config")).toHaveLength(1)
    expect(h.intervals).toHaveLength(0)
  })

  test("dispose detaches promptly while an external rebuild is still blocked", async () => {
    const emitted: string[] = []
    const h = harness((revision) => emitted.push(revision))
    h.monitor.start()
    h.block()
    void h.monitor.invalidate()
    await Promise.resolve()
    await h.monitor.dispose()
    expect(h.closed).toContain("/config")
    expect(emitted).toEqual([])
    h.unblock()
    await Promise.resolve()
    await Promise.resolve()
    expect(emitted).toEqual([])
  })
})
