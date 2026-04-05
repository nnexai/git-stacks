---
phase: 72-extraction-tests
plan: 01
subsystem: testing
tags: [bun-test, mock-module, workspace-env, workspace-status, workspace-git]
requires:
  - phase: 70
    provides: [workspace-env, workspace-status, workspace-git extracted modules]
provides:
  - focused extracted-module coverage for workspace env helpers
  - seam-correct mock.module coverage for workspace status and git flows
  - verified makeGitMock helper surface for extracted git helper imports
affects: [phase-72, validation, extracted-module-regressions]
tech-stack:
  added: []
  patterns: [direct-domain-module-tests, top-level mock.module isolation, temp-dir env-file coverage]
key-files:
  created:
    - tests/lib/workspace-env.test.ts
    - tests/lib/workspace-status.test.ts
    - tests/lib/workspace-git.test.ts
  modified: []
key-decisions:
  - "Kept the locked Phase 72 seams: direct imports from the extracted modules and top-level mock.module(\"@/lib/git\", ...) for status/git tests."
  - "Recorded Task 1 as a verification-only no-op because makeGitMock() already covered the required git.ts helpers in the checked-out tree."
  - "Used temp-directory writes plus mocked secrets to prove workspace-env helpers without real workspace roots or git repos."
patterns-established:
  - "Extracted-module tests should target the domain modules directly instead of re-entering workspace-ops.ts."
  - "Files using mock.module() rely on scripts/test-runner.ts process isolation rather than custom runner glue."
requirements-completed: [TEST-01, TEST-02, TEST-03]
duration: 9 min
completed: 2026-04-05
---

# Phase 72 Plan 01: Extracted Module Test Coverage Summary

**Focused extracted-module coverage now exists for workspace env, status, and git behavior without creating real repos or routing through the stale workspace-ops facade.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-05T18:40:56.609Z
- **Completed:** 2026-04-05T18:49:50.128Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added direct `workspace-env` tests for `mergeEnv`, `buildBaseEnv`, `buildRepoEnv`, `buildWorkspaceEnv`, and `writeEnvFiles`.
- Added isolated `workspace-status` tests that aggregate dirty/ahead/behind state and verify worktree versus trunk base-ref selection.
- Added isolated `workspace-git` tests that cover dry-run push behavior, push option forwarding, auto-stash aborts, and successful stash-aware sync flows.

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand `makeGitMock()` to match the extracted module imports** - `a3917240` (`test`, verification-only no-op; helper surface already present)
2. **Task 2: Create focused `workspace-env` helper tests without real repos** - `b31ba336` (`test`)
3. **Task 3: Create seam-correct `workspace-status` and `workspace-git` mock tests** - `55f71f76` (`test`)

## Files Created/Modified

- `tests/lib/workspace-env.test.ts` - pure helper and temp-directory coverage for extracted env helpers with mocked secrets
- `tests/lib/workspace-status.test.ts` - isolated status aggregation coverage using `mock.module("@/lib/git", ...)`
- `tests/lib/workspace-git.test.ts` - isolated push/sync coverage using the live extracted seams

## Decisions Made

- Kept `workspace-status` and `workspace-git` tests on `mock.module("@/lib/git", ...)` with `makeGitMock()` instead of inventing an `_exec` seam the live modules do not use.
- Treated the helper-surface task as already satisfied by the repository snapshot and recorded that verification explicitly rather than churning `tests/helpers.ts`.
- Used real filesystem temp directories only where `writeEnvFiles()` needs disk interaction; all other new tests stay data-driven and repo-free.

## Deviations from Plan

None - plan executed as written, with Task 1 satisfied by verification rather than a source diff.

## Issues Encountered

- The first `typecheck` pass failed because `WorkspaceRepo.task_path` is optional at the type level. The tests were tightened with explicit worktree-path helpers and then rerun cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 72 wave 2 can now add the dependency gate and dashboard IPC-state cleanup on top of a green extracted-module test baseline.
- `TEST-04` remains open until `madge` is installed, the dashboard cycles are removed, and the full validation command is green.

---
*Phase: 72-extraction-tests*
*Completed: 2026-04-05*
