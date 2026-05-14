---
phase: 80-e2e-cli-harness-and-living-inventory
plan: 01
subsystem: testing
tags: [e2e, bun, cli, fixtures, diagnostics]
requires:
  - phase: 79-release-prep
    provides: v0.17.0 baseline CLI behavior
provides:
  - Shared real-process CLI subprocess helper
  - Redacted failure formatter for E2E assertions
  - Small config, registry, template, and workspace fixture builders
  - Harness proof tests for isolation, diagnostics, and persisted YAML assertions
affects: [phase-81, phase-82, phase-82.1, phase-84, tests]
tech-stack:
  added: []
  patterns: [Bun.spawnSync argv-array CLI harness, isolated GIT_STACKS_CONFIG_DIR fixtures]
key-files:
  created: [tests/commands/e2e-harness.test.ts]
  modified: [tests/helpers.ts]
key-decisions:
  - "Extended tests/helpers.ts instead of creating a new E2E subsystem."
  - "Kept helper output diagnostic-only; assertions stay in command test files."
requirements-completed: [E2E-04, E2E-05, E2E-06, E2E-07]
duration: 45 min
completed: 2026-05-14
---

# Phase 80 Plan 01: E2E CLI Harness Summary

**Shared Bun subprocess harness for real `git-stacks` CLI tests with isolated git/app config, fixture builders, and redacted diagnostics**

## Performance

- **Duration:** 45 min
- **Started:** 2026-05-14T00:00:00Z
- **Completed:** 2026-05-14T00:45:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `runCli()` to standardize real-process `git-stacks` invocations through `Bun.spawnSync(["bun", "run", "src/index.ts", ...argv])`.
- Added env shaping from `getTestGitEnv()` plus forced `GIT_STACKS_CONFIG_DIR` isolation and allowlisted env previews.
- Added `formatCliFailure()` so failed assertions can include argv, cwd, exit code, stdout, stderr, artifact paths, and redacted env context.
- Added small fixture builders for config, registry, template, and workspace YAML setup.
- Added `tests/commands/e2e-harness.test.ts` proving isolation, redaction, fixture setup, `label add` YAML mutation, and `template list` fixture consumption.

## Task Commits

1. **Task 1: Add the shared real-process CLI wrapper and redacted diagnostics** - `f934c1f`
2. **Task 2: Add small fixture builders and prove YAML/file assertions through the harness** - `f934c1f`

**Plan metadata:** committed with the Phase 80 summary closeout.

## Files Created/Modified

- `tests/helpers.ts` - Exports `TEST_CLI_ENV_ALLOWLIST`, `runCli`, `formatCliFailure`, and fixture builders.
- `tests/commands/e2e-harness.test.ts` - Proves the shared harness behavior against the real CLI.

## Decisions Made

- Kept the harness as a thin standardization of existing command-test subprocess patterns.
- Did not add scenario DSLs or helper-owned assertions; command tests remain responsible for assertions.
- Kept diagnostics quiet unless tests call `formatCliFailure()` in assertion messages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted the plan's targeted Bun test command**
- **Found during:** Task verification
- **Issue:** `bun test tests/commands/e2e-harness.test.ts -x` fails because Bun 1.3.10 does not support `-x`.
- **Fix:** Ran the equivalent targeted command without the unsupported flag.
- **Files modified:** None
- **Verification:** `bun test tests/commands/e2e-harness.test.ts` passed.
- **Committed in:** N/A

**2. [Rule 3 - Blocking] Completed the workspace YAML fixture shape**
- **Found during:** Task 2 verification
- **Issue:** The proof workspace YAML lacked required `created` and repo `main_path` fields, so `label add` could not find the workspace.
- **Fix:** Added the required fields to the test fixture.
- **Files modified:** `tests/commands/e2e-harness.test.ts`
- **Verification:** `bun test tests/commands/e2e-harness.test.ts` and `bun run typecheck` passed.
- **Committed in:** `f934c1f`

---

**Total deviations:** 2 auto-fixed (blocking verification/runtime drift).  
**Impact on plan:** No scope change; fixes were required to satisfy the intended harness proof.

## Issues Encountered

- Bun rejected the plan's `-x` flag; verification used supported Bun commands instead.

## Verification

- `bun test tests/commands/e2e-harness.test.ts` - passed
- `bun run typecheck` - passed
- `bun run test:integ` - passed, 50/50 integration files
- `bun run test` - passed, unit PASS and integration 50/50

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- Required helpers exist in `tests/helpers.ts`.
- Required harness tests exist in `tests/commands/e2e-harness.test.ts`.
- Plan-level verification commands passed using supported Bun syntax.

## Next Phase Readiness

Ready for `80-02`: the inventory can map to `tests/commands/e2e-harness.test.ts` and later E2E command files can reuse `runCli()` plus the fixture builders.

---
*Phase: 80-e2e-cli-harness-and-living-inventory*
*Completed: 2026-05-14*
