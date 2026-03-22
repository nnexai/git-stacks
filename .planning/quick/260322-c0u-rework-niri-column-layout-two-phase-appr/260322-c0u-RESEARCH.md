# Quick Task 260322-c0u: Rework niri column layout - Research

**Researched:** 2026-03-22
**Domain:** niri compositor IPC for column layout management
**Confidence:** HIGH

## Summary

The niri IPC has all the primitives needed for a two-phase approach (create-then-arrange), but the available actions constrain the design differently than CONTEXT.md assumed. The critical findings are:

1. **`move-column-left`/`move-column-right` do NOT accept `--id` or `--window-id`** -- they operate on the focused column only. However, **`move-column-to-index`** exists and moves the focused column to a specific 1-based index. This is far better than repeated left/right moves.

2. **`niri msg -j windows` now includes `layout.pos_in_scrolling_layout`** -- a `[column_index, tile_index]` tuple (1-based) that tells you exactly which column each window is in. This was added in v25.08 and is available on the running niri v25.11.

3. **`set-window-width --id <ID>`** exists and accepts a window ID -- this should be used instead of `set-column-width` (which has no `--id` flag and operates on the focused column).

4. **`consume-or-expel-window-left --id <ID>`** is confirmed working with `--id` flag (already used in current code).

5. **`focus-window --id <ID>`** is reliable for targeting. Combined with `move-column-to-index`, the pattern is: `focus-window --id X` then `move-column-to-index N`.

**Primary recommendation:** Use `focus-window --id` + `move-column-to-index` for reordering (not repeated `move-column-left`/`right`). Use `set-window-width --id` for width (not `set-column-width`). Read `layout.pos_in_scrolling_layout` from windows JSON to know current column positions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `focus-window --id` + `move-column-left`/`move-column-right` to reorder columns (UPDATED: research shows `move-column-to-index` is superior -- recommend this instead)
- Stacking (`consume-or-expel-window-left`) happens AFTER reordering, not during
- Phase 2 order: reorder columns -> stack within columns -> apply widths -> apply focus
- ALL bag windows (including source references) are moved to workspace in Phase 1
- Phase 1 should collect a map of `{ columnIndex, windowIndex } -> windowId`

### Claude's Discretion
- Research needed on whether `move-column-left/right` accepts `--window-id` flag -- ANSWERED: No, use `move-column-to-index` instead

### Deferred Ideas (OUT OF SCOPE)
None specified.
</user_constraints>

## Key Findings

### 1. Column Movement Commands (CRITICAL)

**`move-column-left` / `move-column-right`**: NO `--id` or `--window-id` parameter. Operates on focused column only.

```
$ niri msg action move-column-left --help
Move the focused column to the left
Usage: niri msg action move-column-left
```

**`move-column-to-index`**: Moves focused column to a 1-based index. NO `--id` flag -- requires prior `focus-window`.

```
$ niri msg action move-column-to-index --help
Move the focused column to a specific index on its workspace
Usage: niri msg action move-column-to-index <INDEX>
Arguments:
  <INDEX>  New index for the column. The index starts from 1 for the first column.
```

**Implication:** The reorder algorithm should be: for each column, `focus-window --id <any_window_in_column>` then `move-column-to-index <target>`. This is O(n) commands instead of O(n^2) for repeated left/right moves.

**Confidence:** HIGH -- verified via `niri msg action move-column-to-index --help` on running niri v25.11, and confirmed via niri-ipc docs.rs.

### 2. Window Position Query

`niri msg -j windows` returns a `layout` object with `pos_in_scrolling_layout: [column_index, tile_index]` (1-based). This tells us exactly where each window is positioned.

```json
{
  "id": 53,
  "app_id": "com.mitchellh.ghostty",
  "workspace_id": 18,
  "layout": {
    "pos_in_scrolling_layout": [2, 1],
    "tile_size": [1424.0, 914.0],
    "window_size": [1424, 914]
  }
}
```

**Implication:** After Phase 1 (all windows created/moved to workspace), query windows, filter by workspace_id, and read `pos_in_scrolling_layout[0]` to get current column index for each window. No guessing needed.

**Confidence:** HIGH -- verified on running niri v25.11 instance. Field added in v25.08.

**Schema update required:** `NiriWindowSchema` in `src/lib/niri.ts` does not include the `layout` field. Must add it.

### 3. Width Setting

**`set-column-width`**: NO `--id` flag. Operates on focused column only.

**`set-window-width --id <ID>`**: Accepts `--id` flag. Sets width of a specific window by ID.

```
$ niri msg action set-window-width --help
Change the width of the focused window
Usage: niri msg action set-window-width [OPTIONS] <CHANGE>
Options:
      --id <ID>  Id of the window whose width to set. If `None`, uses the focused window.
```

**Implication:** Replace current `setNiriColumnWidth` usage with `setWindowWidth(windowId, change)` to avoid focus dependency. Or use `set-column-width` after `focus-window` (current approach). Either works; `set-window-width --id` is cleaner since it's a single IPC call.

**Confidence:** HIGH -- verified via `--help` on running instance.

### 4. Stacking (`consume-or-expel-window-left`)

Accepts `--id <ID>` flag. Already used correctly in current code. Confirmed.

```
$ niri msg action consume-or-expel-window-left --help
Options:
      --id <ID>  Id of the window to consume or expel. If `None`, uses the focused window.
```

**Confidence:** HIGH.

### 5. Focus Window Reliability

`focus-window --id <ID>` is a required flag (not optional). It does not depend on mouse position -- it programmatically sets compositor focus. Even with focus-follows-mouse, the focus is set to the specified window ID. The concern about mouse override is valid only if the user moves their mouse during the layout operation, which would cause a focus change on the *next* mouse motion event -- but niri IPC commands execute synchronously within the compositor, so `focus-window` + `move-column-to-index` in sequence should be atomic from the compositor's perspective.

**Caveat:** If the user has `focus-follows-mouse` enabled and moves the mouse between two sequential `niri msg` calls, focus could shift. Since each `niri msg` is a separate process + IPC roundtrip, there is a small race window. Using `set-window-width --id` and `consume-or-expel-window-left --id` avoids this for those operations. Only `move-column-to-index` requires a preceding `focus-window`.

**Confidence:** MEDIUM -- the focus-follows-mouse race window is theoretical. In practice, the IPC commands execute in milliseconds and the user would need to be actively moving their mouse during workspace setup.

### 6. Other Useful Actions

| Action | Accepts `--id`? | Notes |
|--------|----------------|-------|
| `focus-column <INDEX>` | No (takes column index) | Could use to focus column N, but `focus-window --id` is more precise |
| `move-column-to-first` | No | Moves focused column to start |
| `move-column-to-last` | No | Moves focused column to end |
| `center-window --id` | Yes | Not needed for layout |

## Architecture Patterns

### Recommended Reorder Algorithm

```
Phase 1: Create all windows, collect windowId map
  -> { targetColumnIndex -> windowId[] }

Phase 2: Layout
  Step 1: Query niri windows, filter by workspace_id
  Step 2: For each target column (left-to-right, index 1..N):
    a. focus-window --id <first_window_of_target_column>
    b. move-column-to-index <target_index>
    (After each move, other column indices shift -- but since we process
     left-to-right and move TO the current index, columns to the right
     just get pushed right, which is correct)
  Step 3: Stack windows within columns
    For each column with >1 window:
      consume-or-expel-window-left --id <window_2>
      consume-or-expel-window-left --id <window_3>
      ...
  Step 4: Apply widths
    For each column with a width config:
      set-window-width --id <first_window_in_column> <width>
  Step 5: Apply focus
    If any window has focus: true:
      focus-window --id <that_window>
    Else handle workspace-level focus as before
```

### Ordering Correctness

Processing left-to-right with `move-column-to-index`:
- Target column 1: focus its window, move to index 1. Now column 1 is correct.
- Target column 2: focus its window (currently somewhere >= 2), move to index 2. Column 2 is now correct. Column 1 stays at 1.
- Target column 3: focus its window (currently somewhere >= 3), move to index 3. Columns 1-2 stay correct.

This works because `move-column-to-index` moves the focused column to the specified position and shifts others. By processing left-to-right, already-placed columns are never displaced.

### Width: Use `set-window-width` not `set-column-width`

After stacking, `set-window-width --id <window_id> <change>` sets the column width (since the window's column is the unit that has width in niri). This avoids the focus dependency of `set-column-width`.

## New niri.ts Wrappers Needed

| Function | niri msg command | Parameters |
|----------|-----------------|------------|
| `moveColumnToIndex(index: number)` | `action move-column-to-index <INDEX>` | 1-based index |
| `setWindowWidth(windowId: number, change: string)` | `action set-window-width --id <ID> <CHANGE>` | window ID + width string |

Note: `moveColumnToIndex` has NO `--id` flag. Caller must `focusNiriWindow(id)` first.

## Schema Updates Needed

`NiriWindowSchema` must add:

```typescript
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
```

Only `pos_in_scrolling_layout` is actually needed for the reorder algorithm, but including the full layout object prevents Zod from stripping unknown fields (which could mask issues).

## Common Pitfalls

### Pitfall 1: Column Index Shifting During Reorder
**What goes wrong:** Moving a column to index N shifts all columns at >= N to the right. If you process columns in arbitrary order, previously-placed columns get displaced.
**How to avoid:** Process columns strictly left-to-right (index 1, 2, 3...). Already-placed columns (indices < current) are never affected.

### Pitfall 2: Focus-Follows-Mouse Race
**What goes wrong:** Between `focus-window --id X` and `move-column-to-index N`, the user's mouse position causes focus to shift to a different window.
**How to avoid:** Minimize the gap between focus + move calls. For width and stacking, use `--id` flag variants to avoid focus dependency entirely. Accept that `move-column-to-index` has this small race window.

### Pitfall 3: Stacking Before Reordering
**What goes wrong:** If you stack windows (consume-or-expel) before reordering, the stacked window disappears from its column and the column count changes, breaking index calculations.
**How to avoid:** Always reorder first, then stack. CONTEXT.md already specifies this order.

### Pitfall 4: Stale pos_in_scrolling_layout
**What goes wrong:** After moving columns, the layout positions from the initial query are stale.
**How to avoid:** Query windows once before reordering to build the current-position map. After all reordering, the positions match the target. For stacking, use `--id` flags which don't depend on position knowledge.

### Pitfall 5: Floating Windows Have No Column Index
**What goes wrong:** `pos_in_scrolling_layout` is null for floating windows.
**How to avoid:** Filter to `is_floating === false` when building the column position map.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test |
| Config file | bunfig.toml |
| Quick run command | `bun test tests/lib/niri.test.ts tests/lib/integrations/niri.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| LAYOUT-01 | Phase 1 collects windowId map from spawns + bag | unit | `bun test tests/lib/integrations/niri.test.ts -x` |
| LAYOUT-02 | Phase 2 reorders columns via focus+move-column-to-index | unit | `bun test tests/lib/integrations/niri.test.ts -x` |
| LAYOUT-03 | Phase 2 stacks windows after reordering | unit | `bun test tests/lib/integrations/niri.test.ts -x` |
| LAYOUT-04 | Phase 2 applies widths via set-window-width --id | unit | `bun test tests/lib/integrations/niri.test.ts -x` |
| LAYOUT-05 | New niri.ts wrappers (moveColumnToIndex, setWindowWidth) | unit | `bun test tests/lib/niri.test.ts -x` |
| LAYOUT-06 | NiriWindowSchema includes layout field | unit | `bun test tests/lib/niri.test.ts -x` |

## Sources

### Primary (HIGH confidence)
- Running niri v25.11 instance -- verified all `--help` outputs directly
- [niri-ipc Action enum on docs.rs](https://docs.rs/niri-ipc/latest/niri_ipc/enum.Action.html) -- MoveColumnToIndex, SetWindowWidth, etc.
- [niri-ipc Window struct on docs.rs](https://docs.rs/niri-ipc/latest/niri_ipc/struct.Window.html) -- layout field
- [niri-ipc WindowLayout struct on docs.rs](https://docs.rs/niri-ipc/latest/niri_ipc/struct.WindowLayout.html) -- pos_in_scrolling_layout field
- Live `niri msg -j windows` output confirming `layout.pos_in_scrolling_layout` field

### Secondary (MEDIUM confidence)
- [niri v25.05 release notes](https://github.com/niri-wm/niri/discussions/1589) -- introduced move-column-to-index
- [niri v25.08 release notes](https://github.com/niri-wm/niri/discussions/2317) -- introduced window layout position data

## Metadata

**Confidence breakdown:**
- Column movement commands: HIGH - verified on running instance
- Window position query: HIGH - verified on running instance
- Width setting via set-window-width: HIGH - verified on running instance
- Reorder algorithm correctness: MEDIUM - logically sound but untested
- Focus-follows-mouse race: MEDIUM - theoretical concern, likely negligible in practice

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (niri IPC is stable)
