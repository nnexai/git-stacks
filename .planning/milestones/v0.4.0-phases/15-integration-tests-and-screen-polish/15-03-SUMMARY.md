---
phase: 15-integration-tests-and-screen-polish
plan: 03
subsystem: testing
tags: [solidjs, opentui, tui, dashboard, integration-tests, bun-test]

# Dependency graph
requires:
  - phase: 15-01-screen-polish-and-test-stubs
    provides: Wave 0 test stubs (integ-wizard.test.tsx, integ-sync-progress.test.tsx) and App.tsx polish
  - phase: 13-wizard-create-workspace
    provides: WizardView.tsx with step navigation and deferred focus pattern
  - phase: 12-workspace-sync
    provides: SyncProgressView.tsx and syncWorkspace onProgress callback
provides:
  - integ-wizard.test.tsx with 3 passing integration tests for wizard entry, cancel, back-navigation
  - integ-sync-progress.test.tsx with 3 passing integration tests for sync action menu, confirm, progress flow
  - Module-level config mock pattern for tests resilient against Bun module cache in full suite runs
affects: [15-verifier, future-testing-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config mock pattern: mock.module for ../../../src/lib/config with inline fixtures to bypass module cache"
    - "Deferred focus wait: await new Promise(r => setTimeout(r, 0)) between wizard step transitions"
    - "Workspace-ops full mock: include getWorkspaceStatus, editWorkspaceYaml, mergeEnv, writeEnvFiles"
    - "syncWorkspace mock with progress callback: calls onProgress with fetching->rebasing->synced updates"

key-files:
  created: []
  modified:
    - tests/tui/dashboard/integ-wizard.test.tsx
    - tests/tui/dashboard/integ-sync-progress.test.tsx

key-decisions:
  - "integ-sync-progress mocks ../../../src/lib/config wholesale to provide inline workspace fixture — GIT_STACKS_CONFIG_DIR alone is insufficient when paths.ts is already cached from an earlier test file in same run (Pitfall 1 from RESEARCH.md)"
  - "wizard test relies on GIT_STACKS_CONFIG_DIR + filesystem fixture for templates — passes when run in full suite because Templates tab data is found regardless of which configDir is active"
  - "syncWorkspace mock signature is (name, opts, onProgress?) matching actual workspace-ops.ts 3-arg signature — plan's example had 4 args which would not intercept correctly"
  - "workspace-ops mock must include all exports (getWorkspaceStatus, editWorkspaceYaml, mergeEnv, writeEnvFiles, etc.) or Bun throws 'Export not found' on first use"

patterns-established:
  - "For tests requiring specific workspace data in full suite: mock ../../../src/lib/config with inline fixture objects (listWorkspaces, readWorkspace) to bypass module cache"
  - "wizard test pattern: pressKey('2') -> pressEnter() -> pressKey('w') -> assert 'Workspace name'"
  - "sync test pattern: pressEnter() -> pressKey('s') -> pressKey('y') -> assert sync content visible"

requirements-completed: [T-05, UI-03]

# Metrics
duration: 10min
completed: 2026-03-21
---

# Phase 15 Plan 03: Wizard and Sync Progress Integration Tests Summary

**Two integration test files covering wizard entry/cancel/back-nav and sync action menu/confirm/progress flows, using config module mocking for full-suite resilience**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-21T11:56:23Z
- **Completed:** 2026-03-21T12:06:00Z
- **Tasks:** 2 (Task 1, Task 2)
- **Files modified:** 2

## Accomplishments

- `integ-wizard.test.tsx` — 3 tests: wizard entry from TemplateActionMenu (asserts "Workspace name" step 1 label), escape at step 1 cancels and returns to Templates list, escape at step 2 goes back to step 1 with deferred focus wait
- `integ-sync-progress.test.tsx` — 3 tests: action menu shows Sync option, pressing "s" opens confirm dialog showing workspace name and [y], confirming sync shows sync-related content in frame
- Config module mock pattern established for full-suite resilience against Bun module cache (Pitfall 1)
- syncWorkspace mock correctly calls onProgress callback with per-repo status updates

## Task Commits

1. **Task 1: Wizard entry, back-navigation, and cancel integration test** - `631e0c7` (test)
2. **Task 2: Sync progress flow integration test** - `ed52426` (test)
3. **Deviation fix: sync-progress module cache resilience** - `4f3f31d` (test)

## Files Created/Modified

- `tests/tui/dashboard/integ-wizard.test.tsx` — Wizard integration tests: entry from TemplateActionMenu, escape-cancel at step 1, back-nav at step 2
- `tests/tui/dashboard/integ-sync-progress.test.tsx` — Sync integration tests: action menu Sync option, confirm dialog, sync progress/completion flow

## Decisions Made

- `integ-sync-progress` mocks `../../../src/lib/config` wholesale rather than relying solely on `GIT_STACKS_CONFIG_DIR`: when tests run in full suite, `paths.ts` is already loaded with a different configDir from an earlier file, making `listWorkspaces()` return empty. The config mock bypasses this by returning inline fixture objects.
- `syncWorkspace` mock uses 3-arg signature `(name, opts, onProgress?)` matching the actual function - the plan's example showed 4 args which would not have intercepted correctly.
- All workspace-ops exports must be included in mock or Bun throws "Export named X not found" at runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] syncWorkspace mock used wrong arity**
- **Found during:** Task 2 (sync progress flow test)
- **Issue:** Plan example showed syncWorkspace mock with 4 parameters `(_ws, _cfg, _strat, onProgress)` but actual `workspace-ops.ts` signature is `(name: string, opts, onProgress?)` (3 params)
- **Fix:** Corrected mock to 3-param signature matching the actual function
- **Files modified:** tests/tui/dashboard/integ-sync-progress.test.tsx
- **Verification:** bun test passes, onProgress callback fires with progress updates
- **Committed in:** ed52426

**2. [Rule 1 - Bug] module cache causes "No workspaces found" in full suite**
- **Found during:** Task 2 verification (running full dashboard test suite)
- **Issue:** When `integ-sync-progress.test.tsx` runs after other test files in the same Bun process, `paths.ts` is already cached with a different configDir, so `listWorkspaces()` returns empty and workspace list shows "No workspaces found"
- **Fix:** Added `mock.module("../../../src/lib/config", ...)` with inline fixture objects to bypass filesystem reads entirely for this test
- **Files modified:** tests/tui/dashboard/integ-sync-progress.test.tsx
- **Verification:** bun test tests/tui/dashboard/ shows 57 pass (up from 54) with 0 sync-progress failures
- **Committed in:** 4f3f31d

---

**Total deviations:** 2 auto-fixed (1 wrong mock arity, 1 module cache resilience)
**Impact on plan:** Both fixes necessary for correctness. The config mock approach is an improvement over the plan's GIT_STACKS_CONFIG_DIR-only approach.

## Issues Encountered

- `mock.module` for `workspace-ops` must include ALL exported symbols or Bun throws "Export named X not found" at first use — discovered at runtime, fixed by auditing workspace-ops.ts exports
- Plan 02 tests (integ-tab-switching, integ-action-menu) have 7 pre-existing failures from their parallel implementation — not related to Plan 03 work

## Known Stubs

None — all tests make real assertions against the rendered frame.

## Next Phase Readiness

- All 6 Plan 03 integration tests pass (3 wizard + 3 sync-progress)
- Pattern for module-cache-resilient config mocking is now established for future integration tests
- Plans 15-02 and 15-03 combined deliver T-05 coverage for all four D-16 flows

## Self-Check: PASSED

All 3 task files confirmed present. All 3 commits (631e0c7, ed52426, 4f3f31d) confirmed in git log.
