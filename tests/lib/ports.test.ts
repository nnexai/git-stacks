import { describe, test, expect, afterEach } from "bun:test"
import { join } from "path"
import { existsSync, writeFileSync } from "fs"
import { useIsolatedConfig, makeTmpDir, cleanup } from "../helpers"

// --- Isolated config (for lock and allocatePorts integration tests) ---
const isolated = useIsolatedConfig("ports-test")

// --- Pure function imports (no filesystem) ---
import {
  findContiguousBlock,
  mergePorts,
  buildTakenSet,
  checkConflicts,
  allocatePorts,
  acquireLock,
} from "../../src/lib/ports"

// --- Helpers ---

function makeWorkspace(name: string, ports?: Record<string, number | null>, opts?: {
  env?: Record<string, string>
  env_file?: string
  repos?: Array<{ name: string; repo: string; type: string; mode: string; main_path: string; task_path: string }>
}): any {
  return {
    name,
    branch: "main",
    created: "2026-01-01",
    schema_version: "1",
    repos: opts?.repos ?? [],
    env: opts?.env,
    env_file: opts?.env_file,
    ports,
  }
}

function makeConfig(range_start = 10000, range_end = 65000): any {
  return {
    workspace_root: "/tmp/test",
    integrations: {},
    ports: { range_start, range_end },
  }
}

// --- findContiguousBlock ---

describe("findContiguousBlock", () => {
  test("returns rangeStart when no taken ports", () => {
    expect(findContiguousBlock([], 2, 10000, 65000)).toBe(10000)
  })

  test("finds first fit after a taken block", () => {
    // taken: 10000-10002 (3 ports), need 3 => should return 10003
    const taken = [{ start: 10000, end: 10002 }]
    expect(findContiguousBlock(taken, 3, 10000, 65000)).toBe(10003)
  })

  test("returns null when not enough room", () => {
    // range 10000-10005 (6 ports), taken 10000-10004, need 3 => only 1 free (10005)
    const taken = [{ start: 10000, end: 10004 }]
    expect(findContiguousBlock(taken, 3, 10000, 10005)).toBeNull()
  })

  test("finds gap between two taken blocks", () => {
    // taken: 10000-10001 and 10005-10006, need 3 => gap is 10002-10004 = 3 ports
    const taken = [
      { start: 10000, end: 10001 },
      { start: 10005, end: 10006 },
    ]
    expect(findContiguousBlock(taken, 3, 10000, 65000)).toBe(10002)
  })

  test("returns null when entire range is taken", () => {
    const taken = [{ start: 10000, end: 65000 }]
    expect(findContiguousBlock(taken, 1, 10000, 65000)).toBeNull()
  })

  test("handles single port request at start", () => {
    expect(findContiguousBlock([], 1, 10000, 65000)).toBe(10000)
  })

  test("returns candidate when it fits exactly at end of range", () => {
    // range 10000-10002 (3 ports), no taken, need 3
    expect(findContiguousBlock([], 3, 10000, 10002)).toBe(10000)
  })
})

// --- buildTakenSet ---

describe("buildTakenSet", () => {
  test("returns empty array when no workspaces", () => {
    expect(buildTakenSet([], "my-ws")).toEqual([])
  })

  test("collects resolved ports from other workspaces", () => {
    const ws1 = makeWorkspace("ws1", { A: 10000, B: 10001 })
    const ws2 = makeWorkspace("ws2", { C: 10002 })
    const taken = buildTakenSet([ws1, ws2], "my-ws")
    // Ports 10000, 10001, 10002 are adjacent and get merged into one range
    expect(taken.length).toBe(1)
    expect(taken[0].start).toBe(10000)
    expect(taken[0].end).toBe(10002)
  })

  test("excludes null ports", () => {
    const ws1 = makeWorkspace("ws1", { A: null, B: 10000 })
    const taken = buildTakenSet([ws1], "my-ws")
    expect(taken.length).toBe(1)
    expect(taken[0].start).toBe(10000)
  })

  test("excludes the current workspace by name", () => {
    const ws1 = makeWorkspace("current", { A: 10000 })
    const ws2 = makeWorkspace("other", { B: 10001 })
    const taken = buildTakenSet([ws1, ws2], "current")
    expect(taken.length).toBe(1)
    expect(taken[0].start).toBe(10001)
  })

  test("returns sorted merged ranges", () => {
    const ws1 = makeWorkspace("ws1", { A: 10002, B: 10000, C: 10001 })
    const taken = buildTakenSet([ws1], "other")
    // should be sorted and merged: [10000-10002]
    expect(taken[0].start).toBe(10000)
    expect(taken[0].end).toBe(10002)
  })
})

// --- checkConflicts ---

describe("checkConflicts", () => {
  test("returns ok when no env or env_file", () => {
    const ws = makeWorkspace("ws1", { PORT: null })
    const result = checkConflicts(ws, ["PORT"])
    expect(result.ok).toBe(true)
  })

  test("returns error when port name collides with workspace.env key", () => {
    const ws = makeWorkspace("ws1", { PORT: null }, { env: { PORT: "3000" } })
    const result = checkConflicts(ws, ["PORT"])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("PORT")
      expect(result.error).toContain("conflict")
    }
  })

  test("returns ok when env has different keys", () => {
    const ws = makeWorkspace("ws1", { API_PORT: null }, { env: { DATABASE_URL: "postgres://..." } })
    const result = checkConflicts(ws, ["API_PORT"])
    expect(result.ok).toBe(true)
  })

  test("returns error when port name collides with env_file key", () => {
    const dir = makeTmpDir("conflict-test")
    try {
      const envFilePath = join(dir, ".env")
      writeFileSync(envFilePath, "PORT=3000\nDATABASE_URL=postgres://...\n")
      // Create a workspace with a repo that has task_path pointing to our dir
      const ws = makeWorkspace("ws1", { PORT: null }, {
        env_file: ".env",
        repos: [{ name: "repo1", repo: "r1", type: "other", mode: "worktree", main_path: dir, task_path: dir }],
      })
      const result = checkConflicts(ws, ["PORT"])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("PORT")
      }
    } finally {
      cleanup(dir)
    }
  })

  test("skips env_file check when file does not exist", () => {
    const ws = makeWorkspace("ws1", { PORT: null }, {
      env_file: ".env",
      repos: [{ name: "r", repo: "r", type: "other", mode: "worktree", main_path: "/tmp/nonexistent-12345", task_path: "/tmp/nonexistent-12345" }],
    })
    const result = checkConflicts(ws, ["PORT"])
    expect(result.ok).toBe(true)
  })

  test("returns ok when no collisions", () => {
    const ws = makeWorkspace("ws1", { APP_PORT: null }, { env: { DATABASE_URL: "postgres://..." } })
    const result = checkConflicts(ws, ["APP_PORT"])
    expect(result.ok).toBe(true)
  })
})

// --- mergePorts ---

describe("mergePorts", () => {
  test("returns undefined when both inputs are undefined", () => {
    expect(mergePorts(undefined, undefined)).toBeUndefined()
  })

  test("returns workspace ports when template is undefined", () => {
    const result = mergePorts(undefined, { PORT: null })
    expect(result).toEqual({ PORT: null })
  })

  test("returns template ports when workspace is undefined", () => {
    const result = mergePorts({ PORT: null }, undefined)
    expect(result).toEqual({ PORT: null })
  })

  test("workspace wins on same key (overrides template value)", () => {
    const result = mergePorts({ PORT: null }, { PORT: 3000 })
    expect(result).toEqual({ PORT: 3000 })
  })

  test("merges distinct keys from both (union)", () => {
    const result = mergePorts({ A: null }, { B: null })
    expect(result).toEqual({ A: null, B: null })
  })

  test("workspace resolved value overrides template null", () => {
    const result = mergePorts({ PORT: null }, { PORT: 3000 })
    expect(result?.PORT).toBe(3000)
  })
})

// --- allocatePorts ---

describe("allocatePorts", () => {
  test("returns ok/unchanged when workspace has no ports", () => {
    const ws = makeWorkspace("ws1")
    const config = makeConfig()
    const result = allocatePorts(ws, config, { reallocate: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(false)
    }
  })

  test("returns ok/unchanged when workspace.ports is empty object", () => {
    const ws = makeWorkspace("ws1", {})
    const config = makeConfig()
    const result = allocatePorts(ws, config, { reallocate: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(false)
    }
  })

  test("allocates null ports to contiguous block", () => {
    // Write existing workspace to isolated config dir so listWorkspaces returns empty
    const ws = makeWorkspace("ws1", { A: null, B: null, C: null })
    const config = makeConfig(10000, 65000)
    const result = allocatePorts(ws, config, { reallocate: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(true)
      expect(result.workspace.ports?.A).toBe(10000)
      expect(result.workspace.ports?.B).toBe(10001)
      expect(result.workspace.ports?.C).toBe(10002)
    }
  })

  test("keeps resolved ports when conflict-free (changed=false)", () => {
    const ws = makeWorkspace("ws1", { PORT: 10000 })
    const config = makeConfig()
    const result = allocatePorts(ws, config, { reallocate: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(false)
      expect(result.workspace.ports?.PORT).toBe(10000)
    }
  })

  test("errors on conflict with another workspace port when reallocate=false", () => {
    // Set up: write another workspace with PORT=10000 to isolated config dir
    writeFileSync(
      join(isolated.configDir, "workspaces", "other-ws.yml"),
      `name: other-ws\nbranch: main\ncreated: 2026-01-01\nrepos: []\nports:\n  PORT: 10000\n`
    )
    const ws = makeWorkspace("my-ws", { PORT: 10000 })
    const config = makeConfig()
    const result = allocatePorts(ws, config, { reallocate: false })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("--reallocate")
    }
  })

  test("reallocates conflicting port when reallocate=true", () => {
    // other-ws still has PORT=10000 from previous test, or we ensure it here
    const wsFilePath = join(isolated.configDir, "workspaces", "conflict-ws.yml")
    writeFileSync(wsFilePath, `name: conflict-ws\nbranch: main\ncreated: 2026-01-01\nrepos: []\nports:\n  PORT: 10000\n`)
    const ws = makeWorkspace("reallocate-ws", { PORT: 10000 })
    const config = makeConfig()
    const result = allocatePorts(ws, config, { reallocate: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(true)
      // PORT should be reallocated to something != 10000
      expect(result.workspace.ports?.PORT).not.toBe(10000)
    }
  })

  test("errors when resolved port is outside global range", () => {
    const ws = makeWorkspace("my-ws2", { PORT: 9999 }) // below range_start=10000
    const config = makeConfig(10000, 65000)
    const result = allocatePorts(ws, config, { reallocate: false })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("--reallocate")
    }
  })

  test("errors when env collision detected before locking", () => {
    const ws = makeWorkspace("collision-ws", { PORT: null }, { env: { PORT: "3000" } })
    const config = makeConfig()
    const result = allocatePorts(ws, config, { reallocate: false })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("PORT")
    }
  })

  afterEach(() => {
    // Clean up test workspace files between tests
    const wsDir = join(isolated.configDir, "workspaces")
    if (existsSync(wsDir)) {
      const { readdirSync, unlinkSync } = require("fs")
      for (const f of readdirSync(wsDir)) {
        if (f.endsWith(".yml")) {
          try { unlinkSync(join(wsDir, f)) } catch {}
        }
      }
    }
  })
})

// --- acquireLock ---

describe("acquireLock", () => {
  test("returns a release function that removes the lock file", () => {
    const lockFile = join(isolated.configDir, ".ports.lock")
    const release = acquireLock()
    expect(existsSync(lockFile)).toBe(true)
    release()
    expect(existsSync(lockFile)).toBe(false)
  })

  test("lock file is removed after second release call (idempotent)", () => {
    const lockFile = join(isolated.configDir, ".ports.lock")
    const release = acquireLock()
    release()
    expect(existsSync(lockFile)).toBe(false)
    // Second call should not throw
    expect(() => release()).not.toThrow()
  })
})
