---
status: complete
phase: quick
plan: 260326-w2u
subsystem: tui
tags: [concurrency, tui, staleness, git, performance]

requires: []
provides:
  - mapLimited concurrency utility in src/lib/concurrency.ts
  - useStaleness hook with max-3 concurrent git processes and re-entrancy guard
affects: [tui, staleness, dashboard]

tech-stack:
  added: []
  patterns:
    - "Slot+queue concurrency limiting without external libraries"
    - "Re-entrancy guard via plain boolean flag (no reactive signal needed)"

key-files:
  created:
    - src/lib/concurrency.ts
    - tests/lib/concurrency-limiter.test.ts
  modified:
    - src/tui/dashboard/hooks/useStaleness.ts

key-decisions:
  - "Implemented mapLimited as a standalone async function (no class, no p-limit dependency)"
  - "Re-entrancy guard uses plain boolean, not a signal — reactivity not needed for a mutex"
  - "MAX_CONCURRENT_FETCHES = 3 defined as named constant alongside STALENESS_TTL"

patterns-established:
  - "mapLimited: reusable bounded-concurrency wrapper with Promise.allSettled result shape"

requirements-completed: []

duration: 2min
completed: 2026-03-26
---

# Quick Task 260326-w2u Summary

**Bounded-concurrency git fetch in useStaleness: mapLimited utility (max 3 concurrent) + re-entrancy guard preventing overlapping fetchStaleness calls**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-26T22:08:01Z
- **Completed:** 2026-03-26T22:10:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `src/lib/concurrency.ts` with `mapLimited<T,R>()` — runs async tasks with bounded concurrency, returns results in input order (same shape as `Promise.allSettled`)
- Added 4 unit tests covering peak concurrency <= limit, no drops, reject resilience, and input-order preservation
- Updated `useStaleness` to replace `Promise.allSettled` with `mapLimited(..., MAX_CONCURRENT_FETCHES)` and added a `fetching` boolean guard preventing re-entrant calls

## Task Commits

1. **Task 1: Create concurrency limiter utility with tests** - `09a399c` (feat + test, TDD)
2. **Task 2: Wire concurrency limiter and re-entrancy guard into useStaleness** - `bb377be` (feat)

## Files Created/Modified

- `src/lib/concurrency.ts` - mapLimited utility: slot+queue concurrency limiter, ~35 lines, no dependencies
- `tests/lib/concurrency-limiter.test.ts` - 4 bun:test test cases for mapLimited
- `src/tui/dashboard/hooks/useStaleness.ts` - imports mapLimited, adds MAX_CONCURRENT_FETCHES=3, adds fetching guard

## Decisions Made

- No external library (no `p-limit`) — the utility is ~35 lines and keeping it inline avoids a dependency for simple functionality
- `fetching` is a plain `let` boolean, not a SolidJS signal — a mutex flag has no UI reactivity requirement
- `.finally()` resets the guard so it correctly releases even when `mapLimited` itself throws

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `deferred` helper from test file**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Helper function declared in test file but never used; TypeScript strict mode raised TS6133
- **Fix:** Removed the unused function from the test file
- **Files modified:** tests/lib/concurrency-limiter.test.ts
- **Verification:** `bun run typecheck` passes with no errors
- **Committed in:** bb377be (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - unused variable)
**Impact on plan:** Trivial cleanup required by TypeScript strict mode. No scope change.

## Issues Encountered

None beyond the unused variable caught by typecheck.

## Next Phase Readiness

- `mapLimited` is reusable from any other module needing bounded concurrency
- useStaleness now safe for workspaces with many repos (no unbounded git process spawning)

---
*Phase: quick*
*Completed: 2026-03-26*

## Self-Check: PASSED

- src/lib/concurrency.ts: FOUND
- tests/lib/concurrency-limiter.test.ts: FOUND
- src/tui/dashboard/hooks/useStaleness.ts: FOUND
- 260326-w2u-SUMMARY.md: FOUND
- Commit 09a399c: FOUND
- Commit bb377be: FOUND
