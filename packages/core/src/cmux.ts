// ─── Injectable executor ──────────────────────────────────────────────────────

// All cmux shell calls funnel through _exec.run. The object property is mutable
// even in ESM (unlike named exports), so tests can replace it:
//   import { _exec } from "@/lib/cmux?cmux-test"
//   _exec.run = mockFn

export type CmdResult = { exitCode: number; stdout: string }

export const _exec = {
  run: async (args: string[]): Promise<CmdResult> => {
    const result = await $`cmux ${args}`.quiet().nothrow()
    return { exitCode: result.exitCode, stdout: result.text() }
  },
}

async function runMutation(args: string[], command: string): Promise<CmdResult> {
  const result = await _exec.run(args)
  requirePlatformSuccess(command, result)
  return result
}

// Creates a new cmux workspace rooted at the given directory.
// Returns the workspace ref (e.g. "workspace:2") for later use.
export async function createCmuxWorkspace(cwd: string, name: string): Promise<string> {
  const r = await runMutation(["new-workspace", "--cwd", cwd], "cmux new-workspace")
  // cmux may prefix output with "OK " — extract just the workspace:N ref
  const ref = r.stdout.trim().match(/workspace:\d+/)?.[0]
  if (!ref) throw new Error(`cmux new-workspace: unexpected output: ${r.stdout.trim()}`)
  await runMutation(["rename-workspace", "--workspace", ref, name], "cmux rename-workspace")
  await runMutation(["select-workspace", "--workspace", ref], "cmux select-workspace")
  return ref
}

// Focuses an existing cmux workspace by ref. Returns true if successful.
export async function focusCmuxWorkspace(ref: string): Promise<boolean> {
  const r = await _exec.run(["select-workspace", "--workspace", ref])
  return r.exitCode === 0
}

// Parses `cmux list-workspaces` output into { ref, name } pairs.
// Unnamed workspaces (never renamed) show a path as their name.
async function listCmuxWorkspaces(): Promise<Array<{ ref: string; name: string }>> {
  const r = await _exec.run(["list-workspaces"])
  if (r.exitCode !== 0) return []

  return r.stdout
    .split("\n")
    .flatMap((line) => {
      // Strip trailing flag annotations, e.g. "  [selected]"
      const clean = line.replace(/\s+\[[^\]]*\]\s*$/, "")
      // Format: "[* ]  workspace:N  <name>"
      const match = clean.match(/^.\s*(workspace:\d+)\s{2,}(.+)$/)
      if (!match) return []
      return [{ ref: match[1], name: match[2].trim() }]
    })
}

// Finds a cmux workspace by its assigned name. Returns its ref or null.
async function findCmuxWorkspaceByName(name: string): Promise<string | null> {
  const workspaces = await listCmuxWorkspaces()
  return workspaces.find((w) => w.name === name)?.ref ?? null
}

// Opens a workspace in cmux using a three-step strategy:
//   1. Focus by saved ref (fast path)
//   2. Find by name (handles stale refs after cmux restarts or manual workspace creation)
//   3. Create a new workspace
// Returns the current ref and whether it was freshly created.
export async function openCmuxWorkspace(
  name: string,
  tasksDir: string,
  existingRef?: string
): Promise<{ ref: string; created: boolean }> {
  // Fast path: saved ref still valid
  if (existingRef && await focusCmuxWorkspace(existingRef)) {
    return { ref: existingRef, created: false }
  }

  // Fallback: find by name
  const foundRef = await findCmuxWorkspaceByName(name)
  if (foundRef) {
    await focusCmuxWorkspace(foundRef)
    return { ref: foundRef, created: false }
  }

  // Not found: create a new workspace
  const { join } = await import("path")
  const { existsSync, mkdirSync } = await import("fs")
  const wsDir = join(tasksDir, name)
  if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })

  const ref = await createCmuxWorkspace(wsDir, name)
  return { ref, created: true }
}

// Creates a new split pane in an existing cmux workspace.
// Returns both the pane ref and its initial surface ref, or null on failure.
export async function addCmuxPane(
  wsRef: string,
  direction = "down"
): Promise<{ paneRef: string; surfaceRef: string } | null> {
  const r = await _exec.run(["new-pane", "--direction", direction, "--workspace", wsRef])
  if (r.exitCode !== 0) return null
  const text = r.stdout.trim()
  const paneRef = text.match(/pane:\d+/)?.[0]
  const surfaceRef = text.match(/surface:\d+/)?.[0]
  if (!paneRef || !surfaceRef) return null
  return { paneRef, surfaceRef }
}

// Creates a new surface (tab) within an existing pane.
// Returns the new surface ref, or null on failure.
export async function addCmuxSurface(wsRef: string, paneRef: string): Promise<string | null> {
  const r = await _exec.run(["new-surface", "--pane", paneRef, "--workspace", wsRef])
  if (r.exitCode !== 0) return null
  return r.stdout.trim().match(/surface:\d+/)?.[0] ?? null
}

// Sends text to a specific surface in a cmux workspace.
// Append "\n" to the text to execute it as a command.
export async function sendToCmuxSurface(wsRef: string, surfaceRef: string, text: string): Promise<void> {
  await runMutation(["send", "--workspace", wsRef, "--surface", surfaceRef, text], "cmux send")
}

// Focuses a specific surface (tab) within a cmux workspace.
export async function focusCmuxSurface(wsRef: string, surfaceRef: string): Promise<boolean> {
  const r = await _exec.run(["move-surface", "--surface", surfaceRef, "--workspace", wsRef, "--focus", "true"])
  return r.exitCode === 0
}

// Returns the pane ref and surface ref of the main (initial) pane in a workspace.
export async function getCmuxMainPane(wsRef: string): Promise<{ paneRef: string; surfaceRef: string }> {
  const panesResult = await _exec.run(["list-panes", "--workspace", wsRef])
  let paneRef = "pane:1"
  if (panesResult.exitCode === 0) {
    const match = panesResult.stdout.trim().match(/pane:\d+/)
    if (match) paneRef = match[0]
  }

  const surfacesResult = await _exec.run(["list-pane-surfaces", "--workspace", wsRef, "--pane", paneRef])
  let surfaceRef = "surface:1"
  if (surfacesResult.exitCode === 0) {
    const match = surfacesResult.stdout.trim().match(/surface:\d+/)
    if (match) surfaceRef = match[0]
  }

  return { paneRef, surfaceRef }
}
import { requirePlatformSuccess } from "./platform-exec"
import { $ } from "@git-stacks/core/node-runtime"
