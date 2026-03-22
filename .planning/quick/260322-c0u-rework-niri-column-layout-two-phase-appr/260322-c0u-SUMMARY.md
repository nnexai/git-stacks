---
phase: quick-260322-c0u
plan: 01
subsystem: integrations
tags: [niri, wayland, window-management, ipc]

requires:
  - phase: quick-260322-a6s
    provides: declarative columns config in niri integration open()
  - phase: quick-260322-b5d
    provides: WindowDetector interface, windowIds Record<string,number[]>

provides:
  - moveColumnToIndex and setWindowWidth wrappers in niri.ts
  - NiriWindowSchema layout field with pos_in_scrolling_layout
  - Two-phase open() in niri integration (create-then-arrange)
  - Column reordering via focus-window + move-column-to-index (O(n))
  - Focus-independent width setting via set-window-width --id

affects:
  - niri integration consumers
  - any future integration touching niri column layout

tech-stack:
  added: []
  patterns:
    - Two-phase window layout: Phase 1 creates all windows and collects columnMap, Phase 2 reorders/stacks/sets widths without spawning
    - focus-window --id + move-column-to-index for column reorder (left-to-right to avoid displacement)
    - set-window-width --id instead of focus + set-column-width for focus-independent width

key-files:
  created: []
  modified:
    - src/lib/niri.ts
    - src/lib/integrations/niri.ts
    - tests/lib/niri.test.ts
    - tests/lib/integrations/niri.test.ts

key-decisions:
  - "Two-phase approach: Phase 1 collects columnMap (no positioning), Phase 2 reorders left-to-right via focusNiriWindow + moveColumnToIndex (1-based), then stacks, then applies widths via setWindowWidth --id"
  - "moveColumnToIndex has no --id flag — caller must focusNiriWindow first; process left-to-right so already-placed columns stay stable"
  - "setWindowWidth --id replaces setNiriColumnWidth — eliminates focus dependency for width setting"
  - "NiriWindowSchema.layout field added (optional, backward compat) — enables pos_in_scrolling_layout if needed for future algorithms"
  - "setNiriColumnWidth import removed from niri integration — only setWindowWidth used in Phase 2c"

patterns-established:
  - "Phase 1 / Phase 2 separation: spawn everything first, arrange after — prevents race conditions with focus-follows-mouse"
  - "Left-to-right column reorder: moveColumnToIndex(ci + 1) for each column in config order 0..N ensures already-placed columns are never displaced"

requirements-completed: [LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAYOUT-05, LAYOUT-06]

duration: 5min
completed: 2026-03-22
---

# Quick Task 260322-c0u: Rework niri column layout — two-phase approach Summary

**Two-phase niri window layout: Phase 1 collects columnMap from spawns/bag, Phase 2 reorders via move-column-to-index, stacks, and applies widths via set-window-width --id — eliminating focus-follows-mouse races**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T07:52:13Z
- **Completed:** 2026-03-22T07:57:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `moveColumnToIndex` and `setWindowWidth` wrappers to `src/lib/niri.ts` with correct IPC args, and added `NiriWindowSchema.layout` field with `pos_in_scrolling_layout` tuple
- Reworked `niri integration open()` from inline-spawn-and-position to a clean two-phase create-then-arrange architecture
- Phase 2 column reorder uses O(n) `focus-window + move-column-to-index` left-to-right (previously stacking happened inline during spawn, racing with focus-follows-mouse)
- Width setting now uses `set-window-width --id` (focus-independent) instead of `focus + set-column-width`
- 74 niri-related tests pass (35 in niri.test.ts, 39 in integrations/niri.test.ts), full suite 496/496

## Task Commits

1. **Task 1: Add niri.ts wrappers and layout field** (TDD) - `d9ee8f1` (feat)
2. **Task 2: Rework niri integration open() to two-phase** - `4662303` (feat)

## Files Created/Modified

- `/home/nnex/dev/prj/git-stacks/src/lib/niri.ts` — Added `NiriWindowLayoutSchema`, `layout` field on `NiriWindowSchema`, `moveColumnToIndex()`, `setWindowWidth()`, both added to `NiriCommands` interface
- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/niri.ts` — Two-phase open(): Phase 1 builds columnMap, Phase 2 reorders+stacks+widths+focus; replaced `setNiriColumnWidth` import with `moveColumnToIndex`/`setWindowWidth`
- `/home/nnex/dev/prj/git-stacks/tests/lib/niri.test.ts` — Tests for moveColumnToIndex, setWindowWidth, layout field parsing, backward compat; NiriCommands structural check updated to 16 functions
- `/home/nnex/dev/prj/git-stacks/tests/lib/integrations/niri.test.ts` — Updated width tests to check `mockSetWindowWidth`; added `mockMoveColumnToIndex`/`mockSetWindowWidth` mocks; removed `mockSetNiriColumnWidth`; 3 new reordering tests

## Decisions Made

- Two-phase approach: collecting the entire `columnMap` in Phase 1 before any layout in Phase 2 is the critical separation that prevents focus-follows-mouse races. During Phase 1, no `consumeOrExpelWindowLeft`, `focusNiriWindow`, `setNiriColumnWidth`, or `setWindowWidth` calls are made.
- Column reorder is left-to-right with 1-based index: `moveColumnToIndex(ci + 1)` for config index `ci`. This is mathematically correct because already-placed columns (indices 1..ci-1) are never displaced by moving a column to the right.
- `setNiriColumnWidth` removed from integration imports entirely. The old approach (`focusNiriWindow + setNiriColumnWidth`) would have raced; the new approach (`setWindowWidth --id`) is a single focus-independent IPC call.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

During test development, the mock.module for `@/lib/niri` in the integration test file was updated to remove `setNiriColumnWidth` before the integration source was updated to remove that import. Bun's mock.module raised "Export named 'setNiriColumnWidth' not found" because the mock no longer provided it but the integration still imported it. Resolved by immediately updating the integration source to complete the two-phase implementation — the correct resolution sequence.

## Known Stubs

None — all wrappers call real niri IPC commands and the integration open() is fully wired.

## Next Phase Readiness

- Column layout is now race-condition-safe under focus-follows-mouse
- `NiriWindowSchema.layout.pos_in_scrolling_layout` available if future plans need to query current column positions
- `setNiriColumnWidth` remains in `niri.ts` for backward compatibility but is no longer used by the integration

## Self-Check: PASSED

All files confirmed present. Commits d9ee8f1 and 4662303 verified in git log.

---
*Phase: quick-260322-c0u*
*Completed: 2026-03-22*
