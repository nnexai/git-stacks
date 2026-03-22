# Quick Task 260322-a6s: Rework Niri Integration Config - Research

**Researched:** 2026-03-22
**Domain:** niri compositor IPC -- column width control, window stacking, spawn ordering
**Confidence:** HIGH (live-tested on niri 25.11)

## Summary

All IPC commands needed for declarative column layout are available and confirmed working via live testing on niri 25.11. The key findings: `set-column-width` accepts percentage strings (e.g., `"50%"`) and fixed pixels (e.g., `"1280"`) but NOT decimal proportions (e.g., `"0.33333"` fails). Width commands operate on the **focused column only** -- there is no `--id` targeting flag, so the integration must focus each column before setting its width. Window stacking into columns uses `consume-or-expel-window-left`, which DOES accept `--id` for targeting specific windows.

**Primary recommendation:** Use `set-column-width` with the user's width string passed through verbatim (percentage or fixed pixel). For window stacking, use `consume-or-expel-window-left --id <windowId>` after spawning. Three new niri.ts wrapper functions are needed: `focusNiriWindow`, `setNiriColumnWidth`, `consumeOrExpelWindowLeft`. A fourth wrapper, `niriSpawnSh`, is needed for spawning windows with cwd control.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Config uses `columns:` array -- each column contains 1-2 windows stacked vertically
- Column order in the array = placement order in the niri workspace (left to right)
- Each column has an optional `width:` that maps to niri's width system
- Each window has `app:` (program), optional `args:`, optional `repo:` (cwd from workspace repos), optional `cwd:` (explicit path), optional `command:` (terminal command)
- Top-level key is `columns:` (not `windows:` or `layout:`)
- Inside each column: `windows:` array
- Old `commands:` config is removed -- breaking change within unreleased v0.6.0
- Must still use `niriSpawn()` for window spawning
- `$WS_WORKSPACE`, `$WS_BRANCH`, `$WS_TASKS_DIR` env var substitution in args/command

### Claude's Discretion
- Exact niri IPC command sequencing for column width control
- Whether `set-column-width` or `switch-preset-column-width` is more appropriate

### Deferred Ideas (OUT OF SCOPE)
None specified.
</user_constraints>

## Niri IPC Findings (Live-Tested)

### Column Width Control

**Recommendation: Use `set-column-width`, NOT `switch-preset-column-width`.**

| Command | Targeting | Arguments | Use Case |
|---------|-----------|-----------|----------|
| `set-column-width` | Focused column only (no `--id`) | `"50%"`, `"1280"`, `"+10%"`, `"-10%"` | Set exact width -- user specifies value |
| `switch-preset-column-width` | Focused column only | None -- just cycles through presets | NOT useful -- no control over which preset |
| `set-window-width` | `--id <ID>` supported | Same format as set-column-width | Per-window width (not what we need) |

**Tested formats for `set-column-width <CHANGE>`:**

| Input | Result | Notes |
|-------|--------|-------|
| `"50%"` | OK (exit 0) | Proportion of output width, includes borders/gaps |
| `"1280"` | OK (exit 0) | Fixed logical pixels, window content only |
| `"+10%"` | OK (exit 0) | Relative increase |
| `"-10%"` | OK (exit 0) | Relative decrease |
| `"0.33333"` | FAIL (exit 2) | "invalid value" -- decimal proportions not accepted |

**Key constraint:** `set-column-width` has NO `--id` or `--window-id` flag. It ONLY operates on the focused column. The integration must `focus-window --id <ID>` on a window in the target column before calling `set-column-width`.

### Window-to-Column Stacking

**Tested sequence for stacking window C below window B in the same column:**

1. Spawn window B (becomes its own column)
2. Spawn window C (becomes a new column to the right of B)
3. `consume-or-expel-window-left --id <C_id>` -- C joins B's column, stacked below B

**Verified behavior:**
- `consume-or-expel-window-left` accepts `--id <ID>` for targeting specific windows
- After consume, `pos_in_scrolling_layout` in the window JSON confirms stacking: B at `[col, 1]`, C at `[col, 2]`
- `expel-window-from-column` reverses the operation (makes it a separate column again)
- Consuming always places the window BELOW existing windows in the column (matches config array order: `windows[0]` is top, `windows[1]` is bottom)

### Window Spawn Ordering

**Observed behavior:** New windows spawned via `niri msg action spawn` appear as a new column to the RIGHT of the currently focused column/window. This means column order in the config array naturally maps to left-to-right ordering when processing sequentially.

### cwd Control via spawn-sh

**Live-tested:** `niri msg action spawn-sh -- "cd /tmp && ghostty -e sleep 10"` successfully spawns a ghostty window with `/tmp` as the working directory. Available since niri 25.08; confirmed working on 25.11.

`spawn` (no `-sh`) does NOT support shell features like `cd`, env var expansion, or pipes. Use `spawn-sh` when the window needs a specific cwd or when `command:` is specified.

### Complete IPC Sequence for Config

For a config like:
```yaml
columns:
  - width: "50%"
    windows:
      - app: ghostty
        repo: backend
        command: npm run dev
  - width: "50%"
    windows:
      - app: firefox
        args: [--new-window, localhost:3000]
      - app: ghostty
        repo: frontend
        command: npm run dev
```

The IPC sequence is:

```
# Column 1, window 1 (with cwd + command -> use spawn-sh)
1. snapshotWindowIds wrapping:
     niri msg action spawn-sh -- "cd /tasks/ws/backend && exec ghostty -e bash -c 'npm run dev'"
   -> captures [win1_id]
2. niri msg action focus-window --id <win1_id>
3. niri msg action set-column-width 50%

# Column 2, window 1 (no cwd, no command -> use spawn)
4. snapshotWindowIds wrapping:
     niri msg action spawn -- firefox --new-window localhost:3000
   -> captures [win2_id]
5. niri msg action focus-window --id <win2_id>
6. niri msg action set-column-width 50%

# Column 2, window 2 (with cwd + command -> use spawn-sh, then consume into column)
7. snapshotWindowIds wrapping:
     niri msg action spawn-sh -- "cd /tasks/ws/frontend && exec ghostty -e bash -c 'npm run dev'"
   -> captures [win3_id]
8. niri msg action consume-or-expel-window-left --id <win3_id>
   -> win3 joins win2's column, stacked below
```

### New niri.ts Wrapper Functions Needed

Four new functions for `src/lib/niri.ts`:

```typescript
// Focus a window by its niri window ID
export async function focusNiriWindow(windowId: number): Promise<void> {
  await _exec.run(["action", "focus-window", "--id", String(windowId)])
}

// Set the width of the currently focused column
// change: "50%", "1280", "+10%", "-10%"
export async function setNiriColumnWidth(change: string): Promise<void> {
  await _exec.run(["action", "set-column-width", change])
}

// Consume the target window into the column to its left (stack vertically)
// If windowId provided, targets that window; otherwise uses focused window
export async function consumeOrExpelWindowLeft(windowId?: number): Promise<void> {
  const args = ["action", "consume-or-expel-window-left"]
  if (windowId !== undefined) args.push("--id", String(windowId))
  await _exec.run(args)
}

// Spawn a command through the shell (supports cd, env vars, pipes)
export async function niriSpawnSh(command: string): Promise<void> {
  await _exec.run(["action", "spawn-sh", "--", command])
}
```

Update `NiriCommands` interface to include these four new functions.

## Architecture Patterns

### Config Schema (Zod)

```typescript
const niriWindowSchema = z.object({
  app: z.string(),
  args: z.array(z.string()).optional(),
  repo: z.string().optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
})

const niriColumnSchema = z.object({
  width: z.string().optional(),  // "50%", "1280", etc. -- passed to set-column-width verbatim
  windows: z.array(niriWindowSchema).min(1),
})

const niriConfigSchema = z.object({
  enabled: z.boolean().optional(),
  columns: z.array(niriColumnSchema).optional(),
})
```

### Spawn Logic Decision Tree

For each window in the config:

1. **Resolve cwd:** `repo:` -> look up `task_path` from workspace repos; `cwd:` -> use directly; neither -> use `tasksDir`
2. **Build spawn command:**
   - If `command:` is set (terminal app with command to run):
     Use `niriSpawnSh("cd <cwd> && exec <app> <args...> -e bash -c '<command>'")`
   - If `repo:` or `cwd:` is set but no `command:` (app with cwd):
     Use `niriSpawnSh("cd <cwd> && exec <app> <args...>")`
   - If neither `repo:`, `cwd:`, nor `command:` (plain GUI app like firefox):
     Use `niriSpawn([app, ...args])`

### Env Var Substitution

Reuse the existing pattern from the current `commands` implementation:

```typescript
const vars: Record<string, string> = {
  WS_WORKSPACE: ctx.workspace.name,
  WS_BRANCH: ctx.workspace.branch ?? "",
  WS_TASKS_DIR: ctx.tasksDir,
}
const expand = (s: string) => s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => vars[key] ?? "")
```

Apply to `args`, `command`, and `cwd` values before building spawn commands.

### Integration open() Rewrite Pattern

Follow the same pattern as tmux/cmux `applyPaneLayout`:

1. Parse config from workspace settings (fall back to global config)
2. If no columns configured, return early (no-op, like no `panes:` in tmux)
3. For each column in order:
   a. For each window in the column:
      - Resolve cwd, expand env vars, build spawn command
      - Use `snapshotWindowIds` + `niriSpawn`/`niriSpawnSh` to spawn and capture window IDs
   b. If column has >1 window: `consumeOrExpelWindowLeft(windowId)` for windows 2+
   c. Focus the first window of the column, then `setNiriColumnWidth(width)` if width is specified

## Common Pitfalls

### Pitfall 1: set-column-width Requires Focus First
**What goes wrong:** Calling `set-column-width` without first focusing a window in the target column sets the width of the WRONG column.
**How to avoid:** Always `focus-window --id <windowId>` before `set-column-width`. The focused window determines which column is affected.

### Pitfall 2: snapshotWindowIds Timing
**What goes wrong:** Spawning multiple windows rapidly without waiting for each to appear causes snapshot to miss windows or attribute them to wrong columns.
**How to avoid:** Use `snapshotWindowIds` for EACH window spawn sequentially. Do not parallelize spawns.

### Pitfall 3: consume-or-expel-window-left Is a Toggle
**What goes wrong:** `consume-or-expel-window-left` is a toggle -- if the window is already IN a column (not the sole window), it EXPELS it instead of consuming.
**How to avoid:** Only call for freshly spawned windows that are guaranteed to be in their own single-window column. This is always true for windows 2+ in a column since they were just spawned.

### Pitfall 4: spawn vs spawn-sh for cwd
**What goes wrong:** `niri msg action spawn` does NOT support `cd`, shell expansion, or environment variable expansion. Using it with commands that need cwd fails silently (window opens in wrong directory).
**How to avoid:** Use `spawn-sh` whenever the window needs a specific working directory or when `command:` is specified. Use `spawn` only for plain GUI apps with no cwd requirement.

### Pitfall 5: Shell Escaping in spawn-sh
**What goes wrong:** `spawn-sh` passes the argument to `sh`, so shell metacharacters in user commands or paths get interpreted.
**How to avoid:** Quote paths and command arguments properly when building the `spawn-sh` string. Use single quotes around the inner command to prevent double-expansion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column width format validation | Regex parser for "50%", "1280", etc. | Pass string verbatim to `set-column-width` | niri validates it; if invalid, the command fails gracefully (exit 2) |
| Window-column tracking | Manual column index tracking | `consume-or-expel-window-left --id` | niri handles column membership |
| Preset cycling | Counter-based preset index | `switch-preset-column-width` | Not needed -- `set-column-width` with explicit value is better for declarative config |

## Open Questions

1. **Command field semantics**: The CONTEXT.md example shows `command: npm run dev` on a ghostty window. The cleanest approach is `spawn-sh "cd <cwd> && exec ghostty -e bash -c 'npm run dev'"`. This handles cwd and command in one shot. The planner should decide whether `command:` always implies wrapping with `-e bash -c` or if users specify the terminal execution flag themselves.

   **Recommendation:** The integration wraps `command:` automatically: `exec <app> <args...> -e bash -c '<command>'`. Users who need custom flags use `args:` instead of `command:`.

## Sources

### Primary (HIGH confidence -- live-tested)
- `niri msg action set-column-width --help` on niri 25.11
- `niri msg action consume-or-expel-window-left --help` on niri 25.11
- `niri msg action focus-window --help` on niri 25.11
- `niri msg action spawn --help` and `spawn-sh --help` on niri 25.11
- Live IPC tests: spawned 3 ghostty windows, set widths, stacked windows, verified `pos_in_scrolling_layout` in JSON output
- Live `spawn-sh` test: confirmed `"cd /tmp && ghostty -e sleep 10"` works

### Secondary (MEDIUM confidence)
- [niri Configuration: Layout wiki](https://github.com/niri-wm/niri/wiki/Configuration:-Layout) -- preset-column-widths config syntax
- [niri Configuration: Key Bindings wiki](https://github.com/niri-wm/niri/wiki/Configuration:-Key-Bindings) -- action documentation
- [niri IPC wiki](https://github.com/YaLTeR/niri/wiki/IPC) -- general IPC patterns

## Metadata

**Confidence breakdown:**
- IPC commands: HIGH -- live-tested on running niri 25.11
- Width format: HIGH -- tested "50%", "1280", "+10%"; confirmed "0.33333" fails
- Window stacking: HIGH -- live-tested consume-or-expel-window-left with --id
- Spawn ordering: HIGH -- confirmed new windows appear right of focused column
- cwd handling: HIGH -- spawn-sh tested with cd + ghostty on niri 25.11

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (niri IPC is stable across recent versions)
