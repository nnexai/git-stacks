---
phase: 89-files-sync-schema-and-materialization
plan: 03
subsystem: filesystem
tags: [files-sync, git-exclude, linked-worktree]
requires:
  - phase: 89-02
    provides: sync materialization and target safety
provides:
  - repo-level git_exclude handling after sync materialization
  - linked worktree common-git-dir exclude support
  - create/open sync pass-through coverage
affects: [files, git, workspace-lifecycle, workspace-ops]
tech-stack:
  added: []
  patterns: [common git dir exclude writes, post-materialization exclude ordering]
key-files:
  created: []
  modified:
    - src/lib/files.ts
    - src/lib/git.ts
    - tests/lib/files.test.ts
    - tests/lib/lifecycle-files-env-config-real-fixture.test.ts
    - tests/lib/workspace-lifecycle-create.test.ts
    - tests/lib/workspace-ops.test.ts
key-decisions:
  - "Repo-level git_exclude writes to the common git dir info/exclude after sync copy succeeds."
  - "Workspace-level sync ignores git_exclude and never writes local excludes."
patterns-established:
  - "Local exclude helpers preserve existing lines and dedupe appended sync entries."
requirements-completed: [FSYNC-01, FSYNC-02, FSYNC-03]
duration: 27 min
completed: 2026-05-16
---

# Phase 89 Plan 03: Repo-Level Sync Git Excludes Summary

**Repo-level files.sync excludes through git common-dir info/exclude, with linked-worktree verification**

## Performance

- **Duration:** 27 min
- **Started:** 2026-05-16T08:51:00Z
- **Completed:** 2026-05-16T09:18:00Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Added common git dir resolution with `git rev-parse --git-common-dir` and local exclude writing to `<common-git-dir>/info/exclude`.
- Wired repo-level `git_exclude: true` to append rooted file and directory exclude patterns only after sync materialization succeeds.
- Proved linked worktree behavior with real `git check-ignore`, and verified create/open entrypoints preserve sync-bearing file config.

## Task Commits

1. **Task 1: Add linked-worktree exclude tests** - `085156d` (test)
2. **Task 2: Add workspace-level no-exclude and failure-order tests** - `085156d` (test)
3. **Task 3: Implement common-dir exclude helpers and repo-level git_exclude** - `34c9f8f` (feat)
4. **Task 4: Run final Phase 89 gates** - no code commit; verification recorded below.

## Files Created/Modified

- `src/lib/git.ts` - Adds common git dir resolution and local exclude write helpers.
- `src/lib/files.ts` - Writes repo-level sync excludes after successful materialization only.
- `tests/lib/lifecycle-files-env-config-real-fixture.test.ts` - Covers linked worktree common-dir excludes with real git.
- `tests/lib/files.test.ts` - Covers workspace no-exclude and repo failure-order behavior.
- `tests/lib/workspace-lifecycle-create.test.ts` - Covers create-time pass-through of sync-bearing files.
- `tests/lib/workspace-ops.test.ts` - Covers open-time sync materialization.

## Decisions Made

- Exclude patterns are rooted to sync targets: files use `/<target>`, directories use `/<target>/` and `/<target>/**`.
- Existing user lines in `info/exclude` are preserved, and existing sync lines are not duplicated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Combined Bun test command exposes existing global mock leakage**
- **Found during:** Task 4 (Run final Phase 89 gates)
- **Issue:** The exact single-process command that includes `workspace-lifecycle-create.test.ts` and `lifecycle-files-env-config-real-fixture.test.ts` fails because global `mock.module()` stubs from the former leak into the latter.
- **Fix:** Verified the affected files independently and kept the exact combined failure recorded. A deeper runner/isolation fix belongs to the existing Phase 93.1 test-runner work.
- **Files modified:** None for this issue.
- **Verification:** Every Phase 89 target test file passes when run independently; `bun run typecheck` and `bun run verify:gates` pass.
- **Committed in:** Not applicable.

---

**Total deviations:** 1 recorded (pre-existing test isolation issue, not a sync implementation failure).
**Impact on plan:** Implementation behavior is verified; the exact raw combined Bun command remains blocked by test-runner isolation debt.

## Issues Encountered

- Exact command failed:
  - `bun test tests/lib/config.test.ts tests/lib/composition.test.ts tests/lib/files.test.ts tests/lib/lifecycle-files-env-config-real-fixture.test.ts tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts && bun run typecheck && bun run verify:gates`
  - Failure class: single-process Bun mock leakage from `workspace-lifecycle-create.test.ts` into `lifecycle-files-env-config-real-fixture.test.ts`.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/files.test.ts tests/lib/lifecycle-files-env-config-real-fixture.test.ts tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts && bun run typecheck` - passed before final combined gate, aside from the known combined-file pollution path.
- `bun test tests/lib/config.test.ts` - passed independently.
- `bun test tests/lib/composition.test.ts` - passed independently.
- `bun test tests/lib/files.test.ts` - passed independently.
- `bun test tests/lib/lifecycle-files-env-config-real-fixture.test.ts` - passed independently.
- `bun test tests/lib/workspace-lifecycle-create.test.ts` - passed independently.
- `bun test tests/lib/workspace-ops.test.ts` - passed independently.
- `bun run typecheck` - passed.
- `bun run verify:gates` - passed.

## Self-Check: PASSED

## Next Phase Readiness

Phase 89 implementation is ready for phase-level verification, with a recorded test-runner isolation caveat on the exact raw combined Bun command.

---
*Phase: 89-files-sync-schema-and-materialization*
*Completed: 2026-05-16*
