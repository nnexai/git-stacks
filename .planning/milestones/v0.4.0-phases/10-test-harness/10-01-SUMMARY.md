---
phase: 10-test-harness
plan: 01
subsystem: testing
tags: [paths, env-override, config-isolation, ActionMenu, TUI, solid-js, arrow-keys]

# Dependency graph
requires: []
provides:
  - GIT_STACKS_CONFIG_DIR env var overrides WS_CONFIG_DIR and all derived constants (test isolation)
  - ActionMenu arrow-key cursor navigation with visual highlight (> prefix, cyan color)
  - ActionMenu enter key dispatches action at cursor position
  - paths unit test verifying env override via subprocess spawning pattern
affects:
  - 10-02-PLAN (component tests rely on both changes from this plan)
  - all future test files that need config isolation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "subprocess spawning for module-cache-safe env-var tests (spawnSync bun --eval)"
    - "GIT_STACKS_CONFIG_DIR env override pattern for config dir isolation in tests"
    - "SolidJS createSignal for arrow-key cursor state in TUI components"

key-files:
  created:
    - tests/lib/paths.test.ts
  modified:
    - src/lib/paths.ts
    - src/tui/dashboard/ActionMenu.tsx

key-decisions:
  - "Subprocess spawning (spawnSync bun --eval) chosen over top-level await import for paths tests — Bun shares module cache across test files in the same run, so dynamic import at file-top-level does not guarantee fresh evaluation when other files already imported paths.ts statically"
  - "fullActions array computed inside component (not module scope) so Run entry is conditional on props.onRun being present"
  - "Letter-key shortcuts preserved alongside arrow-key navigation for backward compatibility"

patterns-established:
  - "Test isolation pattern: use spawnSync with GIT_STACKS_CONFIG_DIR set in env to verify env override logic without module cache interference"
  - "TUI cursor pattern: createSignal(0) + up/down handlers clamped with Math.min/Math.max"

requirements-completed:
  - T-06
  - T-04

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 10 Plan 01: Test Infrastructure Foundations Summary

**GIT_STACKS_CONFIG_DIR env override in paths.ts and SolidJS arrow-key cursor navigation in ActionMenu — the two production code prerequisites for Plan 02 component tests**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-21T06:06:29Z
- **Completed:** 2026-03-21T06:08:40Z
- **Tasks:** 2
- **Files modified:** 3 (1 created test file, 2 modified source files)

## Accomplishments

- Added `GIT_STACKS_CONFIG_DIR` env override to `paths.ts` so tests can redirect the entire config directory without touching `~/.config/git-stacks`
- Wrote 7-test suite in `tests/lib/paths.test.ts` using subprocess spawning to verify env override is effective at module load time regardless of Bun's module cache state
- Enhanced `ActionMenu.tsx` with `createSignal`-based cursor state, up/down arrow key handlers, enter key dispatch, and visual `>` prefix + cyan highlight for the selected item
- Full test suite (230 tests) passes after both changes

## Task Commits

1. **Task 1: Add GIT_STACKS_CONFIG_DIR env override to paths.ts** - `ece7a69` (feat)
2. **Task 1 fix: paths test subprocess isolation** - `0e3101f` (fix) — auto-fixed module cache bug
3. **Task 2: Add arrow-key cursor navigation to ActionMenu** - `7f6f2c9` (feat)

## Files Created/Modified

- `src/lib/paths.ts` - Added `process.env.GIT_STACKS_CONFIG_DIR ?? join(HOME, ".config", "git-stacks")` override
- `tests/lib/paths.test.ts` - 7 tests: one source-content check + 6 subprocess-based path derivation checks
- `src/tui/dashboard/ActionMenu.tsx` - Arrow-key cursor nav, `createSignal`, `fullActions` array with conditional Run entry

## Decisions Made

- **Subprocess pattern for paths test:** Bun runs all test files in a shared module cache when `bun test tests/` is called. A top-level `await import` in our test file returns the already-cached module (evaluated before `GIT_STACKS_CONFIG_DIR` was set) because `config.test.ts` statically imports `paths.ts`. Solution: `spawnSync("bun", ["--eval", script], { env: { GIT_STACKS_CONFIG_DIR: tmp } })` creates a completely fresh process with only our env var set.
- **fullActions computed inside component:** Run action is conditional on `props.onRun` existing. Computed inline rather than at module scope so reactive props are evaluated at render time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Paths test failed when run as part of the full suite due to Bun module cache**
- **Found during:** Task 1 verification (running `bun test tests/`)
- **Issue:** `config.test.ts` has a static `import { WORKSPACES_DIR } from "../../src/lib/paths"` at line 13. When bun runs all test files, this import evaluates `paths.ts` before our test file sets `GIT_STACKS_CONFIG_DIR`. Our subsequent `await import(...)` returns the cached (non-overridden) values.
- **Fix:** Rewrote test to use `spawnSync("bun", ["--eval", ...], { env: { GIT_STACKS_CONFIG_DIR: tmp } })` — each assertion spawns a fresh Bun subprocess that evaluates `paths.ts` with only our env override set.
- **Files modified:** `tests/lib/paths.test.ts`
- **Verification:** `bun test tests/` — 200 pass, 0 fail (230 total with todos)
- **Committed in:** `0e3101f`

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary fix — the original test pattern is correct when a file runs in isolation but breaks in full-suite runs due to shared module cache. Subprocess approach is more robust and works in both contexts.

## Issues Encountered

Bun module caching across test files in a single `bun test` run. When multiple test files are evaluated in the same worker pool, ES module cache is shared. Tests that set env vars before import only work reliably when that module was not previously imported by any other test file in the run. Solved by spawning fresh subprocesses.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 (component tests) can now be written: `GIT_STACKS_CONFIG_DIR` provides config isolation, and `ActionMenu` has cursor state to assert against
- The subprocess testing pattern from `paths.test.ts` is available as a reference for any future test that needs true module-load-time env var isolation

## Self-Check: PASSED

- FOUND: src/lib/paths.ts
- FOUND: tests/lib/paths.test.ts
- FOUND: src/tui/dashboard/ActionMenu.tsx
- FOUND: .planning/phases/10-test-harness/10-01-SUMMARY.md
- FOUND: ece7a69 (feat: paths.ts env override + test)
- FOUND: 0e3101f (fix: paths test subprocess isolation)
- FOUND: 7f6f2c9 (feat: ActionMenu arrow-key navigation)
