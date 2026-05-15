---
phase: 86-workspace-command-workflow-edge-coverage
plan: 03
subsystem: testing
tags: [workspace, wrappers, e2e-inventory, gates]
requires:
  - phase: 86-workspace-command-workflow-edge-coverage
    provides: recreate and destructive command Phase 86 test files
provides:
  - wrapper command edge coverage
  - canonical E2E inventory mappings for Phase 86 command tests
affects: [workspace-command-workflow-edge-coverage, workspace-cli, tests, e2e-inventory]
tech-stack:
  added: []
  patterns: [real CLI subprocess tests, JSON payload assertions, inventory gate alignment]
key-files:
  created: [tests/commands/workspace-wrapper-edges.test.ts]
  modified: [src/commands/workspace.ts, tests/e2e-inventory.ts]
key-decisions:
  - "run --json now fails fast unless --parallel is present, matching the only JSON result mode implemented by the command."
patterns-established:
  - "Wrapper edge tests parse JSON payloads and assert durable command contracts instead of prompt or spinner text."
requirements-completed: [CMD-01, CMD-02, CMD-03, CMD-04, GATE-03]
duration: 35min
completed: 2026-05-15
---

# Phase 86 Plan 03: Workspace Wrapper Edge Coverage Summary

**Real CLI wrapper coverage for run, paths, env, status, sync, push, and pull, with Phase 86 test mappings wired into the canonical E2E inventory.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-05-15T04:53:00Z
- **Completed:** 2026-05-15T05:28:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `tests/commands/workspace-wrapper-edges.test.ts` with seven real CLI subprocess tests.
- Covered wrapper option conflicts, mixed-result JSON output, cwd detection, outside-cwd failure guidance, `--repo` JSON output, `status --fetch --json`, and no-op/error branches for sync, push, and pull.
- Updated `tests/e2e-inventory.ts` so Phase 86 recreate, clean-gone, destructive-safety, and wrapper-edge tests are mapped to the existing workspace command inventory entries.
- Fixed `run --json` without `--parallel` so it fails before executing the requested command.

## Task Commits

1. **Tasks 1-2: Cover wrapper command edges and inventory mappings** - `84933f6` (test)

## Files Created/Modified

- `tests/commands/workspace-wrapper-edges.test.ts` - Real CLI coverage for wrapper command edge contracts.
- `tests/e2e-inventory.ts` - Maps Phase 86 coverage into workspace status, run, paths, env, and git-operation inventory entries.
- `src/commands/workspace.ts` - Adds an option guard for unsupported `run --json` without `--parallel`.

## Decisions Made

- Kept wrapper tests focused on stable machine-readable and safety-critical output rather than snapshotting progress text.
- Mapped new Phase 86 tests into existing inventory items instead of creating duplicate command-family entries.
- Treated `run --json` without `--parallel` as an invalid option combination because non-parallel run mode has no JSON contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `run --json` was accepted without `--parallel` but ignored**
- **Found during:** Task 1
- **Issue:** The CLI parsed `--json` for `run` even when `--parallel` was absent, then executed the command in human-output mode instead of rejecting the unsupported option combination.
- **Fix:** Added a fast-fail guard before run dispatch: `--json` now requires `--parallel`.
- **Files modified:** `src/commands/workspace.ts`
- **Verification:** `bun test tests/commands/workspace-wrapper-edges.test.ts`; `bun run verify:gates`; `bun run verify`
- **Committed in:** `84933f6`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug).
**Impact on plan:** The fix was required to make wrapper option behavior explicit and stayed within the `run` command contract.

## Issues Encountered

- A previous long-running verification session became unavailable after context compaction, so the full verification command was rerun before committing.

## Verification

- `bun test tests/commands/workspace-wrapper-edges.test.ts` - passed, 7 tests.
- `bun run verify:gates` - passed.
- `bun run verify` - passed: coverage, unit tests, 73/73 integration test files, dependency cycle check, and typecheck.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 86 now has all three command workflow coverage plans implemented and mapped through the local gate inventory.

## Self-Check: PASSED

- Found `tests/commands/workspace-wrapper-edges.test.ts`.
- Found commit `84933f6`.
- No tracked file deletions in task commit.

---
*Phase: 86-workspace-command-workflow-edge-coverage*
*Completed: 2026-05-15*
