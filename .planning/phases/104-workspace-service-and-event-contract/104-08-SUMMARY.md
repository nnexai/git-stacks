---
phase: 104-workspace-service-and-event-contract
plan: "08"
subsystem: service-events
tags: [sse, backpressure, bun, loopback, accounting, tdd]
requires:
  - phase: 104-05
    provides: Bounded subscriber queues and durable replay/live broker
  - phase: 104-06
    provides: Authenticated loopback SSE service transport
provides:
  - Exactly-once shared queue-to-transport event and encoded-byte accounting
  - Destination-owned direct SSE writes that retain reservations through transport acceptance
  - Real loopback stalled-reader overflow and idempotent cleanup coverage
affects: [104-09, phase-105, phase-107]
tech-stack:
  added: []
  patterns: [atomic queue-reservation transfer, direct destination-owned stream, idempotent close listener]
key-files:
  created:
    - tests/service/events-backpressure.test.ts
  modified:
    - src/lib/service/event-broker.ts
    - src/service/server.ts
    - tests/lib/service/event-broker.test.ts
key-decisions:
  - "A subscriber owns one shared event and byte charge across its queue and active transport reservation; acknowledgement alone releases it and advances the safe cursor."
  - "Production SSE uses Bun direct streams so destination-owned writes and flushes complete before broker acknowledgement."
  - "Subscription closure notifies the bridge, making overflow, cancellation, controller failure, and server shutdown converge on one idempotent release."
requirements-completed: [SVC-05, EVT-03, EVT-04, EVT-05]
coverage:
  - id: D1
    description: Events retain exactly one shared charge while queued, reserved, failed, accepted, and acknowledged
    requirement: EVT-05
    verification:
      - kind: unit
        ref: tests/lib/service/event-broker.test.ts#transfers one shared charge from queue through reservation and acknowledgement
        status: pass
    human_judgment: false
  - id: D2
    description: Real stalled loopback readers cross event and byte limits without escaping production bridge diagnostics
    requirement: EVT-05
    verification:
      - kind: integration
        ref: tests/service/events-backpressure.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Slow-client overflow and healthy-reader cancellation release subscriptions bridges heartbeats and admission counts once
    requirement: SVC-05
    verification:
      - kind: integration
        ref: tests/service/events-backpressure.test.ts#stalled reader overflows shared encoded bytes while a draining reader progresses
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 08: Bounded SSE Transport Backpressure Summary

**Exactly-once broker-to-direct-stream accounting keeps every SSE event charged until destination acceptance and deterministically disconnects stalled loopback readers at either shared cap**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T12:45:33Z
- **Completed:** 2026-07-11T12:53:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added explicit peek, reserve, acknowledge, diagnostics, and close notification semantics so queue and bridge ownership share one event/byte ledger without double- or zero-charging.
- Replaced eager default-stream enqueueing with a production `SseTransportBridge` using Bun direct destination-owned writes and flush-before-ack cursor advancement.
- Added real port-zero raw-loopback stalled-reader tests for both count and encoded-byte overflow, healthy-reader progress, bounded publisher latency, and exact resource cleanup.

## Task Commits

1. **Task 1 RED: stalled loopback and transfer accounting tests** - `24ad074`
2. **Task 2 GREEN: shared broker/SSE transport accounting** - `be5b833`

## Files Created/Modified

- `src/lib/service/event-broker.ts` - Atomic queue-to-reservation ownership transfer, combined diagnostics, safe cursor acknowledgement, and close listeners.
- `src/service/server.ts` - Production direct-stream `SseTransportBridge`, bridge diagnostics, bounded heartbeat serialization, and idempotent admission cleanup.
- `tests/lib/service/event-broker.test.ts` - Exactly-once transfer, failed acceptance, cap, cursor, acknowledgement, and close coverage.
- `tests/service/events-backpressure.test.ts` - Real loopback stalled-reader count/byte overflow and cleanup proof.

## Decisions Made

- Retained the subscriber's original charge through transport reservation instead of creating a second bridge budget.
- Used Bun's direct stream contract because its destination owns chunk queueing; successful write and flush form the transport-acceptance boundary before acknowledgement.
- Made broker-driven subscription close observable to the bridge so overflow releases connection admission immediately even while a transport write is pending.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first default `ReadableStream` implementation demonstrated that ordinary controller enqueueing still allowed runtime buffering. The production bridge was moved to Bun's direct destination-owned stream contract, which is the required acceptance boundary and made the real loopback pressure tests deterministic.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/service/event-broker.test.ts tests/service/events-backpressure.test.ts tests/service/events.test.ts` — 11 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.
- `git diff --check` — passed.

## Next Phase Readiness

- Plan 104-09 can close ordinary request deadlines independently of event transport accounting.
- Phase 105 artifacts remain untouched.
- No blockers.

## Self-Check: PASSED

- All four key created/modified files exist.
- RED and GREEN commits exist in order.
- Focused loopback and broker tests, typecheck, dependency checks, and whitespace checks pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
