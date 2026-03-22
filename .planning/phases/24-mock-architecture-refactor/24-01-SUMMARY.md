---
phase: 24-mock-architecture-refactor
plan: 01
subsystem: testing
tags: [injectable-mock, exec-pattern, tmux, cmux, lifecycle, bun-test, unit-tests]

# Dependency graph
requires:
  - phase: 19-niri-shell-wrappers
    provides: "niri.ts _exec pattern that is the model for tmux.ts, cmux.ts, lifecycle.ts"
provides:
  - "Injectable _exec.run in tmux.ts (CmdResult type + all tmux shell calls)"
  - "Injectable _exec.run in cmux.ts (CmdResult type + all cmux shell calls)"
  - "Injectable _exec.spawn in lifecycle.ts (SpawnHandle type + Bun.spawn calls)"
  - "Direct unit tests for tmux.ts using _exec injection (25 tests)"
  - "Direct unit tests for cmux.ts using _exec injection (24 tests)"
  - "Extended lifecycle.ts tests with _exec.spawn injection (12 tests + 6 real-shell)"
affects:
  - "24-02-prompts-wrapper: same _exec injection pattern applied to clack/prompts"
  - "future test refactors: tmux/cmux/lifecycle can now be tested without mock.module"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutable exported _exec object with default shell impl — tests replace properties without mock.module"
    - "Cache-busting dynamic import (?query-param) for Bun module isolation in tests"
    - "SpawnHandle return type from _exec.spawn — enables stream access before awaiting exit"

key-files:
  created:
    - tests/lib/tmux.test.ts
    - tests/lib/cmux.test.ts
  modified:
    - src/lib/tmux.ts
    - src/lib/cmux.ts
    - src/lib/lifecycle.ts
    - tests/lib/lifecycle.test.ts

key-decisions:
  - "lifecycle.ts _exec.spawn returns SpawnHandle (exited, stdout, stderr) not a resolved result — required so runHooksCaptured can drain streams concurrently before awaiting exit"
  - "lifecycle.ts real-shell tests use cache-busting dynamic import (not static import) to prevent contamination from mock.module('lifecycle') in consumer tests"
  - "cmux.ts dynamic-imports bun's $ inside _exec.run to avoid top-level import issue"

patterns-established:
  - "_exec.run pattern: export const _exec = { run: async (args: string[]): Promise<CmdResult> => { ... } }"
  - "_exec.spawn pattern: export const _exec = { spawn: (args): SpawnHandle => { ... } } (synchronous, returns handle)"
  - "Multi-call tracking in tests: allCalls[] + callResults[] array indexed by call count"
  - "Cache-busting import for real-shell tests: avoids mock.module contamination from consumer test files"

requirements-completed: [MOCK-01, MOCK-02]

# Metrics
duration: 12min
completed: 2026-03-22
---

# Phase 24 Plan 01: Mock Architecture Refactor — _exec Injection Summary

**Injectable _exec objects added to tmux.ts, cmux.ts, and lifecycle.ts with 67 direct unit tests using property-replacement mocking instead of mock.module()**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-22T12:34:00Z
- **Completed:** 2026-03-22T12:46:46Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `src/lib/tmux.ts`: Added `CmdResult` type and mutable `_exec.run` object; all 8 tmux shell functions now route through `_exec.run` instead of direct `$` calls
- `src/lib/cmux.ts`: Added `CmdResult` type and mutable `_exec.run` object; all cmux shell functions route through `_exec.run`
- `src/lib/lifecycle.ts`: Added `SpawnHandle` type and mutable `_exec.spawn` object; both `runHooks` and `runHooksCaptured` use `_exec.spawn` instead of direct `Bun.spawn`
- 25 direct unit tests for `tmux.ts` covering all public functions (no `mock.module`)
- 24 direct unit tests for `cmux.ts` covering all public functions with multi-call tracking (no `mock.module`)
- 12 new `_exec.spawn` injection tests for lifecycle + 6 original real-shell tests preserved

## Task Commits

1. **Task 1: Add _exec objects to tmux.ts, cmux.ts, lifecycle.ts** - `10b2ecb` (feat)
2. **Task 2: Create direct unit tests using _exec injection** - `e61a5a3` (test)
3. **Task 2 fix: Cross-test contamination fix for lifecycle tests** - `e83c19f` (fix)

## Files Created/Modified

- `src/lib/tmux.ts` - Added `export type CmdResult` and `export const _exec`; all `$\`tmux\`` calls route through `_exec.run`
- `src/lib/cmux.ts` - Added `export type CmdResult` and `export const _exec`; all `$\`cmux\`` calls route through `_exec.run`
- `src/lib/lifecycle.ts` - Added `export type SpawnHandle` and `export const _exec`; `Bun.spawn` calls route through `_exec.spawn`
- `tests/lib/tmux.test.ts` - 25 tests: all public functions, TMUX env save/restore, direction variants (down/up/right/left), return-value boolean tests
- `tests/lib/cmux.test.ts` - 24 tests: sequential call tracking for multi-step functions, pane/surface ref parsing, failure paths
- `tests/lib/lifecycle.test.ts` - Extended with 12 injection tests; real-shell tests moved to cache-busting import to prevent contamination

## Decisions Made

- `lifecycle.ts _exec.spawn` returns `SpawnHandle` (not resolved result): required because `runHooksCaptured` must drain stdout/stderr streams concurrently with `Promise.all` before awaiting `proc.exited`. An async spawn wrapper would deadlock.
- Real-shell lifecycle tests switched from static import to cache-busting dynamic import: `mock.module("@/lib/lifecycle")` in consumer tests (`integration-commands.test.ts`) contaminates the statically-imported module, breaking real-shell tests when run together.
- `cmux.ts` uses dynamic `import("bun")` inside `_exec.run` default impl: this is an implementation detail to avoid any potential circular import issues with the Bun runtime module.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error for `proc.stdout`/`proc.stderr` null check**
- **Found during:** Task 1 (lifecycle.ts refactor)
- **Issue:** `Bun.spawn` `proc.stdout` is `ReadableStream | undefined` when `stdout: "inherit"`, but `SpawnHandle.stdout` is typed as `ReadableStream | null`. Compiler error TS2322.
- **Fix:** Added `?? null` coalescing: `stdout: args.stdout === "pipe" ? (proc.stdout ?? null) : null`
- **Files modified:** `src/lib/lifecycle.ts`
- **Verification:** `bun run typecheck` exits 0
- **Committed in:** `10b2ecb` (Task 1 commit)

**2. [Rule 1 - Bug] Removed unused imports causing TypeScript errors in test files**
- **Found during:** Task 2 verification (typecheck)
- **Issue:** `openCmuxWorkspace` imported in cmux.test.ts but unused (TS6133); `openTmuxSession` imported in tmux.test.ts but unused (TS6133); `beforeEach` imported in cmux.test.ts but unused (TS6133); `(out) => lines.push(out)` lacked type annotation (TS7006)
- **Fix:** Removed unused destructured imports; added explicit `(out: HookOutputLine)` type annotations
- **Files modified:** `tests/lib/cmux.test.ts`, `tests/lib/tmux.test.ts`, `tests/lib/lifecycle.test.ts`
- **Verification:** `bun run typecheck` exits 0
- **Committed in:** `e83c19f` (fix commit)

**3. [Rule 1 - Bug] Fixed cross-test contamination for lifecycle real-shell tests**
- **Found during:** Task 2 verification (running tests together)
- **Issue:** `integration-commands.test.ts` uses `mock.module("@/lib/lifecycle")` which contaminates the static import in lifecycle.test.ts when all tests run in the same Bun process, causing real-shell tests to receive mock implementations and produce empty results
- **Fix:** Changed lifecycle.test.ts real-shell tests to use cache-busting dynamic import (`?lifecycle-real`) matching the established Phase 23 pattern
- **Files modified:** `tests/lib/lifecycle.test.ts`
- **Verification:** All 88 tests pass when run together
- **Committed in:** `e83c19f` (fix commit)

---

**Total deviations:** 3 auto-fixed (2 bug - type errors, 1 bug - cross-test contamination)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- Bun's module cache sharing across test files when using static imports causes mock.module contamination — resolved by using the established cache-busting pattern from Phase 23.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `_exec` pattern established in tmux.ts, cmux.ts, and lifecycle.ts
- Plan 02 (prompts wrapper) builds on the same pattern applied to `@clack/prompts`
- Consumer tests (`mock.module` callers) continue to work unchanged

## Self-Check: PASSED

Files verified: src/lib/tmux.ts, src/lib/cmux.ts, src/lib/lifecycle.ts, tests/lib/tmux.test.ts, tests/lib/cmux.test.ts, tests/lib/lifecycle.test.ts — all present.
Commits verified: 10b2ecb (feat), e61a5a3 (test), e83c19f (fix) — all found in git log.

---
*Phase: 24-mock-architecture-refactor*
*Completed: 2026-03-22*
