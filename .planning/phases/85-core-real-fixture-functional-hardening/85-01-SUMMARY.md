---
phase: 85-core-real-fixture-functional-hardening
plan: 01
subsystem: testing
tags: [workspace-lifecycle, real-fixtures, git-worktrees, hooks]

requires:
  - phase: 81-workspace-and-git-operation-e2e-coverage
    provides: workspace command and lifecycle E2E context
provides:
  - Real-fixture source coverage for workspace clean, remove, merge, rename, missing task paths, and hook rollback behavior
  - Shared helper for remote-backed workspace fixtures rooted under workspace_root/tasks
affects: [phase-85, phase-86, workspace-lifecycle-tests]

tech-stack:
  added: []
  patterns:
    - Source-level Bun tests using disposable local git remotes and isolated config homes

key-files:
  created:
    - tests/lib/workspace-ops-real-fixture.test.ts
  modified:
    - tests/helpers.ts
    - src/lib/lifecycle.ts
    - src/lib/workspace-lifecycle.ts

key-decisions:
  - "Use a helper that composes existing Phase 80/81 fixture primitives instead of replacing runCli or helper architecture."
  - "Use /bin/sh for lifecycle hook subprocesses so isolated test environments do not depend on PATH lookup for shell resolution."

patterns-established:
  - "Real workspace lifecycle tests assert filesystem, YAML, branch, worktree registration, and hook probe artifacts."
  - "Reusable workspace fixtures should place task worktrees under workspace_root/tasks/<workspace>/<repo> so rename and cleanup paths match production layout."

requirements-completed: [CORE-01, CORE-03, CORE-05, GATE-03]

duration: 24min
completed: 2026-05-15
---

# Phase 85 Plan 01: Workspace Lifecycle Real-Fixture Coverage Summary

**Real workspace lifecycle source coverage using local remotes, isolated config, durable YAML, git worktrees, and hook probe artifacts**

## Performance

- **Duration:** 24 min
- **Started:** 2026-05-15T04:11:00Z
- **Completed:** 2026-05-15T04:35:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `makeRealWorkspaceFixture`, a narrow helper that composes existing repo/config/workspace primitives for Phase 85 real-fixture tests.
- Added `tests/lib/workspace-ops-real-fixture.test.ts` covering dry-run and forced clean/remove/merge, rename re-registration, missing task paths, hook failure preservation, and close with missing task folders.
- Hardened lifecycle hook spawning to use `/bin/sh`, avoiding PATH-dependent failures under isolated subprocess environments.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reusable real workspace fixture helper only if needed** - `5713834` (test)
2. **Task 2: Cover workspace lifecycle behavior with real fixtures** - `0de4370` (test)

## Files Created/Modified

- `tests/helpers.ts` - Adds `makeRealWorkspaceFixture` for remote-backed workspace fixtures under production-like task paths.
- `tests/lib/workspace-ops-real-fixture.test.ts` - Adds real source lifecycle tests for workspace operations.
- `src/lib/lifecycle.ts` - Uses `/bin/sh` for hook subprocess spawning.
- `src/lib/workspace-lifecycle.ts` - Uses `/bin/sh` for workspace lifecycle hook subprocess spawning.

## Decisions Made

- Reused and composed existing helper patterns instead of adding command-wrapper-only helpers.
- Kept tests source-oriented by importing captured real workspace exports from `tests/helpers.ts`.
- Treated shell path resolution as a correctness issue for isolated hook environments and fixed it inline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hook subprocess shell resolution depended on PATH**
- **Found during:** Task 2 (Cover workspace lifecycle behavior with real fixtures)
- **Issue:** Captured hook tests could fail with `posix_spawn 'sh'` when the subprocess environment did not provide a usable shell lookup path.
- **Fix:** Switched lifecycle hook spawning from `sh` to `/bin/sh` in both generic lifecycle and workspace lifecycle hook runners.
- **Files modified:** `src/lib/lifecycle.ts`, `src/lib/workspace-lifecycle.ts`
- **Verification:** `bun test tests/lib/workspace-ops-real-fixture.test.ts`, `bun run test:unit`, `bun run typecheck`
- **Committed in:** `0de4370`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The fix is directly tied to Phase 85 hook rollback correctness and does not widen scope.

## Issues Encountered

- Initial lifecycle test assertions assumed empty parent task folders would always be removed. The tests were corrected to assert the source-owned contract: worktree removal, YAML deletion or preservation, branch state, and registration state.
- The first helper shape placed task worktrees outside `workspace_root/tasks/<workspace>/<repo>`. It was corrected before commit so rename tests exercise the production path rewrite.

## Verification

- `rg -n "makeRepoWithRemote|makeWorkspaceFixture|realCleanWorkspace|realRemoveWorkspace|realMergeWorkspace|realRenameWorkspace|makeRealWorkspaceFixture" tests/helpers.ts` - PASS
- `bun test tests/lib/workspace-ops-real-fixture.test.ts` - PASS
- `bun run test:unit` - PASS
- `bun run typecheck` - PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 85-02. Shared real workspace fixture setup is available for later Phase 85 tests, and workspace lifecycle coverage now exercises real source modules.

## Self-Check: PASSED

- Found expected files: `tests/helpers.ts`, `tests/lib/workspace-ops-real-fixture.test.ts`, `src/lib/lifecycle.ts`, `src/lib/workspace-lifecycle.ts`
- Found expected commits: `5713834`, `0de4370`
- Stub scan found only false positives from normal empty buffers, arrays, and helper default objects; no goal-blocking stubs were introduced.

---
*Phase: 85-core-real-fixture-functional-hardening*
*Completed: 2026-05-15*
