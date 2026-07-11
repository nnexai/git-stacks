---
phase: 104-workspace-service-and-event-contract
plan: "02"
subsystem: service-snapshots
tags: [aggregate-snapshot, revision, launch-context, redaction, tdd]
requires:
  - phase: 104-01
    provides: Strict v1 wire schemas and stable workspace/repository identities
provides:
  - Internally consistent aggregate workspace snapshots with bounded race retry
  - Durable digest-derived monotonic snapshot revisions
  - Secret-safe authoritative shell and named-command launch contexts
affects: [104-06, phase-105, phase-107]
tech-stack:
  added: []
  patterns: [pre-post authoritative fingerprint, canonical projection digest, explicit secret allowlist]
key-files:
  created:
    - src/lib/service/snapshot.ts
    - tests/lib/service/snapshot.test.ts
    - tests/lib/service/launch-context.test.ts
  modified:
    - src/lib/service/contract.ts
key-decisions:
  - "Snapshot revision changes are driven only by the canonical contract-visible projection; diagnostic timestamps are excluded."
  - "Launch environments use an explicit safe projection and retain secret references as metadata without resolved values."
requirements-completed: [SVC-02, SVC-03, SVC-04]
coverage:
  - id: D1
    description: Consistent identity-complete aggregate snapshots with bounded retry and durable monotonic revisions
    requirement: SVC-02
    verification:
      - kind: unit
        ref: tests/lib/service/snapshot.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Authoritative workspace and repository launch specifications with resolved cwd, steps, ports, and environment
    requirement: SVC-03
    verification:
      - kind: unit
        ref: tests/lib/service/launch-context.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Existing command and environment semantics remain the single projection boundary
    requirement: SVC-04
    verification:
      - kind: unit
        ref: bun test tests/lib/service/launch-context.test.ts tests/lib/workspace-command.test.ts tests/lib/workspace-env.test.ts
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 02: Aggregate Snapshot and Launch Context Summary

**Race-consistent workspace aggregates with durable content revisions and secret-safe resolved launch specifications**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-11T11:38:33Z
- **Completed:** 2026-07-11T11:44:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Built identity-complete aggregate snapshots that retry concurrent input changes three times and fail with structured `snapshot_busy` semantics instead of returning mixed generations.
- Added serialized atomic revision metadata that reuses revisions for canonically equal projections across restarts and advances exactly once for visible changes.
- Projected ordered workspace/repository launch steps, cwd, ports, and safe environment values while omitting resolved secrets and preserving reference metadata.

## Task Commits

1. **Task 1 RED: snapshot consistency and revision tests** - `befbab3`
2. **Task 1 GREEN: consistent revisioned snapshots** - `62c8a25`
3. **Task 2 RED: launch projection tests** - `b67f92b`
4. **Task 2 GREEN: secret-safe launch contexts** - `fc93f3a`
5. **Task 1 hardening: fingerprint live Git inputs** - `fa09b00`

## Files Created/Modified

- `src/lib/service/snapshot.ts` - Aggregate builder, production fingerprints, durable revision store, and launch projection.
- `src/lib/service/contract.ts` - Strict aggregate status, command-step, launch metadata, and `snapshot_busy` vocabulary.
- `tests/lib/service/snapshot.test.ts` - Race, retry-bound, restart, revision, timestamp, identity, and all-workspace coverage.
- `tests/lib/service/launch-context.test.ts` - Ordered command steps, repository binding, ports, hidden commands, and secret omission coverage.

## Decisions Made

- Canonically hash only contract-visible projection data, excluding `generated_at`, so diagnostics never cause false revision churn.
- Preserve existing command ordering and visibility by planning only names returned from `listManualCommands`; snapshot construction never invokes command runners.
- Remove secret-referenced keys from every projected environment and expose only resolver/reference metadata.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended the strict wire schema for required aggregate fields**
- **Found during:** Task 1
- **Issue:** The Phase 104-01 contract did not yet describe aggregate command/status fields or structured launch steps required by this plan.
- **Fix:** Added strict optional aggregate and launch schemas while preserving the existing golden fixture contract.
- **Files modified:** `src/lib/service/contract.ts`
- **Verification:** Contract, snapshot, launch-context, and typecheck suites pass.
- **Committed in:** `62c8a25`, `fc93f3a`

**2. [Rule 1 - Correctness] Fingerprinted live Git state in the production adapter**
- **Found during:** Plan-level review
- **Issue:** Filesystem metadata alone would not reliably detect modified tracked-file content.
- **Fix:** Included workspace YAML content and Git porcelain-v2 branch/worktree state in pre/post fingerprints.
- **Files modified:** `src/lib/service/snapshot.ts`
- **Verification:** Focused suites, 719-test unit suite, typecheck, and dependency graph pass.
- **Committed in:** `fa09b00`

---

**Total deviations:** 2 auto-fixed (1 missing critical functionality, 1 correctness fix)
**Impact on plan:** Both changes are required to enforce the planned strict aggregate and consistency guarantees; no unrelated scope was added.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/service/snapshot.test.ts tests/lib/service/launch-context.test.ts` — 7 passed, 0 failed.
- `bun test tests/lib/service/launch-context.test.ts tests/lib/workspace-command.test.ts tests/lib/workspace-env.test.ts` — 13 passed, 0 failed.
- `bun run test:unit` — 719 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.

## Next Phase Readiness

- Plan 104-06 can expose aggregate snapshots directly through authenticated loopback routes.
- Native clients can launch shells and named commands without reading YAML or receiving resolved secret values.
- No blockers.

## Self-Check: PASSED

- All four key files exist.
- All RED/GREEN and hardening commits exist in order.
- Plan-level tests, unit suite, typecheck, and dependency graph checks pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
