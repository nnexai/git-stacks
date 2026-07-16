---
phase: 123-archived-workspaces-and-safe-removal
plan: "02"
subsystem: protocol
tags: [workspace-catalog, lifecycle-contracts, activity-ordering, zod, browser-projection]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Canonical archive fields and staged dirty-safe removal authority from Plan 01
provides:
  - One revisioned active/archive workspace catalog with persisted activity timestamps
  - Strict bounded lifecycle mutation, phase, failure, and result schemas
  - Minimal browser and trusted archived-state contracts
  - One deterministic pinned/priority/activity/name/ID successor comparator
affects: [123-04-lifecycle-coordinator, 123-05-runtime-wiring, 123-06-web-lifecycle, 123-07-tui-lifecycle, 123-08-verification]

tech-stack:
  added: []
  patterns: [partition-before-projection catalog, aggregate active/archive revision, strict force-only mutation union, shared successor comparator]

key-files:
  created: []
  modified:
    - packages/protocol/src/service.ts
    - packages/protocol/src/web.ts
    - packages/client/src/presentation.ts
    - packages/service/src/policy/snapshot.ts
    - packages/service/src/policy/core-contract.ts
    - packages/service/src/policy/core-state.ts
    - packages/service/src/web/projection.ts
    - tests/fixtures/service-v1/workspace-snapshot.json
    - tests/service-node/secure-contract-runtime.test.mjs

key-decisions:
  - "Catalog revision digests both active projections and minimal archived summaries, including all-archived state."
  - "Force eligibility is schema-valid only for workspace_dirty after terminals are confirmed stopped; confirmation_name exists only on workspace.force-remove."
  - "The legacy workspacePriorityOrder export delegates to workspaceSuccessorOrder with neutral activity and ID defaults instead of retaining a divergent algorithm."

patterns-established:
  - "Archived definitions are partitioned before active project() and represented only as id, name, and activity_at."
  - "Persisted last_opened with created fallback is carried unchanged on every active projection and drives shared successor ordering."

requirements-completed: [ARCH-02, ARCH-03, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05]

coverage:
  - id: D1
    description: "The service builds one positive-revision catalog that partitions active projections from minimal sorted archived summaries and advances for archive-only changes."
    requirement: ARCH-03
    verification:
      - kind: unit
        ref: "tests/lib/service/snapshot.test.ts#PHASE123_RED catalog activity ordering contract"
        status: pass
      - kind: unit
        ref: "tests/lib/service/snapshot.test.ts#catalog revision advances through active, all-archived, and archive-only changes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lifecycle mutations, progress phases, failures, and results are strict, bounded, and reserve exact-name confirmation for Force Remove only."
    requirement: REMOVE-03
    verification:
      - kind: unit
        ref: "tests/service/web-presentation.test.ts#lifecycle contracts are strict, bounded, and force-specific"
        status: pass
      - kind: integration
        ref: "tests/conformance/protocol-client.test.mjs#shared lifecycle mutation and successor contracts survive package builds"
        status: pass
    human_judgment: false
  - id: D3
    description: "Active activity_at is preserved through service snapshot, trusted CoreWorkspace, and browser projection contracts."
    requirement: ARCH-02
    verification:
      - kind: unit
        ref: "tests/lib/service/snapshot.test.ts#PHASE123_RED catalog activity ordering contract"
        status: pass
      - kind: unit
        ref: "tests/service/web-projection.test.ts#omits paths, commands, environment, secret references, ports, and launch details"
        status: pass
      - kind: integration
        ref: "tests/lib/service/contract.test.ts#parses and exactly round-trips golden fixtures"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both clients receive one successor comparator with independent pinned, priority, activity recency, name, and stable-ID tie tiers."
    requirement: REMOVE-05
    verification:
      - kind: unit
        ref: "tests/service/web-presentation.test.ts#shared successor order proves every tie tier independently"
        status: pass
      - kind: integration
        ref: "tests/conformance/protocol-client.test.mjs#shared lifecycle mutation and successor contracts survive package builds"
        status: pass
    human_judgment: false

duration: 10 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 02: Activity-Bearing Catalog and Lifecycle Contract Summary

**A revisioned active/archive catalog, strict force-specific lifecycle schemas, and one deterministic cross-client successor comparator**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-16T06:08:00Z
- **Completed:** 2026-07-16T06:18:59Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added active `activity_at`, minimal archived summaries, and a catalog whose revision covers both active and archived state even when no active workspace remains.
- Added strict bounded lifecycle mutation, phase, failure-detail, result, and browser operation contracts with dirty-only Force Remove eligibility.
- Partitioned archived definitions before active projection and propagated catalog state into the trusted CoreState contract.
- Replaced divergent successor selection with one shared pin, priority, activity, name, and stable-ID comparator while retaining a delegating compatibility export.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock active activity, catalog, lifecycle schema, and successor ordering contracts** - `58e8a14b` (test)
2. **Task 2: Implement the aggregate catalog and shared lifecycle/presentation contract** - `4f6cf0a8` (feat)

Post-wave integration repair:

- **Align trusted and browser golden snapshots with the required catalog fields** - `98a351c7` (fix)

## Verification

- RED gate: the focused command exited nonzero for five intended missing behaviors, passed 17 existing tests, and reported the exact `PHASE123_RED catalog activity ordering contract` sentinel.
- Focused GREEN: 25/25 snapshot, presentation, and browser-projection tests pass.
- Package build: protocol, client, core, CLI, service, and web packages build successfully.
- Built conformance: 4/4 Node contract tests pass.
- Workspace typecheck: every package passes.
- Architecture: `npm run test:deps` reports `Package architecture: OK`.
- Full post-wave gate: `npm test` passes 135 Vitest files / 1766 tests, 42 Node contract/runtime tests, and the complete OpenTUI test matrix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Compatibility] Kept required browser snapshot fields runnable before Plan 06**
- **Found during:** Task 2 typecheck and focused compatibility verification
- **Issue:** Making `activity_at` and `archived_workspaces` required immediately invalidated the web app's initial empty snapshot and the current browser projection.
- **Fix:** Added the empty archive collection to the initial snapshot, propagated active activity through the existing browser allowlist, and updated its security fixture.
- **Files modified:** `packages/web/src/app.ts`, `packages/service/src/web/projection.ts`, `tests/service/web-projection.test.ts`
- **Verification:** Web projection tests pass 3/3 and workspace typecheck is green.
- **Committed in:** `4f6cf0a8`

**2. [Rule 1 - Integration Regression] Aligned golden snapshots with the strict required fields**
- **Found during:** Wave 2 post-merge `npm test`
- **Issue:** The service-v1 trusted workspace golden omitted canonical persisted `activity_at`, while the secure runtime's inline empty browser golden omitted the required archived collection.
- **Fix:** Added an offset-aware persisted activity timestamp to the trusted fixture and `archived_workspaces: []` to the empty browser contract expectation without relaxing either schema.
- **Files modified:** `tests/fixtures/service-v1/workspace-snapshot.json`, `tests/service-node/secure-contract-runtime.test.mjs`
- **Verification:** The focused service contract suite passes 9/9, secure runtime passes 1/1, and the complete `npm test` gate passes.
- **Committed in:** `98a351c7`

---

**Total deviations:** 2 auto-fixed (1 missing critical compatibility seam, 1 integration fixture regression). **Impact:** The strict contract is usable immediately and every golden transport fixture now records its required bounded catalog fields without implementing the later archived browser UI ahead of Plan 06.

## Known Stubs

- `packages/service/src/web/projection.ts` currently emits an empty `archived_workspaces` collection because its existing input is the legacy active snapshot array. Plan 06 owns the browser catalog projection and will replace this intentional compatibility seam with authoritative archived summaries before the web UI ships.

## Issues Encountered

- The newly required active activity field exposed one pre-existing browser projection fixture that manually constructed a trusted snapshot without `activity_at`; the fixture now asserts the authoritative value survives projection.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can implement terminal admission and confirmed shutdown independently.
- Plan 04 can consume `buildCatalog`, lifecycle schemas, aggregate revision, and strict dirty-force details.
- Plans 06 and 07 can consume the same `workspaceSuccessorOrder` and activity-bearing catalog contracts.
- No blocker remains.

## Self-Check: PASSED

- Task commits `58e8a14b`, `4f6cf0a8`, and integration repair `98a351c7` exist in history.
- Every modified source and test file exists.
- All four coverage deliverables have current passing automated evidence.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
