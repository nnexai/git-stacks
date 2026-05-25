---
phase: 100-manager-tui-command-output-containment
plan: 02
subsystem: tui
tags: [dashboard, command-output, opentui, manual-commands, issues]
requires:
  - phase: 100-01
    provides: command output state and captured manual-command callback primitives
provides:
  - structured ProgressView command-output viewer
  - captured dashboard run/manual/issue command output wiring
  - close/back behavior that blocks while commands are running
affects: [phase-100, manager-dashboard, manual-commands, issue-actions]
tech-stack:
  added: []
  patterns:
    - dashboard command output uses bounded tagged lines instead of raw strings
key-files:
  created: []
  modified:
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/ProgressView.tsx
    - src/tui/dashboard/issue-actions.ts
    - tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx
    - tests/tui/dashboard/issue-actions.test.ts
    - tests/tui/dashboard/integ-action-menu.test.tsx
key-decisions:
  - "Editor flows continue to use renderer suspend/resume and inherited stdio; non-editor progress commands use the bounded viewer."
  - "Existing progress messages from workspace operations are preserved as system output lines."
patterns-established:
  - "ProgressView renders status, omitted-line marker, stderr color branch, and explicit empty-output state from CommandOutputState."
  - "Dashboard command close/back keys are ignored while output status remains running."
requirements-completed: [TOUT-01, TOUT-02, TOUT-03, TOUT-04]
duration: 19min
completed: 2026-05-25
---

# Phase 100-02: Dashboard Command Output Viewer Summary

**Manager dashboard command paths now render bounded stdout/stderr inside the OpenTUI progress viewer**

## Performance

- **Duration:** 19 min
- **Started:** 2026-05-25T15:08:00Z
- **Completed:** 2026-05-25T15:27:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Upgraded `ProgressView` to render `CommandOutputState` with running, success, failure, omitted, empty-output, and stderr display states.
- Reworked dashboard progress state so run/manual-command/issue-open output is captured and shown as bounded tagged lines.
- Added integration coverage proving manual command output uses `onOutput`, cannot be dismissed while running, and returns to the workspace list after completion.

## Task Commits

1. **Tasks 1-3: ProgressView, command routing, and close/back context** - `a44dd26` (feat)

## Files Created/Modified

- `src/tui/dashboard/App.tsx` - Structured output state and run/manual/issue command wiring.
- `src/tui/dashboard/ProgressView.tsx` - Bounded command-output modal rendering.
- `src/tui/dashboard/issue-actions.ts` - Tagged stdout/stderr issue-open result lines.
- `tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx` - Viewer state coverage.
- `tests/tui/dashboard/issue-actions.test.ts` - Tagged output and exit-code coverage.
- `tests/tui/dashboard/integ-action-menu.test.tsx` - Manual command output callback and close/back coverage.

## Decisions Made

- Non-editor command output is captured in the dashboard; editor actions remain suspend/resume inherited-stdio flows by design.
- Workspace operation progress text is modeled as `system` lines so older progress surfaces continue to render without command stream labels.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Isolated issue-actions tests from dashboard mock-module leakage**
- **Found during:** Task 2 verification
- **Issue:** Running the focused test files together caused the dashboard integration mock for `issue-actions` to leak into `issue-actions.test.ts` through Bun's shared module cache.
- **Fix:** Imported `issue-actions` in the unit test through a Bun query-suffixed module path, matching the repo's existing cache-isolation test pattern.
- **Files modified:** `tests/tui/dashboard/issue-actions.test.ts`
- **Verification:** Focused tests, `bun run typecheck`, `bun run test:unit`, and `bun run test:integ` pass.
- **Committed in:** `a44dd26`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** The fix is test isolation only; no product scope changed.

## Issues Encountered

None beyond the documented test isolation deviation.

## Verification

- `bun test tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx tests/tui/dashboard/issue-actions.test.ts tests/tui/dashboard/integ-action-menu.test.tsx` - passed, 18 tests.
- `bun run typecheck` - passed.
- `bun run test:unit` - passed, 662 tests across 56 files.
- `bun run test:integ` - passed, 85/85 integration files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 03 can extend the regression matrix around noisy output, stderr-only output, no-output success, and full phase verification using the now-wired dashboard output viewer.

---
*Phase: 100-manager-tui-command-output-containment*
*Completed: 2026-05-25*
