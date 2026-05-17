---
phase: 99-dashboard-actions-and-correctness-polish
plan: 03
subsystem: tui
tags: [dashboard, action-menu, manual-commands]
requires:
  - phase: 95-manual-workspace-commands
    provides: "Manual command listing and execution helpers"
  - phase: 99-dashboard-actions-and-correctness-polish
    provides: "Grouped action row support"
provides:
  - "Workspace Commands... action row"
  - "Manual command picker and progress execution"
affects: [dashboard-actions, manual-commands]
tech-stack:
  added: []
  patterns:
    - "Dashboard command execution uses listManualCommands default filtering and runManualCommand source helper"
key-files:
  created:
    - .planning/phases/99-dashboard-actions-and-correctness-polish/99-03-SUMMARY.md
  modified:
    - src/tui/dashboard/ActionMenu.tsx
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/types.ts
    - tests/tui/dashboard/ActionMenu.test.tsx
    - tests/tui/dashboard/integ-action-menu.test.tsx
requirements-completed: [TUI-05]
key-decisions:
  - "The TUI command picker lists visible manual command names only and keeps pre/post buckets implicit."
patterns-established:
  - "Manual command failures remain in the generic progress view until keypress with failedCommand context."
duration: 4 min
completed: 2026-05-17
---

# Phase 99 Plan 03: Workspace Manual Command Picker Summary

**Workspace `Commands...` action with visible-command picker, `runManualCommand()` execution, and persistent failure output**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-17T14:20:46Z
- **Completed:** 2026-05-17T14:24:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `Commands...` / `Commands... (none configured)` row with disabled activation blocking and stable existing shortcuts.
- Added a command picker driven by `listManualCommands()` default filtering, so `pre*` and `post*` names stay hidden.
- Routed selected commands through `runManualCommand(workspace, name, { config: readGlobalConfig() })` and kept success/failure output visible until keypress.

## Task Commits

1. **Task 1: Add a command-capable grouped row to the workspace action menu** - `6e10e8f` (feat)
2. **Task 2: Add command picker and source-helper execution** - `4c5a536` (feat)

**Plan metadata:** this summary commit.

## Files Created/Modified

- `src/tui/dashboard/ActionMenu.tsx` - Added commands grouped row and disabled label.
- `src/tui/dashboard/types.ts` - Added `commands` action and command picker view.
- `src/tui/dashboard/App.tsx` - Added command discovery, picker rendering, source-helper execution, and progress output.
- `tests/tui/dashboard/ActionMenu.test.tsx` - Covered command row enabled/disabled behavior.
- `tests/tui/dashboard/integ-action-menu.test.tsx` - Covered picker filtering, execution, and failure persistence.

## Decisions Made

- Used `listManualCommands()` without `{ all: true }` to preserve Phase 95 hidden pre/post defaults.
- Used the generic `ProgressView` rather than adding command-specific progress UI.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

The combined `bun test tests/lib/workspace-command.test.ts tests/tui/dashboard/ActionMenu.test.tsx tests/tui/dashboard/integ-action-menu.test.tsx` shape was avoided because Bun module-cache ordering can defeat the App test's workspace-command mock after the real helper is imported. The same files passed when run as separate `bun test` invocations, followed by `bun run typecheck`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 04 regression and rollback-exclusion coverage. No create-flow rollback files were modified.

## Self-Check: PASSED

- `bun test tests/lib/workspace-command.test.ts` passed.
- `bun test tests/tui/dashboard/ActionMenu.test.tsx` passed.
- `bun test tests/tui/dashboard/integ-action-menu.test.tsx` passed.
- `bun run typecheck` passed.
- Key files exist and plan commits are present.

---
*Phase: 99-dashboard-actions-and-correctness-polish*
*Completed: 2026-05-17*
