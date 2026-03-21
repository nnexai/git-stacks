---
phase: 12-workspace-sync
plan: 01
subsystem: git
tags: [git, worktree, sync, fetch, timeout, callbacks]

# Dependency graph
requires: []
provides:
  - "fetchOrigin with 30-second socket timeout via git -c fetch.timeout=30"
  - "SyncRow type exported from workspace-ops.ts for TUI consumption"
  - "syncWorkspace onSyncProgress callback for structured per-repo status updates"
  - "Fetch failure tracking — unreachable remotes surface as skipped/failed in SyncResult"
affects: [12-02, 12-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "git -c fetch.timeout=30 flag for socket-level timeout without AbortSignal"
    - "fetchFailures Map pattern for tracking parallel async failures before sequential processing"
    - "Optional structured callback parameter appended to existing function signature (additive, non-breaking)"

key-files:
  created: []
  modified:
    - src/lib/git.ts
    - src/lib/workspace-ops.ts
    - tests/lib/git.test.ts

key-decisions:
  - "Use git -c fetch.timeout=30 (socket-level) not AbortSignal — git handles subprocess cleanup"
  - "fetchFailures Map collects all fetch errors in parallel phase before sequential rebase loop"
  - "onSyncProgress added as 4th optional parameter — preserves all existing callers without change"

patterns-established:
  - "Source-level test verification: readFileSync(git.ts) + toContain() for un-mockable Bun.$ internals"

requirements-completed: [WS-04]

# Metrics
duration: 12min
completed: 2026-03-21
---

# Phase 12 Plan 01: fetchOrigin Timeout and SyncWorkspace Progress Callbacks Summary

**fetchOrigin 30-second socket timeout via git -c flag, SyncRow type and onSyncProgress callback added to syncWorkspace, fetch failures tracked per-repo instead of silently swallowed**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-21T08:45:00Z
- **Completed:** 2026-03-21T08:57:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `fetchOrigin` now uses `git -c fetch.timeout=30 fetch origin` — unreachable remotes fail within 30 seconds (WS-04)
- `SyncRow` type exported from `workspace-ops.ts` with repo/status/detail/conflicts fields for TUI Plan 02/03 consumption
- `syncWorkspace` accepts optional `onSyncProgress?: (update: SyncRow) => void` as 4th parameter — all existing callers unchanged
- Fetch failures tracked in a `fetchFailures` Map instead of `.catch(() => {})` — failed repos now surface as skipped entries in SyncResult

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fetch.timeout=30 to fetchOrigin** - `12b3993` (feat, TDD)
2. **Task 2: Add SyncRow type and onSyncProgress callback** - `9dba188` (feat)

## Files Created/Modified

- `src/lib/git.ts` — fetchOrigin updated to use -c fetch.timeout=30 flag
- `src/lib/workspace-ops.ts` — SyncRow type added, syncWorkspace gets onSyncProgress param, fetch error swallowing replaced with fetchFailures Map
- `tests/lib/git.test.ts` — fetchOrigin import added, describe("fetchOrigin") block with 2 tests (functional + source-level timeout verification)

## Decisions Made

- `git -c fetch.timeout=30` (socket-level) instead of AbortSignal — git manages subprocess cleanup, no extra signal handling needed. Aligns with D-10 and WS-04.
- `fetchFailures` Map populated in parallel fetch phase, checked in sequential rebase loop — preserves concurrent fetch performance while enabling ordered failure reporting.
- Source-level test for timeout flag: `readFileSync(git.ts).toContain("fetch.timeout=30")` — used because Bun.$ tagged template calls cannot be asserted without mocking.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

- [x] `src/lib/git.ts` contains `fetch.timeout=30` — confirmed
- [x] `src/lib/workspace-ops.ts` exports `SyncRow` type — confirmed
- [x] `src/lib/workspace-ops.ts` contains `onSyncProgress?.` (7 occurrences) — confirmed
- [x] `src/lib/workspace-ops.ts` does NOT contain `.catch(() => {})` on fetch — confirmed (count: 0)
- [x] `src/lib/workspace-ops.ts` contains `fetchFailures.set(` — confirmed
- [x] `bun run typecheck` passes — confirmed
- [x] `bun test tests/lib/git.test.ts` — 15 pass, 0 fail
- [x] `bun test tests/lib/workspace-ops.test.ts` — 14 pass, 0 fail
- [x] Commits 12b3993 and 9dba188 exist — confirmed

## Self-Check: PASSED

## Next Phase Readiness

- Plan 02 (sync progress UI) can consume `SyncRow` from `workspace-ops.ts` and call `syncWorkspace(..., ..., ..., onSyncProgress)`
- Plan 03 (action menu wiring) will call `syncWorkspace` with the callback once the TUI component exists
- No blockers

---
*Phase: 12-workspace-sync*
*Completed: 2026-03-21*
