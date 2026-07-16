---
phase: 123-archived-workspaces-and-safe-removal
plan: "04"
subsystem: service-lifecycle
tags: [workspace-lifecycle, idempotency, terminal-barrier, dirty-force, reconciliation]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Typed core archive/removal boundaries, aggregate catalog contracts, and confirmed terminal admission from Plans 01-03
provides:
  - Per-workspace revision-bound lifecycle coordinator for archive, unarchive, remove, and force-remove
  - Dirty-only exact-name force authority derived from a fresh non-forced inspection
  - Durable typed lifecycle failures, boundary progress, and authoritative reconciled results
affects: [123-05-runtime-wiring, 123-06-web-lifecycle, 123-07-tui-lifecycle, 123-08-verification]

tech-stack:
  added: []
  patterns: [lease-scoped lifecycle transaction, fresh dirty capability derivation, typed durable operation failure, boundary-owned progress]

key-files:
  created:
    - packages/service/src/policy/workspace-lifecycle.ts
    - tests/lib/service/workspace-lifecycle-operations.test.ts
  modified:
    - packages/protocol/src/service.ts
    - packages/service/src/policy/operations.ts
    - packages/service/src/snapshot-adapter.ts

key-decisions:
  - "The stable workspace lease begins before execution-time catalog validation and is released only after authoritative reconciliation or failure cleanup."
  - "Force Remove derives allow_dirty only from its own fresh workspace_dirty inspection and checks the exact current authoritative name before commit."
  - "Typed lifecycle details live on durable failed operations instead of being reconstructed from error text."

patterns-established:
  - "Lifecycle boundary progress is emitted by the coordinator immediately before terminal, inspection, core callback, and catalog-reconciliation work."
  - "Archive/unarchive may converge only when the same stable ID is already in the requested state; remove intent never converges or replays."

requirements-completed: [ARCH-02, ARCH-04, REMOVE-02, REMOVE-03, REMOVE-04, REMOVE-05]

coverage:
  - id: D1
    description: "A stable target lease spans execution-time revision validation, confirmed terminal exit, core mutation, aggregate reconciliation, and release while unrelated targets continue."
    requirement: ARCH-02
    verification:
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts#PHASE123_RED service lifecycle coordinator contract"
        status: pass
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts#holds only the target lease through reconciliation so unrelated targets continue"
        status: pass
    human_judgment: false
  - id: D2
    description: "Archive and unarchive converge only for a same-ID satisfied state, while durable idempotency and stable identity prevent destructive replay against missing or recreated targets."
    requirement: ARCH-04
    verification:
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts#checks revision under the lease and converges only an already-satisfied same-ID archive transition"
        status: pass
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts#preserves durable idempotency and a new key cannot target deleted or recreated state"
        status: pass
    human_judgment: false
  - id: D3
    description: "Normal removal reports every dirty blocker after terminals stop, and Force Remove requires a fresh dirty inspection plus exact authoritative-name confirmation."
    requirement: REMOVE-03
    verification:
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts#normal dirty removal returns every blocker after terminals stop and never commits"
        status: pass
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts#force repeats fresh non-forced inspection and accepts only current dirty state plus exact current name"
        status: pass
    human_judgment: false
  - id: D4
    description: "Durable operations publish typed lifecycle failures and actual checking, removing, deleting, and reconciling boundaries before returning the authoritative catalog revision."
    requirement: REMOVE-05
    verification:
      - kind: integration
        ref: "tests/lib/service/workspace-lifecycle-operations.test.ts#persists typed lifecycle failure details on the durable operation"
        status: pass
      - kind: other
        ref: "npm test"
        status: pass
    human_judgment: false

duration: 7 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 04: Revision-Bound Workspace Lifecycle Coordinator Summary

**A per-workspace lifecycle transaction that confirms terminal exit, derives dirty-force authority freshly, and reconciles every successful mutation to one authoritative revision**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-16T06:42:00Z
- **Completed:** 2026-07-16T06:48:25Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added one coordinator for archive, unarchive, remove, and force-remove with execution-time stable-ID/revision validation under a target-scoped lease.
- Made confirmed terminal exit a hard prerequisite for archive and removal, with dirty inspection and exact-name force authority occurring only afterward.
- Published lifecycle phases at their real core boundaries and stored typed failures or reconciled revisions on durable operations.
- Proved same-key identity, stale convergence limits, recreated-target safety, unrelated-target concurrency, and failure-path lease release.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the lifecycle coordinator failure-order harness** - `91b81cdd` (test)
2. **Task 2: Implement revision-bound lifecycle coordination and honest progress** - `aa2ed997` (feat)

## Verification

- RED gate reached the exact `PHASE123_RED service lifecycle coordinator contract` sentinel with 11 intended failures.
- Focused coordinator, registry, and terminal suites pass 27/27.
- Protocol and browser contract/projection suites pass 20/20.
- Full `npm test` passes 136 Vitest files / 1782 tests, 42 Node contract/runtime tests, and the complete OpenTUI matrix.
- Workspace typecheck passes for protocol, client, core, CLI, service, web, and TUI.
- Dependency and cycle gate reports `Package architecture: OK`.

## Files Created/Modified

- `packages/service/src/policy/workspace-lifecycle.ts` - Lease-scoped lifecycle coordinator and typed lifecycle error authority.
- `tests/lib/service/workspace-lifecycle-operations.test.ts` - Ordering, force, idempotency, stale-state, concurrency, progress, and failure harness.
- `packages/service/src/policy/operations.ts` - Durable propagation of validated lifecycle error codes and details.
- `packages/service/src/snapshot-adapter.ts` - Aggregate catalog rebuild capability for lifecycle reconciliation.
- `packages/protocol/src/service.ts` - Typed lifecycle details on durable failed operations.

## Decisions Made

- Used a mutable operation result record populated only after reconciliation so the existing registry persists the exact authoritative revision without a second operation path.
- Preserved target concurrency by validating once under the stable target lease; unrelated workspace revision advancement does not globally serialize lifecycle work.
- Kept dirty authority opaque and one-shot: only the plan returned by the current typed dirty inspection reaches `commitWorkspaceRemoval` with `allow_dirty: true`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Contract] Persist lifecycle failure details on the durable operation**
- **Found during:** Task 2 operation integration
- **Issue:** Plan 02 defined strict lifecycle failure details for client projection, but the durable `OperationFailure` schema had no typed field capable of retaining blocker arrays and force eligibility.
- **Fix:** Added an optional validated lifecycle field to failed operations and taught the registry to preserve only schema-valid lifecycle errors and bounded protocol error codes.
- **Files modified:** `packages/protocol/src/service.ts`, `packages/service/src/policy/operations.ts`
- **Verification:** Typed durable failure integration test, protocol/browser contract suites, full `npm test`, typecheck, and dependency gates all pass.
- **Committed in:** `aa2ed997`

---

**Total deviations:** 1 auto-fixed (1 missing critical typed contract). **Impact:** Required to transport the planned blocker and force-safety result without error-text parsing; no product scope expansion.

## Issues Encountered

- The first RED run failed during static import because the coordinator file did not yet exist; a minimal compileable production stub was introduced without staging it, then the required RED gate was rerun and reached the named behavioral sentinel before the test-only commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 05 can inject one shared admission, terminal manager, operation registry, and aggregate snapshot into `createWorkspaceLifecycleCoordinator` and route all four strict lifecycle kinds to `submit`.
- Plans 06-07 can consume durable typed failure details and reconciled result revisions without parsing messages or recreating dirty policy.
- No blocker remains.

## Self-Check: PASSED

- Both created files exist.
- Task commits `91b81cdd` and `aa2ed997` exist in history.
- All four coverage deliverables have current passing automated evidence.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
