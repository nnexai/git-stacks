---
phase: 84-local-coverage-gates-docs-and-release-prep
plan: 02
subsystem: testing
tags: [bun, coverage, commander, e2e-inventory, verify]

requires:
  - phase: 80-e2e-cli-harness-and-living-inventory
    provides: canonical machine-readable E2E inventory
  - phase: 83-istanbul-based-subprocess-coverage-reporting
    provides: stable `.coverage/` artifact surface
provides:
  - Aggregated local gate collector for inventory, mapped tests, and coverage artifacts
  - Stable `bun run verify` umbrella command
  - Direct `verify:prereqs` and `verify:gates` maintainer commands
affects: [local-verification, coverage, e2e-inventory, release-prep]

tech-stack:
  added: []
  patterns:
    - Commander command tree inspection through registered command modules
    - Local-only Bun script orchestration with explicit command printing

key-files:
  created:
    - scripts/verify-gates.ts
    - scripts/verify-prereqs.ts
    - scripts/verify.ts
    - tests/lib/verify-gates.test.ts
    - tests/lib/verify.test.ts
  modified:
    - package.json
    - src/lib/operation-runner.ts
    - tests/commands/repo-add.test.ts
    - tests/tui/workspace-clone.test.ts

key-decisions:
  - "Use `bun run verify` as the stable local umbrella command and keep existing component scripts intact."
  - "Validate coverage artifact presence and parseability without introducing numeric thresholds or CI requirements."
  - "Aggregate inventory, mapped-test, and coverage findings before exiting so maintainers get one actionable report."

patterns-established:
  - "Verification helpers expose testable functions and a thin CLI wrapper."
  - "Local release gates remain repository scripts rather than CI-only behavior."

requirements-completed: [GATE-01, GATE-02, GATE-03]

duration: 56min
completed: 2026-05-14
---

# Phase 84 Plan 02: Local Verify Workflow Summary

**Local verify workflow with aggregated inventory, mapped-test, and coverage artifact gates**

## Performance

- **Duration:** 56 min
- **Started:** 2026-05-14T18:51:00Z
- **Completed:** 2026-05-14T19:47:31Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `scripts/verify-gates.ts`, which compares the live Commander surface with `tests/e2e-inventory.ts`, checks mapped test paths, and validates Phase 83 `.coverage/` artifacts in one aggregated report.
- Added `scripts/verify.ts` as the stable `bun run verify` umbrella command, running prereqs, coverage refresh, gates, tests, dependency checks, and typecheck in order.
- Added `scripts/verify-prereqs.ts` for direct debugging of prerequisite Phase 80/83 surfaces.
- Preserved the existing `test`, `test:unit`, `test:integ`, `test:deps`, and `typecheck` script bodies.

## Task Commits

1. **Task 1 RED: Aggregated gate collector tests** - `75c880e` (test)
2. **Task 1 GREEN: Aggregated gate collector** - `ba48c66` (feat)
3. **Task 2 RED: Verify workflow tests** - `334f424` (test)
4. **Task 2 GREEN: Verify workflow wiring** - `c256d08` (feat)

## Files Created/Modified

- `scripts/verify-gates.ts` - Aggregates inventory drift, mapped-test gaps, missing mapped files, and coverage artifact validation.
- `scripts/verify-prereqs.ts` - Checks prerequisite inventory and coverage reporting surfaces.
- `scripts/verify.ts` - Runs the documented local verification sequence.
- `tests/lib/verify-gates.test.ts` - Locks collector aggregation and success behavior.
- `tests/lib/verify.test.ts` - Locks verify script order and package script preservation.
- `package.json` - Adds `verify`, `verify:prereqs`, and `verify:gates`.
- `src/lib/operation-runner.ts` - Removes a type-only import cycle exposed by `test:deps`.
- `tests/commands/repo-add.test.ts` - Tightens mock return types exposed by `typecheck`.
- `tests/tui/workspace-clone.test.ts` - Tightens mock predicate typing exposed by `typecheck`.

## Decisions Made

- Used the existing Bun script surface for all local gates; no CI files were added.
- Kept coverage policy to artifact existence and parseability only; no thresholds were added.
- Built the live CLI command surface from current command registrations rather than introducing a second inventory file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed dependency cycle surfaced by `bun run verify`**
- **Found during:** Task 2 (`bun run verify`)
- **Issue:** `test:deps` reported `lib/workspace-ops.ts > lib/workspace-lifecycle.ts > lib/operation-runner.ts`.
- **Fix:** Moved the `ProgressCallback` type into `src/lib/operation-runner.ts` to avoid importing from `workspace-ops`.
- **Files modified:** `src/lib/operation-runner.ts`
- **Verification:** `bun run test:deps`
- **Committed in:** `c256d08`

**2. [Rule 3 - Blocking] Fixed stale test mock types surfaced by `typecheck`**
- **Found during:** Task 2 (`bun run verify`)
- **Issue:** TypeScript rejected stale test mock inference in repo-add and workspace-clone tests.
- **Fix:** Added explicit mock return types and a safer prompt argument cast.
- **Files modified:** `tests/commands/repo-add.test.ts`, `tests/tui/workspace-clone.test.ts`
- **Verification:** `bun run typecheck`
- **Committed in:** `c256d08`

---

**Total deviations:** 2 auto-fixed (Rule 3)
**Impact on plan:** Both fixes were required for the planned `bun run verify` command to pass. No scope was added beyond local verification correctness.

## Issues Encountered

- The plan's `bun test ... -x` commands are no longer accepted by the current Bun test runner. The same focused tests were run without `-x`.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/verify-gates.test.ts`
- `bun test tests/lib/verify.test.ts`
- `bun run verify:prereqs && bun run verify:gates`
- `bun run test:deps`
- `bun run typecheck`
- `bun run verify`

## Known Stubs

None.

## Threat Flags

None.

## Next Phase Readiness

Phase 84 can now document `bun run verify` as the local maintainer path and prepare release metadata against a passing local gate surface.

## Self-Check: PASSED

- Created files exist: `scripts/verify-gates.ts`, `scripts/verify-prereqs.ts`, `scripts/verify.ts`, `tests/lib/verify-gates.test.ts`, `tests/lib/verify.test.ts`
- Commits exist: `75c880e`, `ba48c66`, `334f424`, `c256d08`

---
*Phase: 84-local-coverage-gates-docs-and-release-prep*
*Completed: 2026-05-14*
