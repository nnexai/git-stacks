---
phase: 15-integration-tests-and-screen-polish
plan: 02
subsystem: testing
tags: [solidjs, opentui, tui, dashboard, integration-tests, config-isolation]

# Dependency graph
requires:
  - phase: 15-01
    provides: Wave 0 test stubs, tiered help bar, relative age display
provides:
  - Tab switching integration test with help bar and age assertions
  - Action menu dispatch integration test with D-18 side-effect assertion
  - Config module mock pattern for cross-file test isolation (discovered)
affects: [15-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config module mock: mock.module('../../../src/lib/config') with inline fixtures — resilient to module cache ordering"
    - "Renderer destroy in afterEach: prevents keyboard event leakage between testRender instances"
    - "wsRemoved flag: tracks state across beforeEach/test for D-18 side-effect assertion"

key-files:
  created: []
  modified:
    - tests/tui/dashboard/integ-tab-switching.test.tsx
    - tests/tui/dashboard/integ-action-menu.test.tsx

key-decisions:
  - "Config module must be mocked (not just env var set) for cross-file test isolation — integ-sync-progress.test.tsx established this pattern first, and our tests follow it"
  - "renderer.destroy() in afterEach required — without it, keyboard events from previous tests leak into subsequent testRender instances (useKeyboard is global broadcast)"
  - "wsRemoved flag approach: tracks whether removeWorkspace has been called, allowing the config mock's listWorkspaces to return [] after removal without coupling to filesystem"
  - "D-18 side-effect: removeWorkspace mock deletes actual YAML file from configDir AND sets wsRemoved flag — existsSync assertion on physical file proves real deletion"

patterns-established:
  - "Integration test cross-file isolation: mock config module with inline fixtures, not just env var override"
  - "Renderer lifecycle: always capture renderer ref from testRender, destroy in afterEach"
  - "beforeEach re-seed: reset wsRemoved flag and re-write YAML fixture before each test"

requirements-completed: [T-05, UI-01, UI-02]

# Metrics
duration: 11min
completed: 2026-03-21
---

# Phase 15 Plan 02: Integration Tests Part 1 Summary

**Tab switching (1/2/3 keys + help bar + relative age) and action menu dispatch (open/remove-confirm/escape) integration tests with config module mock for cross-file isolation**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-03-21T11:59:50Z
- **Completed:** 2026-03-21T12:10:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Tab switching integration test: 5 tests covering workspace list display, templates tab, repos tab, help bar at 80 columns (verifies 1/2/3 Tabs tier without Navigate), and relative age display (65d not ISO date)
- Action menu integration test: 3 tests covering Enter opens action menu, Remove dispatches through confirm dialog (D-18 YAML deletion verified via existsSync), and escape returns to list
- Discovered and solved cross-file module cache contamination: config module must be mocked with inline fixtures (not just env var) to survive `bun test tests/` full-suite runs
- Added `renderer.destroy()` in `afterEach` to prevent keyboard event leakage between `testRender` instances

## Task Commits

1. **Task 1: Tab switching integration test** - `53cfcd2` (test)
2. **Task 2: Action menu integration test** - `3b90bad` (test)
3. **Task 1 update: Config mock for cross-file isolation** - `8c8b328` (test)

## Files Created/Modified

- `tests/tui/dashboard/integ-tab-switching.test.tsx` — 5 passing tests: workspace display, Templates tab, Repos tab, help bar 80-col tiering, relative age format
- `tests/tui/dashboard/integ-action-menu.test.tsx` — 3 passing tests: action menu open, Remove confirm with YAML deletion (D-18), escape to list

## Decisions Made

- Config module must be mocked (not just `GIT_STACKS_CONFIG_DIR`) for cross-file test isolation — discovered when running `bun test tests/tui/dashboard/` and seeing `sync-ws` from integ-sync-progress's config mock overriding our filesystem-based approach
- `renderer.destroy()` in afterEach is required — `useKeyboard` in OpenTUI is a global broadcast; without destroying old renderers, `pressKey("r")` in the action menu test triggered the previous App instance's refresh handler
- wsRemoved flag pattern: `beforeEach` resets flag, `removeWorkspace` mock sets it, `listWorkspaces` mock checks it — allows the confirm dialog test to verify both UI flow and filesystem side-effect
- D-18 side-effect assertion uses `existsSync` on actual file path (seeded in beforeEach, deleted by mock) — proves real deletion, not just mock call

## Deviations from Plan

**Auto-fixed Issues**

**1. [Rule 1 - Bug] Config module mock required for cross-file isolation**
- **Found during:** Task 1 verification (full suite run)
- **Issue:** Setting `process.env.GIT_STACKS_CONFIG_DIR` is insufficient when another test file mocks the entire `config` module — the last mock.module call wins globally in Bun's test process
- **Fix:** Added `mock.module("../../../src/lib/config", ...)` with inline fixtures to both test files, mirroring the pattern established by integ-sync-progress.test.tsx
- **Files modified:** integ-tab-switching.test.tsx, integ-action-menu.test.tsx
- **Commit:** 8c8b328

**2. [Rule 1 - Bug] Renderer keyboard event leakage**
- **Found during:** Task 2 verification (multi-file run)
- **Issue:** Previous testRender instance keyboard handlers remained active, causing `pressKey("r")` to trigger Refresh action in old App instances
- **Fix:** Added `let activeRenderer` tracking with `afterEach(() => renderer.destroy())` pattern
- **Files modified:** integ-tab-switching.test.tsx, integ-action-menu.test.tsx
- **Commit:** 8c8b328, 3b90bad

## Known Stubs

None — all tests are fully implemented and passing.

## Self-Check: PASSED

All files confirmed present. All task commits confirmed in git log.

---
*Phase: 15-integration-tests-and-screen-polish*
*Completed: 2026-03-21*
