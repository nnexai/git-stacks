---
phase: 25-dedicated-lifecycle-phases
plan: 01
subsystem: lifecycle
tags: [zod, workspace-ops, hooks, typescript]

# Dependency graph
requires:
  - phase: 24.1-test-mock-hygiene
    provides: clean test mock infrastructure; @/tui/utils wrapper pattern established
provides:
  - Extended Zod schemas with post_close, pre_clean, post_clean, pre_merge, post_remove hook fields
  - buildBaseEnv helper with WS_TRIGGERED_BY env variable injection
  - _executeClose inner function as building block for cleanWorkspace and removeWorkspace cascade
  - closeWorkspace public guard delegating to _executeClose
  - post_close hooks fire after runIntegrationCleanup
affects:
  - 25-02 (cleanWorkspace will call _executeClose in its cascade)
  - 25-03 (removeWorkspace will call _executeClose in its cascade)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_executeClose inner function pattern: public guard (validate/read) + inner function (execute); inner function receives pre-loaded Workspace + GlobalConfig as parameters"
    - "buildBaseEnv helper: single place to construct all WS_* environment variables including WS_TRIGGERED_BY"
    - "WS_TRIGGERED_BY env var: injected into all hook environments to indicate which lifecycle command triggered the hook"

key-files:
  created: []
  modified:
    - src/lib/config.ts
    - src/lib/workspace-ops.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "buildBaseEnv exported (not private) so plans 02 and 03 can reuse it in cleanWorkspace and removeWorkspace cascades"
  - "_executeClose is unexported (private to module) — it is the implementation detail, not a public contract"
  - "post_close fires after runIntegrationCleanup (integration teardown happens before post_close, matching pre_close before integration teardown)"
  - "restore real @/lib/lifecycle in workspace-ops.test.ts via cache-busted import + mock.module to prevent parallel suite contamination from consumer test files"

patterns-established:
  - "Public guard + inner execute pattern: closeWorkspace validates/reads then delegates to _executeClose; allows cascade calls from clean/remove without re-reading workspace"

requirements-completed: [LC-01, LC-02, LC-03, LC-08]

# Metrics
duration: 17min
completed: 2026-03-22
---

# Phase 25 Plan 01: Lifecycle Schema Foundation Summary

**Extended Zod schemas with 5 new hook fields (post_close, pre_clean, post_clean, pre_merge, post_remove) and split closeWorkspace into a public guard + _executeClose inner function with buildBaseEnv helper and WS_TRIGGERED_BY injection**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-22T17:49:42Z
- **Completed:** 2026-03-22T18:06:22Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added 5 new hook fields to WorkspaceHooksSchema, TemplateSchema.hooks, and WorkspaceRepoHooksSchema (pre_clean) — fully backward compatible
- Introduced `buildBaseEnv` helper that constructs all WS_* environment variables including the new `WS_TRIGGERED_BY` field
- Refactored `closeWorkspace` into a thin public guard + `_executeClose` inner function that runs: pre_close -> integration cleanup -> post_close
- Added 11 new schema tests (lifecycle hook schemas describe block) + 3 closeWorkspace behavior tests (post_close, ordering, WS_TRIGGERED_BY)
- Fixed a parallel test suite contamination issue: restored real `@/lib/lifecycle` in workspace-ops.test.ts to prevent mock.module contamination from consumer test files running in parallel

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Zod schemas with new lifecycle hook fields** — `7f849a4` (feat + test RED+GREEN)
2. **Task 2: Refactor closeWorkspace with buildBaseEnv, _executeClose, post_close, WS_TRIGGERED_BY** — `77747db` (feat)

## Files Created/Modified

- `src/lib/config.ts` — WorkspaceHooksSchema gets post_close, pre_clean, post_clean, pre_merge, post_remove; WorkspaceRepoHooksSchema gets pre_clean; TemplateSchema.hooks gets all 5 new fields
- `src/lib/workspace-ops.ts` — Added GlobalConfig import, buildBaseEnv helper, _executeClose inner function; refactored closeWorkspace to delegate to _executeClose
- `tests/lib/workspace-ops.test.ts` — Added lifecycle hook schemas describe block (11 tests); added 3 closeWorkspace behavior tests; added real lifecycle re-mock to prevent parallel contamination; fixed closeWorkspace type annotation

## Decisions Made

- `buildBaseEnv` is exported so plans 02 and 03 (cleanWorkspace, removeWorkspace cascades) can reuse it
- `_executeClose` is NOT exported — it's an implementation detail, the public API is only `closeWorkspace`
- `post_close` fires after `runIntegrationCleanup` (integration teardown is considered "close" infrastructure, user hooks wrap it)
- The test file restores `@/lib/lifecycle` to real implementation using cache-busted import + `mock.module()` to prevent parallel suite contamination

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed parallel test suite contamination: lifecycle mocked by other test files**
- **Found during:** Task 2 (closeWorkspace behavior tests)
- **Issue:** `@/lib/lifecycle` is mocked in multiple other test files (integration-commands.test.ts, etc.). When the full test suite runs, the mock pollutes the workspace-ops test's hook execution, causing the hook-ordering test to fail (ENOENT: log file never created because hooks never ran)
- **Fix:** Added `const realLifecycle = await import("@/lib/lifecycle?ws-ops-lifecycle-real")` + `mock.module("@/lib/lifecycle", () => realLifecycle)` at the top of workspace-ops.test.ts to ensure real hooks execute
- **Files modified:** tests/lib/workspace-ops.test.ts
- **Verification:** `bun test tests/` 589 pass, 0 fail
- **Committed in:** 77747db (Task 2 commit)

**2. [Rule 1 - Bug] Fixed test type annotation: closeWorkspace opts type had dryRun instead of captured**
- **Found during:** Task 2 (typecheck)
- **Issue:** The existing closeWorkspace type in the dynamic import declaration had `opts: { dryRun?: boolean }` but the actual implementation uses `opts: { captured?: boolean }`
- **Fix:** Updated the type annotation to `opts: { captured?: boolean }`
- **Files modified:** tests/lib/workspace-ops.test.ts
- **Verification:** `bun run typecheck` exits 0
- **Committed in:** 77747db (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed items above.

## Next Phase Readiness

- `_executeClose` inner function is ready for plans 02 and 03 to call as part of cleanWorkspace and removeWorkspace cascades
- `buildBaseEnv` helper available for all cascade functions to build standardized WS_* env vars with WS_TRIGGERED_BY
- All 5 new hook fields parsed correctly in all 3 schemas
- 589 tests pass, 0 failures, typecheck clean

---
*Phase: 25-dedicated-lifecycle-phases*
*Completed: 2026-03-22*
