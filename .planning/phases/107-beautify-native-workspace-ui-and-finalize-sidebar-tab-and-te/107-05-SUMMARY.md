---
phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te
plan: 05
subsystem: service-synchronization
tags: [typescript, sse, journal, filesystem-watch, snapshots]
requires:
  - phase: 107-04
    provides: authoritative workspace change monitoring
provides:
  - Durable replayable snapshot invalidation control events
  - Managed monitor lifecycle with append-before-publish ordering
  - Retryable structured snapshot contention responses
affects: [107-08, native-reconciliation, service-events]
key-files:
  created: [tests/service/workspace-sync.test.ts]
  modified: [src/lib/service/contract.ts, src/lib/service/event-journal.ts, src/lib/service/workspace-change-monitor.ts, src/service/main.ts, src/service/server.ts]
key-decisions:
  - "Publish snapshot invalidations only from records returned by the fsynced serialized journal append."
  - "Keep the prior monitor revision baseline when publication fails so a later signal retries the same authoritative revision."
requirements-completed: [LNX-08]
completed: 2026-07-12
status: complete
---

# Phase 107 Plan 05: Durable Workspace Synchronization Summary

**Workspace changes now cross the service boundary as durable, ordered, replayable invalidations, with managed shutdown and recoverable projection contention.**

## Accomplishments

- Added strict `snapshot_invalidated` control records and serialized journal append support.
- Wired the filesystem monitor into managed service startup, operation-triggered invalidation, and drain-before-transport shutdown.
- Added structured retryable `snapshot_busy` HTTP 409 responses and replay/retention synchronization coverage.

## Task Commits

1. **Durable invalidation contract and journal** - `18b2ead5`
2. **Managed append-before-publish lifecycle** - `cfc525d0`
3. **Recoverable synchronization responses and tests** - `c076173b`

## Verification

- Contract, journal, broker, monitor, event, security, and SSE backpressure suites pass.
- `bun run typecheck` passes.
- `bun run test:deps` reports no circular dependencies.

## Deviations from Plan

- The external-sync contract test exercises the durable revision/replay boundary directly; full native end-to-end reconciliation remains in dependent Plan 107-08.

## Self-Check: PASSED

All task commits exist, the required synchronization test artifact is present, and focused verification is green.

---
*Phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te*
*Completed: 2026-07-12*
