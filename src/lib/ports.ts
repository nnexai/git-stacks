import { openSync, closeSync, unlinkSync, constants, existsSync, readFileSync } from "node:fs"
import { join } from "path"
import { PORTS_LOCK_FILE } from "./paths"
import { listWorkspaces, type Workspace, type GlobalConfig } from "./config"

// --- Types ---

type PortRange = { start: number; end: number }

export type AllocateResult =
  | { ok: true; workspace: Workspace; changed: boolean }
  | { ok: false; error: string }

// --- Lock ---

const LOCK_TIMEOUT_MS = 5000
const LOCK_RETRY_INTERVAL_MS = 50

export function acquireLock(): () => void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let acquired = false

  while (Date.now() < deadline) {
    try {
      // O_WRONLY | O_CREAT | O_EXCL — atomic exclusive create; fails with EEXIST if exists
      const fd = openSync(PORTS_LOCK_FILE, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL)
      closeSync(fd)
      acquired = true
      break
    } catch (err: any) {
      if (err?.code === "EEXIST") {
        Bun.sleepSync(LOCK_RETRY_INTERVAL_MS)
        continue
      }
      throw err
    }
  }

  if (!acquired) {
    throw new Error(`Port allocation lock timeout: could not acquire ${PORTS_LOCK_FILE} within ${LOCK_TIMEOUT_MS}ms`)
  }

  let released = false
  const release = () => {
    if (released) return
    released = true
    try {
      unlinkSync(PORTS_LOCK_FILE)
    } catch {
      // already removed — ignore
    }
  }

  // Backup cleanup on process exit
  process.on("exit", release)

  return release
}

// --- Range helpers ---

function mergeRanges(sorted: PortRange[]): PortRange[] {
  if (sorted.length === 0) return []
  const merged: PortRange[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    // Adjacent or overlapping: r2.start <= r1.end + 1
    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end)
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

export function findContiguousBlock(
  taken: PortRange[],
  count: number,
  rangeStart: number,
  rangeEnd: number
): number | null {
  // First-fit: scan gaps between taken ranges for a block of size `count`.
  // `taken` must be sorted by start and merged (no overlaps).
  // Returns the start port number, or null if no block fits.
  let candidate = rangeStart
  for (const r of taken) {
    if (candidate + count - 1 < r.start) return candidate
    candidate = Math.max(candidate, r.end + 1)
  }
  if (candidate + count - 1 <= rangeEnd) return candidate
  return null
}

// --- Taken port scanning ---

export function buildTakenSet(
  allWorkspaces: Workspace[],
  excludeName: string
): PortRange[] {
  // Collect all resolved (non-null) port values from all workspaces except excludeName.
  const points: number[] = []
  for (const ws of allWorkspaces) {
    if (ws.name === excludeName) continue
    if (!ws.ports) continue
    for (const val of Object.values(ws.ports)) {
      if (typeof val === "number") {
        points.push(val)
      }
    }
  }
  if (points.length === 0) return []
  // Convert to PortRange array, sort, and merge
  const ranges: PortRange[] = points.map(p => ({ start: p, end: p }))
  ranges.sort((a, b) => a.start - b.start)
  return mergeRanges(ranges)
}

// --- Conflict detection ---

export function checkConflicts(
  workspace: Workspace,
  portNames: string[]
): { ok: true } | { ok: false; error: string } {
  // Per D-05/PORT-INJECT-02: Check if any port name collides with:
  //   1. Keys in workspace.env
  //   2. Keys in workspace env_file (parsed from any repo's task_path)
  if (portNames.length === 0) return { ok: true }

  const portNameSet = new Set(portNames)

  // 1. Check workspace.env keys
  if (workspace.env) {
    for (const key of Object.keys(workspace.env)) {
      if (portNameSet.has(key)) {
        return {
          ok: false,
          error: `Port name conflict: '${key}' appears in both ports and env. Rename the port or use env: instead.`,
        }
      }
    }
  }

  // 2. Check env_file keys
  if (workspace.env_file) {
    for (const repo of workspace.repos) {
      const envFilePath = join(repo.task_path, workspace.env_file)
      if (!existsSync(envFilePath)) continue
      try {
        const content = readFileSync(envFilePath, "utf-8")
        for (const line of content.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith("#")) continue
          const eqIdx = trimmed.indexOf("=")
          if (eqIdx < 1) continue
          const key = trimmed.slice(0, eqIdx).trim()
          if (portNameSet.has(key)) {
            return {
              ok: false,
              error: `Port name conflict: '${key}' appears in both ports and env_file. Rename the port or use env: instead.`,
            }
          }
        }
      } catch {
        // unreadable env_file — skip
      }
    }
  }

  return { ok: true }
}

// --- Template port merge ---

export function mergePorts(
  templatePorts: Record<string, number | null> | undefined,
  workspacePorts: Record<string, number | null> | undefined
): Record<string, number | null> | undefined {
  // Per D-04/PORT-TEMPLATE-01: Merge template ports with workspace ports.
  // Workspace wins on same key (last-wins via spread).
  if (!templatePorts && !workspacePorts) return undefined
  return { ...templatePorts, ...workspacePorts }
}

// --- Main allocator ---

export function allocatePorts(
  workspace: Workspace,
  config: GlobalConfig,
  opts: { reallocate: boolean }
): AllocateResult {
  // Per PORT-ALLOC-01, PORT-ALLOC-02, D-06, D-07, D-09, D-10, D-13

  // 1. If workspace.ports is undefined or empty, return early
  if (!workspace.ports || Object.keys(workspace.ports).length === 0) {
    return { ok: true, workspace, changed: false }
  }

  const { range_start, range_end } = config.ports
  const originalPorts = workspace.ports

  // 2. Check env collision first (fail fast per D-05)
  const conflictResult = checkConflicts(workspace, Object.keys(originalPorts))
  if (!conflictResult.ok) return { ok: false, error: conflictResult.error }

  // 3. Acquire lock
  const release = acquireLock()

  try {
    // 4a. Load all workspaces
    const allWorkspaces = listWorkspaces()

    // 4b. Build taken set (excluding current workspace)
    const taken = buildTakenSet(allWorkspaces, workspace.name)

    // 4c. Separate ports into null (need allocation) and resolved (need validation)
    const nullPortNames: string[] = []
    const resolvedPorts: Record<string, number> = {}

    for (const [name, val] of Object.entries(originalPorts)) {
      if (val === null) {
        nullPortNames.push(name)
      } else {
        resolvedPorts[name] = val
      }
    }

    // 4d. Validate resolved ports
    const conflictingResolved: string[] = []
    for (const [name, port] of Object.entries(resolvedPorts)) {
      // Check if in global range
      const outOfRange = port < range_start || port > range_end
      // Check if overlaps taken range
      const isConflict = outOfRange || taken.some(r => port >= r.start && port <= r.end)
      if (isConflict) {
        conflictingResolved.push(name)
      }
    }

    if (conflictingResolved.length > 0) {
      if (!opts.reallocate) {
        const examples = conflictingResolved.map(n => `${n}=${resolvedPorts[n]}`).join(", ")
        return {
          ok: false,
          error: `Port conflict: ${examples} is used by another workspace (or out of range). Re-run with --reallocate to resolve.`,
        }
      }
      // reallocate=true: move conflicting resolved ports to null pool for reallocation
      for (const name of conflictingResolved) {
        nullPortNames.push(name)
        delete resolvedPorts[name]
      }
    }

    // 4e. Allocate null ports
    const updatedPorts: Record<string, number> = { ...resolvedPorts }

    if (nullPortNames.length > 0) {
      // Include own non-conflicting resolved ports in taken set to avoid overlap
      const ownResolved: PortRange[] = Object.values(resolvedPorts).map(p => ({ start: p, end: p }))
      const combinedTaken = mergeRanges(
        [...taken, ...ownResolved].sort((a, b) => a.start - b.start)
      )

      const block = findContiguousBlock(combinedTaken, nullPortNames.length, range_start, range_end)
      if (block === null) {
        return {
          ok: false,
          error: `No free contiguous port block of size ${nullPortNames.length} in range ${range_start}-${range_end}`,
        }
      }

      // Assign sequentially
      nullPortNames.forEach((name, i) => {
        updatedPorts[name] = block + i
      })
    }

    // 4f. Build final ports record preserving original key order
    const finalPorts: Record<string, number | null> = {}
    for (const key of Object.keys(originalPorts)) {
      finalPorts[key] = updatedPorts[key] ?? null
    }

    // 4g. Detect change
    const changed = Object.entries(finalPorts).some(
      ([k, v]) => originalPorts[k] !== v
    )

    // 4h. Return result
    return {
      ok: true,
      workspace: { ...workspace, ports: finalPorts },
      changed,
    }
  } finally {
    release()
  }
}
