---
phase: 05-tech-debt-cleanup-fix-open-now-lifecycle-bypass-workspace-type-contract-in-new-flow-and-dead-code-removal
plan: 02
subsystem: workspace-ops
tags: [dead-code, cleanup, safety, files, paths, repo-wizard]

# Dependency graph
requires:
  - phase: 05-tech-debt-cleanup P01
    provides: workspace-wizard type-safe new flow (prerequisite for this cleanup pass)
provides:
  - warnExternalFiles call in mergeWorkspace (SAFE-01 complete across all three destructive ops)
  - STACKS_DIR removed from paths.ts (zero-import export eliminated)
  - stale "old StackRepo/Stack type" JSDoc comments removed from files.ts
  - deprecated applyFileOperations removed from files.ts (zero call sites)
  - unreachable runRepoAdd removed from repo-wizard.ts with unused imports cleaned up
affects: [v2-work, future-maintenance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "warnExternalFiles emitted before dry-run short-circuit in all three destructive ops (clean, remove, merge)"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/lib/paths.ts
    - src/lib/files.ts
    - src/tui/repo-wizard.ts

key-decisions:
  - "warnExternalFiles block inserted after dirty check and before conflict pre-check in mergeWorkspace — matching identical pattern in cleanWorkspace and removeWorkspace"
  - "STACKS_DIR removed with zero call-site risk — grep confirmed zero imports across entire src/ tree"
  - "runRepoAdd removed entirely; src/commands/repo.ts only ever imported runRepoScan (confirmed by plan research)"

patterns-established:
  - "Destructive ops (clean, remove, merge) all emit warnExternalFiles before any dry-run short-circuit"

requirements-completed: [DEBT-03, DEBT-04]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 05 Plan 02: Dead Code Removal and SAFE-01 Completeness Summary

**warnExternalFiles added to mergeWorkspace completing SAFE-01 coverage, plus removal of STACKS_DIR, deprecated applyFileOperations, stale JSDoc comments, and the unreachable runRepoAdd TUI function**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T21:50:08Z
- **Completed:** 2026-03-18T21:51:42Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- mergeWorkspace now emits external file warnings via warnExternalFiles — SAFE-01 coverage is complete across clean, remove, and merge operations
- Four dead code items eliminated: STACKS_DIR export, stale JSDoc comments in files.ts, deprecated applyFileOperations function, and the unreachable runRepoAdd function in repo-wizard.ts
- repo-wizard.ts import section trimmed from 8 imports to 5 (removing existsSync, resolve, join, basename, safeText, expandHome, detectRepoType)
- All 146 tests pass, CLI starts cleanly after all removals

## Task Commits

Each task was committed atomically:

1. **Task 1: Add warnExternalFiles to mergeWorkspace** - `e4abe9e` (feat)
2. **Task 2: Remove dead code (STACKS_DIR, stale comments, runRepoAdd, deprecated applyFileOperations)** - `a2a212c` (fix)

**Plan metadata:** `(pending)` (docs: complete plan)

## Files Created/Modified

- `src/lib/workspace-ops.ts` - Added warnExternalFiles block in mergeWorkspace (after dirty check, before conflict pre-check and dry-run short-circuit)
- `src/lib/paths.ts` - Removed STACKS_DIR export
- `src/lib/files.ts` - Cleaned stale "old StackRepo/Stack type" JSDoc comments; removed deprecated applyFileOperations function
- `src/tui/repo-wizard.ts` - Removed runRepoAdd function; cleaned unused imports

## Decisions Made

- warnExternalFiles block inserted after dirty check and before conflict pre-check in mergeWorkspace — matching identical pattern in cleanWorkspace and removeWorkspace
- STACKS_DIR removed with zero call-site risk — grep confirmed zero imports across entire src/ tree
- runRepoAdd removed entirely; src/commands/repo.ts only ever imported runRepoScan (confirmed by plan research)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 tech debt cleanup complete (both 05-01 and 05-02 executed)
- SAFE-01 is fully covered across all three destructive workspace operations
- Codebase is clean for v2 work — no dead code, no stale comments, no deprecated functions

---
*Phase: 05-tech-debt-cleanup*
*Completed: 2026-03-18*
