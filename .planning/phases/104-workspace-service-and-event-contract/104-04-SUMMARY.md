---
phase: 104-workspace-service-and-event-contract
plan: "04"
subsystem: service-operations
tags: [operations, idempotency, cancellation, event-journal, tdd]
requires:
  - phase: 104-01
    provides: Strict operation and event wire schemas
  - phase: 104-05
    provides: Append-first durable operation event publisher
provides:
  - Durable asynchronous operation lifecycle with append-first visibility
  - Cooperative safe-boundary cancellation and explicit rollback outcomes
  - Restart-safe credential-scoped idempotency reservations
  - Workspace open and close mutation adapters
affects: [104-06, phase-105, phase-107]
tech-stack:
  added: []
  patterns: [persist-append-publish visibility, serialized reservation before scheduling, cooperative safe-step cancellation]
key-files:
  created:
    - src/lib/service/operations.ts
    - tests/lib/service/operations.test.ts
    - tests/lib/service/idempotency.test.ts
  modified:
    - src/lib/service/contract.ts
key-decisions:
  - "Persist operation state before durable journal append, but expose it to queries and observers only after append succeeds."
  - "Scope idempotency reservations by client, endpoint, and key while hashing canonical request content independently of object key order."
requirements-completed: [EVT-01, EVT-02, EVT-03]
coverage:
  - id: D1
    description: Durable accepted-running-terminal lifecycle with structured progress, restart recovery, and honest cancellation rollback
    requirement: EVT-01
    verification:
      - kind: unit
        ref: tests/lib/service/operations.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Equivalent retries reuse one operation across concurrency and restart while conflicting input is rejected
    requirement: EVT-02
    verification:
      - kind: unit
        ref: tests/lib/service/idempotency.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Every lifecycle and progress transition enters the durable event journal before live visibility
    requirement: EVT-03
    verification:
      - kind: unit
        ref: tests/lib/service/operations.test.ts#persists accepted before scheduling stays queryable and publishes before observers
        status: pass
      - kind: unit
        ref: tests/lib/service/event-journal.test.ts
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 04: Durable Operation Lifecycle and Idempotency Summary

**Append-first asynchronous operations with safe cancellation, restart-safe deduplication, and focused workspace open/close adapters**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-11T11:55:01Z
- **Completed:** 2026-07-11T12:01:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added an atomic operation store that durably accepts work before scheduling and enforces accepted to running to exactly one terminal state.
- Routed accepted, running, progress, rollback, terminal, and restart-interrupted transitions through the shared append-first event publisher before query/observer visibility.
- Added cooperative cancellation between named steps with completed-work, rollback-attempt, rollback-success, original-error, and rollback-error reporting.
- Added canonical request hashing and serialized client/endpoint/key reservations that deduplicate concurrent and restarted requests through terminal retention.
- Added only the planned workspace open and close adapters while preserving direct CLI and OpenTUI library paths.

## Task Commits

1. **Task 1 RED: operation lifecycle tests** - `899c7ef`
2. **Task 1 GREEN: durable operation lifecycle** - `655c662`
3. **Task 2 RED: idempotency and adapter tests** - `6bad5eb`
4. **Task 2 GREEN: idempotent workspace operations** - `aebd5a2`

## Files Created/Modified

- `src/lib/service/operations.ts` - Durable registry, lifecycle executor, cancellation, retention, reservations, and open/close adapters.
- `src/lib/service/contract.ts` - Terminal timestamps, rollback outcome fields, and explicit idempotency conflict vocabulary.
- `tests/lib/service/operations.test.ts` - Lifecycle ordering, append failure, cancellation, rollback, query safety, and restart coverage.
- `tests/lib/service/idempotency.test.ts` - Concurrent retry, conflict, restart, retention, canonical hash, and adapter coverage.

## Decisions Made

- Kept persisted state and externally visible state distinct so a failed journal append cannot leak an unjournaled transition through queries or observers.
- Recovered non-resumable accepted/running records as explicit interrupted failures and never rescheduled their executors.
- Treated each workspace open or close invocation as one named safe step; legacy progress callbacks become structured progress events without changing direct callers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended terminal operation wire records**
- **Found during:** Task 1
- **Issue:** The existing strict contract could not encode terminal timestamps or the required rollback attempted/succeeded outcome.
- **Fix:** Added accepted/started/finished timestamps, rollback outcome booleans, and the explicit idempotency conflict error code.
- **Files modified:** `src/lib/service/contract.ts`
- **Verification:** Contract, operation, idempotency, event-journal, typecheck, unit, and dependency suites pass.
- **Committed in:** `655c662`

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** The strict additive fields are necessary to represent D-10 through D-13 honestly; no unrelated product surface was added.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/service/operations.test.ts tests/lib/service/idempotency.test.ts tests/lib/service/event-journal.test.ts tests/lib/service/contract.test.ts` — 20 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:unit` — 742 passed, 0 failed, 28 snapshots.
- `bun run test:deps` — passed with no circular dependencies.

## Next Phase Readiness

- Plan 104-06 can bind authenticated mutation routes to the registry and expose operation reads/cancellation without adding lifecycle logic in transport code.
- Phase 105 clients can rely on durable operation identity, structured terminal details, and conflict-safe retry semantics.
- No blockers.

## Self-Check: PASSED

- All four key created/modified files exist.
- RED and GREEN commits exist in order for both tasks.
- Focused, contract, unit, typecheck, and dependency verification all pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
