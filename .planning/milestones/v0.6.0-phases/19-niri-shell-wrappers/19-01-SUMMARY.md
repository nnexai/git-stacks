---
phase: 19-niri-shell-wrappers
plan: 01
subsystem: integrations
tags: [niri, zod, bun-shell, ipc, mocking, tdd]

# Dependency graph
requires:
  - phase: 16-artifact-type-foundation
    provides: NiriWindow used in ArtifactBag type definitions

provides:
  - src/lib/niri.ts — complete niri compositor IPC wrapper module with 8 async functions
  - tests/lib/niri.test.ts — 26 unit tests passing without NIRI_SOCKET
  - NiriCommands interface for Phase 20 mock.module() type-safe mocking
  - SnapshotOpts.\_listWindows injectable parameter for snapshotWindowIds test control

affects:
  - 20-niri-integration (imports and mocks @/lib/niri entirely)

# Tech tracking
tech-stack:
  added: []  # No new deps — zod and bun already present
  patterns:
    - "_exec mutable object export for ESM-safe test injection (object properties are mutable unlike named exports)"
    - "SnapshotOpts injectable parameters (_sleep, _listWindows) for pure-logic testing without shell mocks"
    - "Zod .nullable().optional() on all Rust Option<T> fields (serialized as null, not absent)"

key-files:
  created:
    - src/lib/niri.ts
    - tests/lib/niri.test.ts

key-decisions:
  - "_exec mutable object pattern chosen over mock.module(bun) — Bun built-in modules cannot be mocked via mock.module; object property mutation works in ESM"
  - "All shell calls go through _exec.run (single Bun.$ invocation point) making the entire module testable via one replacement"
  - "snapshotWindowIds uses _listWindows injectable instead of _exec.run — cleaner test control without Zod parse overhead in tests"
  - "NiriCommands interface exported so Phase 20 can use mock.module(@/lib/niri) with type-safe mock objects"

patterns-established:
  - "Mutable _exec object: export const _exec = { run: async (args) => ... } — tests replace _exec.run without breaking ESM sealing"
  - "Injectable _listWindows in SnapshotOpts — avoids circular mock dependency in snapshotWindowIds tests"

requirements-completed: [NIRI-06, NIRI-07, NIRI-10, TEST-01]

# Metrics
duration: 9min
completed: 2026-03-22
---

# Phase 19 Plan 01: niri-shell-wrappers Summary

**8 typed async niri IPC wrappers in src/lib/niri.ts with Zod validation, injectable test hooks, and 26 unit tests that pass without NIRI_SOCKET**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-22T00:18:53Z
- **Completed:** 2026-03-22T00:28:00Z
- **Tasks:** 2 (combined into 1 commit — Task 2 was pure verification)
- **Files modified:** 2

## Accomplishments

- Implemented `src/lib/niri.ts` with 8 exported async functions (`isNiriRunning`, `listNiriWindows`, `listNiriWorkspaces`, `setNiriWorkspaceName`, `moveWindowToWorkspace`, `niriSpawn`, `focusNiriWorkspace`, `snapshotWindowIds`) using Bun.$ shell template literals
- Zod schemas for NiriWindow and NiriWorkspace with `.nullable().optional()` on all Rust `Option<T>` fields (prevents parse failures when niri serializes None as null)
- Exported `NiriCommands` interface so Phase 20 tests can type-safely mock the whole module via `mock.module("@/lib/niri", ...)`
- `snapshotWindowIds` implements exponential backoff polling with injectable `_sleep` and `_listWindows` parameters for deterministic testing
- 26 unit tests covering all 8 functions, all passing without NIRI_SOCKET in the environment
- Full test suite (425 tests) passes with zero regressions; TypeScript compiles cleanly

## Task Commits

1. **Task 1: Write niri.ts module and failing tests (RED+GREEN)** - `a03a2ff` (feat)
2. **Task 2: Verify full test suite and mockability** - no additional commit needed (verification-only)

## Files Created/Modified

- `src/lib/niri.ts` — 8 niri IPC wrapper functions, Zod schemas, NiriCommands interface, _exec mutable test hook
- `tests/lib/niri.test.ts` — 26 unit tests, all passing without real niri process

## Decisions Made

**_exec mutable object pattern for test injection**
Bun built-in modules (`"bun"`) cannot be mocked via `mock.module()` — confirmed empirically. `spyOn(Bun, "$")` also fails because `$` is not a regular property. Solution: export `const _exec = { run: ... }` — ESM named exports are sealed (cannot reassign), but object property values are mutable. Tests replace `_exec.run` after import. This is the cleanest pattern for isolating Bun.$ calls in unit tests.

**SnapshotOpts uses _listWindows not _exec.run**
`snapshotWindowIds` makes multiple `listNiriWindows()` calls (before + polling). Testing via `_exec.run` interception would require Zod-valid JSON in every mock response. Using `_listWindows: () => NiriWindow[]` injection is cleaner — tests control exactly what windows appear at each call with typed data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Discovered Bun built-in modules are not mockable via mock.module**
- **Found during:** Task 1 (test implementation)
- **Issue:** Plan suggested `mock.module("bun", () => ({ $: mockFn }))` for intercepting Bun.$ calls. Testing confirmed this does NOT work — Bun built-in modules bypass the mock registry.
- **Fix:** Used `_exec` mutable object export pattern instead. All `Bun.$` calls route through `_exec.run`. Tests replace `_exec.run` after import.
- **Files modified:** src/lib/niri.ts, tests/lib/niri.test.ts
- **Verification:** All 26 tests pass with correct mock interception confirmed by capturedArgs assertions
- **Committed in:** a03a2ff (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — implementation approach correction)
**Impact on plan:** The `_exec` pattern is cleaner than the plan's suggested approach and achieves the same testability goal with less complexity.

## Issues Encountered

- `spyOn(Bun, "$")` does not work — `$` is not an enumerable property on the Bun global
- `mock.module("bun", ...)` does not intercept the `$` import in niri.ts — confirmed empirically
- Module ESM exports are sealed (readonly), so direct property assignment `niriModule._runNiriMsg = mockFn` throws `TypeError: Attempted to assign to readonly property`
- Solution: export a mutable object `_exec` whose `.run` property CAN be mutated after import

## Known Stubs

None — all 8 functions have real implementations.

## Next Phase Readiness

- `src/lib/niri.ts` is ready for Phase 20 (niri-integration) to import
- Phase 20 tests should use `mock.module("@/lib/niri", ...)` to replace the whole module — NOT the `_exec` pattern (that's for niri.ts own unit tests only)
- `NiriCommands` interface ensures Phase 20 mock objects have correct type signatures
- `SnapshotOpts._listWindows` injectable available if Phase 20 needs fine-grained snapshotWindowIds testing

---
*Phase: 19-niri-shell-wrappers*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: src/lib/niri.ts
- FOUND: tests/lib/niri.test.ts
- FOUND: 19-01-SUMMARY.md
- FOUND: commit a03a2ff
