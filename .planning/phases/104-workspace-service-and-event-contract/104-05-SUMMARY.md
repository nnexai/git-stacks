---
phase: 104-workspace-service-and-event-contract
plan: "05"
subsystem: service-events
tags: [journal, replay, compaction, broker, attention, tdd]
requires:
  - phase: 104-01
    provides: Strict service event, operation, cursor, and identity schemas
provides:
  - One fsynced monotonic service-wide operation and attention event journal
  - Explicit replay-gap metadata and atomic age/byte compaction
  - Race-free replay/live handoff with dual-bounded per-client queues
  - Additive failure-isolated structured attention publication for legacy messages
affects: [104-04, 104-06, phase-105, phase-107]
tech-stack:
  added: []
  patterns: [serialized append-before-publish, validated partial-tail recovery, bounded nonblocking mailboxes]
key-files:
  created:
    - src/lib/service/event-journal.ts
    - src/lib/service/event-broker.ts
    - tests/lib/service/event-journal.test.ts
    - tests/lib/service/event-broker.test.ts
  modified:
    - src/lib/messages.ts
    - tests/lib/messages.test.ts
key-decisions:
  - "Journal sequence allocation, fsynced append, compaction, and subscriber registration share one serialization boundary."
  - "Legacy message JSONL persistence remains authoritative and structured attention publication is additive and failure-isolated."
requirements-completed: [EVT-03, EVT-04, EVT-05, SVC-04]
coverage:
  - id: D1
    description: Durable validated operation and attention records share one restart-safe monotonic cursor stream
    requirement: EVT-03
    verification:
      - kind: unit
        ref: tests/lib/service/event-journal.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Retained reconnects replay in order while stale cursors receive snapshot-backed replay-gap metadata
    requirement: EVT-04
    verification:
      - kind: unit
        ref: tests/lib/service/event-journal.test.ts#reports replay gaps with retained bounds and current snapshot revision
        status: pass
    human_judgment: false
  - id: D3
    description: Replay/live handoff is gap-free and slow subscribers are disconnected at either queue bound without blocking producers
    requirement: EVT-05
    verification:
      - kind: unit
        ref: tests/lib/service/event-broker.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: Existing message storage and APIs remain compatible with additive structured attention publication
    requirement: SVC-04
    verification:
      - kind: unit
        ref: tests/lib/messages.test.ts
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 05: Durable Event Journal and Bounded Broker Summary

**Fsynced ordered service events with explicit replay recovery, atomic retention, bounded live mailboxes, and compatible attention publication**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-11T11:47:55Z
- **Completed:** 2026-07-11T11:50:52Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added strict serialized sequence allocation with fsynced append-before-publication, restart recovery, partial-tail repair, interior-corruption rejection, and atomic age/byte compaction.
- Added replay gaps carrying retained bounds and the current snapshot revision so stale clients can rebuild explicitly.
- Added race-free replay/live subscriber registration with 256-event and 1-MiB defaults, explicit slow-consumer disconnects, and synchronous isolated fanout.
- Preserved every legacy message API and JSONL behavior while optionally mapping persisted messages to structured attention events.

## Task Commits

1. **Task 1 RED: durable journal behavior tests** - `3f48397`
2. **Task 1 GREEN: ordered durable journal** - `bb1a03c`
3. **Task 2 RED: broker and attention compatibility tests** - `5a106db`
4. **Task 2 GREEN: bounded broker and attention adapter** - `93ea838`

## Files Created/Modified

- `src/lib/service/event-journal.ts` - Validated serialized append, replay, gap detection, recovery, and compaction.
- `src/lib/service/event-broker.ts` - Bounded nonblocking subscriptions and replay/live handoff.
- `src/lib/messages.ts` - Optional failure-isolated structured attention adapter after legacy persistence.
- `tests/lib/service/event-journal.test.ts` - Concurrent order, append-first, restart, corruption, gap, and compaction coverage.
- `tests/lib/service/event-broker.test.ts` - Handoff, both caps, producer latency, cleanup, and isolation coverage.
- `tests/lib/messages.test.ts` - Structured attention and unchanged legacy behavior coverage.

## Decisions Made

- Reused the journal's serialization boundary for subscriber registration so a captured high-water cursor and live registration form one atomic handoff.
- Used decimal strings externally and `bigint` internally so cursor order cannot lose precision over long-running service lifetimes.
- Kept structured message publication best-effort because existing JSONL message persistence is the compatibility contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/service/event-journal.test.ts tests/lib/service/event-broker.test.ts tests/lib/messages.test.ts` — 31 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.

## Next Phase Readiness

- Plan 104-04 can inject `publishOperationEvent` without depending on broker or transport composition.
- Plan 104-06 can expose journal replay and broker subscriptions through authenticated SSE.
- No blockers.

## Self-Check: PASSED

- All six key created/modified files exist.
- All four RED/GREEN commits exist in order.
- Plan-level tests, typecheck, and dependency graph checks pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
