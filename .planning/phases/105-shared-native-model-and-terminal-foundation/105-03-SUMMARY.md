---
phase: 105-shared-native-model-and-terminal-foundation
plan: 03
subsystem: native-model
tags: [zig, reducer, persistence, c-abi, restoration]

requires:
  - phase: 105-shared-native-model-and-terminal-foundation
    provides: Portable opaque v1 ABI and canonical service fixtures
provides:
  - Deterministic platform-neutral state reducer and typed effects
  - Presentation-only ended-session encoding and independent quarantine
  - Explicit distinct relaunch identity and predecessor lineage
  - C ABI reducer dispatch with canonical snapshot bytes
affects: [105-04, 105-05, 106-linux-native-client, 107-macos-native-client]

tech-stack:
  added: []
  patterns: [pure tagged-union reducer, canonical state serialization, presentation allowlist, bounded quarantine diagnostics]

key-files:
  created: [native/core/model.zig, native/core/reducer.zig, native/core/persistence.zig, native/tests/reducer_test.zig, native/tests/persistence_test.zig]
  modified: [native/core/abi.zig, native/include/git_stacks_native_v1.h, native/tests/abi_harness.c, native/build.zig]

key-decisions:
  - "Service disconnection retains an explicitly stale snapshot, while revision drift and replay gaps enter refresh_required and emit only a refresh effect."
  - "Restoration accepts valid records independently and always materializes them as ended presentation state."
  - "Relaunch replaces neither the ended identity nor its history; it creates a distinct live surface with predecessor lineage."

requirements-completed: [CORE-01, CORE-02, CORE-03, CORE-04, CORE-05]

coverage:
  - id: D1
    description: "D-01 through D-04 connection, revision, replay, and optional-data transitions are deterministic."
    requirement: CORE-02
    verification:
      - kind: integration
        ref: "bun run native:test:model"
        status: pass
    human_judgment: false
  - id: D2
    description: "Session bytes contain only ended presentation metadata and mixed corrupt entries are quarantined independently."
    requirement: CORE-05
    verification:
      - kind: integration
        ref: "bun run native:test:restore"
        status: pass
    human_judgment: false
  - id: D3
    description: "C ABI dispatch and direct Zig reduction expose the same canonical snapshot vocabulary."
    requirement: CORE-03
    verification:
      - kind: integration
        ref: "bun run native:test:model && bun run native:test:quick"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 03: Shared Model and Session Restoration Summary

**One deterministic native state machine now owns degraded connection semantics, truthful ended-session restoration, relaunch lineage, and canonical ABI dispatch.**

## Performance

- **Duration:** 6 min
- **Completed:** 2026-07-11
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added explicit stale, refresh-required, incompatible, duplicate, replay-gap, surface, and attention model vocabulary with a pure typed-effect reducer.
- Added deterministic canonical snapshots and verified repeated transition sequences produce stable results.
- Added a strict session presentation allowlist, ended-only restoration, stable bounded quarantine diagnostics, and owner-only permission policy checks.
- Added explicit relaunch effects that allocate a distinct surface identity linked to an unchanged ended predecessor.
- Routed validated action dispatch through the opaque C ABI and proved canonical vocabulary parity in both Zig and C harnesses.

## Task Commits

1. **Task 1: Build deterministic shared state and typed effects** - `d5ee438f`
2. **Task 2: Persist presentation-only ended sessions with independent quarantine** - `06eafbf1`
3. **Task 3: Wire relaunch lineage and reducer behavior through the ABI** - `64b90326`

## Files Created/Modified

- `native/core/model.zig` - Platform-neutral state, stable identities, and canonical serialization.
- `native/core/reducer.zig` - Pure action admission and tagged effects.
- `native/core/persistence.zig` - Presentation allowlist and independent restoration quarantine.
- `native/core/abi.zig` - Opaque reducer dispatch and canonical snapshot ownership.
- `native/tests/reducer_test.zig` - D-01 through D-04, replay, duplicate, and relaunch coverage.
- `native/tests/persistence_test.zig` - Secret-negative, ended-only, quarantine, and permission-policy coverage.

## Deviations from Plan

None.

## Issues Encountered

- Zig module roots require explicit build imports for tests outside `native/core`; the build graph now declares those imports directly.

## User Setup Required

None beyond the existing Phase 105 native cache setup.

## Next Phase Readiness

- Plan 105-04 can consume typed terminal effects without adding platform or I/O state to the reducer.
- Linux and later macOS adapters can share canonical ABI snapshots and ended-session relaunch semantics.

## Self-Check: PASSED

- All three task commits exist.
- `bun run native:test:restore`, `bun run native:test:model`, `bun run native:test:quick`, `bun run typecheck`, and `git diff --check` pass.
- The unrelated untracked Phase 106 directory remains untouched.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
