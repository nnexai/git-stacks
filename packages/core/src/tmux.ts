import { $ } from "./node-runtime"

import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import { requirePlatformSuccess } from "./platform-exec"

// ─── Injectable executor ──────────────────────────────────────────────────────
// All tmux subprocess calls funnel through _exec.run. The object property is mutable
// even in ESM (unlike named exports), so tests can replace it:
//   import { _exec } from "@/lib/tmux?tmux-test"
//   _exec.run = mockFn

export type CmdResult = { exitCode: number; stdout: string; stderr?: string }

export const _exec = {
  run: async (args: string[]): Promise<CmdResult> => {
    const result = await $`tmux ${args}`.quiet().nothrow()
    return { exitCode: result.exitCode, stdout: result.text(), stderr: result.stderr.toString() }
  },
}

// Kills a tmux session by name (no-op if it does not exist).
export async function killTmuxSession(name: string): Promise<void> {
  const result = await _exec.run(["kill-session", "-t", name])
  requirePlatformSuccess("tmux kill-session", result)
}

// Returns true if a tmux session with the given name exists.
export async function tmuxSessionExists(name: string): Promise<boolean> {
  const r = await _exec.run(["has-session", "-t", name])
  return r.exitCode === 0
}

// Focuses an existing tmux session.
// Uses switch-client when inside tmux, attach-session otherwise.
export async function focusTmuxSession(name: string): Promise<void> {
  const result = await _exec.run(process.env.TMUX
    ? ["switch-client", "-t", name]
    : ["attach-session", "-t", name])
  requirePlatformSuccess("tmux focus session", result)
}

// Creates a new detached tmux session rooted at cwd.
export async function createTmuxSession(cwd: string, name: string): Promise<void> {
  const result = await _exec.run(["new-session", "-d", "-s", name, "-c", cwd])
  requirePlatformSuccess("tmux new-session", result)
}

// Opens a tmux session: focuses if it already exists, otherwise creates one.
// Returns { created: true } when a new session was made.
// Caller is responsible for focusing after any layout has been applied.
export async function openTmuxSession(
  name: string,
  tasksDir: string
): Promise<{ created: boolean }> {
  if (await tmuxSessionExists(name)) {
    return { created: false }
  }

  const wsDir = join(tasksDir, name)
  if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })

  await createTmuxSession(wsDir, name)
  return { created: true }
}

// Returns the global pane ID (e.g. "%0") of the first pane in the session.
export async function getTmuxMainPane(session: string): Promise<string | null> {
  const r = await _exec.run(["list-panes", "-t", session, "-F", "#{pane_id}"])
  if (r.exitCode !== 0) return null
  const pane = r.stdout.trim().split("\n")[0]
  return pane && /^%\d+$/.test(pane) ? pane : null
}

// Splits a window in the given session and returns the new pane ID, or null on failure.
// "down"/"up"  → vertical split (-v); "right"/"left" → horizontal split (-h).
// "up"/"left" add -b to split before the active pane.
export async function addTmuxPane(session: string, direction = "down"): Promise<string | null> {
  const isVertical = direction === "down" || direction === "up"
  const isBefore = direction === "up" || direction === "left"
  const splitFlag = isVertical ? "-v" : "-h"
  const args = isBefore
    ? ["split-window", "-t", session, splitFlag, "-b", "-P", "-F", "#{pane_id}"]
    : ["split-window", "-t", session, splitFlag, "-P", "-F", "#{pane_id}"]
  const r = await _exec.run(args)
  if (r.exitCode !== 0) return null
  return r.stdout.trim() || null
}

// Sends text to a pane and presses Enter to execute it.
// Pane IDs (%N) are globally unique — no session prefix needed.
export async function sendToTmuxPane(paneId: string, text: string): Promise<void> {
  const result = await _exec.run(["send-keys", "-t", paneId, text, "Enter"])
  requirePlatformSuccess("tmux send-keys", result)
}

// Focuses a specific pane. Returns true if successful.
export async function focusTmuxPane(paneId: string): Promise<boolean> {
  const r = await _exec.run(["select-pane", "-t", paneId])
  return r.exitCode === 0
}
