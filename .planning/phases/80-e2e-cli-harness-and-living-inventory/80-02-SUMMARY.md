---
phase: 80-e2e-cli-harness-and-living-inventory
plan: 02
subsystem: testing
tags: [e2e, inventory, typescript, validation]
requires:
  - phase: 80-e2e-cli-harness-and-living-inventory
    provides: shared CLI harness and fixture builders
provides:
  - Canonical typed E2E inventory
  - First-class explicit exclusion entries
  - Duplicate ID and unmapped in-scope selectors
  - Inventory regression tests
affects: [phase-81, phase-82, phase-82.1, phase-83, phase-84, tests]
tech-stack:
  added: []
  patterns: [typed inventory data, pure selector validators, explicit exclusion metadata]
key-files:
  created: [tests/e2e-inventory.ts, tests/lib/e2e-inventory.test.ts]
  modified: []
key-decisions:
  - "The canonical E2E inventory is TypeScript data under tests/."
  - "Scope exclusions are represented as first-class inventory entries."
requirements-completed: [E2E-01, E2E-02, E2E-03]
duration: 35 min
completed: 2026-05-14
---

# Phase 80 Plan 02: E2E Inventory Summary

**Typed E2E inventory with stable flow IDs, explicit non-TUI/non-integration exclusions, and reusable duplicate/unmapped validators**

## Performance

- **Duration:** 35 min
- **Started:** 2026-05-14T00:45:00Z
- **Completed:** 2026-05-14T01:20:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `tests/e2e-inventory.ts` as the canonical machine-parseable inventory for v0.17.1 E2E scope.
- Added all required stable IDs for workspace, template, repo, label, message, support, and exclusion entries.
- Added explicit exclusions for TUI, external integration behavior, editor-launching flows, wizard-only flows, install prompts, and the v0.17.0 rollback-visibility audit gap.
- Added selectors and validators: `getInventoryItem`, `getInScopeItems`, `getExcludedItems`, `getDuplicateInventoryIds`, `getUnmappedInScopeItems`, and `validateE2EInventory`.
- Added `tests/lib/e2e-inventory.test.ts` to lock exclusions, duplicate detection, unmapped detection, validation shape, and mapping path invariants.

## Task Commits

1. **Task 1: Create the canonical typed flow inventory module** - `506302b`
2. **Task 2: Add duplicate-ID and unmapped-flow validator tests** - `506302b`

**Plan metadata:** committed with the Phase 80 summary closeout.

## Files Created/Modified

- `tests/e2e-inventory.ts` - Canonical typed inventory plus reusable selectors and validators.
- `tests/lib/e2e-inventory.test.ts` - Inventory regression tests.

## Decisions Made

- Used flow-level entries instead of raw command-tree mirroring so later phases can map user-visible behavior rather than every parser node.
- Kept validation pure and local to the module; no help-output parsing or markdown generation.
- Left later-phase in-scope items intentionally unmapped where coverage is planned but not yet implemented.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted the plan's targeted Bun test command**
- **Found during:** Task verification
- **Issue:** `bun test tests/lib/e2e-inventory.test.ts -x` fails because Bun 1.3.10 does not support `-x`.
- **Fix:** Ran the equivalent targeted command without the unsupported flag.
- **Files modified:** None
- **Verification:** `bun test tests/lib/e2e-inventory.test.ts` passed.
- **Committed in:** N/A

---

**Total deviations:** 1 auto-fixed (runtime command drift).  
**Impact on plan:** No scope change; verification used the supported equivalent command.

## Issues Encountered

- Bun rejected the plan's `-x` flag; verification used supported Bun commands instead.

## Verification

- `bun test tests/lib/e2e-inventory.test.ts` - passed
- `bun run typecheck` - passed
- `bun run test` - passed, unit PASS and integration 50/50

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- Required inventory exports exist in `tests/e2e-inventory.ts`.
- Required regression tests exist in `tests/lib/e2e-inventory.test.ts`.
- Required exclusion IDs and baseline mapped test paths are present.
- Plan-level verification commands passed using supported Bun syntax.

## Next Phase Readiness

Phase 80 is complete. Phase 81 can now consume `runCli()` and update `tests/e2e-inventory.ts` mappings while adding workspace and git-operation E2E coverage.

---
*Phase: 80-e2e-cli-harness-and-living-inventory*
*Completed: 2026-05-14*
