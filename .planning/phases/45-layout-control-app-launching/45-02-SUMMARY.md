---
phase: 45
plan: 2
title: AeroSpace Layout & Commands Tests
subsystem: tests/integrations/aerospace
tags: [aerospace, layout, commands, focus, tests]

requires: [45-01-SUMMARY.md]
provides: [test coverage for LAYOUT-01 through LAYOUT-04, LAUNCH-01, LAUNCH-02]
affects: [tests/lib/integrations/aerospace.test.ts]

tech-stack:
  added: []
  patterns: [mockSnapshotResult pattern for snapshot-based tests, spawnFn error catch for Linux CI]

key-files:
  created: []
  modified:
    - tests/lib/integrations/aerospace.test.ts

key-decisions:
  - "mockSnapshotWindowIds catches spawnFn errors with try/catch — on Linux, Bun.spawn(['open', '-a', ...]) throws ENOENT; the mock must not propagate this so tests remain platform-agnostic"
  - "Tracked state variables (flattenedWorkspaces, layoutCalls, execCalls, focusedWindows) use module-level let + beforeEach reset — same pattern as Phase 44 movedWindows"

requirements-completed: [LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAUNCH-01, LAUNCH-02]

duration: "6 min"
completed: "2026-03-28"
---

# Phase 45 Plan 2: AeroSpace Layout & Commands Tests Summary

Extended `tests/lib/integrations/aerospace.test.ts` with 47 tests (up from ~22) covering all LAYOUT and LAUNCH requirements via tracked mocks for flattenWorkspaceTree, setLayout, focusWindow, snapshotWindowIds, and _exec.run.

**Duration:** ~6 min | **Tasks:** 2 | **Files changed:** 1

## What Was Built

- Extended mock setup: `mockFlattenWorkspaceTree`, `mockSetLayout`, `mockFocusWindow`, `mockSnapshotWindowIds`, `mockExecRun` — all tracked and reset in beforeEach
- `mockSnapshotResult` configurable per test; spawnFn errors silently caught (Linux CI compatibility)
- `makeCtx` extended with optional `repos` array
- New describe blocks:
  - `flatten_before_open` (4 tests) — LAYOUT-03
  - `layout` (6 tests) — LAYOUT-01, LAYOUT-02
  - `focus` (4 tests) — LAYOUT-04
  - `commands array` (9 tests) — LAUNCH-01, LAUNCH-02
  - `backward compatibility` (1 test)

## Task Outcomes

| Task | Status | Commit |
|------|--------|--------|
| T1: Layout, flatten, focus tests | Done | 2907fe2 |
| T2: Commands array + backward compat tests | Done | 2907fe2 |

## Verification

- `bun test tests/lib/integrations/aerospace.test.ts`: 47 pass, 0 fail
- `bun run typecheck`: exits 0
- `bun run test`: 37/37 integration tests pass, no mock pollution

## Issues Encountered

None — Bun.spawn ENOENT on Linux resolved by catching spawnFn errors in mockSnapshotWindowIds.

## Next

Phase 45 complete — ready for Phase 46.

## Self-Check: PASSED
