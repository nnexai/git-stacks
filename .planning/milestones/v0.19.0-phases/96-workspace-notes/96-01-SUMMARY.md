---
phase: 96-workspace-notes
plan: 01
subsystem: testing
tags: [notes, jsonl, paths, workspace]
requires: []
provides:
  - Workspace notes storage helpers with append/list/clear/summary semantics
  - Config-root notes path contract via NOTES_DIR
affects: [96-02, tui-notes-details]
tech-stack:
  added: []
  patterns: [fail-closed JSONL parsing, config-root scoped workspace metadata]
key-files:
  created: [src/lib/notes.ts, tests/lib/notes.test.ts]
  modified: [src/lib/paths.ts, tests/lib/paths.test.ts, tests/helpers.ts]
key-decisions:
  - "Notes are stored under WS_CONFIG_DIR/notes as per-workspace JSONL files with {text,created} only."
  - "Malformed note stores block add/list/clear/summary operations and do not mutate on disk."
patterns-established:
  - "Parse existing JSONL before append/clear to prevent silent mutation of corrupt stores."
requirements-completed: [NOTE-02]
duration: 18min
completed: 2026-05-17
---

# Phase 96 Plan 01: Storage And Summary Contract For Workspace Notes Summary

**Workspace notes storage now uses config-root JSONL files with fail-closed corruption handling and a reusable count/latest summary helper.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-17T13:49:00Z
- **Completed:** 2026-05-17T14:07:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `NOTES_DIR` under `WS_CONFIG_DIR` and included it in path isolation tests/mocks.
- Added dedicated notes storage module with append/list/clear/summary surface.
- Locked fail-closed behavior for malformed JSONL across add/list/clear/summary.

## Task Commits

1. **Task 1: Add failing storage, summary, and path-isolation coverage for workspace notes** - `2fc9afb` (test)
2. **Task 2: Implement the notes path constant and reusable JSONL note helper surface** - `99556be` (feat)

## Files Created/Modified
- `src/lib/notes.ts` - Workspace note JSONL storage and summary helpers.
- `src/lib/paths.ts` - Added `NOTES_DIR` constant under config root.
- `tests/lib/notes.test.ts` - Storage order, corruption, clear, and summary contract tests.
- `tests/lib/paths.test.ts` - Config override derivation check for `NOTES_DIR`.
- `tests/helpers.ts` - Added notes directory support to isolated config and paths mocks.

## Decisions Made
- Kept note records minimal (`text`, `created`) and bound workspace context to file path.
- Clear behavior deletes the note file after validating existing content.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed new test type annotations for project `typecheck` gate**
- **Found during:** Task 2
- **Issue:** New test mappings used implicit `any`, causing `tsc --noEmit` failure.
- **Fix:** Added explicit row typing in `tests/lib/notes.test.ts`.
- **Files modified:** `tests/lib/notes.test.ts`
- **Verification:** `bun run typecheck`
- **Committed in:** `99556be`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** No scope change; required to satisfy existing type gate.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Storage and summary contracts are stable and ready for CLI wiring in Plan 96-02.

## Self-Check: PASSED
- FOUND: `.planning/phases/96-workspace-notes/96-01-SUMMARY.md`
- FOUND commit: `2fc9afb`
- FOUND commit: `99556be`

---
*Phase: 96-workspace-notes*
*Completed: 2026-05-17*
