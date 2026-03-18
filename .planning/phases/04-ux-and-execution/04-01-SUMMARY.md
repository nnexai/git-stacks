---
phase: 04-ux-and-execution
plan: 01
subsystem: ux
tags: [errors, formatting, testing, workspace-ops, console-error]

# Dependency graph
requires: []
provides:
  - formatError(message, hint?) helper exported from src/lib/errors.ts
  - Consistent error output format: 'error: <message>\n  -> <hint>'
  - All workspace.ts console.error+process.exit(1) patterns use formatError
  - Parenthetical git error format in workspace-ops.ts error strings
  - Wave 0 test stubs in tests/commands/ for all 6 new phase behaviors
affects: [04-02, 04-03, 04-04, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error formatting: formatError(message, hint?) -> 'error: <msg>\\n  -> <hint>'"
    - "Git error format: human-readable message with raw git error in parentheses"
    - "Wave 0 stubs: test.todo() entries ensure bun test discovers new test files from day one"

key-files:
  created:
    - src/lib/errors.ts
    - tests/lib/errors.test.ts
    - tests/commands/status-json.test.ts
    - tests/commands/doctor-json.test.ts
    - tests/commands/doctor-fix.test.ts
    - tests/commands/sync-json.test.ts
    - tests/commands/list-columns.test.ts
    - tests/commands/run-parallel.test.ts
  modified:
    - src/commands/workspace.ts
    - src/lib/workspace-ops.ts

key-decisions:
  - "formatError empty hint guard: empty string and undefined both produce message-only output (no bare arrow line)"
  - "Recovery hints: only added where specific actionable fix exists — not invented for result.error passthroughs from ops layer"
  - "Parenthetical format for git errors: repo name quoted with single quotes: Merge failed for 'name' (raw git error)"
  - "Conflict wording: 'Merge conflicts detected:' vs 'Merge conflicts:' to add clarity; 'Could not clean/remove' vs 'Failed to clean/remove' for natural language"

patterns-established:
  - "Error output: always console.error(formatError(message, hint?)) — never raw console.error strings"
  - "Git op errors: 'Operation failed for name (raw git error)' — never colon-separated"
  - "Recovery hints in workspace.ts: workspace not found -> 'run: ws list'; repo not found -> shows available repos inline"

requirements-completed: [UX-01]

# Metrics
duration: 4min
completed: 2026-03-18
---

# Phase 4 Plan 1: Error Formatting Foundation Summary

**formatError helper with consistent 'error: msg' prefix and git operation parenthetical error format across all workspace commands**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T20:24:01Z
- **Completed:** 2026-03-18T20:28:01Z
- **Tasks:** 4 (Task 0 + Task 1 TDD + Task 2 + Task 3)
- **Files modified:** 10

## Accomplishments

- Created Wave 0 test stubs (6 files, 30 todos) ensuring bun test discovers all upcoming behavior tests
- Implemented formatError helper with TDD (RED/GREEN cycle, 4 test cases)
- Audited all 22 console.error calls in workspace.ts — all now use formatError with actionable hints where applicable
- Reformatted all git operation error strings in workspace-ops.ts to parenthetical format per CONTEXT.md locked decision

## Task Commits

Each task was committed atomically:

1. **Task 0: Create Wave 0 test stubs** - `151170f` (test)
2. **Task 1 RED: Failing tests for formatError** - `4977dcb` (test)
3. **Task 1 GREEN: formatError implementation** - `3f54fd0` (feat)
4. **Task 2: Audit workspace.ts console.error calls** - `09dec9c` (feat)
5. **Task 3: Reformat workspace-ops.ts error strings** - `aae96a5` (feat)

## Files Created/Modified

- `src/lib/errors.ts` - formatError(message, hint?) helper, exported
- `tests/lib/errors.test.ts` - 4 unit tests for formatError (all passing)
- `tests/commands/status-json.test.ts` - Wave 0 stub (4 todos)
- `tests/commands/doctor-json.test.ts` - Wave 0 stub (5 todos)
- `tests/commands/doctor-fix.test.ts` - Wave 0 stub (6 todos)
- `tests/commands/sync-json.test.ts` - Wave 0 stub (4 todos)
- `tests/commands/list-columns.test.ts` - Wave 0 stub (5 todos)
- `tests/commands/run-parallel.test.ts` - Wave 0 stub (6 todos)
- `src/commands/workspace.ts` - Added formatError import, replaced all 22 console.error calls
- `src/lib/workspace-ops.ts` - Reformatted git op error strings to parenthetical format

## Decisions Made

- formatError guards empty string hints: `if (hint)` catches both `undefined` and `""` — no bare `  -> ` lines
- Recovery hints only added where there is a concrete actionable fix (per CONTEXT.md). No hints invented for `result.error` passthroughs from ops layer since those already contain context.
- `repo not found` errors in `cd` and `run` commands show `available repos: <list>` inline for immediate recovery without needing a second command
- Parenthetical format for repo name: `Merge failed for '${repo.name}'` (quoted) vs `${repo.name}` unquoted elsewhere — single quotes added to match natural language when naming the entity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- formatError helper is available for all subsequent workspace commands (status, doctor, sync, list, run)
- Wave 0 test stubs ready for implementation in plans 04-02 through 04-06
- Pattern established: all new console.error calls must go through formatError

## Self-Check: PASSED

All files verified present. All commits verified in git history.

---
*Phase: 04-ux-and-execution*
*Completed: 2026-03-18*
