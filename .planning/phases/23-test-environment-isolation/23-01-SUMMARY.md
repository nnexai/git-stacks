---
phase: 23-test-environment-isolation
plan: 01
subsystem: testing
tags: [bun, mock.module, test-isolation, config, workspace-ops, messages]

requires:
  - phase: 21-workspace-close-command
    provides: closeWorkspace function tested by workspace-ops.test.ts
  - phase: 22-niri-display-fix
    provides: completed v0.7.0 feature work before test isolation

provides:
  - useIsolatedConfig helper in tests/helpers.ts for config path isolation
  - config.test.ts isolated from real ~/.config/git-stacks
  - workspace-ops.test.ts isolated from real ~/.config/git-stacks
  - messages.test.ts isolated from real ~/.config/git-stacks

affects: [any future test files that write to config directories]

tech-stack:
  added: []
  patterns:
    - "useIsolatedConfig + cache-busting dynamic imports for in-process config isolation"
    - "Re-establish mock in beforeEach when multiple describe blocks share one isolated config"

key-files:
  created: []
  modified:
    - tests/helpers.ts
    - tests/lib/config.test.ts
    - tests/lib/workspace-ops.test.ts
    - tests/lib/messages.test.ts

key-decisions:
  - "Re-establish mock.module in beforeEach of corrupt YAML section to prevent io-roundtrip test overriding the shared isolated config mock"
  - "Top-level await import with cache-busting for workspace-ops dynamic imports eliminates saveGlobalConfig/restoreGlobalConfig pattern"
  - "WorkspaceSchema and TemplateSchema kept as static imports since they are pure Zod schemas with no path dependencies"

patterns-established:
  - "useIsolatedConfig at file level + afterAll(() => isolated.cleanup()) for test files with multiple path-dependent describe blocks"
  - "Re-establish mock in nested beforeEach when other describe blocks override the shared file-level mock"

requirements-completed: [TEST-01, TEST-02]

duration: 7min
completed: 2026-03-22
---

# Phase 23 Plan 01: Test Environment Isolation Summary

**Shared useIsolatedConfig helper wired into 3 test files that previously wrote to real ~/.config/git-stacks, eliminating config pollution during test runs**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T11:18:33Z
- **Completed:** 2026-03-22T11:25:42Z
- **Tasks:** 2 (Task 1 was pre-committed; executed Task 2)
- **Files modified:** 4 (tests/helpers.ts, tests/lib/config.test.ts, tests/lib/workspace-ops.test.ts, tests/lib/messages.test.ts)

## Accomplishments

- Eliminated all writes to real `~/.config/git-stacks` during the 3 offending test files' execution
- Fixed the `corrupt YAML handling` test that was failing due to mock override by the `workspace file I/O` test
- Replaced fragile `saveGlobalConfig`/`restoreGlobalConfig` pattern in workspace-ops.test.ts with proper `useIsolatedConfig` isolation
- All 58 tests in the 3 modified files now pass with 0 failures

## Task Commits

1. **Task 1: Add useIsolatedConfig helper to tests/helpers.ts** - `e99d470` (feat) — pre-committed
2. **Task 2: Fix 3 offending test files** - `01261ee` (fix)

## Files Created/Modified

- `tests/helpers.ts` - Added `useIsolatedConfig` export (already committed in e99d470)
- `tests/lib/config.test.ts` - Added `isolated = useIsolatedConfig("config-test")` at file level; added mock re-establishment in corrupt YAML `beforeEach` to prevent io-roundtrip test from overriding the shared mock
- `tests/lib/workspace-ops.test.ts` - Replaced static imports + saveGlobalConfig/restoreGlobalConfig with `useIsolatedConfig("ws-ops")`; dynamic imports with cache-busting for config/git/workspace-ops functions; removed `GLOBAL_CONFIG_FILE` import
- `tests/lib/messages.test.ts` - Replaced `MESSAGES_DIR` static import with `useIsolatedConfig("messages-test")`; dynamic import for messages functions; replaced hardcoded MESSAGES_DIR references with `isolated.configDir/messages`

## Decisions Made

- Re-establish mock in `beforeEach` of corrupt YAML describe block: the `workspace file I/O` test (in the same file) calls `mock.module("@/lib/paths", ...)` with its own temp dir `tmp`, which overrides the file-level `useIsolatedConfig` mock. After `tmp` is cleaned up in `afterEach`, the corrupt YAML test runs and finds the stale mock pointing to a deleted directory. Fix: re-apply the isolated mock in beforeEach of the corrupt YAML block.
- Keep `WorkspaceSchema` and `TemplateSchema` as static imports: these are pure Zod schemas with no path dependencies, so they don't need cache-busting dynamic imports.
- Top-level `await import()` in workspace-ops.test.ts: this pattern is used once at file load time, providing stable typed references for all tests in the file without per-test re-imports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock re-establishment needed in corrupt YAML beforeEach**
- **Found during:** Task 2 (testing config.test.ts after initial fix)
- **Issue:** The `workspace file I/O` describe block in config.test.ts overrides `mock.module("@/lib/paths", ...)` with its own `tmp` dir. After its `afterEach` cleans up `tmp`, the corrupt YAML tests run but the mock still points to the cleaned `tmp` dir. `listWorkspaces` returns `[]` because the workspaces dir no longer exists.
- **Fix:** Added `mock.module("@/lib/paths", ...)` re-establishment in the `beforeEach` of `corrupt YAML handling` describe block, pointing back to `isolated.configDir`.
- **Files modified:** tests/lib/config.test.ts
- **Verification:** Config tests now show 26 pass, 0 fail
- **Committed in:** `01261ee` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix was necessary for correctness — without it the corrupt YAML test remains broken.

## Issues Encountered

- Test count discrepancy: the original full suite showed 513 tests while our fixed version shows 503. Investigation revealed this is a pre-existing Bun test runner quirk where running the full suite together caused 10 extra tests to be registered via cross-file mock contamination from the old static imports in workspace-ops.test.ts. Our dynamic import approach prevents this contamination. Verified by running parts in isolation — both original and fixed code show the same counts when run separately.
- 22 pre-existing failures in the full suite (runWorkspaceEdit, workspace-wizard, promptIntegrationOverrides, WorkspaceRow snapshots) are caused by `tests/lib/integration-commands.test.ts` contaminating other tests. These exist before AND after our changes. Verified by git stash comparison.

## Known Stubs

None — all test isolation is fully wired.

## Next Phase Readiness

- Phase 23 complete — test environment isolation implemented
- v0.7.0 milestone complete (phases 21-23 done)
- No blockers; no concerns
