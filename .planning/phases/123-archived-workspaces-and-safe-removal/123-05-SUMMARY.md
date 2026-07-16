---
phase: 123-archived-workspaces-and-safe-removal
plan: "05"
subsystem: service-lifecycle-transport
tags: [secure-router, trusted-client, idempotency, terminal-admission, composition-root]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Strict lifecycle schemas, confirmed terminal authority, and the revision-bound coordinator from Plans 02-04
provides:
  - Strict operation.write lifecycle routing shared by browser and trusted TUI clients
  - Non-retrying trusted lifecycle submission with durable event/poll observation
  - One runtime admission, terminal manager, lifecycle coordinator, operation registry, and aggregate snapshot authority
affects: [123-06-web-lifecycle, 123-07-tui-lifecycle, 123-08-verification]

tech-stack:
  added: []
  patterns: [strict typed lifecycle adapter, non-retrying destructive submission, composition factory over one terminal authority]

key-files:
  created: []
  modified:
    - packages/service/src/policy/core-contract.ts
    - packages/service/src/policy/client.ts
    - packages/service/src/secure/router.ts
    - packages/service/src/main.ts
    - tests/lib/service/operations.test.ts
    - tests/service/operations.test.ts

key-decisions:
  - "Lifecycle schemas remain separate from legacy name-based core mutations so browser and trusted clients carry the same stable-ID/revision intent without changing daemonless CLI authority."
  - "operation.submit is never retried by the trusted client; only observation of an already accepted durable operation resumes through events or polling."
  - "The router constructs the sole terminal manager with the shared admission, then the composition factory creates the sole coordinator from that exact manager and aggregate snapshot."

patterns-established:
  - "Transport-only adapters parse and forward lifecycle intent; terminal shutdown, dirty inspection, exact-name force validation, and filesystem mutation remain coordinator/core authority."
  - "Destructive intent has one submission attempt, while durable observation may reconnect after an operation ID exists."

requirements-completed: [ARCH-02, ARCH-04, REMOVE-02, REMOVE-03, REMOVE-05]

coverage:
  - id: D1
    description: "Browser and trusted clients submit all four strict stable-ID/revision lifecycle kinds through operation.write to the shared coordinator."
    requirement: ARCH-02
    verification:
      - kind: integration
        ref: "tests/service/operations.test.ts#PHASE123_RED lifecycle router client composition contract"
        status: pass
      - kind: unit
        ref: "tests/lib/service/operations.test.ts#uses the shared strict lifecycle schemas for trusted operation submission"
        status: pass
    human_judgment: false
  - id: D2
    description: "Force confirmation is strict and coordinator-owned, and destructive lifecycle submission is not replayed after transport failure."
    requirement: REMOVE-03
    verification:
      - kind: integration
        ref: "tests/service/operations.test.ts#trusted lifecycle submission never replays destructive intent after transport failure"
        status: pass
      - kind: integration
        ref: "tests/service/operations.test.ts#PHASE123_RED lifecycle router client composition contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "One shared admission reaches the terminal manager and coordinator, which share the same operation registry and aggregate reconciliation snapshot."
    requirement: REMOVE-02
    verification:
      - kind: integration
        ref: "tests/service/operations.test.ts#PHASE123_RED lifecycle router client composition contract"
        status: pass
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts"
        status: pass
      - kind: integration
        ref: "tests/service/web-terminal.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Package, type, architecture, and daemonless core/CLI boundaries remain buildable after lifecycle composition."
    requirement: REMOVE-05
    verification:
      - kind: other
        ref: "npm run build:packages"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "npm run test:deps"
        status: pass
    human_judgment: false

duration: 10 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 05: Secure Lifecycle Transport and Shared Runtime Composition Summary

**Strict operation.write lifecycle routing with one admission-aware terminal manager, one coordinator, and non-retrying destructive client submission**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-16T06:52:18Z
- **Completed:** 2026-07-16T07:02:33Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Routed archive, unarchive, remove, and force-remove through one strict lifecycle parser and the Plan 04 coordinator under the existing operation.write boundary.
- Added trusted-client lifecycle observation while ensuring operation submission is attempted exactly once; reconnect fallback observes only an already accepted operation.
- Composed one admission authority into the router-owned terminal manager and created one coordinator from that exact manager, operation registry, and aggregate snapshot.
- Kept dirty inspection, force eligibility, exact-name confirmation, terminal enumeration, and Git/filesystem mutation out of router and client adapters.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock lifecycle router, client, and composition boundaries** - `4c2ca744` (test)
2. **Task 2: Wire strict lifecycle transport and one shared runtime authority** - `6b8e9ef6` (feat)

## Verification

- RED gate failed on the intended missing schema and router behavior and included the exact `PHASE123_RED lifecycle router client composition contract` sentinel.
- Focused coordinator, operation, router/client/composition, and terminal suites pass 32/32.
- Workspace typecheck passes for protocol, client, core, CLI, service, web, and TUI packages.
- Dependency and cycle gate reports `Package architecture: OK`.
- Protocol, client, core, CLI, service, and web package outputs build successfully.

## Files Created/Modified

- `packages/service/src/policy/core-contract.ts` - Per-kind views over the shared strict lifecycle schema for trusted client contracts.
- `packages/service/src/policy/client.ts` - Durable lifecycle observation and single-attempt operation submission.
- `packages/service/src/secure/router.ts` - operation.write lifecycle parsing and coordinator dispatch with no policy duplication.
- `packages/service/src/main.ts` - One admission/coordinator/snapshot composition factory wired into the service runtime.
- `tests/lib/service/operations.test.ts` - Strict trusted lifecycle schema coverage.
- `tests/service/operations.test.ts` - Scope, force, forwarding, no-replay, and shared-composition evidence.

## Decisions Made

- Kept lifecycle requests separate from the legacy name-based core mutation map so service-backed clients use stable IDs and revisions while daemonless CLI core execution remains unchanged.
- Disabled automatic retry for every operation submission; safe recovery starts only after the caller has received a durable operation ID.
- Let the router construct its sole terminal manager so terminal-count idle accounting stays authoritative, then injected that exact manager into the lifecycle coordinator through the composition factory.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial composition review found that injecting a prebuilt terminal manager would bypass the router's aggregate connection-count callback. The composition was corrected before commit so the router owns the manager callback while still sharing the exact admission and coordinator instance.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06 can submit the strict direct lifecycle body from browser actions and consume projected durable progress/failure details.
- Plan 07 can replace the legacy TUI remove call with `runWorkspaceLifecycleMutation` and observe the same coordinator operation.
- No blocker remains.

## Self-Check: PASSED

- Task commits `4c2ca744` and `6b8e9ef6` exist in history.
- All six modified source/test files exist.
- All four coverage deliverables have current passing automated evidence.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
