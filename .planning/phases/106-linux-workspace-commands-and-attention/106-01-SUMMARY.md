---
phase: 106-linux-workspace-commands-and-attention
plan: 01
subsystem: service
tags: [native-launch, attention, journal, agent-hooks]
requires:
  - phase: 105-shared-native-model-and-terminal-foundation
    provides: Native model identities and terminal surface foundation
provides:
  - Stable scoped command identities and negotiated service capabilities
  - Authenticated revision-bound native launch resolution
  - Structured identity-addressed lifecycle attention in the durable journal
affects: [106-02, 106-03, linux-native-client]
tech-stack:
  added: []
  patterns: [stable opaque command ids, empty failure launch channel, journal-owned sequence]
key-files:
  created: [tests/lib/service/native-launch.test.ts, tests/lib/agent-hooks/structured-attention.test.ts]
  modified: [src/lib/service/contract.ts, src/lib/service/snapshot.ts, src/service/server.ts, src/lib/service/event-journal.ts]
key-decisions:
  - "Command IDs derive from workspace, optional repository scope, and command name rather than display labels alone."
  - "The journal assigns structured attention sequence numbers at durable append time."
patterns-established:
  - "Native launch failures contain only structured errors and never a launch specification."
  - "Hook adapters publish typed lifecycle state with injected identity environment variables."
requirements-completed: [ACT-01, ACT-02, ACT-03, ACT-06]
coverage:
  - id: D1
    description: Stable command, launch-resolution, and attention contracts
    requirement: ACT-01
    verification:
      - kind: unit
        ref: tests/lib/service/contract.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Authenticated fresh native launch resolution with an empty failure channel
    requirement: ACT-02
    verification:
      - kind: integration
        ref: tests/lib/service/native-launch.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Typed agent lifecycle attention and durable journal sequencing
    requirement: ACT-03
    verification:
      - kind: unit
        ref: tests/lib/agent-hooks/structured-attention.test.ts and tests/lib/service/event-journal.test.ts
        status: pass
    human_judgment: false
duration: 18min
completed: 2026-07-11
status: complete
---

# Phase 106 Plan 01: Service Launch and Attention Contracts Summary

**Stable command identities, authenticated fresh launch resolution, and replayable structured agent attention now form the native-client service boundary.**

## Performance

- **Duration:** 18 min
- **Completed:** 2026-07-11
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Extended the strict v1 contract and fixtures with stable scoped command IDs, native launch resolution, lifecycle attention, and explicit capability negotiation.
- Added an authenticated `/v1/native-launch` route which binds resolution to current workspace, repository, command, and revision identities and never returns launch data on failure.
- Converted Claude Code and Copilot hook generation to typed lifecycle publication and made the durable journal own structured attention sequence assignment.

## Task Commits

1. **Tasks 1-3: Contracts, resolver, and structured attention** - `da0d1b14` (feat)

## Decisions Made

- Preserve legacy attention payloads as an additive union while validating structured attention strictly.
- Resolve configured commands by stable ID and declared scope; display names are never execution authority.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Broadened managed snapshot adapter typing**
- **Found during:** Task 2
- **Issue:** The managed service option inferred the concrete builder return type, preventing resolver-optional test adapters.
- **Fix:** Exported the server snapshot adapter and retained the managed service's required revision method.
- **Files modified:** `src/service/server.ts`, `src/service/main.ts`
- **Verification:** `bun run typecheck`
- **Committed in:** `da0d1b14`

**Total deviations:** 1 auto-fixed (blocking type integration). **Impact:** No scope expansion; enables capability-unavailable adapters while preserving managed-service revision guarantees.

## Issues Encountered

The interrupted contract edits imported cleanly after correcting one misplaced import and a readonly test expectation.

## User Setup Required

None - no external service configuration required.

## Verification

- Focused tests: 21 passed, 0 failed
- `bun run typecheck`: passed
- `bun run test:deps`: passed
- `bun run verify:gates`: passed
- `git diff --check`: passed

## Next Phase Readiness

Plan 106-02 can consume negotiated launch specifications and structured replay events without parsing labels, prose, or terminal output. No blocker remains for the next plan.

## Self-Check: PASSED

---
*Phase: 106-linux-workspace-commands-and-attention*
*Completed: 2026-07-11*
