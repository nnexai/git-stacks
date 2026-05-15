---
phase: 87-integration-contract-and-source-module-coverage
plan: 03
subsystem: testing
tags: [integrations, tmux, cmux, niri, aerospace, vscode, intellij]

requires:
  - phase: 87-integration-contract-and-source-module-coverage
    provides: injected executor testing pattern from Plans 01-02
provides:
  - Terminal multiplexer plugin contract tests
  - IDE plugin contract tests
  - Window-manager artifact routing and skip/failure contract tests
affects: [phase-87, integration-coverage, phase-88-readiness]

tech-stack:
  added: []
  patterns:
    - Mock helper modules before cache-busted integration imports
    - Plugin-level tests under tests/lib/integrations for editor/session integrations

key-files:
  created:
    - tests/lib/integrations/cmux.test.ts
    - tests/lib/integrations/vscode.test.ts
    - tests/lib/integrations/intellij.test.ts
    - .planning/phases/87-integration-contract-and-source-module-coverage/87-03-SUMMARY.md
  modified:
    - tests/lib/integrations/tmux.test.ts
    - tests/lib/integrations/niri.test.ts
    - tests/lib/integrations/aerospace.test.ts

key-decisions:
  - "Session and IDE integration tests assert helper/executor calls instead of launching real tmux, cmux, editors, or window managers."
  - "Window-manager tests explicitly cover artifact-bag source routing and skip/no-op branches through fake detector/helper modules."

patterns-established:
  - "Combined focused mock-heavy integration suites must include every export later imports expect from mocked modules."
  - "Plugin-level IDE tests live beside other integration plugin tests while library-level generation tests remain in tests/lib."

requirements-completed: [INTG-04, GATE-03]

duration: 25 min
completed: 2026-05-15
---

# Phase 87 Plan 03: Session And IDE Integration Contract Summary

**Session, IDE, and window-manager integrations now have fake-helper contract tests for config parsing, command construction, routing, skips, and failures.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-15T05:22:00Z
- **Completed:** 2026-05-15T05:47:25Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added tmux pane layout, invalid config, and unavailable-session skip coverage through mocked tmux helpers.
- Added new cmux plugin tests for workspace open, saved-ref persistence, pane/surface layout, focus, invalid config, and helper failure behavior.
- Added VSCode and IntelliJ plugin-level tests for generate/open, no-artifact skip, spawn arguments, command failure handling, and Java-only applicability.
- Extended niri and AeroSpace coverage for invalid config and artifact-source routing without real compositor/window-manager calls.

## Task Commits

1. **Task 1: Add tmux and cmux pane/config contract coverage** - `fdf27fb` (test)
2. **Task 2: Add IDE integration plugin contract coverage** - `81cf5ae` (test)
3. **Task 3: Extend niri and AeroSpace artifact/skip/failure contracts** - `2b50728` (test)
4. **Auto-fix: Combined focused suite mock stability** - `2145d23` (fix)

## Files Created/Modified

- `tests/lib/integrations/cmux.test.ts` - New cmux plugin contract tests.
- `tests/lib/integrations/vscode.test.ts` - New VSCode plugin contract tests.
- `tests/lib/integrations/intellij.test.ts` - New IntelliJ plugin contract tests.
- `tests/lib/integrations/tmux.test.ts` - Expanded tmux pane layout and skip coverage.
- `tests/lib/integrations/niri.test.ts` - Expanded invalid config and combined-suite mock coverage.
- `tests/lib/integrations/aerospace.test.ts` - Expanded artifact source routing coverage.
- `.planning/phases/87-integration-contract-and-source-module-coverage/87-03-SUMMARY.md` - Execution summary and verification record.

## Decisions Made

- Kept all desktop, editor, and window-manager behavior behind mocks or exported `_exec` seams.
- Added plugin-level IDE tests under `tests/lib/integrations/` instead of moving existing library generation tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stabilized combined mock-heavy focused suite**
- **Found during:** Plan verification
- **Issue:** The six-file focused command loaded later modules after `niri.test.ts` mocked `@/lib/lifecycle` without the `_exec` export expected by downstream imports.
- **Fix:** Added the missing `_exec` export to the lifecycle mock and reset the AeroSpace snapshot mock before asserting source-only routing.
- **Files modified:** `tests/lib/integrations/niri.test.ts`, `tests/lib/integrations/aerospace.test.ts`
- **Verification:** `bun test tests/lib/integrations/tmux.test.ts tests/lib/integrations/cmux.test.ts tests/lib/integrations/niri.test.ts tests/lib/integrations/aerospace.test.ts tests/lib/integrations/vscode.test.ts tests/lib/integrations/intellij.test.ts`
- **Committed in:** `2145d23`

**Total deviations:** 1 auto-fixed (Rule 3 blocking).
**Impact on plan:** Required to satisfy the planned combined focused verification command; no scope expansion.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/integrations/tmux.test.ts tests/lib/integrations/cmux.test.ts` - PASS
- `bun test tests/lib/integrations/vscode.test.ts tests/lib/integrations/intellij.test.ts` - PASS
- `bun test tests/lib/integrations/niri.test.ts tests/lib/integrations/aerospace.test.ts` - PASS
- `bun test tests/lib/integrations/tmux.test.ts tests/lib/integrations/cmux.test.ts tests/lib/integrations/niri.test.ts tests/lib/integrations/aerospace.test.ts tests/lib/integrations/vscode.test.ts tests/lib/integrations/intellij.test.ts` - PASS
- `bun run test:unit` - PASS
- `bun run typecheck` - PASS

## Next Phase Readiness

Wave 1 is complete. Plan 87-04 can audit source-bypassing mocks and inspect coverage artifacts.

## Self-Check: PASSED

- Created summary exists.
- Task commits exist: `fdf27fb`, `81cf5ae`, `2b50728`, `2145d23`.
- Key files created and modified as planned.

---
*Phase: 87-integration-contract-and-source-module-coverage*
*Completed: 2026-05-15*
