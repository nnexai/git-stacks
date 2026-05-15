---
phase: 85-core-real-fixture-functional-hardening
plan: 02
subsystem: testing
tags: [git, real-remotes, bare-remotes, source-coverage]

requires:
  - phase: 81-workspace-and-git-operation-e2e-coverage
    provides: workspace git operation E2E context
provides:
  - Source-level tests for core git wrappers against disposable local bare remotes
affects: [phase-85, git-wrapper-tests, coverage-gates]

tech-stack:
  added: []
  patterns:
    - Direct `src/lib/git.ts` tests using local bare remotes and peer clones

key-files:
  created:
    - tests/lib/git-real-remote.test.ts
  modified: []

key-decisions:
  - "Use local bare remotes and peer clones only; no network services or developer repositories are required."
  - "Assert source-owned structured results and git state instead of incidental git stderr wording."

patterns-established:
  - "Git wrapper real-remote tests should create divergence through peer clones and verify wrapper return values plus actual repo state."

requirements-completed: [CORE-02, CORE-05, GATE-03]

duration: 3min
completed: 2026-05-15
---

# Phase 85 Plan 02: Git Real-Remote Source Coverage Summary

**Core git wrapper coverage against local bare remotes for branch state, tracking, push, pull, failures, no-op, and dirty worktree behavior**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-15T04:35:08Z
- **Completed:** 2026-05-15T04:37:54Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `tests/lib/git-real-remote.test.ts` with direct imports from `src/lib/git.ts`.
- Covered ahead/behind counts, worktree fetch staleness, upstream tracking paths, push no-op and non-fast-forward failures, pull fast-forward/no-op/divergence/missing-branch results, and dirty worktree detection.
- Kept all remotes local and disposable through existing git helper patterns.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add real-remote branch-state tests for git wrappers** - `d2e5805` (test)
2. **Task 2: Add push, pull, no-op, failure, and dirty-worktree tests** - `d2e5805` (test)

## Files Created/Modified

- `tests/lib/git-real-remote.test.ts` - Adds real local-remote source tests for git wrapper behavior.

## Decisions Made

- Kept the coverage at the wrapper layer rather than adding CLI workflow assertions.
- Used peer clones to create remote divergence and branch availability without external network dependencies.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `git rev-parse --git-path FETCH_HEAD` returns a path relative to the repository it is run in. The test now checks the main repository's `FETCH_HEAD`, which is the same common-dir artifact that worktree staleness uses.
- Creating a local branch directly from `origin/<branch>` sets tracking in git; the upstream-tracking test now creates a local branch from `main` while keeping the remote-tracking ref present to exercise the intended source path.

## Verification

- `bun test tests/lib/git-real-remote.test.ts` - PASS
- `bun run test:unit` - PASS
- `bun run typecheck` - PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 85-03. Core git wrapper behavior now has direct source coverage with local remotes.

## Self-Check: PASSED

- Found expected file: `tests/lib/git-real-remote.test.ts`
- Found expected commit: `d2e5805`
- Stub scan found only a harmless optional helper default argument; no goal-blocking stubs were introduced.

---
*Phase: 85-core-real-fixture-functional-hardening*
*Completed: 2026-05-15*
