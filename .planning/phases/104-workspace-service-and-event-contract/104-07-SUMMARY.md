---
phase: 104-workspace-service-and-event-contract
plan: "07"
subsystem: service-events
tags: [sse, event-journal, snapshots, attention, lifecycle, tdd]
requires:
  - phase: 104-02
    provides: Authoritative durable snapshot revisions
  - phase: 104-05
    provides: Shared durable event journal and attention publication seam
  - phase: 104-06
    provides: Managed authenticated HTTP/SSE service composition
provides:
  - Production-managed attention and operation events in one durable cursor stream
  - Authoritative snapshot revision metadata for replay gaps
  - Ownership-safe attention adapter lifecycle cleanup
affects: [104-08, 104-09, phase-105, phase-107]
tech-stack:
  added: []
  patterns: [ownership-token disposal, snapshot-owned revision provider, append-before-live publication]
key-files:
  created: []
  modified:
    - src/lib/messages.ts
    - src/lib/service/snapshot.ts
    - src/service/main.ts
    - tests/lib/messages.test.ts
    - tests/lib/service/snapshot.test.ts
    - tests/service/events.test.ts
    - tests/service/discovery.test.ts
key-decisions:
  - "Attention publication cleanup is identity-checked and idempotent so an older service cannot detach a newer owner."
  - "Replay-gap revisions come from a current authoritative snapshot build; an empty workspace set explicitly reports revision zero."
requirements-completed: [SVC-02, SVC-04, EVT-03, EVT-04]
coverage:
  - id: D1
    description: Managed operation and attention records share durable strictly increasing cursors across restart and authenticated SSE replay
    requirement: EVT-03
    verification:
      - kind: integration
        ref: tests/service/events.test.ts#managed attention publication is durable and available over authenticated SSE
        status: pass
    human_judgment: false
  - id: D2
    description: Replay gaps expose the current authoritative snapshot subsystem revision
    requirement: EVT-04
    verification:
      - kind: integration
        ref: tests/service/events.test.ts#managed replay gaps expose the authoritative snapshot revision
        status: pass
      - kind: unit
        ref: tests/lib/service/snapshot.test.ts#reports the greatest revision from a current authoritative build
        status: pass
    human_judgment: false
  - id: D3
    description: Managed shutdown removes only its own attention adapter while legacy JSONL persistence remains authoritative
    requirement: SVC-04
    verification:
      - kind: unit
        ref: tests/lib/messages.test.ts#an older attention owner cannot dispose a newer publication
        status: pass
      - kind: integration
        ref: tests/service/events.test.ts#managed attention publication is durable and available over authenticated SSE
        status: pass
    human_judgment: false
duration: 2min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 07: Managed Event Composition and Replay Revision Summary

**Production attention events now share the durable operation cursor stream, with authoritative snapshot revisions in replay-gap responses and ownership-safe shutdown cleanup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-11T12:40:01Z
- **Completed:** 2026-07-11T12:42:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Wired real legacy-compatible attention messages through stable workspace identity resolution, journal append, and broker publication in managed production composition.
- Added snapshot-owned current revision calculation and injected it into production replay-gap metadata.
- Proved mixed operation/attention replay, restart cursor preservation, authenticated SSE delivery, ownership-safe disposal, and post-stop legacy persistence.

## Task Commits

1. **Task 1 RED: production event composition coverage** - `1bf3aba`
2. **Task 2 GREEN: managed attention and replay revision wiring** - `dbcac53`
3. **Task 2 verification: durable mixed event replay** - `425164c`

## Files Created/Modified

- `src/lib/messages.ts` - Returns identity-checked idempotent attention publication disposers and captures one publisher per append.
- `src/lib/service/snapshot.ts` - Exposes the greatest revision from a current authoritative build without fabricating nonzero empty-state revisions.
- `src/service/main.ts` - Injects snapshot revisions, installs append-before-broker attention publication, and disposes it during shutdown.
- `tests/lib/messages.test.ts` - Covers cross-owner and idempotent disposal.
- `tests/lib/service/snapshot.test.ts` - Covers current greatest and empty-state revisions.
- `tests/service/events.test.ts` - Covers real authenticated mixed replay, restart, shutdown, and replay-gap metadata.
- `tests/service/discovery.test.ts` - Keeps the injected managed-service snapshot fixture aligned with the new typed interface.

## Decisions Made

- Captured the current attention publisher before asynchronous identity resolution so a concurrent owner replacement cannot split one publication across owners.
- Derived current revision by building all authoritative snapshots and taking their greatest allocated decimal revision; no-workspace state remains explicitly `0`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the managed discovery snapshot fixture**
- **Found during:** Task 2 type verification
- **Issue:** The existing discovery test injected a snapshot adapter without the newly required `currentRevision` method.
- **Fix:** Added an explicit zero revision to the no-workspace discovery fixture.
- **Files modified:** `tests/service/discovery.test.ts`
- **Verification:** `bun run typecheck` and the discovery integration tests pass.
- **Committed in:** `dbcac53`

---

**Total deviations:** 1 auto-fixed (1 blocking issue). **Impact:** Test-fixture contract alignment only; no product scope added.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/messages.test.ts tests/lib/service/snapshot.test.ts tests/service/events.test.ts tests/service/discovery.test.ts` — 34 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.
- `git diff --check` — passed.

## Next Phase Readiness

- Plan 104-08 can close bounded network-facing SSE backpressure independently of cursor composition.
- Plan 104-09 can close ordinary handler execution deadlines independently of replay metadata.
- Phase 105 artifacts remain untouched.

## Self-Check: PASSED

- All seven key modified files exist.
- RED, GREEN, and strengthened transport verification commits exist in order.
- Focused tests, typecheck, dependency checks, and whitespace checks pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
