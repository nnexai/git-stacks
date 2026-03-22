# Quick Task 260322-c0u: Rework niri column layout — two-phase approach - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Task Boundary

Rework niri integration's column layout from inline spawn-and-position to a two-phase approach:
- Phase 1 (creation): Move all bag windows to workspace + spawn all column app/command windows. No ordering guarantees.
- Phase 2 (layout): Reorder windows into column config order, stack within columns, apply widths, apply focus.

Key constraint: Do NOT rely on window focus for ordering — user has focus-follows-mouse, so focus can shift to any window during setup if the mouse moves.

</domain>

<decisions>
## Implementation Decisions

### Movement strategy
- Use `focus-window --id` + `move-column-left`/`move-column-right` to reorder columns
- Research needed: check if `move-column-left/right` accepts `--window-id` flag (avoiding focus dependency)
- After all windows exist on the workspace, calculate how many moves each column needs to reach its target position

### Stacking semantics
- Stacking (`consume-or-expel-window-left`) happens AFTER reordering, not during
- Phase 2 order: reorder columns → stack within columns → apply widths → apply focus

### Source window timing
- ALL bag windows (including source references) are moved to workspace in Step 2 (Phase 1)
- Phase 2 handles ordering only — it doesn't need to move windows between workspaces
- Non-column bag windows still move in Step 2 as before (no behavior change for them)

</decisions>

<specifics>
## Specific Ideas

- Phase 1 should collect a map of `{ columnIndex, windowIndex } → windowId` as it spawns/resolves windows
- Phase 2 receives this map and the current window order from `niri msg -j windows` filtered to the target workspace
- The reorder algorithm: for each column left-to-right, if the target window isn't at the right position, focus it and move-column-left until it is
- Width application uses `focus-window --id` + `set-column-width` (already works this way)
- Final focus uses `focus-window --id` for the window marked `focus: true`
- Need new niri.ts wrappers: `moveColumnLeft(windowId?)` and `moveColumnRight(windowId?)`

</specifics>

<canonical_refs>
## Canonical References

- niri IPC docs: need to verify `move-column-left --id <window-id>` support via research
- Current implementation: `src/lib/integrations/niri.ts` (column processing in open())
- niri shell wrappers: `src/lib/niri.ts`

</canonical_refs>
