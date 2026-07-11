---
phase: 105-shared-native-model-and-terminal-foundation
plan: 04
subsystem: native-terminal
tags: [zig, pty, process-group, crash-guard, lifecycle]
requires:
  - phase: 105-shared-native-model-and-terminal-foundation
    provides: Shared reducer model and exact Zig toolchain
provides:
  - Exclusive terminal process-group ownership state machine
  - Private inherited-channel crash cleanup registry
  - Bounded redacted cleanup diagnostics and failed-cleanup truth
affects: [105-05, 106-linux-native-client, 107-macos-native-client]
tech-stack:
  added: []
  patterns: [registration-before-live, absence-before-unregister, birth-token-bound process groups]
key-files:
  created: [native/terminal/ownership.zig, native/terminal/guard.zig, native/terminal/diagnostics.zig, native/tests/ownership_test.zig]
  modified: [native/build.zig, native/core/model.zig, native/core/reducer.zig, scripts/verify-native.ts, package.json]
key-decisions:
  - "A terminal becomes live only after its process identity and private guard registration are proven."
  - "Cleanup uncertainty is a durable failed_cleanup lifecycle, never an ordinary ended state."
patterns-established:
  - "Terminal teardown escalates the entire birth-token-bound process group and unregisters only after absence proof."
  - "The guard protocol is a binary inherited descriptor with no public command or named endpoint."
requirements-completed: [CORE-02, CORE-05, TERM-02, TERM-04]
coverage:
  - id: D1
    description: "Exclusive process-group ownership gates live exposure and preserves failed-cleanup truth."
    requirement: TERM-02
    verification:
      - kind: integration
        ref: "bun run native:test:lifecycle"
        status: pass
    human_judgment: false
  - id: D2
    description: "Private guard EOF cleanup and unsafe or reused group rejection are executable."
    requirement: TERM-04
    verification:
      - kind: integration
        ref: "native/tests/ownership_test.zig#guard rejects unsafe groups and EOF tears down every registered group"
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 04: Terminal Ownership and Crash Guard Summary

**Birth-token-bound terminal process groups now have registration-before-live, bounded escalation, crash-guard cleanup, and durable failed-cleanup truth.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-11T13:27:18Z
- **Completed:** 2026-07-11T13:29:39Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Added an explicit acquiring/live/closing/ended/failed-cleanup owner with guard registration as a prerequisite for live exposure.
- Added graceful close and bounded whole-group SIGHUP, SIGTERM, and SIGKILL escalation with reaping and absence-before-unregister.
- Added a private binary guard registry whose control EOF cleans every registered process group and rejects client, guard, reused, and unsafe groups.
- Proved teardown against a real Linux session/process group containing both a leader and descendant.

## Task Commits

1. **Task 1 RED: Define lifecycle behavior** - `cdf6764a` (test)
2. **Task 1 GREEN: Implement terminal ownership and guard** - `c136fbd5` (feat)

## Files Created/Modified

- `native/terminal/ownership.zig` - Exclusive ownership, confirmation, escalation, reaping, and cleanup-proof lifecycle.
- `native/terminal/guard.zig` - Private inherited-channel registration and EOF cleanup boundary.
- `native/terminal/diagnostics.zig` - Fixed-size redacted cleanup diagnostics.
- `native/tests/ownership_test.zig` - Injected lifecycle and real Linux process-group verification.
- `native/core/model.zig`, `native/core/reducer.zig` - Durable ended and failed-cleanup reducer actions.

## Decisions Made

- Registration identity combines PGID with the Linux birth token; a PGID collision with a different token is rejected rather than replaced.
- Diagnostics accept only a PGID and closed reason enum, structurally excluding argv, environment, credentials, clipboard, and terminal bytes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Persist terminal cleanup outcomes through the shared reducer**
- **Found during:** Task 1 ownership integration
- **Issue:** The existing reducer lifecycle could represent only live or ended and had no action for cleanup failure.
- **Fix:** Added failed_cleanup plus idempotent terminal-ended and terminal-failed-cleanup actions that request persistence.
- **Files modified:** `native/core/model.zig`, `native/core/reducer.zig`
- **Verification:** `bun run native:test:model && bun run native:test:quick`
- **Committed in:** `c136fbd5`

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** The addition is required to preserve D-11 cleanup truth across the shared model boundary; no host integration was pulled forward.

## Issues Encountered

- Zig 0.15.2 no longer exports `std.BoundedArray`; injected recorders use allocator-explicit `std.ArrayList` instead.

## User Setup Required

None beyond the existing Phase 105 native cache setup.

## Next Phase Readiness

- Plan 105-05 can host libghostty surfaces behind registration-before-live and ownership-mediated close/exit/quit behavior.
- No blockers remain for terminal host integration.

## Self-Check: PASSED

- `bun run native:test:lifecycle`, `bun run native:test:model`, `bun run native:test:quick`, `bun run typecheck`, and `git diff --check` pass.
- Both TDD commits exist and the unrelated untracked Phase 106 directory remains untouched.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
