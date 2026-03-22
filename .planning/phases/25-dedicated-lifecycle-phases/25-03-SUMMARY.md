---
phase: 25-dedicated-lifecycle-phases
plan: "03"
subsystem: workspace-ops
tags: [lifecycle, hooks, merge, tui, cascade, workspace-ops]

# Dependency graph
requires:
  - phase: 25-02
    provides: _executeClean/_executeClose cascade functions and buildBaseEnv helper

provides:
  - mergeWorkspace with full D-10 lifecycle order via _executeClean composition
  - captured:true for clean/remove/merge dispatches in TUI dashboard
  - runPreRemoveHooks removed (no longer exported from workspace-ops.ts)
  - --gone workspace removal migrated to use removeWorkspace() for full lifecycle

affects:
  - src/lib/workspace-ops.ts
  - src/tui/dashboard/App.tsx
  - src/commands/workspace.ts
  - tests/lib/workspace-ops.test.ts

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mergeWorkspace composes _executeClean (steps 1-6) then adds merge-specific steps 7-12 — no duplication of close/clean logic"
    - "All TUI lifecycle dispatches pass captured:true to use runHooksCaptured and prevent OpenTUI screen corruption"
    - "--gone removal now delegates to removeWorkspace() for full cascade instead of inline manual removal"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/tui/dashboard/App.tsx
    - src/commands/workspace.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "mergeWorkspace composes _executeClean for steps 1-6, then handles steps 7-12 merge-specific — follows the same composition pattern as removeWorkspace"
  - "post_merge fires after post_remove (D-11) — workspace is fully gone before merge notification hooks run"
  - "runPreRemoveHooks removed — removeWorkspace supersedes it for all callers (mergeWorkspace + --gone path)"
  - "--gone clean path migrated to removeWorkspace() calls — gains full D-10 lifecycle including close cascade and all hook positions"

patterns-established:
  - "captured:true pattern: all TUI dispatch paths pass captured:true; CLI paths do not (they inherit stdio)"

requirements-completed: [LC-10, LC-11, LC-12, LC-13]

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 25 Plan 03: Merge Cascade & TUI Captured Flag Summary

**mergeWorkspace refactored to full D-10 lifecycle order (pre_close -> integration cleanup -> post_close -> pre_clean -> worktree removal -> post_clean -> pre_merge -> git merge -> pre_remove -> YAML delete -> post_remove -> post_merge) via _executeClean composition; TUI captured flag fix prevents OpenTUI screen corruption on clean/remove/merge; runPreRemoveHooks removed**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T14:39:07Z
- **Completed:** 2026-03-22T14:43:57Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- mergeWorkspace now follows full D-10 lifecycle order by composing _executeClean for steps 1-6 (close cascade + clean cascade) then executing merge-specific steps 7-12
- All TUI lifecycle dispatches (clean, remove, merge) now pass captured:true, matching the existing pattern for open and close; hooks run via runHooksCaptured to prevent OpenTUI screen corruption
- runPreRemoveHooks removed from workspace-ops.ts; all callers migrated — mergeWorkspace uses the new cascade directly, workspace.ts --gone path uses removeWorkspace()
- Three new merge tests: D-10 lifecycle order verification, WS_TRIGGERED_BY=merge propagation, pre_merge hook abort with YAML preservation

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor mergeWorkspace with full D-10 cascade order** - `cad952b` (feat)
2. **Task 2: Fix TUI captured flag for clean/remove/merge dispatches** - `626c264` (fix)

## Files Created/Modified

- `src/lib/workspace-ops.ts` - mergeWorkspace replaced with D-10 cascade, runPreRemoveHooks removed
- `src/commands/workspace.ts` - runPreRemoveHooks import removed, --gone path migrated to removeWorkspace(), unused imports cleaned up (existsSync, unlinkSync, workspacePath, removeWorktree)
- `src/tui/dashboard/App.tsx` - captured:true added to cleanWorkspace, removeWorkspace, mergeWorkspace dispatches
- `tests/lib/workspace-ops.test.ts` - three new merge tests: D-10 order, WS_TRIGGERED_BY=merge, pre_merge abort; mergeWorkspace type declaration updated to include captured?: boolean

## Decisions Made

- mergeWorkspace composes _executeClean for steps 1-6 rather than calling _executeClose directly — matches the removeWorkspace pattern and avoids duplicating close+clean logic
- post_merge fires after post_remove (D-11 ordering) — workspace is fully deleted before merge notification hooks run
- --gone path in workspace.ts now uses removeWorkspace() — gains full D-10 lifecycle including close cascade and all hook positions that were previously skipped

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleaned up unused imports in workspace.ts after --gone refactor**
- **Found during:** Task 1 (mergeWorkspace refactor)
- **Issue:** After replacing runPreRemoveHooks + manual loop with removeWorkspace(), the imports for existsSync, unlinkSync, workspacePath, and removeWorktree became unused; TypeScript strict mode reported errors
- **Fix:** Removed unused imports and the unused `const tasksDir = getTasksDir(...)` in the --gone block; `bun run typecheck` exits 0
- **Files modified:** src/commands/workspace.ts
- **Committed in:** cad952b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - cleanup of newly-unused imports)
**Impact on plan:** Required for TypeScript strict mode compliance. No scope creep.

## Issues Encountered

None.

## Known Stubs

None - all hook fields are wired through the full cascade.

## Next Phase Readiness

Phase 25 is complete. All three plans (25-01 through 25-03) delivered:
- 25-01: buildBaseEnv, _executeClose, WS_TRIGGERED_BY injection
- 25-02: _executeClean cascade, cleanWorkspace/removeWorkspace refactor
- 25-03: mergeWorkspace D-10 cascade, TUI captured flag fix, runPreRemoveHooks removal

The lifecycle system is now fully consistent: all destructive operations (clean, remove, merge) compose the same cascade chain, WS_TRIGGERED_BY propagates through all hooks, and TUI dispatches use captured:true to prevent screen corruption.

## Self-Check: PASSED

- FOUND: .planning/phases/25-dedicated-lifecycle-phases/25-03-SUMMARY.md
- FOUND: cad952b (feat(25-03): refactor mergeWorkspace with full D-10 cascade order)
- FOUND: 626c264 (fix(25-03): pass captured:true to cleanWorkspace, removeWorkspace, mergeWorkspace in TUI)
- FOUND: runPreRemoveHooks completely removed from src/
- PASS: bun test tests/lib/workspace-ops.test.ts — 46 pass, 0 fail
- PASS: bun test tests/ — 601 pass, 0 fail
- PASS: bun run typecheck — no errors

---
*Phase: 25-dedicated-lifecycle-phases*
*Completed: 2026-03-22*
