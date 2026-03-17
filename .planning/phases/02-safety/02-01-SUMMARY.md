---
phase: 02-safety
plan: 01
subsystem: safety
tags: [dry-run, file-ops, workspace-ops, tdd]

# Dependency graph
requires:
  - phase: 01.1-file-and-folder-copy-symlink-support
    provides: files.ts with applyFileOpsForRepo, applyFileOpsForWorkspace, mergeFiles, processFileList
  - phase: 01-foundation
    provides: workspace-ops.ts with removeWorkspace, cleanWorkspace, mergeWorkspace, renameWorkspace
provides:
  - warnExternalFiles() export in files.ts — detects external path entries via pure path math
  - dryRun option on all four ops functions (remove, clean, merge, rename)
  - [dry-run] prefixed action descriptions via onProgress callback
  - External file warnings emitted by removeWorkspace and cleanWorkspace in both dry-run and real runs
affects:
  - 02-safety plan 02 (command layer --dry-run flag will call these updated ops functions)
  - Any future plan touching workspace lifecycle operations

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD RED-GREEN for each feature: failing test commit, then implementation commit
    - dryRun short-circuit placed AFTER external warnings but BEFORE hooks
    - Pure path math for external detection — no filesystem existence checks (Pitfall 4 avoidance)
    - Opts object pattern with defaults for backward-compatible signature evolution

key-files:
  created: []
  modified:
    - src/lib/files.ts
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - tests/lib/files.test.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "warnExternalFiles checks if the entry path itself (after expandHome) is absolute and outside wsDir — not the flattened destination. Absolute entries in files.symlink/copy reference external sources which need user awareness on cleanup."
  - "dryRun short-circuit placed after external warnings so both dry-run and real runs show external file warnings, but before hooks to avoid any side effects"
  - "renameWorkspace opts param defaults to {} for backward compatibility — existing call sites pass {} explicitly, new callers can pass { dryRun: true }"
  - "Stacks map deduplicated at workspace-instance level to avoid emitting duplicate warnings when multiple stack entries all include the same workspace.files entries"

patterns-established:
  - "External file detection: pure path math using expandHome + isAbsolute, comparing against join(tasksDir, workspace.name)"
  - "Dry-run pattern: emit external warnings, check dryRun flag, emit [dry-run] action lines, emit completion message, return { ok: true }"
  - "Ops signature evolution: opts object with optional fields, default = {} for backward compatibility"

requirements-completed: [SAFE-01, FILES-16, FILES-17]

# Metrics
duration: 5min
completed: 2026-03-18
---

# Phase 02 Plan 01: Dry-Run and External File Warning Support Summary

**warnExternalFiles() in files.ts plus dryRun option on all four ops functions, with external file warnings emitted in both dry-run and real removal paths**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T19:03:03Z
- **Completed:** 2026-03-18T19:08:00Z
- **Tasks:** 2 (both TDD with RED + GREEN commits)
- **Files modified:** 5

## Accomplishments
- Implemented `warnExternalFiles(workspace, stacks, wsInstanceRoot, tasksDir): string[]` in files.ts — detects absolute path entries pointing outside the workspace task directory
- Added `dryRun?: boolean` to cleanWorkspace, removeWorkspace, mergeWorkspace, and renameWorkspace opts
- External file warnings now emitted by removeWorkspace and cleanWorkspace in BOTH real and dry-run runs
- All dry-run output uses `[dry-run]` prefix on action lines and ends with "Dry run complete. No changes made."
- Updated workspace.ts call site for renameWorkspace's new opts parameter

## Task Commits

Each task was committed atomically with TDD RED then GREEN commits:

1. **Task 1 RED: Failing tests for warnExternalFiles** - `36fc1bf` (test)
2. **Task 1 GREEN: warnExternalFiles implementation** - `7936780` (feat)
3. **Task 2 RED: Failing dry-run tests for workspace ops** - `2ed696c` (test)
4. **Task 2 GREEN: dryRun implementation + workspace.ts call site fix** - `5b294db` (feat)

_Note: TDD tasks have RED commit (failing tests) then GREEN commit (implementation)_

## Files Created/Modified
- `src/lib/files.ts` - Added warnExternalFiles() export (pure path math, no fs checks)
- `src/lib/workspace-ops.ts` - dryRun option on all four ops, warnExternalFiles calls in remove/clean
- `src/commands/workspace.ts` - Updated renameWorkspace call site to pass explicit opts={}
- `tests/lib/files.test.ts` - Added 6-case warnExternalFiles describe block (FILES-16 tests)
- `tests/lib/workspace-ops.test.ts` - Added 7-case dry-run describe block (SAFE-01 + FILES-17 tests)

## Decisions Made
- warnExternalFiles checks whether the entry path itself (after expandHome) is absolute and outside wsDir — not the flattened destination. This is because absolute paths in files.symlink/copy reference external resources the user should be aware of during cleanup.
- Dry-run short-circuit placed after external warnings but before hooks, so warnings appear in both code paths without any hook side effects.
- renameWorkspace signature changed to `(oldName, newName, opts = {}, onProgress?)` with defaulted opts for backward compatibility. Updated workspace.ts call site explicitly passes `{}`.
- Workspace-instance level entries deduplicated across stacks to avoid duplicate warnings when multiple stacks all inherit the same workspace.files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] workspace.ts renameWorkspace call site needed updating**
- **Found during:** Task 2 (dryRun implementation)
- **Issue:** renameWorkspace signature changed from `(oldName, newName, onProgress?)` to `(oldName, newName, opts, onProgress?)`. The call site in workspace.ts passed a callback as third arg, which would be treated as `opts`.
- **Fix:** Updated workspace.ts to pass explicit `{}` as opts before the callback. Plan noted this would need fixing but placed it in Plan 02. Fixed inline to avoid TypeScript errors and broken intermediate state.
- **Files modified:** src/commands/workspace.ts
- **Verification:** `bun test tests/` passes with no TypeScript errors
- **Committed in:** 5b294db (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug, broken call site)
**Impact on plan:** Necessary for correctness — the call site would have broken with the signature change. No scope creep.

## Issues Encountered
- Initial warnExternalFiles implementation checked flattened destination paths (basename inside wsDir) but tests expected warnings for absolute entry paths. Debugging showed the function should check whether the entry itself is an absolute path outside wsDir, not the normalized destination. Fixed in the GREEN commit before committing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four ops functions now have dryRun support, ready for Plan 02 to add `--dry-run` CLI flags
- warnExternalFiles is exported and tested, ready for use in any future removal-adjacent flows
- No blockers

## Self-Check: PASSED

All required files exist and all task commits verified.

---
*Phase: 02-safety*
*Completed: 2026-03-18*
