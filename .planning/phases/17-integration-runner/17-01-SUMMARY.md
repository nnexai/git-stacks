---
phase: 17-integration-runner
plan: 01
subsystem: integrations
tags: [typescript, bun, integration-runner, ordering, artifact-bag]

# Dependency graph
requires:
  - phase: 16-artifact-type-foundation
    provides: ArtifactBag, IntegrationArtifact types and open() signature with bag parameter
provides:
  - order: number field on Integration interface (tier 1/2/3 numeric ordering)
  - runner.ts with runIntegrationGenerate() and runIntegrations() centralized runner
  - Unit tests covering ordering, skip, accumulation, isEnabled, applies, no-generate edge cases
affects: [18-artifact-population, 19-niri-shell-wrappers, 20-niri-integration, workspace-ops, workspace-wizard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sorted integration execution: [...integrations].sort((a,b) => a.order - b.order) spread-sort pattern"
    - "Runner imports integrations directly from index.ts (not as parameter) — enables mock.module test isolation"

key-files:
  created:
    - src/lib/integrations/runner.ts
    - tests/lib/integrations/runner.test.ts
  modified:
    - src/lib/integrations/types.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/intellij.ts
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/cmux.ts
    - tests/lib/integrations/wizard-helpers.test.ts

key-decisions:
  - "vscode=10, intellij=11, tmux=12 (tier 1: independent setup), cmux=20 (tier 2: side-effects) — preserves existing array order within tier 1"
  - "runner.ts imports integrations array directly from index.ts not as function parameter — enables mock.module substitution in tests"
  - "Spread-sort pattern [...integrations].sort() avoids mutating the exported array in index.ts"

patterns-established:
  - "TDD RED-GREEN for new modules: write failing tests first, commit, then implement"
  - "Query-param cache-busting: import('@/lib/integrations/runner?unit-test') — consistent with wizard-helpers.test.ts pattern"
  - "callOrder string[] tracker array to assert execution order across mock calls"

requirements-completed: [ORCH-03, ORCH-04, ORCH-06, ORCH-07, TEST-02]

# Metrics
duration: 15min
completed: 2026-03-21
---

# Phase 17 Plan 01: Integration Runner Summary

**Numeric `order` field on Integration interface with tier-based runner module (runIntegrationGenerate + runIntegrations) sorting ascending before iteration, tested via TDD with 14 unit tests.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-21T23:00:00Z
- **Completed:** 2026-03-21T23:15:00Z
- **Tasks:** 2
- **Files modified:** 8 (6 modified + 2 created)

## Accomplishments

- Added `order: number` to Integration interface with JSDoc tier documentation (tier 1=10-19, tier 2=20-29, tier 3=30-39)
- Assigned tier-appropriate order values to all four integrations (vscode=10, intellij=11, tmux=12, cmux=20)
- Created `runner.ts` with `runIntegrationGenerate()` and `runIntegrations()` — both sort by ascending order before iterating
- `runIntegrations()` supports skip Set and accumulates ArtifactBag, passing it to each subsequent open() call
- 14 unit tests in `runner.test.ts` covering ordering, skip, accumulation, isEnabled=false, applies=false, no-generate edge case

## Task Commits

Each task was committed atomically:

1. **Task 1: Add order field to Integration interface and all implementations** - `7d63788` (feat)
2. **Task 2 RED: Failing tests for runner module** - `c4481f1` (test)
3. **Task 2 GREEN: Create centralized integration runner module** - `a5193c4` (feat)

_Note: TDD task 2 has two commits (test → feat)_

## Files Created/Modified

- `src/lib/integrations/types.ts` - Added `order: number` field to Integration interface with JSDoc tier documentation
- `src/lib/integrations/vscode.ts` - Added `order: 10`
- `src/lib/integrations/intellij.ts` - Added `order: 11`
- `src/lib/integrations/tmux.ts` - Added `order: 12`
- `src/lib/integrations/cmux.ts` - Added `order: 20`
- `tests/lib/integrations/wizard-helpers.test.ts` - Added `order` to both fake integrations
- `src/lib/integrations/runner.ts` - New: centralized runner with runIntegrationGenerate() and runIntegrations()
- `tests/lib/integrations/runner.test.ts` - New: 14 unit tests for runner module

## Decisions Made

- vscode=10, intellij=11, tmux=12 preserves existing array order within tier 1 (all independent setup integrations)
- cmux=20 is tier 2 because it may consume tmux artifacts in future (INT-01 per STATE.md)
- Runner imports `integrations` array directly from `index.ts` (not passed as parameter) — enables `mock.module` substitution in tests
- Spread-sort `[...integrations].sort()` avoids mutating the exported array in-place

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — runner.ts is fully functional; no hardcoded placeholders.

## Next Phase Readiness

- Plan 02 can now replace inline integration loops in `workspace-ops.ts` and `workspace-wizard.ts` with calls to `runIntegrationGenerate()` and `runIntegrations()`
- The `skip` Set parameter in `runIntegrations()` matches the existing pattern in workspace-ops.ts line 575
- All 389 tests pass with no regressions

---
*Phase: 17-integration-runner*
*Completed: 2026-03-21*

## Self-Check: PASSED

- FOUND: src/lib/integrations/runner.ts
- FOUND: tests/lib/integrations/runner.test.ts
- FOUND: .planning/phases/17-integration-runner/17-01-SUMMARY.md
- FOUND: commit 7d63788 (feat: order field)
- FOUND: commit c4481f1 (test: failing runner tests)
- FOUND: commit a5193c4 (feat: runner module)
