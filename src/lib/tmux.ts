import { $ } from "bun"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"

// Returns true if a tmux session with the given name exists.
export async function tmuxSessionExists(name: string): Promise<boolean> {
  const result = await $`tmux has-session -t ${name}`.quiet().nothrow()
  return result.exitCode === 0
}

// Focuses an existing tmux session.
// Uses switch-client when inside tmux, attach-session otherwise.
export async function focusTmuxSession(name: string): Promise<void> {
  if (process.env.TMUX) {
    await $`tmux switch-client -t ${name}`.quiet().nothrow()
  } else {
    await $`tmux attach-session -t ${name}`.quiet().nothrow()
  }
}

// Creates a new detached tmux session rooted at cwd, then focuses it.
export async function createTmuxSession(cwd: string, name: string): Promise<void> {
  await $`tmux new-session -d -s ${name} -c ${cwd}`.quiet().nothrow()
  await focusTmuxSession(name)
}

// Opens a tmux session: focuses if it already exists, otherwise creates one.
// Returns { created: true } when a new session was made.
export async function openTmuxSession(
  name: string,
  tasksDir: string
): Promise<{ created: boolean }> {
  if (await tmuxSessionExists(name)) {
    await focusTmuxSession(name)
    return { created: false }
  }

  const wsDir = join(tasksDir, name)
  if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })

  await createTmuxSession(wsDir, name)
  return { created: true }
}

// Returns the global pane ID (e.g. "%0") of the first pane in the session.
export async function getTmuxMainPane(session: string): Promise<string> {
  const result = await $`tmux display-message -t ${session} -p #{pane_id}`.quiet().nothrow()
  return result.text().trim() || "%0"
}

// Splits a window in the given session and returns the new pane ID, or null on failure.
// "down"/"up"  → vertical split (-v); "right"/"left" → horizontal split (-h).
// "up"/"left" add -b to split before the active pane.
export async function addTmuxPane(session: string, direction = "down"): Promise<string | null> {
  const isVertical = direction === "down" || direction === "up"
  const isBefore = direction === "up" || direction === "left"
  const splitFlag = isVertical ? "-v" : "-h"
  const result = isBefore
    ? await $`tmux split-window -t ${session} ${splitFlag} -b -P -F #{pane_id}`.quiet().nothrow()
    : await $`tmux split-window -t ${session} ${splitFlag} -P -F #{pane_id}`.quiet().nothrow()
  if (result.exitCode !== 0) return null
  return result.text().trim() || null
}

// Sends text to a pane and presses Enter to execute it.
// Pane IDs (%N) are globally unique — no session prefix needed.
export async function sendToTmuxPane(paneId: string, text: string): Promise<void> {
  await $`tmux send-keys -t ${paneId} ${text} Enter`.quiet().nothrow()
}

// Focuses a specific pane. Returns true if successful.
export async function focusTmuxPane(paneId: string): Promise<boolean> {
  const result = await $`tmux select-pane -t ${paneId}`.quiet().nothrow()
  return result.exitCode === 0
}
