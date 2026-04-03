---
phase: 58-ahead-behind-tracking
plan: 01
subsystem: git
tags: [git, worktree, ahead-behind, fetch, staleness]

# Dependency graph
requires: []
provides:
  - getCommitsAhead git primitive in src/lib/git.ts
  - isFetchStale function using git-common-dir for worktree-safe FETCH_HEAD mtime check
affects: [58-02, 58-03, 58-04, workspace-ops, ahead-behind-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getCommitsAhead mirrors getCommitsBehind: reverse range direction ${base}..${head} counts commits in head not in base"
    - "isFetchStale uses git rev-parse --git-common-dir for worktree-safe FETCH_HEAD resolution"
    - "Stale check defaults to 15 minutes; safe default of true on any error"

key-files:
  created: []
  modified:
    - src/lib/git.ts
    - tests/lib/git.test.ts

key-decisions:
  - "Use git rev-parse --git-common-dir (not hardcoded .git) so isFetchStale works in worktrees where .git is a file"
  - "Default stale threshold is 15 minutes (900000 ms) — matches D-02 decision in phase context"
  - "isFetchStale returns true (stale) on any error — safe default avoids silently skipping fetches"

patterns-established:
  - "getCommitsAhead: mirror of getCommitsBehind with reversed range direction"
  - "isFetchStale: FETCH_HEAD mtime check via --git-common-dir for worktree safety"

requirements-completed: [AB-01, AB-07]

# Metrics
duration: 15min
completed: 2026-04-03
---

# Phase 58 Plan 01: Ahead/Behind Tracking — Git Primitives Summary

**getCommitsAhead and isFetchStale git primitives added to git.ts with worktree-safe FETCH_HEAD path resolution via --git-common-dir**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-03T14:00:00Z
- **Completed:** 2026-04-03T14:15:00Z
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Added `getCommitsAhead(repoPath, base, head)` — exact mirror of `getCommitsBehind` with range direction `${base}..${head}`
- Added `isFetchStale(repoPath, thresholdMs?)` — checks FETCH_HEAD mtime using `git rev-parse --git-common-dir` for worktree safety, defaulting to 15-minute threshold
- Added `statSync` import alongside existing `existsSync` in git.ts
- 11 new tests covering both functions: zero ahead, positive count, non-existent path, ahead/behind mirror relationship, missing FETCH_HEAD, fresh FETCH_HEAD, stale FETCH_HEAD, custom threshold, worktree path resolution
- Full test suite passes (38 tests in git.test.ts, all 37 integration test suites pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getCommitsAhead function to git.ts** - `9e4ce8d` (feat)
2. **Task 2: Add isFetchStale function to git.ts** - `74d6352` (feat)
3. **Task 3: Add tests for getCommitsAhead** - `8d0284d` (test)
4. **Task 4: Add tests for isFetchStale** - `8d0284d` (test — committed with Task 3 in same test file)

## Files Created/Modified
- `src/lib/git.ts` - Added `getCommitsAhead` and `isFetchStale` exports; added `statSync` to fs imports
- `tests/lib/git.test.ts` - Added `describe("getCommitsAhead")` and `describe("isFetchStale")` blocks; added `utimesSync` to fs imports; added `getCommitsAhead` and `isFetchStale` to import list

## Decisions Made
- Used `git rev-parse --git-common-dir` instead of hardcoded `.git` — the common dir is shared across all worktrees so FETCH_HEAD is found correctly
- `--git-common-dir` returns a relative path when CWD is inside the repo; code resolves it against `repoPath` when not absolute
- Default stale threshold: 15 minutes per the phase research decisions (D-02)
- Tasks 3 and 4 ended up in a single commit because both test blocks were written to the same file in sequence

## Deviations from Plan

None - plan executed exactly as written. Tasks 3 and 4 were folded into a single commit (same file), which is noted above.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `getCommitsAhead` and `isFetchStale` are ready for use in Plan 58-02 (workspace-ops integration)
- Both functions follow established patterns from `getCommitsBehind` and `fetchOrigin`
- No blockers

---
*Phase: 58-ahead-behind-tracking*
*Completed: 2026-04-03*
