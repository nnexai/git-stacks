---
phase: 01-foundation
plan: "04"
subsystem: git
tags: [git, worktree, atomicity, bug-fix, workspace-ops]

# Dependency graph
requires:
  - phase: 01-01
    provides: git test infrastructure (makeGitRepo helper, worktree test patterns)
provides:
  - "Detached HEAD temp worktree pattern for mergeNoFF (BUG-04)"
  - "Atomic mergeWorkspace with early-return on merge failure (BUG-01)"
  - "Stage-then-commit pattern for removeWorkspace and cleanWorkspace (BUG-02)"
  - "Git worktree re-registration for renameWorkspace (BUG-03)"
affects: [workspace-ops, mergeWorkspace, removeWorkspace, cleanWorkspace, renameWorkspace]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detached HEAD temp worktree: create --detach at base SHA, merge, update-ref, remove --force"
    - "Stage-then-commit atomicity: collect all failures before mutating persistent state (YAML)"
    - "Result type: { ok: boolean; error?: string } for all fallible git operations"

key-files:
  created: []
  modified:
    - src/lib/git.ts
    - src/lib/workspace-ops.ts
    - tests/lib/git.test.ts

key-decisions:
  - "mergeNoFF uses update-ref to advance base branch ref after temp worktree merge -- no git checkout ever runs on main clone"
  - "renameWorkspace replaces renameSync with per-repo removeWorktree + createWorktree to keep git's internal worktree registry consistent"
  - "removeWorkspace and cleanWorkspace collect failures array before deciding to mutate YAML -- partial failures return error with all failed repos listed"
  - "mergeNoFF returns { ok: boolean; error?: string } matching rebaseBranch pattern -- callers (mergeWorkspace) now check result.ok"

patterns-established:
  - "Detached HEAD merge: worktree add --detach <sha> -> merge -> rev-parse HEAD -> update-ref -> worktree remove --force (in finally)"
  - "Atomicity pattern: collect failures[] -> if failures.length > 0 return error -> else mutate state"

requirements-completed: [BUG-01, BUG-02, BUG-03, BUG-04]

# Metrics
duration: 2min
completed: 2026-03-17
---

# Phase 1 Plan 4: Atomicity Bug Fixes Summary

**Four workspace atomicity bugs fixed: detached HEAD temp worktree for mergeNoFF, YAML-preserved early-return for merge failures, stage-then-commit failure collection for remove/clean, git re-registration instead of renameSync for rename**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-17T21:33:53Z
- **Completed:** 2026-03-17T21:36:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Rewrote `mergeNoFF` to never run `git checkout` on the main clone; instead creates a detached HEAD temp worktree at the base branch SHA, merges there, then advances the base branch ref via `update-ref`
- Fixed `mergeWorkspace` to check the `{ ok, error }` return from `mergeNoFF` and return early with an error if any repo's merge fails -- YAML is never deleted on partial failure
- Fixed `removeWorkspace` and `cleanWorkspace` to use collect-then-commit pattern: all `removeWorktree` calls wrapped in try/catch, failures aggregated, YAML only deleted when all succeed
- Replaced `renameSync(oldTaskDir, newTaskDir)` in `renameWorkspace` with per-repo git worktree re-registration (`removeWorktree` + `createWorktree`) keeping git's internal registry consistent

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite mergeNoFF with detached HEAD temp worktree (BUG-04)** - `83587db` (fix)
2. **Task 2: Fix atomicity in mergeWorkspace, removeWorkspace, cleanWorkspace, renameWorkspace (BUG-01, BUG-02, BUG-03)** - `11d6dd3` (fix)

## Files Created/Modified

- `src/lib/git.ts` - Added `join` from path; rewrote `mergeNoFF` to use detached HEAD temp worktree pattern; return type changed from `void` to `{ ok: boolean; error?: string }`
- `src/lib/workspace-ops.ts` - Removed `renameSync` import; BUG-01 fix in `mergeWorkspace`; BUG-02 fixes in `removeWorkspace`/`cleanWorkspace`; BUG-03 rewrite of `renameWorkspace`
- `tests/lib/git.test.ts` - Updated existing mergeNoFF test to assert `result.ok`; added "does not disturb working tree" test; added "returns error on bad base branch" test

## Decisions Made

- Used `update-ref refs/heads/<baseBranch> <newHead>` to advance the branch ref after a successful merge in the detached worktree. This is the correct mechanism: the branch ref is updated atomically without touching the working tree or HEAD of the main clone.
- The `finally` block ensures the temp worktree is always removed even if the merge fails or throws. `--force` is necessary because a failed merge leaves the worktree in a dirty state.
- Chose to collect all `removeWorktree` failures (not stop on first) so callers get a complete error report of which repos failed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect test expectation for "does not change HEAD" behavior**

- **Found during:** Task 1 verification
- **Issue:** The test checked that `git rev-parse HEAD` SHA was unchanged after `mergeNoFF`, but when the main clone is on `main`, `update-ref refs/heads/main` also advances HEAD (HEAD is a symbolic ref to main). The test expectation was wrong -- what matters is that no `git checkout` disturbs the working tree, not that the SHA is frozen.
- **Fix:** Changed test to verify the branch name remains `main` (no checkout happened) and the merge commit is reachable from the main log.
- **Files modified:** `tests/lib/git.test.ts`
- **Verification:** `bun test tests/lib/git.test.ts -t "mergeNoFF"` passes (3 tests)
- **Committed in:** `83587db` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test expectation)
**Impact on plan:** The test logic bug required fixing before the acceptance criteria could be verified. No scope creep.

## Issues Encountered

None beyond the test expectation bug documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four atomicity bugs (BUG-01 through BUG-04) are fixed and verified with 85 passing tests
- `mergeNoFF` now returns `{ ok: boolean; error?: string }` -- any new callers must check `result.ok`
- The detached HEAD worktree pattern is established and can be reused for future git operations that need to avoid disturbing the main clone working tree

---
*Phase: 01-foundation*
*Completed: 2026-03-17*

## Self-Check: PASSED

All files exist, all commits verified, all acceptance criteria met:
- `worktree add --detach` present in git.ts
- `.gs-merge-` temp path present in git.ts
- `update-ref refs/heads/` present in git.ts
- `worktree remove --force` present in git.ts
- `join` imported from path in git.ts
- `git checkout ${baseBranch}` NOT present in mergeNoFF
- `Merge failed for` present in workspace-ops.ts
- `Failed to remove worktrees` present in workspace-ops.ts
- `renameSync` not imported or called (only in comment)
- `removeWorktree(repo.main_path` present in renameWorkspace
- `createWorktree(repo.main_path` present in renameWorkspace
- 85 tests pass (0 failures)
