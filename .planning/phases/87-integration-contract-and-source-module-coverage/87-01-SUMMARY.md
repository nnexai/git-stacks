---
phase: 87-integration-contract-and-source-module-coverage
plan: 01
subsystem: testing
tags: [integrations, issue-utils, forge-utils, source-coverage, bun]

requires:
  - phase: 81.1-repo-add-honors-enabled-forge-integrations
    provides: global enabled-forge allowlist semantics
provides:
  - Real-source issue utility contract tests
  - Real-source forge utility contract tests
  - Grep-enforced removal of source-copying utility mocks
affects: [phase-87, integration-coverage, phase-88-readiness]

tech-stack:
  added: []
  patterns:
    - Dynamic real module import after dependency-boundary mocks
    - Mutable exported detection seams for forge environment simulation

key-files:
  created:
    - .planning/phases/87-integration-contract-and-source-module-coverage/87-01-SUMMARY.md
  modified:
    - tests/lib/integrations/issue-utils.test.ts
    - tests/lib/integrations/forge-utils.test.ts

key-decisions:
  - "Utility tests now import real integration source modules instead of mocking the module under test with pasted implementation logic."
  - "Mocks remain limited to config, workspace detection, and forge environment detection boundaries."

patterns-established:
  - "Real-source utility tests register dependency mocks first, then dynamically import the integration module under test."
  - "Forge utility tests mutate the exported `_detect` seam rather than replacing forge utility source."

requirements-completed: [INTG-02, GATE-03]

duration: 18 min
completed: 2026-05-15
---

# Phase 87 Plan 01: Utility Source Coverage Summary

**Issue and forge utility tests now execute real integration source modules while mocking only dependency boundaries.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-15T05:21:00Z
- **Completed:** 2026-05-15T05:38:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced the inline `issue-utils` implementation mock with a real `@/lib/integrations/issue-utils` import after config and workspace-status mocks.
- Added real-source `resolveWorkspaceArg()` coverage for explicit workspace success, CWD detection success, missing workspace exit, and undetected CWD exit.
- Replaced the inline `forge-utils` implementation mock with a real `@/lib/integrations/forge-utils` import and exercised exported `_detect` seams plus `resolveForgeRepoAnyMode()`.

## Task Commits

1. **Task 1: Replace inline issue-utils implementation copies with real source imports** - `3b4c439` (test)
2. **Task 2: Replace inline forge-utils implementation copies with real source imports** - `3681c19` (test)
3. **Auto-fix: Typecheck cleanup for utility tests** - `da54dbb` (fix)

## Files Created/Modified

- `tests/lib/integrations/issue-utils.test.ts` - Uses real issue utility source with config and workspace-status mocks.
- `tests/lib/integrations/forge-utils.test.ts` - Uses real forge utility source with config mocks and exported detection seams.
- `.planning/phases/87-integration-contract-and-source-module-coverage/87-01-SUMMARY.md` - Execution summary and verification record.

## Decisions Made

- Tests no longer mock the source utility modules under test.
- `resolveWorkspaceArg()` exit-path tests use temporary `process.exit` and `console.error` mocks so failure branches are covered without ending the test process.
- Forge any-mode behavior is covered through the real exported `resolveForgeRepoAnyMode()` helper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed utility test typecheck regressions**
- **Found during:** Plan verification
- **Issue:** `bun run typecheck` reported an unused `ForgeType` import and overly narrow `console.error` mock argument typing.
- **Fix:** Removed the unused type import and typed `console.error` mocks with a string message argument.
- **Files modified:** `tests/lib/integrations/issue-utils.test.ts`, `tests/lib/integrations/forge-utils.test.ts`
- **Verification:** `bun run typecheck`
- **Committed in:** `da54dbb`

**Total deviations:** 1 auto-fixed (Rule 1 bug).
**Impact on plan:** Type-only cleanup required for the planned verification gate; no scope expansion.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/integrations/issue-utils.test.ts` - PASS
- `bun test tests/lib/integrations/forge-utils.test.ts` - PASS
- `bun test tests/lib/integrations/issue-utils.test.ts tests/lib/integrations/forge-utils.test.ts` - PASS
- `bun run test:unit` - PASS
- `bun run typecheck` - PASS
- `rg` inline source-copy grep gates - PASS

## Next Phase Readiness

Plan 87-02 can build on the same injected-executor testing boundary for forge command modules.

## Self-Check: PASSED

- Created summary exists.
- Task commits exist: `3b4c439`, `3681c19`, `da54dbb`.
- Key files modified as planned.

---
*Phase: 87-integration-contract-and-source-module-coverage*
*Completed: 2026-05-15*
