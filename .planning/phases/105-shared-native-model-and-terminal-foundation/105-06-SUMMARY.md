---
phase: 105-shared-native-model-and-terminal-foundation
plan: 06
subsystem: native-infrastructure
tags: [ghostty, process-groups, crash-guard, reducer, linux]
requires:
  - phase: 105-04
    provides: Ownership, guard, absence, and failed-cleanup policy
  - phase: 105-05
    provides: Patched full Ghostty rendered-surface process-control ABI
provides:
  - Surface-bound Ghostty process identity and cleanup adapter
  - Independent sibling-guard EOF cleanup with birth-token validation
  - Generation-safe ended and failed-cleanup reducer mapping
affects: [105-07, 105-08, linux-terminal]
tech-stack:
  added: []
  patterns: [registration-before-live, absence-before-unregister, generation-tagged-lifecycle]
key-files:
  created:
    - native/terminal/ghostty_process_control.zig
    - native/tests/ghostty_process_control_test.zig
  modified:
    - native/terminal/guard.zig
    - native/core/model.zig
    - native/core/reducer.zig
    - native/tests/reducer_test.zig
    - native/build.zig
key-decisions:
  - "The host controls terminal children only through the exact Ghostty surface ABI; it never creates or adopts the PTY."
  - "The sibling guard independently validates the Ghostty-issued Linux identity after host EOF because the destroyed host surface cannot be dereferenced."
patterns-established:
  - "Lifecycle commit points: guard registration precedes live exposure and birth-token-aware absence precedes unregister."
  - "Callbacks carry stable surface identity plus generation; stale callbacks are reducer no-ops."
requirements-completed: [CORE-02, CORE-05, TERM-02, TERM-04]
coverage:
  - id: D1
    description: Ghostty-owned child identity is registered before live and cleaned with bounded escalation and absence proof
    requirement: TERM-02
    verification:
      - kind: integration
        ref: bun run native:test:lifecycle && bun run native:test:surface-abi
        status: pass
    human_judgment: false
  - id: D2
    description: Cleanup outcomes map truthfully to generation-safe shared model state
    requirement: CORE-05
    verification:
      - kind: unit
        ref: bun run native:test:model && bun run native:test:lifecycle
        status: pass
    human_judgment: false
duration: 18min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 06: Ghostty Process Cleanup Summary

**Full Ghostty surface process control now enforces guarded registration, bounded group cleanup, crash recovery, and truthful generation-safe model outcomes.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-11T17:17:00Z
- **Completed:** 2026-07-11T17:35:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Bound PID, PGID, and Linux birth-token acquisition and all ordinary process control directly to the patched `ghostty_surface_*` ABI.
- Added registration-before-live, graceful close, two-second wait, HUP/TERM/KILL escalation, reverse guard unwind, and absence-gated unregister.
- Added an independent sibling-guard EOF backend and a real registered process-group cleanup test.
- Mapped ended and failed-cleanup callbacks into the shared reducer with stable identity and generation rejection for late callbacks.

## Task Commits

1. **Task 1: Implement the Ghostty process-control and guard adapter** - `33774a5c`, `b400b3c7`
2. **Task 2: Map production cleanup outcomes into shared state** - `e50aa682`

## Files Created/Modified

- `native/terminal/ghostty_process_control.zig` - Exact Ghostty ABI adapter, cleanup policy, and reducer callback representation.
- `native/terminal/guard.zig` - Complete identity registry, reverse EOF unwind, and independent Linux cleanup backend.
- `native/tests/ghostty_process_control_test.zig` - Identity rejection, bounded close, failed cleanup, guard EOF, and real process tests.
- `native/core/model.zig` - Internal surface generation.
- `native/core/reducer.zig` - Generation-aware terminal lifecycle actions.
- `native/tests/reducer_test.zig` - Normal/failure/late-callback lifecycle parity.
- `native/build.zig` - Direct full-libghostty lifecycle test linkage.

## Decisions Made

- Ghostty remains the only PTY and child creator. The product receives identity from the rendered surface and invokes only validated surface operations.
- After host death, the sibling guard uses the previously registered Ghostty identity plus `/proc` birth-token and process-group validation; it cannot safely call a surface pointer from the dead address space.
- Reaping is an observation, while process-group absence is the only condition that permits unregister and an `ended` outcome.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a host-independent guard EOF backend**

- **Found during:** Task 1 final crash-path review
- **Issue:** A sibling guard cannot invoke the surface-bound Ghostty ABI after the host process and surface address space have died.
- **Fix:** Added a Linux guard backend that revalidates the registered Ghostty-issued PID/PGID/birth token and performs identical bounded group cleanup without PTY ownership.
- **Verification:** `bun run native:test:lifecycle`, including real registered group cleanup.
- **Committed in:** `b400b3c7`

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** Required for D-12 crash correctness; it preserves Ghostty ownership and introduces no public control endpoint.

## Issues Encountered

- Zig requires a single module instance for a source imported by both a test root and a child module; the build now shares the guard and reducer module objects.
- Linux zombies remain signal-addressable until reaped, so absence proof scans process-group members and treats zombie-only groups as non-executable absence.

## User Setup Required

None.

## Next Phase Readiness

- Plan 105-07 can create each `GtkGLArea`/Ghostty surface and call `exposeLive` before publishing the terminal leaf.
- Surface close, child-exit, application-quit, and host-crash paths have one reusable cleanup contract.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
