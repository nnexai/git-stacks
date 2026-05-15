---
phase: 87-integration-contract-and-source-module-coverage
plan: 04
subsystem: testing
tags: [coverage, integrations, gates, source-audit]

requires:
  - phase: 87-integration-contract-and-source-module-coverage
    provides: real-source integration tests from Plans 01-03
provides:
  - Phase 87 source-bypassing mock audit notes
  - Phase 87 integration coverage hit evidence
  - coverage runner classification for local integration contract tests
affects: [phase-87, integration-coverage, phase-88-readiness]

tech-stack:
  added: []
  patterns:
    - Local tests/lib/integrations contract tests are included in unit coverage
    - Coverage notes record deferred external environments separately from local source coverage

key-files:
  created:
    - .planning/phases/87-integration-contract-and-source-module-coverage/87-COVERAGE-NOTES.md
    - .planning/phases/87-integration-contract-and-source-module-coverage/87-04-SUMMARY.md
  modified:
    - scripts/coverage-runner.ts

key-decisions:
  - "Local tests/lib/integrations contract tests belong in coverage:unit because they exercise source modules through injected executors and mocks, not real external environments."
  - "Phase 87 coverage notes hand final readiness classification to Phase 88 and do not claim live forge, browser, editor, IDE, or window-manager readiness."

patterns-established:
  - "Phase coverage notes must distinguish source-module coverage evidence from deferred external-environment validation."
  - "coverage:unit includes local integration contract tests when they are unit-style source tests under mocked external seams."

requirements-completed: [INTG-02, INTG-03, INTG-04, GATE-03]

duration: 12 min
completed: 2026-05-15
---

# Phase 87 Plan 04: Coverage Audit And Gate Summary

**Phase 87 now has source-copy audit notes, nonzero coverage hits for every named integration source module, and green local coverage gates.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-15T05:48:00Z
- **Completed:** 2026-05-15T06:00:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `87-COVERAGE-NOTES.md` with the required source-bypassing mock audit, real source module list, deferred external environment list, and Phase 88 handoff.
- Verified the banned inline utility-source patterns are absent from the utility integration tests.
- Updated `coverage:unit` classification so local `tests/lib/integrations/**` source contract tests contribute to unit coverage.
- Ran the canonical gates and recorded coverage hit counts for all Phase 87 source modules.

## Task Commits

1. **Task 1: Audit integration tests for source-bypassing utility copies** - `c430f4d` (docs)
2. **Task 2: Verify integration coverage and local gates** - `e32f59b` (fix)

## Files Created/Modified

- `.planning/phases/87-integration-contract-and-source-module-coverage/87-COVERAGE-NOTES.md` - Audit, deferred-scope, handoff, and coverage verification record.
- `scripts/coverage-runner.ts` - Classifies local integration contract tests as unit coverage inputs.
- `.planning/phases/87-integration-contract-and-source-module-coverage/87-04-SUMMARY.md` - Execution summary and self-check record.

## Decisions Made

- Included `tests/lib/integrations/**` in `coverage:unit` because those tests use mocked external seams while exercising real integration source modules.
- Kept live forge auth, real browsers, real editors/IDEs, real window managers, and final readiness classification explicitly deferred to Phase 88 or later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Included local integration contract tests in unit coverage**
- **Found during:** Task 2 (Verify integration coverage and local gates)
- **Issue:** `bun run coverage:unit` passed but skipped mock-based `tests/lib/integrations/**` tests, leaving Phase 87 source modules zero-hit or low-hit in `.coverage/coverage-final.json`.
- **Fix:** Classified `tests/lib/integrations/**` as unit coverage inputs before the generic mock-module integration classification.
- **Files modified:** `scripts/coverage-runner.ts`, `.planning/phases/87-integration-contract-and-source-module-coverage/87-COVERAGE-NOTES.md`
- **Verification:** `bun run coverage:unit`, `bun run verify:gates`, `bun run typecheck`, and direct `.coverage/coverage-final.json` hit inspection.
- **Committed in:** `e32f59b`

**Total deviations:** 1 auto-fixed (Rule 3 blocking).
**Impact on plan:** Required for the planned coverage verification to measure the real Phase 87 source modules. No external environment scope was added.

## Issues Encountered

The first `coverage:unit` run passed but did not include the Phase 87 local integration contract tests. The runner classification fix resolved the coverage evidence gap.

## User Setup Required

None - no external service configuration required.

## Verification

- `! rg -n "Inline the source implementations|This bypasses the stale mock|function resolveIssueRef|function resolveForgeRepo\\(" tests/lib/integrations/issue-utils.test.ts tests/lib/integrations/forge-utils.test.ts` - PASS
- `test -f .planning/phases/87-integration-contract-and-source-module-coverage/87-COVERAGE-NOTES.md` - PASS
- `bun run coverage:unit` - PASS
- `bun run verify:gates` - PASS
- `bun run typecheck` - PASS
- `.coverage/coverage-final.json` hit inspection - PASS, all named Phase 87 modules had nonzero statement or function hits.

## Known Stubs

None. Stub scan found only normal empty accumulator initializers in `scripts/coverage-runner.ts`, not user-facing placeholders or unwired data.

## Next Phase Readiness

Phase 87 local source-module coverage evidence is ready for Phase 88. Phase 88 still owns final release readiness and any live external-environment validation.

## Self-Check: PASSED

- Created summary exists.
- Task commits exist: `c430f4d`, `e32f59b`.
- Coverage notes exist and include verification results.
- `coverage:unit`, `verify:gates`, and `typecheck` passed after the runner classification fix.

---
*Phase: 87-integration-contract-and-source-module-coverage*
*Completed: 2026-05-15*
