---
phase: 104-workspace-service-and-event-contract
plan: "09"
subsystem: service-transport
tags: [timeout, abort-signal, bun, loopback, contract, tdd]
requires:
  - phase: 104-06
    provides: Authenticated loopback HTTP and SSE service transport
  - phase: 104-08
    provides: Destination-owned bounded SSE transport
provides:
  - Strict request_timeout v1 error contract and golden fixture
  - Independent aborting deadline for every authenticated ordinary route
  - Real stalled-handler timeout recovery and SSE exemption proof
affects: [phase-105, phase-106, phase-107]
tech-stack:
  added: []
  patterns: [private timeout sentinel, promise race with cooperative abort, contained losing promise]
key-files:
  created:
    - tests/fixtures/service-v1/request-timeout-error.json
  modified:
    - src/lib/service/contract.ts
    - src/service/server.ts
    - tests/lib/service/contract.test.ts
    - tests/service/security.test.ts
key-decisions:
  - "Only the private execution-deadline sentinel maps to request_timeout; adapter failures retain the generic internal error boundary."
  - "The ordinary deadline wraps the complete non-SSE route after authentication and rate admission while SSE remains solely under its explicit timeout-zero policy."
requirements-completed: [SVC-05, SVC-02, EVT-01]
coverage:
  - id: D1
    description: The closed v1 contract accepts exactly the stable secret-free request_timeout error envelope
    requirement: SVC-05
    verification:
      - kind: unit
        ref: tests/lib/service/contract.test.ts#closes request timeout errors over the strict golden envelope
        status: pass
    human_judgment: false
  - id: D2
    description: Stalled authenticated ordinary work returns HTTP 504 and late work cannot poison subsequent requests
    requirement: SVC-05
    verification:
      - kind: integration
        ref: tests/service/security.test.ts#times out stalled ordinary handlers contains late work and recovers
        status: pass
    human_judgment: false
  - id: D3
    description: SSE connections remain live beyond the injected ordinary execution deadline
    requirement: EVT-01
    verification:
      - kind: integration
        ref: tests/service/security.test.ts#keeps SSE exempt from the ordinary handler deadline
        status: pass
    human_judgment: false
duration: 2min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 09: Ordinary Handler Execution Deadline Summary

**Authenticated ordinary routes now have an independent aborting 30-second execution deadline with a strict secret-free 504 contract, late-work containment, recovery, and explicit SSE exemption**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-11T12:56:00Z
- **Completed:** 2026-07-11T12:57:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Closed the v1 error-code enum over `request_timeout` and checked in an exact strict golden envelope with no details, cause, stack, or adapter text.
- Wrapped every authenticated non-SSE route in one injectable deadline race that aborts cooperative adapters, clears its timer, and contains late resolution or rejection.
- Proved real loopback 504 behavior, exact response mapping, same-server recovery, and an SSE connection surviving beyond the ordinary deadline.

## Task Commits

1. **Task 1 RED: ordinary deadline contract and loopback failures** - `d3f3f1e`
2. **Task 2 GREEN: ordinary execution deadline and timeout mapping** - `686eb88`

## Files Created/Modified

- `src/lib/service/contract.ts` - Adds the sole canonical `request_timeout` error code.
- `src/service/server.ts` - Adds the injectable ordinary-route deadline, cooperative abort propagation, late-work containment, and exact 504 mapping.
- `tests/lib/service/contract.test.ts` - Enforces the strict golden timeout envelope and rejects alternate spellings and undeclared data.
- `tests/fixtures/service-v1/request-timeout-error.json` - Canonical stable timeout response body.
- `tests/service/security.test.ts` - Real stalled snapshot timeout, late completion, recovery, and SSE exemption coverage.

## Decisions Made

- Applied the deadline after authenticate-first and rate admission so unauthenticated requests retain their single generic rejection and consume no handler execution seam.
- Passed `AbortSignal` through locally owned snapshot and mutation adapters without changing public JSON or requiring existing adapters to cooperate.
- Kept Bun's request timeout as socket inactivity protection and excluded `/v1/events` from the ordinary promise deadline.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The initial synthetic SSE subscription did not activate Bun's direct-stream response reliably. Replacing it with the production `EventJournal` and `EventBroker` made the exemption proof exercise the real transport path.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/service/contract.test.ts tests/service/security.test.ts tests/service/discovery.test.ts tests/service/operations.test.ts tests/service/events-backpressure.test.ts` — 17 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.
- `bun run verify:gates` — passed.
- `git diff --check` — passed.

## Next Phase Readiness

- Phase 104's final verification gap is closed; ordinary work is behaviorally bounded independently of socket activity and SSE transport.
- Phase 105 can rely on the strict timeout contract and server recovery behavior.
- Phase 105 planning artifacts remained untouched.

## Self-Check: PASSED

- All five key created/modified files exist.
- RED and GREEN commits exist in order.
- All plan-level focused transport tests, typecheck, dependency checks, release gates, and whitespace checks pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
