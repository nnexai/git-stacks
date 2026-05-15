---
phase: 88-functional-coverage-readiness-gate
plan: 01
subsystem: testing
tags: [coverage, readiness, gates, functional-confidence]
requires:
  - phase: 85-core-real-fixture-functional-hardening
    provides: core real-fixture coverage targets
  - phase: 86-workspace-command-workflow-edge-coverage
    provides: workspace command workflow coverage targets
  - phase: 87-integration-contract-and-source-module-coverage
    provides: integration source contract coverage targets
provides:
  - typed functional readiness inventory
  - canonical coverage readiness collector
  - pre-finalization v0.17.1 readiness evidence
affects: [verify-gates, release-readiness, v0.17.1]
tech-stack:
  added: []
  patterns: [guarded coverage JSON parsing, fixture-driven readiness classification]
key-files:
  created:
    - tests/functional-readiness-inventory.ts
    - scripts/functional-coverage-readiness.ts
    - tests/lib/functional-coverage-readiness.test.ts
    - .planning/v0.17.1-FUNCTIONAL-COVERAGE-READINESS.md
  modified: []
key-decisions:
  - "Functional readiness uses targeted source sentinels from Phases 85-87 instead of numeric coverage thresholds."
  - "Readiness evidence remains pre-finalization only; archive, tag, publish, cleanup, and $gsd-complete-milestone stay outside Phase 88."
patterns-established:
  - "Functional readiness categories are machine-readable: covered, accepted-gap, deferred-external-environment, must-fix-before-release."
requirements-completed: [GATE-04, COVR-05]
duration: 4 min
completed: 2026-05-15
---

# Phase 88 Plan 01: Functional Coverage Readiness Model Summary

**Typed readiness inventory and canonical coverage collector that classify Phase 85-87 functional confidence without milestone finalization**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-15T05:55:30Z
- **Completed:** 2026-05-15T05:59:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `FUNCTIONAL_READINESS_AREAS` as the machine-readable source of truth for covered, accepted-gap, deferred-external-environment, and must-fix-before-release categories.
- Added `collectFunctionalCoverageReadiness()` and `formatFunctionalCoverageReadiness()` to parse `.coverage/coverage-final.json` and report actionable malformed/missing input or uncovered required source targets.
- Added pre-finalization readiness evidence that distinguishes green suite, covered source, and functional confidence while explicitly excluding archive/tag/publish/finalization work.

## Task Commits

1. **Task 1 RED: failing functional readiness tests** - `ac753a2` (test)
2. **Task 1 GREEN: functional readiness inventory and collector** - `efd5261` (feat)
3. **Task 2: functional readiness evidence** - `d4c1331` (docs)

## Files Created/Modified

- `tests/functional-readiness-inventory.ts` - Typed readiness categories and Phase 85-87 source target inventory.
- `scripts/functional-coverage-readiness.ts` - Collector, formatter, and CLI for canonical readiness checks.
- `tests/lib/functional-coverage-readiness.test.ts` - Fixture tests for covered, accepted, deferred, must-fix, missing, and malformed input cases.
- `.planning/v0.17.1-FUNCTIONAL-COVERAGE-READINESS.md` - Pre-finalization evidence and checklist.

## Decisions Made

- Functional readiness is sentinel-based for Phase 88; COVR-05 remains open to future numeric thresholds after the coverage source stabilizes.
- Missing or malformed `.coverage/coverage-final.json` is a structured report problem, not an uncaught CLI exception.
- External-environment gaps are visible as deferred coverage rather than release blockers when source-level contracts are covered.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 88-02 to integrate functional readiness into `verify:gates`, update maintainer docs, and run full local verification.

## Self-Check: PASSED

- Verified files exist: `tests/functional-readiness-inventory.ts`, `scripts/functional-coverage-readiness.ts`, `tests/lib/functional-coverage-readiness.test.ts`, `.planning/v0.17.1-FUNCTIONAL-COVERAGE-READINESS.md`.
- Verified commits exist: `ac753a2`, `efd5261`, `d4c1331`.
- Verification passed: `bun test tests/lib/functional-coverage-readiness.test.ts`.
- Acceptance checks passed for category strings, default `coverage-final.json` input, and evidence wording.

---
*Phase: 88-functional-coverage-readiness-gate*
*Completed: 2026-05-15*
