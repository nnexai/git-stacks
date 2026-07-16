---
phase: 124-user-shell-and-environment-authority
plan: "00"
subsystem: testing
tags: [shell, vitest, lifecycle, process-groups, environment]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Stable core, CLI, and service execution seams after workspace lifecycle delivery
provides:
  - Exact-sentinel pre-implementation RED contract for the shared Bash/zsh/fish adapter
  - Behavioral RED coverage for reserved GS_* environment identity
  - Staged lifecycle and parallel-command migration assertions that activate with the adapter
affects: [124-01, 124-02, user-shell, workspace-environment]

tech-stack:
  added: []
  patterns: [exact-sentinel RED proof, harness-safe future-contract activation, deterministic fake shell executables]

key-files:
  created:
    - tests/lib/user-shell-adapter.test.ts
  modified:
    - tests/lib/workspace-env.test.ts
    - tests/lib/lifecycle.test.ts
    - tests/commands/run-parallel.test.ts

key-decisions:
  - "Use a file-existence assertion for the exact RED sentinel so the absent future adapter is a behavioral assertion rather than an import or transform failure."
  - "Activate lifecycle and CLI static delegation checks only after Plan 01 creates the adapter, preserving Wave 0 isolation while staging Plan 02's consumer RED boundary."

patterns-established:
  - "RED meta-gate: require nonzero test status, exact named sentinel, and absence of import, syntax, fixture-load, or missing-test errors."
  - "Future-contract activation: consumer assertions remain dormant only until the shared adapter file exists, then reject legacy hard-coded shell paths."

requirements-completed:
  - SHELL-01
  - SHELL-02
  - SHELL-03
  - SHELL-04
  - SHELL-07

coverage:
  - id: D1
    description: "Deterministic pre-implementation adapter contract reaches the exact Phase 124 RED sentinel without harness failure."
    requirement: SHELL-01
    verification:
      - kind: other
        ref: "RED meta-gate: 4 focused Vitest files; nonzero plus exact sentinel plus negative harness-error scan"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reserved workspace and repository GS_* identities have executable conflict assertions, with workspace spoofing failing against the current implementation."
    requirement: SHELL-04
    verification:
      - kind: unit
        ref: "tests/lib/workspace-env.test.ts#reserved workspace identity wins over spoofed workspace env and ports"
        status: pass
    human_judgment: false
  - id: D3
    description: "Lifecycle and parallel command suites stage no-fallback adapter delegation checks without breaking their existing behavior."
    requirement: SHELL-03
    verification:
      - kind: integration
        ref: "tests/lib/lifecycle.test.ts and tests/commands/run-parallel.test.ts; both suites pass during the RED run"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-16
status: complete
---

# Phase 124 Plan 00: Core Shell and Process RED Contract Summary

**Exact-sentinel shell adapter, reserved-environment, lifecycle, and parallel-command RED contracts established without production changes**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-16T10:55:25Z
- **Completed:** 2026-07-16T11:01:21Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Added deterministic absolute executable fixtures for Bash, zsh, and fish plus an exact adapter sentinel that fails as an assertion rather than an unresolved import.
- Added executable spoof-conflict tests proving the current workspace environment incorrectly permits user input to override reserved `GS_*` identity.
- Staged lifecycle and CLI parallel migration checks that become active when Plan 01 creates the shared adapter, while all existing lifecycle and parallel tests remain green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock discovery, profile, command, environment, and process-tree behavior** - `4ae12380` (test)

**Plan metadata:** committed separately with this summary.

## Files Created/Modified

- `tests/lib/user-shell-adapter.test.ts` - Harness-safe exact RED sentinel, fake supported-shell executables, hostile command bytes, and future adapter authority checks.
- `tests/lib/workspace-env.test.ts` - Reserved workspace/repository identity collision coverage.
- `tests/lib/lifecycle.test.ts` - Staged shared-adapter delegation and `/bin/sh` rejection check.
- `tests/commands/run-parallel.test.ts` - Staged parallel-command delegation and `sh` fallback rejection check.

## Decisions Made

- Kept the missing adapter behind a filesystem assertion so Vitest can load every suite and produce the required exact sentinel without an import-resolution failure.
- Used existing lifecycle injected-spawn coverage and staged source checks for later consumer migration rather than creating a test-local shell implementation that could pass while production remained unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Supplied isolated-worktree test dependencies from existing local artifacts**
- **Found during:** Task 1 verification
- **Issue:** The isolated worktree had no untracked `node_modules` or CLI `dist`, so the specified Vitest command could not start and the CLI integration suite could not execute.
- **Fix:** Temporarily linked the already-installed main-checkout dependency and CLI build directories for verification, then removed both links before committing.
- **Files modified:** None; verification-only symlinks were removed.
- **Verification:** Strict RED meta-gate reported `RED_EXIT=1`, `EXACT_SENTINEL=present`, `HARNESS_ERRORS=absent`, with 40 passing and 2 intentional failing tests.
- **Committed in:** No repository change required.

---

**Total deviations:** 1 auto-fixed (1 blocking environment issue).
**Impact on plan:** No source scope expansion, dependency installation, or committed artifact; the isolated test environment could execute the exact plan command.

## Issues Encountered

- A relative patch path briefly targeted the main checkout instead of the isolated worktree. It was immediately restored before verification or commit; a zero-diff assertion confirmed the main copy of `tests/commands/run-parallel.test.ts` remained unchanged.

## User Setup Required

None - no external service configuration required.

## Known Staged Gates

- The lifecycle and CLI delegation checks intentionally return until `packages/core/src/user-shell.ts` exists. Plan 01 creates that file; from then on these assertions reject the legacy hard-coded shell paths for Plan 02.
- The two failing tests are intentional RED evidence: the exact absent-adapter sentinel and the current reserved workspace identity precedence defect.

## Next Phase Readiness

- Plan 01 can implement the shared adapter and environment precedence against deterministic RED evidence.
- Plan 02's lifecycle and parallel-command delegation failures are already staged to activate as soon as Plan 01 creates the adapter.
- No production file, release metadata, tag, push, publish, or release action was touched.

## Self-Check: PASSED

- All four planned test files exist and are committed in `4ae12380`.
- Strict RED proof confirmed nonzero status, exact sentinel presence, and no prohibited harness errors.
- Git diff scope contained tests only; the main worktree retained no change from this execution.

---
*Phase: 124-user-shell-and-environment-authority*
*Completed: 2026-07-16*
