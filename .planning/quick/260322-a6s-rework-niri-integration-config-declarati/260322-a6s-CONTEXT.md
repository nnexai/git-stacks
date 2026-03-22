# Quick Task 260322-a6s: Rework niri integration config — declarative window placement - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Task Boundary

Replace the niri integration's flat `commands: string[]` config with a declarative `columns` structure matching the tmux/cmux pane approach. Instead of panes (tmux concept), we manage windows arranged into vertical columns within a niri workspace. Prior integration windows (vscode, intellij) can be placed into the layout via `source:` references.

</domain>

<decisions>
## Implementation Decisions

### Config structure — columns with windows
- Config uses `columns:` array — each column contains 1-2 windows stacked vertically
- Column order in the array = placement order in the niri workspace (left to right)
- Each column has an optional `width:` passed verbatim to `niri msg action set-column-width` (e.g. `"50%"`, `"1280"`)
- Each window has `app:` (the program), optional `args:`, optional `repo:` (resolves cwd from workspace repos), optional `cwd:` (explicit path), optional `command:` (run in terminal apps)

### Prior integration windows via source:
- A window entry can use `source: <integration-id>` instead of `app:` to reference a window from the artifact bag
- `source: vscode` pulls the vscode WindowArtifact's niriWindowIds and positions that window in the column layout
- Works automatically with any integration that returns a WindowArtifact (vscode, intellij, future integrations)
- `source:` and `app:` are mutually exclusive on a window entry

### Config naming
- Top-level key is `columns:` (not `windows:` or `layout:`)
- Inside each column: `windows:` array

### Repo binding
- Windows support `repo: name` to auto-resolve the repo's `task_path` as cwd, matching tmux/cmux surface pattern
- `cwd:` for explicit paths, `command:` for terminal commands
- `app:` + `args:` for non-terminal windows (browsers etc.)

### Width control (from research)
- Use `set-column-width` (NOT `switch-preset-column-width`) — explicit value is better for declarative config
- Width string passed verbatim — niri validates it (percentage `"50%"`, fixed pixels `"1280"`, relative `"+10%"`)
- `set-column-width` has no `--id` flag — must `focus-window --id` first, then set width

### Window stacking (from research)
- `consume-or-expel-window-left --id <windowId>` stacks a window below existing windows in the column to its left
- Only called for windows 2+ in a column (window 1 is already its own column)

### Spawn control (from research)
- `niriSpawnSh` (niri 25.08+) for windows with `repo:`/`cwd:`/`command:` — supports `cd` and shell features
- `niriSpawn` for plain GUI apps (no cwd needed)
- `command:` auto-wraps with `-e bash -c '<command>'` — users don't specify terminal exec flags

### New niri.ts wrappers needed
- `focusNiriWindow(windowId)` — focus a window by niri ID
- `setNiriColumnWidth(change)` — set focused column's width
- `consumeOrExpelWindowLeft(windowId?)` — stack window into column to its left
- `niriSpawnSh(command)` — spawn through shell (for cwd + command)

### Claude's Discretion
- Shell escaping details in spawn-sh commands
- Error handling for failed spawns/width-sets within the column loop

</decisions>

<specifics>
## Specific Ideas

- Config shape (confirmed by user):
  ```yaml
  settings:
    integrations:
      niri:
        columns:
          - width: "60%"
            windows:
              - source: vscode    # reuses vscode window from artifact bag
          - width: "40%"
            windows:
              - app: ghostty
                repo: backend
                command: npm run dev
              - app: ghostty
                repo: frontend
                command: npm run dev
  ```
- Replaces the old `commands: string[]` entirely — breaking change within unreleased v0.6.0
- `snapshotWindowIds` used for each spawn to capture niri window IDs
- Sequential spawn processing (not parallel) to maintain column ordering
- `$WS_WORKSPACE`, `$WS_BRANCH`, `$WS_TASKS_DIR` env var substitution in args/command/cwd
- IPC sequence per column: spawn windows → consume extras into column → focus first window → set width

</specifics>
