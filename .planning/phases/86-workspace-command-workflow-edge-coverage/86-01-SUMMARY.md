---
phase: 86-workspace-command-workflow-edge-coverage
plan: 01
subsystem: testing
tags: [workspace, recreate, e2e, cli, coverage]
requires:
  - phase: 81-workspace-and-git-operation-e2e-coverage
    provides: workspace CLI fixture and subprocess patterns
provides:
  - open --recreate refusal and no-change subprocess coverage
  - forced recreate repo and configuration drift coverage
affects: [workspace-command-workflow-edge-coverage, tests, e2e-inventory]
tech-stack:
  added: []
  patterns: [real CLI subprocess tests, durable YAML assertions, local git fixtures]
key-files:
  created: [tests/commands/workspace-recreate.test.ts]
  modified: []
key-decisions:
  - "Successful open --recreate assertions ignore last_opened because open normally records that timestamp; refusal and cancel branches still assert byte-for-byte YAML stability."
patterns-established:
  - "Recreate command tests assert persisted YAML and filesystem state instead of prompt/spinner snapshots."
requirements-completed: [CMD-01, GATE-03]
duration: 20min
completed: 2026-05-15
---

# Phase 86 Plan 01: Workspace Recreate Edge Coverage Summary

**Real CLI subprocess coverage for `open --recreate` refusal, no-change, cancel-safe, and forced drift workflows.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-15T04:53:00Z
- **Completed:** 2026-05-15T05:12:59Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `tests/commands/workspace-recreate.test.ts` with seven real CLI subprocess tests.
- Covered missing-template, no-template, no-change, non-force cancel, forced repo add/remove, and forced config drift persistence.
- Verified durable YAML and filesystem state instead of broad prompt/spinner output.

## Task Commits

1. **Tasks 1-2: Cover recreate refusal/no-change paths and forced drift application** - `a2fe0af` (test)

## Files Created/Modified

- `tests/commands/workspace-recreate.test.ts` - Real CLI coverage for template-backed `open --recreate` edge workflows.

## Decisions Made

- Successful `open --recreate` can update `last_opened` through normal open behavior, so no-change tests compare workspace structure excluding that timestamp.
- Config-drift copy uses a non-open hook (`pre_create`) so the test proves hook persistence without executing shell hooks during `open`.

## Deviations from Plan

### Auto-fixed Issues

None - no source behavior changes were required.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Plan scope stayed within test coverage.

## Issues Encountered

- Initial no-change equality had to account for normal `last_opened` open behavior.
- Initial config-drift hook fixture used `post_open`, which executes during `open`; the test now uses `pre_create` to assert persisted hook drift without adding shell availability assumptions.

## Verification

- `bun test tests/commands/workspace-recreate.test.ts` - passed, 7 tests.
- `bun run test:integ` - passed, 70/70 integration test files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02 can build on the same real CLI fixture style for `clean --gone` and destructive command safety tests.

## Self-Check: PASSED

- Found `tests/commands/workspace-recreate.test.ts`.
- Found commit `a2fe0af`.
- No tracked file deletions in task commit.

---
*Phase: 86-workspace-command-workflow-edge-coverage*
*Completed: 2026-05-15*
