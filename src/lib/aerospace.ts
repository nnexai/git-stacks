import { $ } from "bun"
import { z } from "zod"

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const AerospaceWindowSchema = z.object({
  windowId: z.number(),
  appName: z.string(),
  windowTitle: z.string(),
  appPid: z.number(),
  workspace: z.string(),
})

const AerospaceWorkspaceSchema = z.object({
  workspace: z.string(),
  isFocused: z.boolean(),
  isVisible: z.boolean(),
  monitorId: z.number(),
})

// ─── Exported Types ───────────────────────────────────────────────────────────

export type AerospaceWindow = z.infer<typeof AerospaceWindowSchema>
export type AerospaceWorkspace = z.infer<typeof AerospaceWorkspaceSchema>

export type SnapshotOpts = {
  timeoutMs?: number       // default 10_000
  initialDelayMs?: number  // default 200
  maxDelayMs?: number      // default 2_000
  beforeSet?: Set<number>  // accumulated IDs from prior entries to exclude
  _sleep?: (ms: number) => Promise<void>
  _listWindows?: () => Promise<AerospaceWindow[]>
}

// ─── AerospaceCommands interface ──────────────────────────────────────────────
// Phase 44 consumer tests use this type as a constraint to ensure all functions
// are mocked with correct signatures.

export interface AerospaceCommands {
  isAerospaceRunning(): Promise<boolean>
  getVersion(): Promise<string | null>
  listWindows(): Promise<AerospaceWindow[]>
  listWorkspaces(): Promise<AerospaceWorkspace[]>
  moveNodeToWorkspace(windowId: number, workspace: string): Promise<void>
  focusWindow(windowId: number): Promise<void>
  setLayout(layout: string, windowId?: number): Promise<void>
  flattenWorkspaceTree(workspace?: string): Promise<void>
  snapshotWindowIds(spawnFn: () => Promise<void>, opts?: SnapshotOpts): Promise<number[]>
}

// ─── Internal runner — mutable for test injection ─────────────────────────────
// All Bun.$ calls funnel through _exec.run. The object property is mutable
// even in ESM (unlike named exports), so tests can replace it.

export type AerospaceCmdResult = { exitCode: number; stdout: string }

export const _exec = {
  run: async (args: string[]): Promise<AerospaceCmdResult> => {
    const result = await $`aerospace ${args}`.quiet().nothrow()
    return { exitCode: result.exitCode, stdout: result.text() }
  },
}

// ─── Internal TSV parsing helpers ────────────────────────────────────────────

function parseTsvLine(line: string, fieldCount: number): string[] | null {
  const fields = line.split("\t")
  return fields.length === fieldCount ? fields : null
}

function parseBool(val: string): boolean {
  return val === "true"
}

function parseIntSafe(val: string): number {
  return parseInt(val, 10)
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Returns true when aerospace is running on macOS.
 * Returns false immediately on non-macOS platforms without spawning any subprocess.
 */
export async function isAerospaceRunning(): Promise<boolean> {
  if (process.platform !== "darwin") return false
  const result = await $`which aerospace`.quiet().nothrow()
  return result.exitCode === 0
}

/**
 * Returns the aerospace version string (e.g., "0.15.2-Beta") or null on failure.
 */
export async function getVersion(): Promise<string | null> {
  try {
    const result = await _exec.run(["--version"])
    if (result.exitCode !== 0) return null
    return result.stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * Returns Zod-validated list of all aerospace windows.
 * Returns [] on non-zero exit code or parse/validation error.
 */
export async function listWindows(): Promise<AerospaceWindow[]> {
  try {
    const result = await _exec.run([
      "list-windows",
      "--all",
      "--format",
      "%{window-id}%{tab}%{app-name}%{tab}%{window-title}%{tab}%{app-pid}%{tab}%{workspace}",
    ])
    if (result.exitCode !== 0) return []
    const lines = result.stdout.split("\n").filter((l) => l.length > 0)
    const parsed = lines.map((line) => {
      const fields = parseTsvLine(line, 5)
      if (!fields) return null
      return {
        windowId: parseIntSafe(fields[0]),
        appName: fields[1],
        windowTitle: fields[2],
        appPid: parseIntSafe(fields[3]),
        workspace: fields[4],
      }
    }).filter((w) => w !== null)
    return z.array(AerospaceWindowSchema).parse(parsed)
  } catch {
    return []
  }
}

/**
 * Returns Zod-validated list of all aerospace workspaces.
 * Returns [] on non-zero exit code or parse/validation error.
 */
export async function listWorkspaces(): Promise<AerospaceWorkspace[]> {
  try {
    const result = await _exec.run([
      "list-workspaces",
      "--all",
      "--format",
      "%{workspace}%{tab}%{workspace-is-focused}%{tab}%{workspace-is-visible}%{tab}%{monitor-id}",
    ])
    if (result.exitCode !== 0) return []
    const lines = result.stdout.split("\n").filter((l) => l.length > 0)
    const parsed = lines.map((line) => {
      const fields = parseTsvLine(line, 4)
      if (!fields) return null
      return {
        workspace: fields[0],
        isFocused: parseBool(fields[1]),
        isVisible: parseBool(fields[2]),
        monitorId: parseIntSafe(fields[3]),
      }
    }).filter((w) => w !== null)
    return z.array(AerospaceWorkspaceSchema).parse(parsed)
  } catch {
    return []
  }
}

/**
 * Moves a window (by numeric ID) to an aerospace workspace.
 */
export async function moveNodeToWorkspace(windowId: number, workspace: string): Promise<void> {
  await _exec.run(["move-node-to-workspace", "--window-id", String(windowId), workspace])
}

/**
 * Focuses a specific aerospace window by its numeric ID.
 */
export async function focusWindow(windowId: number): Promise<void> {
  await _exec.run(["focus", "--window-id", String(windowId)])
}

/**
 * Sets the layout of a window or the current workspace.
 * If windowId is provided, targets that specific window; otherwise targets current context.
 */
export async function setLayout(layout: string, windowId?: number): Promise<void> {
  if (windowId !== undefined) {
    await _exec.run(["layout", "--window-id", String(windowId), layout])
  } else {
    await _exec.run(["layout", layout])
  }
}

/**
 * Flattens the workspace tree for the specified workspace, or focused workspace if not given.
 */
export async function flattenWorkspaceTree(workspace?: string): Promise<void> {
  if (workspace !== undefined) {
    await _exec.run(["flatten-workspace-tree", "--workspace", workspace])
  } else {
    await _exec.run(["flatten-workspace-tree"])
  }
}

/**
 * Identifies new window IDs that appear after spawning a process.
 *
 * Strategy:
 *  1. Snapshot window IDs before calling spawnFn
 *  2. Call spawnFn()
 *  3. Poll listWindows() with exponential backoff until new IDs appear
 *  4. Return the new IDs, or [] if timeout is reached
 *
 * @param spawnFn - async callback that spawns the window
 * @param opts - timeoutMs (10s), initialDelayMs (200ms), maxDelayMs (2s),
 *               _sleep (injectable delay), _listWindows (injectable for tests)
 */
export async function snapshotWindowIds(
  spawnFn: () => Promise<void>,
  opts: SnapshotOpts = {}
): Promise<number[]> {
  const {
    timeoutMs = 10_000,
    initialDelayMs = 200,
    maxDelayMs = 2_000,
    beforeSet,
    _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    _listWindows = listWindows,
  } = opts

  const before = new Set((await _listWindows()).map((w) => w.windowId))
  await spawnFn()

  const deadline = Date.now() + timeoutMs
  let delay = initialDelayMs

  while (Date.now() < deadline) {
    await _sleep(delay)
    const after = (await _listWindows()).map((w) => w.windowId)
    const newIds = after.filter((id) => !before.has(id) && (!beforeSet || !beforeSet.has(id)))
    if (newIds.length > 0) return newIds
    delay = Math.min(delay * 2, maxDelayMs)
  }

  return [] // timeout — caller handles gracefully
}
