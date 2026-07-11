---
phase: 104-workspace-service-and-event-contract
plan: "06"
subsystem: service-transport
tags: [bun, http, sse, loopback, authentication, lifecycle, tdd]
requires:
  - phase: 104-02
    provides: Authoritative stable-revision workspace snapshots
  - phase: 104-03
    provides: Protected per-client credentials and authenticate-first admission
  - phase: 104-04
    provides: Durable asynchronous operation lifecycle and idempotency
  - phase: 104-05
    provides: Ordered durable event journal and bounded broker
provides:
  - Authenticated loopback-only v1 HTTP JSON and replayable SSE transport
  - Exact request rate timeout body and SSE connection admission limits
  - Protected secret-free service discovery with convergent on-demand startup
  - Safe five-minute idle lifecycle blocked by clients and active operations
affects: [phase-105, phase-106, phase-107]
tech-stack:
  added: []
  patterns: [authenticate-before-route, durable-append-before-SSE, owner-only atomic descriptor, dual-signal idle shutdown]
key-files:
  created:
    - src/service/server.ts
    - src/service/main.ts
    - src/commands/service.ts
    - tests/service/discovery.test.ts
    - tests/service/operations.test.ts
    - tests/service/events.test.ts
  modified:
    - src/lib/cli-program.ts
    - tests/service/security.test.ts
    - tests/e2e-inventory.ts
key-decisions:
  - "Every v1 request authenticates before route lookup, body parsing, capability checks, or rate-state evaluation."
  - "The service descriptor contains endpoint and instance metadata but only a credential lookup identity, never a bearer token."
  - "Service commands register through the shared live Commander tree so completion and release inventories remain authoritative."
requirements-completed: [SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, EVT-01, EVT-02, EVT-03, EVT-04, EVT-05]
coverage:
  - id: D1
    description: Official clients discover and authenticate to a loopback-only random-port v1 service
    requirement: SVC-01
    verification:
      - kind: integration
        ref: tests/service/discovery.test.ts
        status: pass
      - kind: integration
        ref: tests/service/security.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Snapshot and asynchronous operation routes compose authoritative service modules without duplicating workspace logic
    requirement: SVC-03
    verification:
      - kind: integration
        ref: tests/service/operations.test.ts
        status: pass
      - kind: unit
        ref: tests/lib/service/operations.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Replayable SSE uses durable ordered records and bounded per-client resources
    requirement: EVT-05
    verification:
      - kind: integration
        ref: tests/service/events.test.ts
        status: pass
      - kind: unit
        ref: tests/lib/service/event-broker.test.ts
        status: pass
      - kind: unit
        ref: tests/lib/service/event-journal.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: Protected discovery converges concurrent starts and idle exit waits for zero clients and operations
    requirement: SVC-05
    verification:
      - kind: integration
        ref: tests/service/discovery.test.ts#publishes one owner-only secret-free descriptor and removes only its instance
        status: pass
      - kind: integration
        ref: tests/service/operations.test.ts#idle lifecycle suppresses exit while clients or operations are active
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 06: Authenticated Loopback Service and Lifecycle Summary

**Authenticated loopback HTTP/JSON and replayable SSE with bounded admission, protected discovery, async operations, and safe on-demand lifecycle**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-11T12:04:23Z
- **Completed:** 2026-07-11T12:14:03Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Composed strict `/v1` discovery, snapshots, workspace lookup, open/close mutation, operation status/cancellation, and replay/live SSE routes over a loopback-only random-port Bun server.
- Enforced authenticate-first admission, 256-KiB bodies, credential-scoped 60/minute token buckets with burst 20, 30-second ordinary timeouts, 15-second SSE heartbeats, and 8-per-credential/32-total stream caps.
- Published an atomic mode-0600 secret-free descriptor, recovered stale instances, converged concurrent official-client starts, and removed descriptors only for the owning instance.
- Added five-minute idle shutdown that resets or blocks while any SSE client or nonterminal operation remains active, while preserving the existing CLI and OpenTUI suites.

## Task Commits

1. **Task 1 RED: loopback transport tests** - `3c19b1c`
2. **Task 1 GREEN: authenticated v1 HTTP and SSE service** - `0ca45a7`
3. **Task 2 RED: discovery lifecycle tests** - `f495b5a`
4. **Task 2 GREEN: protected discovery and idle lifecycle** - `5ab6908`
5. **Rule 3: release inventory mapping** - `919d9de`

## Files Created/Modified

- `src/service/server.ts` - Thin authenticated bounded HTTP/JSON/SSE adapter over snapshots, operations, journal, and broker.
- `src/service/main.ts` - Credential provisioning, protected descriptor publication, stale/concurrent startup, composition, and idle lifecycle.
- `src/commands/service.ts` - Internal `service start/status` Commander adapter.
- `src/lib/cli-program.ts` - Registers the service family in the authoritative live CLI tree.
- `tests/service/*.test.ts` - Real loopback admission, protected discovery, lifecycle, and SSE-bound coverage.
- `tests/e2e-inventory.ts` - Maps the new internal command paths into release verification.

## Decisions Made

- Kept the transport adapter dependency-injectable so exact timing, bounds, snapshots, and lifecycle behavior can be tested without a second workspace engine.
- Validated a live authenticated discovery response before treating a same-PID descriptor as current; PID presence alone is insufficient stale-state evidence.
- Registered the command in `buildCliProgram()` rather than adding command logic to `src/index.ts`, preserving the repository's single live Commander-tree source of truth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added service commands to the canonical E2E inventory**
- **Found during:** Plan-level `verify:gates`
- **Issue:** The live Commander tree correctly exposed `service start` and `service status`, but the release inventory rejected both as unmapped drift.
- **Fix:** Added a service lifecycle inventory family linked to the real discovery and operation lifecycle tests.
- **Files modified:** `tests/e2e-inventory.ts`
- **Verification:** `bun run verify:gates` passed.
- **Committed in:** `919d9de`

---

**Total deviations:** 1 auto-fixed (1 blocking issue)
**Impact on plan:** Required release-gate traceability for the planned command surface; no product scope was added.

## Issues Encountered

- The first 14-worker full-suite run produced three unrelated five-second integration timeouts. All three files passed immediately in isolated reruns, and the complete suite passed at 8 workers with 749 unit tests and all 85 integration files green.

## User Setup Required

None - official client credentials and discovery are provisioned automatically.

## Verification

- Focused service and service-core tests — 59 passed, 0 failed.
- `bun run test -- --workers 8` — 749 unit tests passed; 85/85 integration files passed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.
- `bun run verify:gates` — passed with command inventory, mapped tests, and coverage artifacts aligned.

## Next Phase Readiness

- Phase 104 is complete: every SVC and EVT requirement has an authenticated real-transport composition path.
- Phase 105 can consume the fixture-backed contract and protected descriptor without reading workspace YAML.
- No blockers.

## Self-Check: PASSED

- All nine key created/modified files exist.
- Both RED/GREEN commit pairs and the release-inventory repair commit exist in order.
- Focused tests, the complete isolated suite, typecheck, dependency graph, and release gates pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
