---
phase: 75-di-seams-structured-logging
plan: 01
subsystem: testing
tags: [di-seams, mutable-exec, lifecycle, git, tdd]

# Dependency graph
requires:
  - phase: 74-template-labels
    provides: stable workspace-ops facade that stays unchanged

provides:
  - Mutable _exec.spawn seam in workspace-lifecycle.ts routing all hook subprocess launches
  - Mutable _exec object in workspace-git.ts wrapping all git.ts helper calls
  - Seam-focused unit tests for both modules without real subprocesses

affects: [76-plugin-contracts, 78-operation-runner, any phase testing hook execution or git sync/push/pull]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-local _exec seam: export const _exec = { fn } initialized from imported helpers; tests replace properties directly"
    - "Lifecycle spawn seam: workspace-lifecycle._exec delegates to lifecycle._exec.spawn, preserving SpawnHandle contract"
    - "runWorkspaceHooks/runWorkspaceHooksCaptured: module-local clones of lifecycle helpers routing through _exec.spawn"

key-files:
  created:
    - tests/lib/workspace-lifecycle.test.ts
  modified:
    - src/lib/workspace-lifecycle.ts
    - src/lib/workspace-git.ts
    - tests/lib/workspace-git.test.ts

key-decisions:
  - "workspace-lifecycle._exec.spawn delegates to lifecycleExec.spawn by default — seam reuses lifecycle's SpawnHandle contract exactly"
  - "workspace-git._exec initialized with all 12 git.ts helpers so any helper call is interceptable in tests"
  - "workspace-ops.ts facade left unchanged — seams are entirely within the two engine modules"

patterns-established:
  - "Pattern: Module-local _exec initialized from direct imports — object property mutation is stable in ESM unlike named export re-binding"
  - "Pattern: TDD RED commit with _exec undefined error confirms seam missing before implementation"

requirements-completed:
  - OBSV-01
  - OBSV-02

# Metrics
duration: 5min
completed: 2026-04-05
---

# Phase 75 Plan 01: DI Seams Summary

**Module-local mutable _exec seams added to workspace-lifecycle.ts and workspace-git.ts, with TDD coverage proving hook spawn and git helper calls are interceptable without real subprocesses**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05T21:38:25Z
- **Completed:** 2026-04-05T21:43:30Z
- **Tasks:** 2 (TDD: RED + GREEN per task)
- **Files modified:** 4

## Accomplishments

- `workspace-lifecycle.ts` exports `_exec = { spawn }` initialized from `lifecycle._exec.spawn`, with `runWorkspaceHooks` and `runWorkspaceHooksCaptured` local helpers routing all hook execution through the seam
- `workspace-git.ts` exports `_exec` wrapping all 12 git.ts helper functions; all production calls updated to `_exec.*` references
- Two seam test suites prove subprocess interception at module boundary without real git or shell invocations
- `workspace-ops.ts` facade unchanged throughout

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing seam tests** - `910e4779` (test)
2. **Task 2 GREEN: Implement seams** - `de493bc5` (feat)

## Files Created/Modified

- `tests/lib/workspace-lifecycle.test.ts` — New: seam tests for `closeWorkspace` spawn args (inherit/pipe mode) and `onProgress` forwarding
- `tests/lib/workspace-git.test.ts` — Extended: `_exec seam` describe block asserting `_exec.pushBranch`, `_exec.fetchOrigin`, `_exec.rebaseBranch` are used by production code
- `src/lib/workspace-lifecycle.ts` — Added `_exec` export, `runWorkspaceHooks`, `runWorkspaceHooksCaptured`; replaced all `runHooks`/`runHooksCaptured` calls
- `src/lib/workspace-git.ts` — Replaced placeholder `_exec = {}` with full 12-property seam; updated all helper call sites to `_exec.*`

## Decisions Made

- Kept `workspace-lifecycle._exec` typed as `{ spawn: typeof lifecycleExec.spawn }` to match the SpawnHandle contract exactly — prevents silent semantic drift (T-75-01 mitigation)
- Initialized `workspace-git._exec` from direct imports rather than lazy getters — property mutation works immediately without closure complexity
- No changes to `workspace-ops.ts`, `lifecycle.ts`, or `git.ts` — seams added at the engine module boundary only

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OBSV-01 and OBSV-02 satisfied at module level: both `workspace-lifecycle` and `workspace-git` have real injectable seams
- Phase 76 (plugin contracts) can mock workspace-git operations via `_exec` without needing full git.ts mocks
- Phase 78 (operation runner with rollback) can intercept lifecycle hook execution via `workspace-lifecycle._exec.spawn`

## Self-Check: PASSED

Files verified:
- `tests/lib/workspace-lifecycle.test.ts` — FOUND
- `tests/lib/workspace-git.test.ts` — FOUND (extended)
- `src/lib/workspace-lifecycle.ts` — FOUND, contains `export const _exec`
- `src/lib/workspace-git.ts` — FOUND, contains `export const _exec`

Commits verified:
- `910e4779` — FOUND (test RED)
- `de493bc5` — FOUND (feat GREEN)

---
*Phase: 75-di-seams-structured-logging*
*Completed: 2026-04-05*
