---
phase: 25-dedicated-lifecycle-phases
plan: 02
subsystem: lifecycle
tags: [workspace-ops, hooks, cascade, lifecycle, teardown]

# Dependency graph
requires:
  - phase: 25-01
    provides: "_executeClose inner function, buildBaseEnv helper, post_close/pre_clean/post_clean/pre_remove/post_remove hook fields in schemas"
provides:
  - "_executeClean inner function: cascades _executeClose before worktree removal with pre_clean/post_clean hooks"
  - "Refactored cleanWorkspace: delegates to _executeClean with triggeredBy=clean"
  - "Refactored removeWorkspace: delegates to _executeClean (cascades through _executeClose) with triggeredBy=remove, then fires pre_remove/post_remove"
  - "Per-repo pre_clean hook execution interleaved with each individual worktree removal (D-08)"
  - "Cascade ordering tests, WS_TRIGGERED_BY propagation tests, abort-on-failure tests, per-repo hook tests"
affects: [25-03, workspace-ops-callers, tui-workspace-actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cascade pattern: close before clean before remove — each level delegates to the level above before doing its own work"
    - "triggeredBy propagated through entire cascade so all hooks see correct WS_TRIGGERED_BY value"
    - "Per-repo hooks interleaved with per-repo operations (not batched before/after)"
    - "try/catch around runHooks (throws on failure); runHooksCaptured failure detection via result check (pre-existing pattern from _executeClose)"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "_executeClean declared before _executeClose in source order — function declarations are hoisted in JS/TS so forward reference is safe"
  - "post_remove failure after YAML deletion logs but does not fail — YAML already gone, can't meaningfully roll back"
  - "runPreRemoveHooks kept in file because mergeWorkspace still calls it — Plan 03 will update mergeWorkspace"

patterns-established:
  - "Inner function pattern: _executeClose, _executeClean are private async function declarations; public functions are thin guards + dry-run handlers + delegation"
  - "Cascade abort: each level returns { ok: false } on failure and the caller propagates immediately (D-03)"
  - "Per-repo interleaved hooks: repo.hooks?.pre_clean fires inside the repo removal loop, not in a separate pass"

requirements-completed: [LC-04, LC-05, LC-06, LC-07, LC-09]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 25 Plan 02: Dedicated Lifecycle Phases Summary

**`_executeClean` cascade function with close-before-clean-before-remove ordering, per-repo interleaved pre_clean hooks, and WS_TRIGGERED_BY propagation through the full teardown chain**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T14:31:00Z
- **Completed:** 2026-03-22T14:35:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `_executeClean` inner function implementing the clean phase of the cascade: calls `_executeClose` first, then fires workspace-level `pre_clean`, then per-repo `pre_clean` interleaved with each worktree removal, then workspace-level `post_clean`
- Refactored `cleanWorkspace` to be a thin guard + dry-run handler that delegates to `_executeClean` with `triggeredBy: "clean"`; removed direct `runIntegrationCleanup` and `runPreRemoveHooks` calls
- Refactored `removeWorkspace` to cascade through `_executeClean` with `triggeredBy: "remove"`, then fire `pre_remove` before YAML deletion and `post_remove` after; removed all direct worktree loop, `runIntegrationCleanup`, and `runPreRemoveHooks` calls
- Added 9 new tests covering cascade ordering, WS_TRIGGERED_BY propagation, abort-on-failure, per-repo hook interleaving, post_remove/post_clean correctness

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor cleanWorkspace with _executeClean inner function and cascade** - `1f0e34e` (feat)
2. **Task 2: Refactor removeWorkspace to cascade through _executeClean** - `b87e99b` (feat)

## Files Created/Modified
- `src/lib/workspace-ops.ts` - Added `_executeClean`, refactored `cleanWorkspace` and `removeWorkspace`
- `tests/lib/workspace-ops.test.ts` - Added cascade ordering, WS_TRIGGERED_BY, abort, per-repo pre_clean, post_remove tests

## Decisions Made
- `_executeClean` placed before `_executeClose` in source order — function declarations are hoisted so forward reference to `_executeClose` is safe
- `post_remove` hook failure after `unlinkSync` logs the error via `onProgress` but does not fail the operation — the YAML is already deleted and there is no meaningful rollback
- `runPreRemoveHooks` function is not deleted because `mergeWorkspace` still calls it — Plan 03 will update the merge flow

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. The `runHooksCaptured` function does not throw on hook failure (unlike `runHooks`) — the pre-existing `_executeClose` uses the same try/catch pattern for both cases, so `_executeClean` follows the same convention for consistency. Tests for abort behavior use the non-captured path where `runHooks` does throw.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `_executeClose` and `_executeClean` are now stable inner functions; Plan 03 can add `_executeMerge` following the same pattern
- `cleanWorkspace` and `removeWorkspace` public APIs are backward-compatible (callers passing fewer opts fields still work)
- 598 tests pass with 0 failures; full suite regression confirmed

## Self-Check: PASSED

- FOUND: src/lib/workspace-ops.ts
- FOUND: tests/lib/workspace-ops.test.ts
- FOUND: 25-02-SUMMARY.md
- FOUND commit: 1f0e34e (Task 1)
- FOUND commit: b87e99b (Task 2)

---
*Phase: 25-dedicated-lifecycle-phases*
*Completed: 2026-03-22*
