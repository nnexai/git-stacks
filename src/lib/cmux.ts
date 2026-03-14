import { $ } from "bun"

// Creates a new cmux workspace rooted at the given directory.
// Returns the workspace ref (e.g. "workspace:2") for later use.
export async function createCmuxWorkspace(cwd: string, name: string): Promise<string> {
  const result = await $`cmux new-workspace --cwd ${cwd}`.text()
  // cmux may prefix output with "OK " — extract just the workspace:N ref
  const ref = result.trim().match(/workspace:\d+/)?.[0]
  if (!ref) throw new Error(`cmux new-workspace: unexpected output: ${result.trim()}`)
  await $`cmux rename-workspace --workspace ${ref} ${name}`.quiet().nothrow()
  await $`cmux select-workspace --workspace ${ref}`.quiet().nothrow()
  return ref
}

// Focuses an existing cmux workspace by ref. Returns true if successful.
export async function focusCmuxWorkspace(ref: string): Promise<boolean> {
  const result = await $`cmux select-workspace --workspace ${ref}`.quiet().nothrow()
  return result.exitCode === 0
}

// Parses `cmux list-workspaces` output into { ref, name } pairs.
// Unnamed workspaces (never renamed) show a path as their name.
async function listCmuxWorkspaces(): Promise<Array<{ ref: string; name: string }>> {
  const result = await $`cmux list-workspaces`.quiet().nothrow()
  if (result.exitCode !== 0) return []

  return result.text()
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
  const result = await $`cmux new-pane --direction ${direction} --workspace ${wsRef}`.quiet().nothrow()
  if (result.exitCode !== 0) return null
  const text = result.text().trim()
  const paneRef = text.match(/pane:\d+/)?.[0]
  const surfaceRef = text.match(/surface:\d+/)?.[0]
  if (!paneRef || !surfaceRef) return null
  return { paneRef, surfaceRef }
}

// Creates a new surface (tab) within an existing pane.
// Returns the new surface ref, or null on failure.
export async function addCmuxSurface(wsRef: string, paneRef: string): Promise<string | null> {
  const result = await $`cmux new-surface --pane ${paneRef} --workspace ${wsRef}`.quiet().nothrow()
  if (result.exitCode !== 0) return null
  return result.text().trim().match(/surface:\d+/)?.[0] ?? null
}

// Sends text to a specific surface in a cmux workspace.
// Append "\n" to the text to execute it as a command.
export async function sendToCmuxSurface(wsRef: string, surfaceRef: string, text: string): Promise<void> {
  await $`cmux send --workspace ${wsRef} --surface ${surfaceRef} ${text}`.quiet().nothrow()
}

// Focuses a specific surface (tab) within a cmux workspace.
export async function focusCmuxSurface(wsRef: string, surfaceRef: string): Promise<boolean> {
  const result = await $`cmux move-surface --surface ${surfaceRef} --workspace ${wsRef} --focus true`.quiet().nothrow()
  return result.exitCode === 0
}

// Returns the pane ref and surface ref of the main (initial) pane in a workspace.
export async function getCmuxMainPane(wsRef: string): Promise<{ paneRef: string; surfaceRef: string }> {
  const panesResult = await $`cmux list-panes --workspace ${wsRef}`.quiet().nothrow()
  let paneRef = "pane:1"
  if (panesResult.exitCode === 0) {
    const match = panesResult.text().trim().match(/pane:\d+/)
    if (match) paneRef = match[0]
  }

  const surfacesResult = await $`cmux list-pane-surfaces --workspace ${wsRef} --pane ${paneRef}`.quiet().nothrow()
  let surfaceRef = "surface:1"
  if (surfacesResult.exitCode === 0) {
    const match = surfacesResult.text().trim().match(/surface:\d+/)
    if (match) surfaceRef = match[0]
  }

  return { paneRef, surfaceRef }
}
