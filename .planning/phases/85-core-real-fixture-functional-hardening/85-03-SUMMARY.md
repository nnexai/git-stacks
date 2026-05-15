---
phase: 85-core-real-fixture-functional-hardening
plan: 03
subsystem: testing
tags: [lifecycle, files, env, secrets, ports, config, real-fixtures]

requires:
  - phase: 81-workspace-and-git-operation-e2e-coverage
    provides: workspace lifecycle and setup context
provides:
  - Real source tests for lifecycle hooks, file operations, env/secrets/ports, and YAML persistence
affects: [phase-85, coverage-gates, core-lib-tests]

tech-stack:
  added: []
  patterns:
    - Combined real-fixture tests with temp files, local scripts, isolated config homes, and direct source imports

key-files:
  created:
    - tests/lib/lifecycle-files-env-config-real-fixture.test.ts
  modified: []

key-decisions:
  - "Use fixture-local shell scripts for secret command resolution and hook execution instead of real keychain/secret-tool dependencies."
  - "Assert config atomic-write outcomes by checking read round trips and absence of leftover .tmp files."

patterns-established:
  - "Real fixture source coverage can group small stable core modules when setup is shared and assertions remain source-owned."

requirements-completed: [CORE-03, CORE-04, CORE-05, GATE-03]

duration: 5min
completed: 2026-05-15
---

# Phase 85 Plan 03: Lifecycle, Files, Env, Ports, And Config Real-Fixture Summary

**Real source coverage for hook subprocesses, file operations, env and secret resolution, port allocation, and config YAML persistence**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-15T04:37:54Z
- **Completed:** 2026-05-15T04:42:28Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added real subprocess lifecycle tests for cwd/env propagation, stdout/stderr capture, and abort-on-failure behavior.
- Added filesystem-backed file operation tests for copy, symlink, glob warnings, idempotency, and external warning behavior.
- Added env, secret, port, and config persistence tests using isolated config homes and fixture-local commands.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add hook execution real-fixture tests** - `d137d7e` (test)
2. **Task 2: Add files, env, secrets, ports, and config persistence tests** - `e7cbf16` (test)

## Files Created/Modified

- `tests/lib/lifecycle-files-env-config-real-fixture.test.ts` - Adds combined real-fixture source coverage across lifecycle, files, workspace-env, secrets, ports, and config.

## Decisions Made

- Used existing source exports directly rather than copying implementation logic into mocks.
- Kept secret coverage to env and fixture-local command resolvers, avoiding real desktop/keychain dependencies.
- Verified port allocation by behavioral contracts instead of assuming allocation order for colliding and null ports.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Cross-stream stdout/stderr order is not deterministic because streams are read concurrently. The test asserts stdout ordering and stderr stream tagging without requiring an impossible total ordering across streams.
- Port reallocation order is source-defined by object iteration and collision handling. The test asserts that conflicted ports move into the expected free set rather than pinning a non-contractual per-key order.

## Verification

- `bun test tests/lib/lifecycle-files-env-config-real-fixture.test.ts` - PASS
- `bun run test:unit` - PASS
- `bun run typecheck` - PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 85-04. Core lifecycle, file, env, secret, port, and config surfaces now have real source coverage.

## Self-Check: PASSED

- Found expected file: `tests/lib/lifecycle-files-env-config-real-fixture.test.ts`
- Found expected commits: `d137d7e`, `e7cbf16`
- Stub scan found only normal empty arrays used for captured line and warning collection; no goal-blocking stubs were introduced.

---
*Phase: 85-core-real-fixture-functional-hardening*
*Completed: 2026-05-15*
