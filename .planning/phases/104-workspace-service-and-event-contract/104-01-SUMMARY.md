---
phase: 104-workspace-service-and-event-contract
plan: "01"
subsystem: service-contract
tags: [zod, json-contract, uuid, yaml, tdd]
requires: []
provides:
  - Strict versioned service wire schemas and inferred TypeScript types
  - Golden discovery and workspace snapshot JSON fixtures
  - Lazy atomic workspace and repository UUID migration
affects: [104-02, 104-03, 104-04, 104-05, 104-06, phase-105]
tech-stack:
  added: []
  patterns: [strict Zod wire boundaries, append-only optional persisted identity, lock-serialized atomic migration]
key-files:
  created:
    - src/lib/service/contract.ts
    - src/lib/service/identity.ts
    - tests/lib/service/contract.test.ts
    - tests/lib/service/identity.test.ts
    - tests/fixtures/service-v1/discovery.json
    - tests/fixtures/service-v1/workspace-snapshot.json
  modified:
    - src/lib/config.ts
key-decisions:
  - "Wire identifiers are UUIDs while request and operation IDs use explicitly prefixed opaque strings."
  - "Identity migration is service-only, lock-serialized, validated, fsynced, and atomically renamed."
requirements-completed: [SVC-01, SVC-02, SVC-04]
coverage:
  - id: D1
    description: Strict v1 discovery, snapshot, error, operation, launch, cursor, and event contract
    requirement: SVC-01
    verification:
      - kind: unit
        ref: tests/lib/service/contract.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Stable workspace and repository identities persist across service reads and renames
    requirement: SVC-02
    verification:
      - kind: unit
        ref: tests/lib/service/identity.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Existing name-based workspace config behavior remains compatible
    requirement: SVC-04
    verification:
      - kind: unit
        ref: tests/lib/config.test.ts
        status: pass
    human_judgment: false
duration: 11min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 01: Service Contract and Stable Identity Summary

**Strict fixture-backed v1 wire schemas plus atomic, rename-safe workspace and repository identities**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-11T11:27:36Z
- **Completed:** 2026-07-11T11:38:36Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Defined strict Zod schemas and inferred types for the complete v1 discovery, envelope, snapshot, launch, operation, cursor, replay-gap, and event vocabulary.
- Added exact cross-language discovery and workspace snapshot fixtures with rejection coverage for unknown, malformed, and sensitive fields.
- Added service-only lazy UUID migration that preserves existing name-based config callers and serializes validated atomic persistence.

## Task Commits

1. **Task 1 RED: contract fixtures and failing tests** - `a7f47b5`
2. **Task 1 GREEN: strict v1 service contract** - `5eded22`
3. **Task 2 RED: identity migration tests** - `8810701`
4. **Task 2 GREEN: stable lazy identities** - `c89de8c`

## Files Created/Modified

- `src/lib/service/contract.ts` - Canonical strict service wire schemas and inferred types.
- `src/lib/service/identity.ts` - Lazy, lock-serialized, atomic identity migration.
- `src/lib/config.ts` - Optional UUID fields, validated workspace writes, and persisted-file lookup.
- `tests/lib/service/contract.test.ts` - Golden parsing and trust-boundary rejection tests.
- `tests/lib/service/identity.test.ts` - Persistence, rename, restart, and symlink safety tests.
- `tests/fixtures/service-v1/discovery.json` - Discovery contract fixture.
- `tests/fixtures/service-v1/workspace-snapshot.json` - Aggregate snapshot contract fixture.

## Decisions Made

- Used UUIDs for persisted entities and distinct prefixed opaque strings for request and operation IDs so callers cannot confuse identifier domains.
- Kept identity migration outside ordinary CLI reads and wrote back to the discovered YAML file, preserving filename drift and name-based behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/service/contract.test.ts tests/lib/service/identity.test.ts tests/lib/config.test.ts` — 120 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.

## Next Phase Readiness

- Snapshot construction and subsequent transport plans can import one canonical contract.
- Phase 105 can consume exact JSON fixtures without inferring TypeScript internals.
- No blockers.

## Self-Check: PASSED

- All seven key created/modified files exist.
- All four TDD task commits exist.
- Plan-level tests, typecheck, and dependency graph checks pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
