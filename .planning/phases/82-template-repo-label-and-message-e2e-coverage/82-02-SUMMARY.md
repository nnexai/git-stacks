---
phase: 82-template-repo-label-and-message-e2e-coverage
plan: "02"
subsystem: testing
tags: [e2e, cli, repo, labels, subprocess]
requires:
  - phase: 82-template-repo-label-and-message-e2e-coverage
    provides: Template E2E coverage and inventory update pattern from plan 01
  - phase: 81.1-repo-add-honors-enabled-forge-integrations
    provides: Enabled-aware repo add forge detection behavior
provides:
  - Repo registry subprocess coverage for git and dir repos
  - Workspace label add/remove/list/clear subprocess coverage
  - Inventory mappings for repo and label flows
affects: [phase-82, phase-84, e2e-inventory]
tech-stack:
  added: []
  patterns: [child-process-only PATH stubbing, isolated git repo fixtures]
key-files:
  created:
    - tests/commands/repo.test.ts
  modified:
    - tests/helpers.ts
    - tests/commands/label.test.ts
    - tests/e2e-inventory.ts
key-decisions:
  - "Stub forge CLIs through a child-process-only PATH helper rather than mutating the parent shell environment."
patterns-established:
  - "Repo E2E tests use real git repos plus isolated config and git-home fixtures."
requirements-completed: [E2E-10, E2E-11]
duration: 7min
completed: 2026-05-14
---

# Phase 82 Plan 02: Repo and Label E2E Coverage Summary

**Repo registry and workspace label command contracts covered through isolated real CLI subprocesses**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-14T18:06:20Z
- **Completed:** 2026-05-14T18:13:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `tests/commands/repo.test.ts` covering git repo add current-branch detection, `--branch`, `--name`, no-enabled-forge, exact-one-enabled-forge, and dir repo list/show/rename/remove `--force`.
- Added child-process-only PATH helper utilities in `tests/helpers.ts` for stub `gh`/`glab` binaries.
- Extended `tests/commands/label.test.ts` with explicit remove/list/clear stdout and persisted YAML assertions.
- Updated `tests/e2e-inventory.ts` with repo registry mappings and label coverage rationale.

## Task Commits

1. **Task 1: Add repo registry subprocess coverage for git-vs-dir and enabled-forge boundaries** - `3ac5dc1` (test)
2. **Task 2: Extend the existing workspace label subprocess suite and map it in the inventory** - `51a3d89` (test)

## Files Created/Modified

- `tests/commands/repo.test.ts` - Focused repo registry subprocess suite.
- `tests/helpers.ts` - Child PATH and executable fixture helpers for subprocess tests.
- `tests/commands/label.test.ts` - Extended workspace label command coverage.
- `tests/e2e-inventory.ts` - Repo and label flow mappings/rationale.

## Decisions Made

- Used stub `gh`/`glab` binaries in a temp bin prepended only to child process `PATH`.
- Kept repo coverage on allowed success paths and `repo remove --force`; prompt and `repo scan` flows remain excluded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced unsupported Bun `-x` verification flag**
- **Found during:** Plan-level verification
- **Issue:** The planned `bun test <file> -x` form is not supported by Bun 1.3.10.
- **Fix:** Ran focused test files without `-x`.
- **Files modified:** None.
- **Verification:** `bun test tests/commands/repo.test.ts` and `bun test tests/commands/label.test.ts` passed.
- **Committed in:** N/A - verification-command deviation only.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Verification stayed focused on the exact planned files; shipped coverage scope did not change.

## Issues Encountered

None beyond the documented unsupported verification flag.

## Known Stubs

None introduced by this plan. Existing helper mock override defaults in `tests/helpers.ts` are pre-existing test infrastructure, not new UI/data stubs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 82-03 can use the same subprocess harness and inventory update pattern for message CLI coverage.

## Self-Check: PASSED

- Found `tests/commands/repo.test.ts`
- Found `tests/commands/label.test.ts`
- Found commits `3ac5dc1` and `51a3d89`
- Verification passed:
  - `bun test tests/commands/repo.test.ts`
  - `bun test tests/commands/label.test.ts`

---
*Phase: 82-template-repo-label-and-message-e2e-coverage*
*Completed: 2026-05-14*
