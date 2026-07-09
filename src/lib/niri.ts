import { $ } from "bun"
import { requirePlatformSuccess } from "./platform-exec"
import { z } from "zod"

// ─── Zod Schemas ─────────────────────────────────────────────────────────────
// All Option<T> Rust fields use .nullable().optional() so both null and
// missing-key are accepted (Rust serializes None as null, not absent key).

const NiriWindowLayoutSchema = z.object({
  pos_in_scrolling_layout: z.tuple([z.number(), z.number()]).nullable().optional(),
  tile_size: z.tuple([z.number(), z.number()]).optional(),
  window_size: z.tuple([z.number(), z.number()]).optional(),
  tile_pos_in_workspace_view: z.tuple([z.number(), z.number()]).nullable().optional(),
  window_offset_in_tile: z.tuple([z.number(), z.number()]).optional(),
})

const NiriWindowSchema = z.object({
  id: z.number(),
  title: z.string().nullable().optional(),
  app_id: z.string().nullable().optional(),
  pid: z.number().nullable().optional(),
  workspace_id: z.number().nullable().optional(),
  is_focused: z.boolean(),
  is_floating: z.boolean(),
  is_urgent: z.boolean(),
  layout: NiriWindowLayoutSchema.optional(),
})

const NiriWorkspaceSchema = z.object({
  id: z.number(),
  idx: z.number(),
  name: z.string().nullable().optional(),
  output: z.string().nullable().optional(),
  is_urgent: z.boolean(),
  is_active: z.boolean(),
  is_focused: z.boolean(),
  active_window_id: z.number().nullable().optional(),
})

// ─── Exported Types ───────────────────────────────────────────────────────────

export type NiriWindow = z.infer<typeof NiriWindowSchema>
export type NiriWorkspace = z.infer<typeof NiriWorkspaceSchema>

export type SnapshotOpts = {
  timeoutMs?: number      // default 10_000
  initialDelayMs?: number // default 200
  maxDelayMs?: number     // default 2_000
  _sleep?: (ms: number) => Promise<void>  // injectable for tests
  /** Injectable for tests — replaces internal listNiriWindows calls */
  _listWindows?: () => Promise<NiriWindow[]>
}

// ─── NiriCommands interface ───────────────────────────────────────────────────
// Phase 20 tests mock.module("@/lib/niri", () => ({ ... })) using this type
// as a constraint to ensure all 10 functions are mocked with correct signatures.

export interface NiriCommands {
  isNiriRunning(): Promise<boolean>
  listNiriWindows(): Promise<NiriWindow[]>
  listNiriWorkspaces(): Promise<NiriWorkspace[]>
  setNiriWorkspaceName(name: string, workspaceRef?: string | number): Promise<void>
  unsetNiriWorkspaceName(workspaceRef?: string | number): Promise<void>
  moveWindowToWorkspace(windowId: number, workspaceRef: string | number): Promise<void>
  niriSpawn(command: string[]): Promise<void>
  focusNiriWorkspace(ref: string | number): Promise<void>
  focusNiriWorkspaceDown(): Promise<void>
  snapshotWindowIds(spawnFn: () => Promise<void>, opts?: SnapshotOpts): Promise<number[]>
  focusNiriWindow(windowId: number): Promise<void>
  setNiriColumnWidth(change: string): Promise<void>
  consumeOrExpelWindowLeft(windowId?: number): Promise<void>
  niriSpawnSh(command: string): Promise<void>
  moveColumnToIndex(index: number): Promise<void>
  setWindowWidth(windowId: number, change: string): Promise<void>
}

// ─── Internal runner — mutable for test injection ─────────────────────────────
// All Bun.$ calls funnel through _exec.run. The object property is mutable
// even in ESM (unlike named exports), so tests can replace it:
//   import { _exec } from "@/lib/niri?niri-test"
//   _exec.run = mockFn
//
// This is the only mock boundary for this module's own unit tests.
// Phase 20 consumer tests use mock.module("@/lib/niri", ...) instead.

export type NiriCmdResult = { exitCode: number; stdout: string }

export const _exec = {
  run: async (args: string[]): Promise<NiriCmdResult> => {
    const result = await $`niri msg ${args}`.quiet().nothrow()
    return { exitCode: result.exitCode, stdout: result.text() }
  },
}

async function runAction(args: string[], command: string): Promise<void> {
  requirePlatformSuccess(command, await _exec.run(args))
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Returns true when niri compositor is running (NIRI_SOCKET env var is set).
 */
export async function isNiriRunning(): Promise<boolean> {
  return Boolean(process.env.NIRI_SOCKET)
}

/**
 * Returns Zod-validated list of all niri windows.
 * Returns [] on non-zero exit code or JSON parse/validation error.
 */
export async function listNiriWindows(): Promise<NiriWindow[]> {
  try {
    const result = await _exec.run(["-j", "windows"])
    if (result.exitCode !== 0) return []
    return z.array(NiriWindowSchema).parse(JSON.parse(result.stdout))
  } catch {
    return []
  }
}

/**
 * Returns Zod-validated list of all niri workspaces.
 * Returns [] on non-zero exit code or JSON parse/validation error.
 */
export async function listNiriWorkspaces(): Promise<NiriWorkspace[]> {
  try {
    const result = await _exec.run(["-j", "workspaces"])
    if (result.exitCode !== 0) return []
    return z.array(NiriWorkspaceSchema).parse(JSON.parse(result.stdout))
  } catch {
    return []
  }
}

/**
 * Sets the name of a niri workspace.
 * If workspaceRef is provided, targets that specific workspace (by name or index).
 * Workspace references: string = name, number = index.
 */
export async function setNiriWorkspaceName(
  name: string,
  workspaceRef?: string | number
): Promise<void> {
  if (workspaceRef !== undefined) {
    await runAction(["action", "set-workspace-name", name, "--workspace", String(workspaceRef)], "niri set-workspace-name")
  } else {
    await runAction(["action", "set-workspace-name", name], "niri set-workspace-name")
  }
}

/**
 * Moves a window (by numeric ID) to a workspace.
 * workspaceRef: string = workspace name, number = workspace index.
 */
export async function moveWindowToWorkspace(
  windowId: number,
  workspaceRef: string | number
): Promise<void> {
  await runAction([
    "action",
    "move-window-to-workspace",
    String(workspaceRef),
    "--window-id",
    String(windowId),
  ], "niri move-window-to-workspace")
}

/**
 * Spawns a command via niri's compositor spawn (fire-and-forget).
 * The `--` separator is always included to prevent command args from being
 * misinterpreted as niri flags.
 */
export async function niriSpawn(command: string[]): Promise<void> {
  await runAction(["action", "spawn", "--", ...command], "niri spawn")
}

/**
 * Focuses a niri workspace by name or index.
 * ref: string = workspace name, number = workspace index.
 */
export async function focusNiriWorkspace(ref: string | number): Promise<void> {
  await runAction(["action", "focus-workspace", String(ref)], "niri focus-workspace")
}

/**
 * Moves focus to the next workspace (creates a new empty one at the end if needed).
 * Used to create a fresh niri workspace for a new git-stacks workspace.
 */
export async function focusNiriWorkspaceDown(): Promise<void> {
  await runAction(["action", "focus-workspace-down"], "niri focus-workspace-down")
}

/**
 * Unsets the name of a niri workspace.
 * If workspaceRef is provided, targets that specific workspace (by name or index).
 * IMPORTANT: unset-workspace-name uses a POSITIONAL arg, NOT --workspace flag.
 */
export async function unsetNiriWorkspaceName(
  workspaceRef?: string | number
): Promise<void> {
  if (workspaceRef !== undefined) {
    await runAction(["action", "unset-workspace-name", String(workspaceRef)], "niri unset-workspace-name")
  } else {
    await runAction(["action", "unset-workspace-name"], "niri unset-workspace-name")
  }
}

/**
 * Identifies new window IDs that appear after spawning a process.
 *
 * Strategy (NIRI-06):
 *  1. Snapshot window IDs before calling spawnFn
 *  2. Call spawnFn()
 *  3. Poll listNiriWindows() with exponential backoff until new IDs appear
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
    _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    _listWindows = listNiriWindows,
  } = opts

  const before = new Set((await _listWindows()).map((w) => w.id))
  await spawnFn()

  const deadline = Date.now() + timeoutMs
  let delay = initialDelayMs

  while (Date.now() < deadline) {
    await _sleep(delay)
    const after = (await _listWindows()).map((w) => w.id)
    const newIds = after.filter((id) => !before.has(id))
    if (newIds.length > 0) return newIds
    delay = Math.min(delay * 2, maxDelayMs)
  }

  return [] // timeout — caller handles gracefully
}

/**
 * Focuses a specific niri window by its numeric ID.
 * Used before setNiriColumnWidth to ensure the correct column is targeted.
 */
export async function focusNiriWindow(windowId: number): Promise<void> {
  await runAction(["action", "focus-window", "--id", String(windowId)], "niri focus-window")
}

/**
 * Sets the width of the currently focused column.
 * change can be an absolute pixel value (e.g. "800") or percentage (e.g. "50%").
 */
export async function setNiriColumnWidth(change: string): Promise<void> {
  await runAction(["action", "set-column-width", change], "niri set-column-width")
}

/**
 * Consumes (merges) a window into the column to the left, or expels it from
 * a column if already the only window in it.
 * If windowId is provided, targets that specific window; otherwise targets focused window.
 */
export async function consumeOrExpelWindowLeft(windowId?: number): Promise<void> {
  if (windowId !== undefined) {
    await runAction(["action", "consume-or-expel-window-left", "--id", String(windowId)], "niri consume-or-expel-window-left")
  } else {
    await runAction(["action", "consume-or-expel-window-left"], "niri consume-or-expel-window-left")
  }
}

/**
 * Spawns a shell command via niri's compositor spawn-sh action.
 * Unlike niriSpawn, this wraps the command in a shell, allowing pipes,
 * semicolons, and other shell features (cd, &&, etc.).
 */
export async function niriSpawnSh(command: string): Promise<void> {
  await runAction(["action", "spawn-sh", "--", command], "niri spawn-sh")
}

/**
 * Moves the focused column to a specific 1-based index on its workspace.
 * IMPORTANT: Caller must call focusNiriWindow(id) first — this command has no --id flag.
 * Used in the two-phase layout approach (Phase 2 reorder step).
 */
export async function moveColumnToIndex(index: number): Promise<void> {
  await runAction(["action", "move-column-to-index", String(index)], "niri move-column-to-index")
}

/**
 * Sets the width of a specific window by its numeric ID.
 * change can be an absolute pixel value (e.g. "800") or percentage (e.g. "50%").
 * Unlike setNiriColumnWidth, this uses --id and does not require the window to be focused.
 */
export async function setWindowWidth(windowId: number, change: string): Promise<void> {
  await runAction(["action", "set-window-width", "--id", String(windowId), change], "niri set-window-width")
}
