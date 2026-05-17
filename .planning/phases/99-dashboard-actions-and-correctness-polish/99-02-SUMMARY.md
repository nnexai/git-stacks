---
phase: 99-dashboard-actions-and-correctness-polish
plan: 02
subsystem: tui
tags: [dashboard, action-menu, issues, integrations]
requires:
  - phase: 99-dashboard-actions-and-correctness-polish
    provides: "Repo edit action plan baseline"
provides:
  - "Workspace Issue... action row"
  - "Linked issue direct-open and picker routing"
affects: [dashboard-actions, linked-issues]
tech-stack:
  added: []
  patterns:
    - "Dashboard issue opening is routed through a small injectable helper for testable command execution"
key-files:
  created:
    - src/tui/dashboard/issue-actions.ts
    - .planning/phases/99-dashboard-actions-and-correctness-polish/99-02-SUMMARY.md
  modified:
    - src/tui/dashboard/ActionMenu.tsx
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/types.ts
    - tests/tui/dashboard/ActionMenu.test.tsx
    - tests/tui/dashboard/integ-action-menu.test.tsx
key-decisions:
  - "Issue opening uses known tracker issue metadata from workspace settings and the existing integration issue open command surface."
patterns-established:
  - "Disabled grouped action rows stay visible and block both Enter and letter shortcut activation."
requirements-completed: [TUI-06]
duration: 6 min
completed: 2026-05-17
---

# Phase 99 Plan 02: Workspace Linked Issue Action Summary

**Workspace `Issue...` action with disabled state, direct single-issue opening, multi-tracker picker, and persistent progress output**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-17T14:15:50Z
- **Completed:** 2026-05-17T14:20:45Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added an `Issue...` grouped row with disabled `Issue... (none linked)` rendering and activation blocking.
- Added linked issue candidate discovery for GitHub, GitLab, Gitea, and Jira workspace metadata.
- Added direct open for one issue, picker routing for multiple issues, and progress/error persistence until keypress.

## Task Commits

1. **Task 1: Add an issue-capable grouped row to the workspace action menu** - `36e1ab4` (feat)
2. **Task 2: Route linked issue open through direct or picker flow** - `992b74d` (feat)

**Plan metadata:** this summary commit.

## Files Created/Modified

- `src/tui/dashboard/ActionMenu.tsx` - Added disabled item support and `Issue...` row.
- `src/tui/dashboard/types.ts` - Added `issue` action, issue picker view, and issue candidate type.
- `src/tui/dashboard/App.tsx` - Added candidate discovery, direct-open routing, picker view, and progress handling.
- `src/tui/dashboard/issue-actions.ts` - Added injectable issue-open helper and tracker labels.
- `tests/tui/dashboard/ActionMenu.test.tsx` - Covered enabled/disabled issue row behavior.
- `tests/tui/dashboard/integ-action-menu.test.tsx` - Covered direct issue open, multi-issue picker, and progress persistence.

## Decisions Made

- Used a narrow dashboard helper around `git-stacks integration <tracker> issue open <workspace>` to avoid duplicating tracker-specific opener semantics in the TUI.
- Kept disabled issue state visible instead of hiding the row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added an injectable helper file for issue opening**
- **Found during:** Task 2 implementation
- **Issue:** Directly spawning from `App.tsx` would make App integration tests depend on a real `git-stacks` binary and tracker tools.
- **Fix:** Added `src/tui/dashboard/issue-actions.ts` as a narrow command wrapper that tests can mock.
- **Files modified:** `src/tui/dashboard/issue-actions.ts`, `tests/tui/dashboard/integ-action-menu.test.tsx`.
- **Verification:** Focused dashboard issue tests and typecheck passed.
- **Committed in:** `992b74d`

---

**Total deviations:** 1 auto-fixed testability seam.
**Impact on plan:** Behavior matches the plan; the helper keeps tracker semantics centralized behind the existing CLI command surface.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 03 manual command picker. No rollback progress files were modified.

## Self-Check: PASSED

- `bun test tests/tui/dashboard/ActionMenu.test.tsx tests/tui/dashboard/integ-action-menu.test.tsx tests/lib/integrations/issue-utils.test.ts` passed.
- `bun run typecheck` passed.
- Key files exist and plan commits are present.

---
*Phase: 99-dashboard-actions-and-correctness-polish*
*Completed: 2026-05-17*
